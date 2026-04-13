/**
 * actor-summon-sheet.mjs — Sheet for Summon / Deployable actors.
 *
 * Streamlined PC-style sheet: Abilities tab + Notes tab.
 * All stats are directly editable (no class derivation).
 */

import { ShardAttackDialog, postAbilityToChat } from "../rolls/attack-dialog.mjs";

export class ShardSummonActorSheet extends ActorSheet {

  static get defaultOptions() {
    return foundry.utils.mergeObject(super.defaultOptions, {
      classes:      ["shard", "sheet", "actor", "summon"],
      template:     "systems/shard/templates/actors/summon-sheet.hbs",
      width:        620,
      height:       720,
      tabs:         [{ navSelector: ".sheet-tabs", contentSelector: ".sheet-body", initial: "abilities" }],
      dragDrop:     [{ dragSelector: ".item-list .item", dropSelector: null }],
      editorOptions: { engine: "prosemirror" }
    });
  }

  /* ------------------------------------------------------------------ */
  /*  Data                                                                */
  /* ------------------------------------------------------------------ */

  async getData() {
    const context = await super.getData();
    const sys     = this.actor.system;
    const TE      = foundry.applications.ux.TextEditor.implementation;

    context.system       = sys;
    context.notesHTML    = await TE.enrichHTML(sys.notes ?? "", { async: true });
    context.editingNotes = this._editingNotes ?? false;

    const abilities = this.actor.items.filter(i => i.type === "ability");
    for (const ab of abilities) {
      ab.effectHTML = ab.system.effect
        ? await TE.enrichHTML(ab.system.effect, { async: true })
        : "";
    }

    const bySort = (a, b) => (a.sort ?? 0) - (b.sort ?? 0);
    context.activeAbilities  = abilities.filter(i => !i.system.isPassive).sort(bySort);
    context.passiveAbilities = abilities.filter(i =>  i.system.isPassive).sort(bySort);

    context.tagDescriptions = await this._buildTagDescriptions();

    return context;
  }

  async _buildTagDescriptions() {
    const uuids = new Set();
    for (const ab of this.actor.items.filter(i => i.type === "ability")) {
      for (const t of (ab.system.tags ?? [])) { if (t.uuid) uuids.add(t.uuid); }
    }
    const map = {};
    await Promise.all([...uuids].map(async uuid => {
      try {
        const tag = await fromUuid(uuid);
        if (tag?.system?.description) map[uuid] = tag.system.description;
      } catch(e) { /* no tooltip */ }
    }));
    return map;
  }

  /* ------------------------------------------------------------------ */
  /*  Listeners                                                           */
  /* ------------------------------------------------------------------ */

  activateListeners(html) {
    super.activateListeners(html);
    if (!this.isEditable) return;

    // Ability expand/collapse
    html.on("click", ".ability-name-row", this._onAbilityExpand.bind(this));

    // Ability actions
    html.on("click", ".ability-activate",    this._onAbilityActivate.bind(this));
    html.on("click", ".ability-attack-roll", this._onAttackRoll.bind(this));

    // Section collapse
    html.on("click", ".collapsible-header", this._onSectionCollapse.bind(this));

    // Restore section collapsed states across re-renders
    if (this._collapsedSections) {
      for (const section of this._collapsedSections) {
        html.find(`[data-section="${section}"]`).addClass("collapsed");
        html.find(`[data-section-body="${section}"]`).addClass("section-body-collapsed");
      }
    }

    // Refocus
    html.on("click", ".refocus-btn", this._onRefocus.bind(this));

    // Drag-sort within ability lists
    html.on("dragover",  ".item-list .item", this._onSortDragOver.bind(this));
    html.on("dragleave", ".item-list .item", this._onSortDragLeave.bind(this));
    html.on("drop",      ".item-list .item", this._onSortDrop.bind(this));

    // Item controls
    html.on("click", ".item-delete", this._onItemDelete.bind(this));
    html.on("click", ".item-edit",   this._onItemEdit.bind(this));

    // Vitals
    html.on("change", ".hp-value-input",      this._onHPChange.bind(this));
    html.on("change", ".focus-value-input",   this._onFocusChange.bind(this));
    html.on("change", ".barrier-value-input", this._onBarrierChange.bind(this));

    // Notes edit toggle
    html.on("click", ".narrative-edit-btn", this._onNotesEdit.bind(this));
    html.on("click", ".narrative-done-btn", this._onNotesDone.bind(this));
  }

