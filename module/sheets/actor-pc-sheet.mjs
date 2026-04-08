/**
 * actor-pc-sheet.mjs — PC Actor Sheet.
 */

import { ShardAttackDialog, postAbilityToChat } from "../rolls/attack-dialog.mjs";

export class ShardPCActorSheet extends ActorSheet {

  static get defaultOptions() {
    return foundry.utils.mergeObject(super.defaultOptions, {
      classes: ["shard", "sheet", "actor", "pc"],
      template: "systems/shard/templates/actors/pc-sheet.hbs",
      width: 720, height: 840,
      tabs: [{ navSelector: ".sheet-tabs", contentSelector: ".sheet-body", initial: "abilities" }],
      dragDrop: [{ dragSelector: ".item-list .item", dropSelector: null }],
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

    context.biographyHTML    = await TE.enrichHTML(sys.biography, { async: true });
    context.notesHTML        = await TE.enrichHTML(sys.notes,     { async: true });
    context.editingBiography = this._editingBiography ?? false;
    context.editingNotes     = this._editingNotes     ?? false;

    // Enrich ability effects for inline display in the inventory
    const abilities = this.actor.items.filter(i => i.type === "ability");
    for (const ab of abilities) {
      ab.effectHTML = ab.system.effect
        ? await TE.enrichHTML(ab.system.effect, { async: true })
        : "";
    }

    const bySort = (a, b) => (a.sort ?? 0) - (b.sort ?? 0);
    context.classes           = this.actor.items.filter(i => i.type === "class").sort(bySort);
    context.innateAbilities   = abilities.filter(i =>  i.system.isInnate                        ).sort(bySort);
    context.passiveAbilities  = abilities.filter(i => !i.system.isInnate &&  i.system.isPassive  ).sort(bySort);
    context.activeAbilities   = abilities.filter(i => !i.system.isInnate && !i.system.isPassive  ).sort(bySort);

    const rankReqs = game.shard.SHARD.RANK_LEVEL_REQUIREMENTS;
    const tl       = this.actor.totalLevel;

    // Build class entries with pre-fetched ability data for display
    context.classEntries = await Promise.all(context.classes.map(async cls => {
      const entry        = sys.classLevels.find(cl => cl.itemId === cls.id) ?? { level: 1, isBase: false };
      const unlockedRanks = [0,1,2,3,4,5].filter(r => r === 0 || tl >= (rankReqs[r] ?? 99));

      // Fetch each ability from its UUID so we have full data for expansion
      const resolvedByRank = { 0: [], 1: [], 2: [], 3: [], 4: [], 5: [] };
      await Promise.all((cls.system.abilities ?? []).map(async (ab) => {
        const row = { uuid: ab.uuid, name: ab.name, rank: ab.rank, abilityData: null };
        if (ab.uuid) {
          try {
            const src = await fromUuid(ab.uuid);
            if (src) {
              // Prefer the actor-owned copy's tags: the source (compendium) item may have
              // no tags if they were added to the actor copy after it was granted.
              const actorCopy = this.actor.items.find(
                i => i.type === "ability" && i.system?.sourceUUID === ab.uuid
              );
              const tags = actorCopy?.system.tags?.length
                ? actorCopy.system.tags
                : (src.system.tags ?? []);

              row.abilityData = {
                cost:             src.system.cost,
                focusCost:        src.system.focusCost,
                range:            src.system.range     ?? "",
                tags,
                isAttack:         src.system.isAttack  ?? false,
                damage:           src.system.damage    ?? "",
                hasGraze:         src.system.hasGraze  ?? false,
                grazeDamage:      src.system.grazeDamage ?? "",
                hasResistance:    src.system.hasResistance ?? false,
                resistanceDV:     src.system.resistanceDV ?? 10,
                effectHTML:       src.system.effect
                                    ? await TE.enrichHTML(src.system.effect, { async: true })
                                    : ""
              };
            }
          } catch(e) {
            console.warn(`Shard | Could not fetch ability ${ab.uuid}`, e);
          }
        }
        const r = ab.rank ?? 1;
        if (resolvedByRank[r]) resolvedByRank[r].push(row);
      }));

      return { item: cls, level: entry.level, isBase: entry.isBase, unlockedRanks, resolvedByRank };
    }));

    context.totalLevel   = this.actor.totalLevel;
    context.config       = game.shard.SHARD;
    context.system       = sys;
    context.grantedUUIDs = new Set(
      this.actor.items.filter(i => i.system?.sourceUUID).map(i => i.system.sourceUUID)
    );

    // Build a UUID → description map for every tag referenced anywhere on this sheet.
    // This is looked up live so descriptions work even for tags added before the schema
    // update (which have no cached description in the tag reference).
    context.tagDescriptions = await this._buildTagDescriptions(context);

    return context;
  }

  /* ------------------------------------------------------------------ */
  /*  Tag Description Lookup                                              */
  /* ------------------------------------------------------------------ */

  /**
   * Build a flat map of { [tagUUID]: descriptionString } for every tag referenced
   * anywhere on this sheet (actor abilities + class entry ability rows).
   * Fetches tag items via fromUuid in parallel; cached by Foundry after first call.
   */
  async _buildTagDescriptions(context) {
    const uuids = new Set();

    // Tags on actor-owned abilities
    for (const ab of this.actor.items.filter(i => i.type === "ability")) {
      for (const t of (ab.system.tags ?? [])) { if (t.uuid) uuids.add(t.uuid); }
    }

    // Tags on class-entry abilities
    for (const entry of (context.classEntries ?? [])) {
      for (const rows of Object.values(entry.resolvedByRank)) {
        for (const row of rows) {
          for (const t of (row.abilityData?.tags ?? [])) { if (t.uuid) uuids.add(t.uuid); }
        }
      }
    }

    const map = {};
    await Promise.all([...uuids].map(async uuid => {
      try {
        const tag = await fromUuid(uuid);
        if (tag?.system?.description) map[uuid] = tag.system.description;
      } catch(e) { /* tag not found — tooltip simply won't appear */ }
    }));
    return map;
  }

  /* ------------------------------------------------------------------ */
  /*  Listeners                                                           */
  /* ------------------------------------------------------------------ */

  activateListeners(html) {
    super.activateListeners(html);
    if (!this.isEditable) return;

    // Inventory ability expand/collapse
    html.on("click", ".ability-name-row", this._onAbilityExpand.bind(this));

    // Inventory ability actions
    html.on("click",  ".ability-activate",    this._onAbilityActivate.bind(this));
    html.on("click",  ".ability-attack-roll", this._onAttackRoll.bind(this));

    // Section collapse
    html.on("click", ".collapsible-header", this._onSectionCollapse.bind(this));

    // Refocus button
    html.on("click", ".refocus-btn", this._onRefocus.bind(this));

    // Class collapse
    html.on("click", ".class-collapse-toggle", this._onClassCollapseToggle.bind(this));

    // Restore section collapsed states across re-renders
    if (this._collapsedSections) {
      for (const section of this._collapsedSections) {
        html.find(`[data-section="${section}"]`).addClass("collapsed");
        html.find(`[data-section-body="${section}"]`).addClass("section-body-collapsed");
      }
    }

    // Drag-sort within ability lists
    html.on("dragover",  ".item-list .item", this._onSortDragOver.bind(this));
    html.on("dragleave", ".item-list .item", this._onSortDragLeave.bind(this));
    html.on("drop",      ".item-list .item", this._onSortDrop.bind(this));

    // Class controls
    html.on("change", ".class-level-input",  this._onClassLevelChange.bind(this));
    html.on("change", ".base-class-radio",   this._onBaseClassChange.bind(this));

    // Class ability row — left-click to expand inline
    html.on("click", ".class-ability-row[data-uuid]", this._onClassAbilityExpand.bind(this));

    // Item controls
    html.on("click", ".item-delete", this._onItemDelete.bind(this));
    html.on("click", ".item-edit",   this._onItemEdit.bind(this));

    // Vitals
    html.on("change", ".hp-value-input",      this._onHPChange.bind(this));
    html.on("change", ".focus-value-input",   this._onFocusChange.bind(this));
    html.on("change", ".barrier-value-input", this._onBarrierChange.bind(this));

    // Narrative tags
    html.on("click", ".tag-add",    this._onTagAdd.bind(this));
    html.on("click", ".tag-remove", this._onTagRemove.bind(this));

    // Narrative tab — biography/notes edit toggle and skill check
    html.on("click", ".narrative-edit-btn", this._onNarrativeEdit.bind(this));
    html.on("click", ".narrative-done-btn", this._onNarrativeDone.bind(this));
    html.on("click", ".skill-check-btn",    this._onSkillCheck.bind(this));

    // Right-click context menu on class ability rows
    this._createClassAbilityContextMenu(html);
  }

  /* ---- Context Menu ------------------------------------------------- */

  _createClassAbilityContextMenu(html) {
    // v13: use namespaced class, pass the raw HTMLElement, opt out of jQuery callbacks
    new foundry.applications.ux.ContextMenu.implementation(
      html[0],                          // HTMLElement, not jQuery object
      ".class-ability-row[data-uuid]",
      [
        {
          name:     "View Ability",
          icon:     "<i class='fas fa-eye'></i>",
          callback: el => this._onClassAbilityView(el.dataset.uuid)
        },
        {
          name:      "Add to Character",
          icon:      "<i class='fas fa-plus'></i>",
          // condition receives HTMLElement in v13 jQuery:false mode
          condition: el => !this.actor.items.some(
            i => i.system?.sourceUUID === el.dataset.uuid
          ),
          callback: el => this._onClassAbilityAdd(el.dataset.uuid)
        }
      ],
      { jQuery: false }                 // opt out of jQuery wrapping now, not in v14
    );
  }

  /* ---- Ability Section Collapse ------------------------------------- */

  _onSectionCollapse(event) {
    if (event.target.closest(".ability-name-row")) return; // ignore bubbled expand clicks
    const header  = event.currentTarget;
    const section = header.dataset.section;
    if (!section) return;

    if (!this._collapsedSections) this._collapsedSections = new Set();

    header.classList.toggle("collapsed");
    const body = this.element[0].querySelector(`[data-section-body="${section}"]`);
    if (body) body.classList.toggle("section-body-collapsed");

    if (header.classList.contains("collapsed")) {
      this._collapsedSections.add(section);
    } else {
      this._collapsedSections.delete(section);
    }
  }

  /* ---- Refocus ------------------------------------------------------ */

  async _onRefocus(event) {
    event.preventDefault();
    event.stopPropagation();

    const actor = this.actor;
    const sys   = actor.system;

    const recovered = Math.ceil(sys.focus.max / 3);
    const newFocus  = Math.min(sys.focus.value + recovered, sys.focus.max);

    const offGuardId  = game.settings.get("shard", "offGuardConditionId") ?? "";
    const wasOffGuard = offGuardId && actor.statuses?.has(offGuardId);

    await actor.update({ "system.focus.value": newFocus });
    if (wasOffGuard) await actor.toggleStatusEffect(offGuardId, { active: false });

    const gainLine   = `+${recovered} Focus (now ${newFocus}&thinsp;/&thinsp;${sys.focus.max})`;
    const statusLine = wasOffGuard ? `<div class="hint" style="margin-top:4px">Off Guard removed.</div>` : "";

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

  /* ---- Class Block Collapse ----------------------------------------- */

  _onClassCollapseToggle(event) {
    event.preventDefault();
    event.stopPropagation();
    event.currentTarget.closest(".class-block").classList.toggle("collapsed");
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

  /* ---- Class Ability Expand ----------------------------------------- */

  _onClassAbilityExpand(event) {
    // Don't fire if clicking a link inside the row (e.g. old + button)
    if (event.target.closest("a")) return;
    const row = event.currentTarget;
    row.classList.toggle("expanded");
    const details = row.nextElementSibling;
    if (details?.classList.contains("class-ability-details")) {
      details.style.display = row.classList.contains("expanded") ? "block" : "none";
    }
  }

  /* ---- Class Ability View ------------------------------------------- */

  async _onClassAbilityView(uuid) {
    if (!uuid) return;
    try {
      const item = await fromUuid(uuid);
      item?.sheet?.render(true);
    } catch(e) {
      ui.notifications.warn("Could not open ability sheet.");
    }
  }

  /* ---- Class Ability Add (shared between context menu and + button) -- */

  async _onClassAbilityAdd(uuid) {
    if (!uuid) return;
    if (this.actor.items.some(i => i.system?.sourceUUID === uuid)) return;

    let src;
    try { src = await fromUuid(uuid); } catch(e) {}

    if (!src) {
      ui.notifications.warn("Ability not found — it may have been moved or deleted.");
      return;
    }

    const data = src.toObject();
    foundry.utils.setProperty(data, "system.sourceUUID", uuid);
    await this.actor.createEmbeddedDocuments("Item", [data]);
    ui.notifications.info(`${src.name} added to ${this.actor.name}.`);
  }

  /* ---- Inventory Ability Expand ------------------------------------- */

  _onAbilityExpand(event) {
    const li = event.currentTarget.closest(".ability-item");
    li.classList.toggle("expanded");
  }

  /* ---- Inventory Ability Activate (non-attack) ---------------------- */

  async _onAbilityActivate(event) {
    event.preventDefault();
    event.stopPropagation();
    const itemId = event.currentTarget.closest("[data-item-id]").dataset.itemId;
    const item   = this.actor.items.get(itemId);
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
    const itemId = event.currentTarget.closest("[data-item-id]").dataset.itemId;
    const item   = this.actor.items.get(itemId);
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

  /* ---- Class Controls ---------------------------------------------- */

  async _onClassLevelChange(event) {
    const itemId = event.currentTarget.closest("[data-item-id]").dataset.itemId;
    const level  = parseInt(event.currentTarget.value, 10);
    if (isNaN(level) || level < 1) return;
    return this.actor.setClassLevel(itemId, level);
  }

  async _onBaseClassChange(event) {
    const newClassId  = event.currentTarget.value;
    const oldEntry    = this.actor.system.classLevels?.find(cl => cl.isBase);

    // If there's a different base class, offer to remove its basic abilities
    if (oldEntry && oldEntry.itemId !== newClassId) {
      const oldClass   = this.actor.items.get(oldEntry.itemId);
      const basicUUIDs = new Set(
        (oldClass?.system.abilities ?? [])
          .filter(a => a.rank === 0 && a.uuid)
          .map(a => a.uuid)
      );
      const toDelete = this.actor.items.filter(
        i => i.type === "ability" && basicUUIDs.has(i.system?.sourceUUID)
      );

      if (toDelete.length) {
        const newClass  = this.actor.items.get(newClassId);
        const abilityList = toDelete.map(i => `<li>${i.name}</li>`).join("");
        const confirmed = await Dialog.confirm({
          title:   "Change Base Class?",
          content: `<p>Switching to <strong>${newClass?.name ?? "new class"}</strong> will remove
                    these basic abilities from <strong>${oldClass?.name ?? "old class"}</strong>:</p>
                    <ul>${abilityList}</ul>
                    <p>Basic abilities from the new class will be granted automatically.</p>`
        });
        if (!confirmed) {
          this.render();   // reset the radio button
          return;
        }
        await this.actor.deleteEmbeddedDocuments("Item", toDelete.map(i => i.id));
      }
    }

    return this.actor.setBaseClass(newClassId);
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

  /* ---- Tags --------------------------------------------------------- */

  async _onTagAdd(event) {
    const tag = await Dialog.prompt({
      title: "Add Tag", content: `<input type="text" name="tag" placeholder="Tag name" style="width:100%">`,
      callback: html => html.find("input[name=tag]").val().trim()
    });
    if (!tag) return;
    return this.actor.update({ "system.narrativeTags": [...(this.actor.system.narrativeTags ?? []), tag] });
  }

  async _onTagRemove(event) {
    const tags = [...(this.actor.system.narrativeTags ?? [])];
    tags.splice(parseInt(event.currentTarget.dataset.index, 10), 1);
    return this.actor.update({ "system.narrativeTags": tags });
  }

  /* ---- Biography / Notes inline edit toggle ------------------------- */

  _onNarrativeEdit(event) {
    event.preventDefault();
    const field = event.currentTarget.dataset.field;
    if (field === "biography") this._editingBiography = true;
    else                        this._editingNotes     = true;
    this.render();
  }

  async _onNarrativeDone(event) {
    event.preventDefault();
    const field     = event.currentTarget.dataset.field;
    const editorKey = field === "biography" ? "system.biography" : "system.notes";
    const editor    = this.editors?.[editorKey];
    if (editor?.active) {
      try { await editor.save(); } catch(e) { /* best-effort */ }
    }
    if (field === "biography") this._editingBiography = false;
    else                        this._editingNotes     = false;
    this.render();
  }

  /* ---- Skill Check -------------------------------------------------- */

  async _onSkillCheck(event) {
    event.preventDefault();
    const actor = this.actor;
    const tags  = actor.system.narrativeTags ?? [];

    const tagRows = tags.length
      ? tags.map((t, i) => `
          <label class="sc-tag-label">
            <input type="checkbox" name="tag_${i}" checked />
            <span>${t}</span>
          </label>`).join("")
      : `<p class="hint" style="margin:4px 0">No narrative tags added yet.</p>`;

    const result = await Dialog.prompt({
      title:   "Skill Check",
      content: `<form class="shard-dialog-form" style="padding:8px">
        <div class="form-group" style="display:flex;align-items:center;gap:8px;margin-bottom:10px">
          <label style="min-width:90px">Roll Name</label>
          <input name="rollName" type="text" value="Skill Check" style="flex:1" />
        </div>
        <div style="margin-bottom:10px">
          <label style="display:block;margin-bottom:6px;font-weight:bold;font-size:0.85em;text-transform:uppercase;letter-spacing:0.08em">Tags</label>
          <div class="sc-tag-list">${tagRows}</div>
        </div>
        <div class="form-group" style="display:flex;align-items:center;gap:8px">
          <label style="min-width:90px">Advantage</label>
          <div class="sc-adv-stepper">
            <button type="button" class="sc-adv-dec">−</button>
            <span class="sc-adv-val">0</span>
            <button type="button" class="sc-adv-inc">+</button>
          </div>
        </div>
      </form>`,
      callback: html => {
        const rollName    = html.find("[name=rollName]").val().trim() || "Skill Check";
        const checkedTags = tags.filter((_, i) => html.find(`[name=tag_${i}]`).prop("checked"));
        const netAdv      = parseInt(html.find(".sc-adv-val").text(), 10) || 0;
        return { rollName, checkedTags, netAdv };
      },
      render: html => {
        html.find(".sc-adv-dec").on("click", () => {
          const span = html.find(".sc-adv-val");
          span.text(parseInt(span.text(), 10) - 1);
        });
        html.find(".sc-adv-inc").on("click", () => {
          const span = html.find(".sc-adv-val");
          span.text(parseInt(span.text(), 10) + 1);
        });
      },
      rejectClose: false
    });

    if (!result) return;

    const { rollName, checkedTags, netAdv } = result;
    const baseDice  = checkedTags.length;
    const totalDice = baseDice + Math.abs(netAdv);

    if (totalDice < 1) {
      ui.notifications.warn("Check at least one tag or add advantage to roll.");
      return;
    }

    const keepMode = netAdv >= 0 ? "kh" : "kl";
    const formula  = `${totalDice}d6${keepMode}1`;
    const roll     = await new Roll(formula).evaluate();

    let advLine = "";
    if (netAdv > 0)      advLine = `<div class="detail-row"><span class="detail-label">Advantage</span> +${netAdv}</div>`;
    else if (netAdv < 0) advLine = `<div class="detail-row"><span class="detail-label">Disadvantage</span> ${netAdv}</div>`;

    const tagLine = checkedTags.length
      ? `<div class="detail-row"><span class="detail-label">Tags</span> ${checkedTags.join(", ")}</div>`
      : "";

    await ChatMessage.create({
      content: `<div class="shard-chat-card ability-card">
        <div class="card-header">
          <div class="card-title">
            <span class="actor-name">${actor.name}</span>
            <span class="ability-name">${rollName}</span>
          </div>
        </div>
        <div class="card-body" style="padding:8px 12px;font-size:0.9em">
          ${tagLine}${advLine}
          <div class="detail-row"><span class="detail-label">Formula</span> ${formula}</div>
          <div class="roll-result" style="font-size:1.4em;font-weight:bold;margin-top:6px;text-align:center">${roll.total}</div>
        </div>
      </div>`,
      rolls:   [roll],
      speaker: ChatMessage.getSpeaker({ actor })
    });
  }

  /* ------------------------------------------------------------------ */
  /*  Drag & Drop                                                         */
  /* ------------------------------------------------------------------ */

  /**
   * Override drag-start so ability items carry a `shardAbilityMacro` flag.
   * The hotbarDrop hook in shard.mjs intercepts that flag and creates a
   * roll macro instead of the default "show item" macro.
   * All other item types fall through to the base ActorSheet behaviour.
   */
  _onDragStart(event) {
    const li   = event.currentTarget.closest("[data-item-id]");
    const item = li ? this.actor.items.get(li.dataset.itemId) : null;
    if (item && ["ability", "npc-ability"].includes(item.type)) {
      event.dataTransfer.setData("text/plain", JSON.stringify({
        type:              "Item",
        uuid:              item.uuid,
        shardAbilityMacro: true
      }));
      return;
    }
    return super._onDragStart(event);
  }

  async _onDropItem(event, data) {
    const item = await Item.fromDropData(data);
    if (!item) return;

    if (item.type === "class") {
      await super._onDropItem(event, data);
      await new Promise(r => setTimeout(r, 50));
      const registeredIds = new Set((this.actor.system.classLevels ?? []).map(cl => cl.itemId));
      const newItem = this.actor.items.find(i => i.type === "class" && !registeredIds.has(i.id));
      if (newItem) await this.actor.registerClassLevel(newItem.id);
      return;
    }

    return super._onDropItem(event, data);
  }
}
