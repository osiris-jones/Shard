/**
 * actor-npc-sheet.mjs — NPC Actor Sheet for the Shard system.
 *
 * Layout mirrors the PC sheet:
 *  - Abilities tab: Active / Passive sections (npc-ability items on the actor)
 *  - Class & Templates tab: one npc-class + any number of npc-templates,
 *    each showing Basic / Optional ability lists with context-menu add
 *  - Narrative tab: biography, tags
 */

import { ShardAttackDialog, postAbilityToChat } from "../rolls/attack-dialog.mjs";

export class ShardNPCActorSheet extends ActorSheet {

  static get defaultOptions() {
    return foundry.utils.mergeObject(super.defaultOptions, {
      classes: ["shard", "sheet", "actor", "npc"],
      template: "systems/shard/templates/actors/npc-sheet.hbs",
      width: 700,
      height: 820,
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

    context.biographyHTML = await TE.enrichHTML(sys.biography ?? "", { async: true });
    context.system        = sys;
    context.config        = game.shard.SHARD;

    // Split on-actor npc-ability items into active / passive
    const npcAbilities = this.actor.items.filter(i => i.type === "npc-ability");
    for (const ab of npcAbilities) {
      ab.effectHTML = ab.system.effect
        ? await TE.enrichHTML(ab.system.effect, { async: true })
        : "";
    }
    const bySort = (a, b) => (a.sort ?? 0) - (b.sort ?? 0);
    context.activeAbilities  = npcAbilities.filter(i => !i.system.isPassive).sort(bySort);
    context.passiveAbilities = npcAbilities.filter(i =>  i.system.isPassive).sort(bySort);

    // NPC class block
    const npcClass = sys.npcClassId ? this.actor.items.get(sys.npcClassId) : null;
    context.npcClass = npcClass
      ? await this._buildClassEntry(npcClass, TE)
      : null;

    // NPC template blocks (all npc-template items on actor)
    const templates = this.actor.items.filter(i => i.type === "npc-template");
    context.npcTemplates = await Promise.all(
      templates.map(t => this._buildTemplateEntry(t, TE))
    );

    // UUIDs already on the actor (to mark granted status in class/template lists)
    context.grantedUUIDs = new Set(
      this.actor.items
        .filter(i => i.system?.sourceUUID)
        .map(i => i.system.sourceUUID)
    );

    // Build a UUID → description map for every tag referenced anywhere on this sheet
    context.tagDescriptions = await this._buildTagDescriptions(context);

    return context;
  }

  async _buildClassEntry(classItem, TE) {
    const resolvedByTier = { basic: [], optional: [] };
    await Promise.all((classItem.system.abilities ?? []).map(async ab => {
      const row = { uuid: ab.uuid, name: ab.name, tier: ab.tier, abilityData: null };
      if (ab.uuid) {
        try {
          const src = await fromUuid(ab.uuid);
          if (src) {
            // Prefer actor-owned copy's tags when the source has none
            const actorCopy = this.actor.items.find(
              i => i.type === "npc-ability" && i.system?.sourceUUID === ab.uuid
            );
            const tags = actorCopy?.system.tags?.length
              ? actorCopy.system.tags
              : (src.system.tags ?? []);

            row.abilityData = {
              cost:          src.system.cost,
              range:         src.system.range     ?? "",
              tags,
              isAttack:      src.system.isAttack  ?? false,
              damage:        src.system.damage    ?? "",
              hasGraze:      src.system.hasGraze  ?? false,
              grazeDamage:   src.system.grazeDamage ?? "",
              hasResistance: src.system.hasResistance ?? false,
              resistanceDV:  src.system.resistanceDV ?? 10,
              charged:       src.system.charged   ?? false,
              effectHTML:    src.system.effect
                               ? await TE.enrichHTML(src.system.effect, { async: true })
                               : ""
            };
          }
        } catch(e) {
          console.warn(`Shard | Could not fetch npc-ability ${ab.uuid}`, e);
        }
      }
      const t = ab.tier ?? "basic";
      if (resolvedByTier[t]) resolvedByTier[t].push(row);
    }));

    return { item: classItem, resolvedByTier };
  }

  async _buildTemplateEntry(tmplItem, TE) {
    const resolvedByTier = { basic: [], optional: [] };
    await Promise.all((tmplItem.system.abilities ?? []).map(async ab => {
      const row = { uuid: ab.uuid, name: ab.name, tier: ab.tier, abilityData: null };
      if (ab.uuid) {
        try {
          const src = await fromUuid(ab.uuid);
          if (src) {
            // Prefer actor-owned copy's tags when the source has none
            const actorCopy = this.actor.items.find(
              i => i.type === "npc-ability" && i.system?.sourceUUID === ab.uuid
            );
            const tags = actorCopy?.system.tags?.length
              ? actorCopy.system.tags
              : (src.system.tags ?? []);

            row.abilityData = {
              cost:          src.system.cost,
              range:         src.system.range     ?? "",
              tags,
              isAttack:      src.system.isAttack  ?? false,
              damage:        src.system.damage    ?? "",
              hasResistance: src.system.hasResistance ?? false,
              resistanceDV:  src.system.resistanceDV ?? 10,
              charged:       src.system.charged   ?? false,
              effectHTML:    src.system.effect
                               ? await TE.enrichHTML(src.system.effect, { async: true })
                               : ""
            };
          }
        } catch(e) {
          console.warn(`Shard | Could not fetch npc-ability ${ab.uuid}`, e);
        }
      }
      const t = ab.tier ?? "basic";
      if (resolvedByTier[t]) resolvedByTier[t].push(row);
    }));

    return { item: tmplItem, resolvedByTier };
  }

  /* ------------------------------------------------------------------ */
  /*  Tag Description Lookup                                              */
  /* ------------------------------------------------------------------ */

  async _buildTagDescriptions(context) {
    const uuids = new Set();

    // Tags on actor-owned npc-abilities
    for (const ab of this.actor.items.filter(i => i.type === "npc-ability")) {
      for (const t of (ab.system.tags ?? [])) { if (t.uuid) uuids.add(t.uuid); }
    }

    // Tags on class/template entry ability rows
    const entries = [
      ...(context.npcClass ? [context.npcClass] : []),
      ...(context.npcTemplates ?? [])
    ];
    for (const entry of entries) {
      for (const rows of Object.values(entry.resolvedByTier ?? {})) {
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

    // ── Read-only listeners (available to observers) ────────────────────
    html.on("click", ".ability-name-row", this._onAbilityExpand.bind(this));
    html.on("click", ".collapsible-header", this._onSectionCollapse.bind(this));
    html.on("click", ".class-collapse-toggle", this._onClassCollapseToggle.bind(this));
    html.on("click", ".class-ability-row[data-uuid]", this._onClassAbilityExpand.bind(this));

    // Restore section collapsed states across re-renders
    if (this._collapsedSections) {
      for (const section of this._collapsedSections) {
        html.find(`[data-section="${section}"]`).addClass("collapsed");
        html.find(`[data-section-body="${section}"]`).addClass("section-body-collapsed");
      }
    }

    if (!this.isEditable) return;

    // Inventory ability actions
    html.on("click", ".ability-activate",    this._onAbilityActivate.bind(this));
    html.on("click", ".ability-attack-roll", this._onAttackRoll.bind(this));

    // Drag-sort within ability lists
    html.on("dragover",  ".item-list .item", this._onSortDragOver.bind(this));
    html.on("dragleave", ".item-list .item", this._onSortDragLeave.bind(this));
    html.on("drop",      ".item-list .item", this._onSortDrop.bind(this));

    // NPC class radio (set base class)
    html.on("change", ".npc-class-radio", this._onNPCClassChange.bind(this));

    // Item controls
    html.on("click", ".item-delete", this._onItemDelete.bind(this));
    html.on("click", ".item-edit",   this._onItemEdit.bind(this));

    // Tier stepper
    html.on("click", ".tier-step", this._onTierStep.bind(this));

    // Vitals
    html.on("change", ".hp-value-input",      this._onHPChange.bind(this));
    html.on("change", ".barrier-value-input", this._onBarrierChange.bind(this));

    // Tags
    html.on("click", ".tag-add",    this._onTagAdd.bind(this));
    html.on("click", ".tag-remove", this._onTagRemove.bind(this));

    // Right-click context menus on class/template ability rows
    this._createAbilityContextMenu(html);
  }

  /* ---- Context Menu ------------------------------------------------- */

  _createAbilityContextMenu(html) {
    new foundry.applications.ux.ContextMenu.implementation(
      html[0],
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
          condition: el => !this.actor.items.some(
            i => i.system?.sourceUUID === el.dataset.uuid
          ),
          callback: el => this._onClassAbilityAdd(el.dataset.uuid)
        }
      ],
      { jQuery: false }
    );
  }

  /* ---- Class Block Collapse ----------------------------------------- */

  _onClassCollapseToggle(event) {
    event.preventDefault();
    event.stopPropagation();
    event.currentTarget.closest(".class-block").classList.toggle("collapsed");
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

    if (header.classList.contains("collapsed")) {
      this._collapsedSections.add(section);
    } else {
      this._collapsedSections.delete(section);
    }
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

  /* ---- Class Ability Add -------------------------------------------- */

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
    if (item) return postAbilityToChat(this.actor, item);
  }

  /* ---- Attack Roll -------------------------------------------------- */

  async _onAttackRoll(event) {
    event.preventDefault();
    event.stopPropagation();
    const itemId = event.currentTarget.closest("[data-item-id]").dataset.itemId;
    const item   = this.actor.items.get(itemId);
    if (item) return ShardAttackDialog.show(this.actor, item);
  }

  /* ---- NPC Class Radio --------------------------------------------- */

  async _onNPCClassChange(event) {
    const itemId = event.currentTarget.value;
    return this.actor.setNPCClass(itemId);
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

  /* ---- Tier Stepper ------------------------------------------------ */

  async _onTierStep(event) {
    event.preventDefault();
    const delta = parseInt(event.currentTarget.dataset.delta, 10);
    const tier  = Math.max(1, (this.actor.system.stats?.tier ?? 1) + delta);
    const update = { "system.stats.tier": tier };

    const classItem = this.actor.system.npcClassId
      ? this.actor.items.get(this.actor.system.npcClassId)
      : null;
    if (classItem) {
      const s     = classItem.system.stats;
      const maxHP = (s.hp ?? 10) + (s.hpBonus ?? 0) * tier;
      update["system.hp.max"]   = maxHP;
      update["system.hp.value"] = Math.min(this.actor.system.hp.value, maxHP);
    }

    await this.actor.update(update);
  }

  /* ---- Vitals ------------------------------------------------------ */

  _onHPChange(event) {
    const val = parseInt(event.currentTarget.value, 10);
    if (!isNaN(val)) this.actor.update({ "system.hp.value": val });
  }

  _onBarrierChange(event) {
    const val = parseInt(event.currentTarget.value, 10);
    if (!isNaN(val)) this.actor.update({ "system.barrier": Math.max(0, val) });
  }

  /* ---- Tags --------------------------------------------------------- */

  async _onTagAdd(event) {
    const tag = await Dialog.prompt({
      title:    "Add Tag",
      content:  `<input type="text" name="tag" placeholder="Tag name" style="width:100%">`,
      callback: html => html.find("input[name=tag]").val().trim()
    });
    if (!tag) return;
    return this.actor.update({
      "system.narrativeTags": [...(this.actor.system.narrativeTags ?? []), tag]
    });
  }

  async _onTagRemove(event) {
    const tags = [...(this.actor.system.narrativeTags ?? [])];
    tags.splice(parseInt(event.currentTarget.dataset.index, 10), 1);
    return this.actor.update({ "system.narrativeTags": tags });
  }

  /* ------------------------------------------------------------------ */
  /*  Drag & Drop                                                         */
  /* ------------------------------------------------------------------ */

  /** @inheritdoc — ability items carry a shardAbilityMacro flag for hotbar drop. */
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

    // npc-class: only one allowed; if dropping a new one, offer to replace
    if (item.type === "npc-class") {
      const existing = this.actor.system.npcClassId
        ? this.actor.items.get(this.actor.system.npcClassId)
        : null;

      if (existing && existing.uuid === (data.uuid ?? item.uuid)) {
        ui.notifications.info("This class is already assigned.");
        return;
      }

      if (existing) {
        const confirmed = await Dialog.confirm({
          title:   "Replace NPC Class?",
          content: `<p>Replace <strong>${existing.name}</strong> with <strong>${item.name}</strong>?
                    Basic abilities from the old class will be removed.</p>`
        });
        if (!confirmed) return;
        await existing.delete();
        await new Promise(r => setTimeout(r, 50));
      }

      const beforeIds = new Set(this.actor.items.filter(i => i.type === "npc-class").map(i => i.id));
      await super._onDropItem(event, data);
      await new Promise(r => setTimeout(r, 50));
      const newItem = this.actor.items
        .filter(i => i.type === "npc-class")
        .find(i => !beforeIds.has(i.id));
      if (newItem) await this.actor.setNPCClass(newItem.id);
      return;
    }

    // npc-template: any number allowed; auto-grant its basic abilities after drop
    if (item.type === "npc-template") {
      const beforeIds = new Set(this.actor.items.filter(i => i.type === "npc-template").map(i => i.id));
      await super._onDropItem(event, data);
      await new Promise(r => setTimeout(r, 50));
      const newItem = this.actor.items
        .filter(i => i.type === "npc-template")
        .find(i => !beforeIds.has(i.id));
      if (newItem) await this.actor._autoGrantNPCTemplateBasicAbilities(newItem.id);
      return;
    }

    return super._onDropItem(event, data);
  }
}