  /* ---- Ability Section Collapse ------------------------------------- */

  _onSectionCollapse(event) {
    if (event.target.closest(".ability-name-row")) return;
    const header  = event.currentTarget;
    const section = header.dataset.section;
    if (!section) return;

    if (!this._collapsedSections) this._collapsedSections = new Set();

    header.classList.toggle("collapsed");
    const body = this.element[0].querySelector(`[data-section-body="${section}"]`);
    if (body) body.classList.toggle("section-body-collapsed");

    if (header.classList.contains("collapsed")) this._collapsedSections.add(section);
    else                                         this._collapsedSections.delete(section);
  }

  /* ---- Refocus ------------------------------------------------------ */

  async _onRefocus(event) {
    event.preventDefault();
    event.stopPropagation();

    const actor    = this.actor;
    const sys      = actor.system;
    const recovered = Math.ceil(sys.focus.max / 3);
    const newFocus  = Math.min(sys.focus.value + recovered, sys.focus.max);

    const offGuardId  = game.settings.get("shard", "offGuardConditionId") ?? "";
    const wasOffGuard = offGuardId && actor.statuses?.has(offGuardId);

    await actor.update({ "system.focus.value": newFocus });
    if (wasOffGuard) await actor.toggleStatusEffect(offGuardId, { active: false });

    const gainLine   = `+${recovered} Focus (now ${newFocus}&thinsp;/&thinsp;${sys.focus.max})`;
    const statusLine = wasOffGuard
      ? `<div class="hint" style="margin-top:4px">Off Guard removed.</div>`
      : "";

    await ChatMessage.create({
      content: `<div class="shard-chat-card ability-card">
        <div class="card-header">
          <div class="card-title">
            <span class="actor-name">${actor.name}</span>
            <span class="ability-name">Refocus</span>
          </div>
        </div>
        <div class="card-body" style="padding:8px 12px;font-size:0.9em">
          ${gainLine}${statusLine}
        </div>
      </div>`,
      speaker: ChatMessage.getSpeaker({ actor })
    });
  }

  /* ---- Drag-sort within ability lists ------------------------------- */

  _onSortDragOver(event) {
    event.preventDefault();
    const li   = event.currentTarget;
    const midY = li.getBoundingClientRect().top + li.getBoundingClientRect().height / 2;
    li.classList.toggle("drop-above", event.clientY < midY);
    li.classList.toggle("drop-below", event.clientY >= midY);
  }

  _onSortDragLeave(event) {
    event.currentTarget.classList.remove("drop-above", "drop-below");
  }

  async _onSortDrop(event) {
    event.currentTarget.classList.remove("drop-above", "drop-below");

    let data;
    try { data = JSON.parse(event.dataTransfer.getData("text/plain")); } catch(e) { return; }
    if (data?.type !== "Item") return;
    if (!data.uuid?.includes(`Actor.${this.actor.id}.Item.`)) return;

    event.preventDefault();
    event.stopPropagation();

    const draggedId = data.uuid.split(".Item.").pop();
    const targetId  = event.currentTarget.dataset.itemId;
    if (!draggedId || !targetId || draggedId === targetId) return;

    const dragged  = this.actor.items.get(draggedId);
    const target   = this.actor.items.get(targetId);
    if (!dragged || !target) return;

    const list     = event.currentTarget.closest("ol");
    const siblings = [...list.querySelectorAll(".item[data-item-id]")]
      .map(el => this.actor.items.get(el.dataset.itemId))
      .filter(i => i && i.id !== draggedId);

    const rect   = event.currentTarget.getBoundingClientRect();
    const before = event.clientY < rect.top + rect.height / 2;

    const updates = SortingHelpers.performIntegerSort(dragged, { target, siblings, sortBefore: before });
    if (updates.length) {
      await this.actor.updateEmbeddedDocuments("Item",
        updates.map(u => ({ _id: u.target.id, sort: u.update.sort }))
      );
    }
  }

  /* ---- Ability Expand ----------------------------------------------- */

  _onAbilityExpand(event) {
    const li = event.currentTarget.closest(".ability-item");
    li.classList.toggle("expanded");
  }

  /* ---- Ability Activate (non-attack) -------------------------------- */

  async _onAbilityActivate(event) {
    event.preventDefault();
    event.stopPropagation();
    const itemId    = event.currentTarget.closest("[data-item-id]").dataset.itemId;
    const item      = this.actor.items.get(itemId);
    if (!item) return;

    const focusCost = item.system.focusCost ?? 0;
    if (focusCost > 0) {
      const ok = await this.actor.spendFocus(focusCost);
      if (!ok) {
        ui.notifications.warn(`${this.actor.name} does not have enough Focus to use ${item.name}.`);
        return;
      }
    }

    return postAbilityToChat(this.actor, item);
  }

  /* ---- Attack Roll -------------------------------------------------- */

  async _onAttackRoll(event) {
    event.preventDefault();
    event.stopPropagation();
    const itemId    = event.currentTarget.closest("[data-item-id]").dataset.itemId;
    const item      = this.actor.items.get(itemId);
    if (!item) return;

    const focusCost = item.system.focusCost ?? 0;
    if (focusCost > 0) {
      const ok = await this.actor.spendFocus(focusCost);
      if (!ok) {
        ui.notifications.warn(`${this.actor.name} does not have enough Focus to use ${item.name}.`);
        return;
      }
    }

    return ShardAttackDialog.show(this.actor, item);
  }

  /* ---- Item Controls ----------------------------------------------- */

  async _onItemDelete(event) {
    event.preventDefault();
    const itemId = event.currentTarget.closest("[data-item-id]").dataset.itemId;
    const item   = this.actor.items.get(itemId);
    if (!item) return;
    return Dialog.confirm({
      title:   `Delete ${item.name}?`,
      content: `<p>Remove <strong>${item.name}</strong> from ${this.actor.name}?</p>`,
      yes:     () => item.delete()
    });
  }

  _onItemEdit(event) {
    event.preventDefault();
    const itemId = event.currentTarget.closest("[data-item-id]").dataset.itemId;
    this.actor.items.get(itemId)?.sheet.render(true);
  }

  /* ---- Vitals ------------------------------------------------------ */

  _onHPChange(event) {
    const val = parseInt(event.currentTarget.value, 10);
    if (!isNaN(val)) this.actor.update({ "system.hp.value": val });
  }

  _onFocusChange(event) {
    const val = parseInt(event.currentTarget.value, 10);
    if (!isNaN(val)) this.actor.update({ "system.focus.value": val });
  }

  _onBarrierChange(event) {
    const val = parseInt(event.currentTarget.value, 10);
    if (!isNaN(val)) this.actor.update({ "system.barrier": Math.max(0, val) });
  }

  /* ---- Notes Edit Toggle ------------------------------------------- */

  _onNotesEdit(event) {
    event.preventDefault();
    this._editingNotes = true;
    this.render();
  }

  async _onNotesDone(event) {
    event.preventDefault();
    const editor = this.editors?.["system.notes"];
    if (editor?.active) {
      try { await editor.save(); } catch(e) { /* best-effort */ }
    }
    this._editingNotes = false;
    this.render();
  }

  /* ------------------------------------------------------------------ */
  /*  Drag & Drop                                                         */
  /* ------------------------------------------------------------------ */

  _onDragStart(event) {
    const li   = event.currentTarget.closest("[data-item-id]");
    const item = li ? this.actor.items.get(li.dataset.itemId) : null;
    if (item && item.type === "ability") {
      event.dataTransfer.setData("text/plain", JSON.stringify({
        type:              "Item",
        uuid:              item.uuid,
        shardAbilityMacro: true
      }));
      return;
    }
    return super._onDragStart(event);
  }
}
