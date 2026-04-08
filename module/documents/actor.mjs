/**
 * actor.mjs — Base Actor document class for the Shard system.
 */

export class ShardActor extends Actor {

  /* ------------------------------------------------------------------ */
  /*  Embedded Item Lifecycle                                             */
  /* ------------------------------------------------------------------ */

  async _onDeleteDescendantDocuments(parent, collection, documents, ids, options, userId) {
    await super._onDeleteDescendantDocuments(parent, collection, documents, ids, options, userId);
    if (collection !== "items" || parent !== this) return;

    const deletedIds = new Set(ids);

    // PC class cleanup
    const hadClass = documents.some(d => d.type === "class");
    if (hadClass) {
      const levels = (this.system.classLevels ?? []).filter(cl => !deletedIds.has(cl.itemId));
      const baseStillExists = levels.some(cl => cl.isBase);
      if (!baseStillExists && levels.length > 0) levels[0].isBase = true;
      await this.update({ "system.classLevels": levels });
    }

    // NPC class cleanup — clear npcClassId if the class item was removed
    if (this.type === "npc") {
      const hadNPCClass = documents.some(d => d.type === "npc-class");
      if (hadNPCClass && deletedIds.has(this.system.npcClassId)) {
        await this.update({ "system.npcClassId": "" });
      }
    }
  }

  /* ------------------------------------------------------------------ */
  /*  Damage & Resources                                                  */
  /* ------------------------------------------------------------------ */

  /**
   * Apply damage to this actor, absorbing through Barrier then Temp HP then HP.
   * @param {number} amount       Raw damage amount (before armor).
   * @param {object} [opts]
   * @param {number} [opts.armor]       Armor to subtract. Pass the stored attack-time
   *                                    value (already 0 if ignoreArmor was checked).
   *                                    Defaults to the actor's current stats.armor.
   * @param {string} [opts.damageType] Damage type for resistance/immunity checks.
   * Returns { barrierTaken, hpTaken } so callers can record both for Undo.
   */
  async applyDamage(amount, { armor = null, damageType = "" } = {}) {
    const sys = this.system;
    let remaining = amount;

    if (sys.resistances?.includes(damageType)) remaining = Math.floor(remaining / 2);
    if (sys.immunities?.includes(damageType))  remaining = 0;

    // Use the explicitly-provided armor value (respects ignoreArmor from the attack),
    // falling back to the actor's current armor if none was supplied.
    const effectiveArmor = armor !== null ? armor : (sys.stats?.armor ?? 0);
    remaining = Math.max(0, remaining - effectiveArmor);

    // 1. Barrier absorbs first
    const currentBarrier = sys.barrier ?? 0;
    const barrierTaken   = Math.min(currentBarrier, remaining);
    remaining -= barrierTaken;

    // 2. Temp HP absorbs next (PC only; NPC model has no temp field)
    let newTemp  = sys.hp?.temp ?? 0;
    if (newTemp > 0) {
      const absorbed = Math.min(newTemp, remaining);
      newTemp   -= absorbed;
      remaining -= absorbed;
    }

    // 3. Remainder hits HP
    const hpTaken = remaining;
    const newHP   = Math.max(0, (sys.hp?.value ?? 0) - hpTaken);

    const update = { "system.hp.value": newHP };
    if (barrierTaken > 0)          update["system.barrier"]  = currentBarrier - barrierTaken;
    if (sys.hp?.temp !== undefined) update["system.hp.temp"] = newTemp;

    await this.update(update);
    return { barrierTaken, hpTaken };
  }

  async spendFocus(amount) {
    const current = this.system.focus?.value ?? 0;
    if (current < amount) return false;
    await this.update({ "system.focus.value": current - amount });
    return true;
  }

  /* ------------------------------------------------------------------ */
  /*  Advantage                                                           */
  /* ------------------------------------------------------------------ */

  get netAdvantage() {
    // actor.statuses is Foundry's native Set of active condition IDs,
    // populated from Active Effects applied via the token HUD.
    const statuses = this.statuses ?? new Set();
    const { STATUS_EFFECTS } = game.shard.SHARD;
    let adv = 0, dis = 0;
    for (const statusId of statuses) {
      const effect = STATUS_EFFECTS.find(e => e.id === statusId);
      if (effect) {
        adv += effect.advantageBonus    ?? 0;
        dis += effect.disadvantageBonus ?? 0;
      }
    }
    return adv - dis;
  }

  /* ------------------------------------------------------------------ */
  /*  Class Management                                                    */
  /* ------------------------------------------------------------------ */

  get totalLevel() {
    return this.system.totalLevel ?? 1;
  }

  get baseClassItem() {
    const entry = this.system.classLevels?.find(cl => cl.isBase);
    return entry ? this.items.get(entry.itemId) : undefined;
  }

  /**
   * Set a class as the base class and auto-grant its basic (rank 0) abilities.
   * @param {string} itemId   Embedded class item ID.
   */
  async setBaseClass(itemId) {
    const levels = (this.system.classLevels ?? []).map(cl => ({
      ...cl,
      isBase: cl.itemId === itemId
    }));
    await this.update({ "system.classLevels": levels });
    await this._autoGrantBasicAbilities(itemId);
  }

  /**
   * Auto-grant rank-0 (Basic) abilities from a class onto this actor.
   * Skips abilities already present (matched by source UUID stored on the item).
   * @param {string} classItemId   Embedded class item ID.
   */
  async _autoGrantBasicAbilities(classItemId) {
    const classItem = this.items.get(classItemId);
    if (!classItem) return;

    const basicEntries = (classItem.system.abilities ?? []).filter(a => a.rank === 0 && a.uuid);
    if (!basicEntries.length) return;

    // Collect UUIDs already granted on this actor
    const grantedUUIDs = new Set(
      this.items
        .filter(i => i.system.sourceUUID)
        .map(i => i.system.sourceUUID)
    );

    const toCreate = [];
    for (const entry of basicEntries) {
      if (grantedUUIDs.has(entry.uuid)) continue;
      try {
        const sourceItem = await fromUuid(entry.uuid);
        if (!sourceItem) continue;
        const data = sourceItem.toObject();
        // Tag with source UUID so we can detect duplicates next time
        foundry.utils.setProperty(data, "system.sourceUUID", entry.uuid);
        toCreate.push(data);
      } catch(e) {
        console.warn(`Shard | Could not fetch ability ${entry.uuid}:`, e);
      }
    }

    if (toCreate.length) {
      await this.createEmbeddedDocuments("Item", toCreate);
    }
  }

  async setClassLevel(itemId, level) {
    const levels = (this.system.classLevels ?? []).map(cl =>
      cl.itemId === itemId ? { ...cl, level } : cl
    );
    return this.update({ "system.classLevels": levels });
  }

  async registerClassLevel(itemId) {
    const existing = (this.system.classLevels ?? []).find(cl => cl.itemId === itemId);
    if (existing) return;
    const isFirst = (this.system.classLevels ?? []).length === 0;
    const levels  = [...(this.system.classLevels ?? []), { itemId, level: 1, isBase: isFirst }];
    await this.update({ "system.classLevels": levels });
    if (isFirst) await this._autoGrantBasicAbilities(itemId);
  }

  /* ------------------------------------------------------------------ */
  /*  NPC Class Management                                                */
  /* ------------------------------------------------------------------ */

  /**
   * Set the active NPC class, inherit its stats, and auto-grant its basic
   * npc-ability items. Removes basic abilities from the old class first.
   * @param {string} itemId  Embedded npc-class item ID.
   */
  async setNPCClass(itemId) {
    const oldClassId = this.system.npcClassId;

    // Remove basic abilities previously granted by the old class
    if (oldClassId && oldClassId !== itemId) {
      const oldClass   = this.items.get(oldClassId);
      const basicUUIDs = new Set(
        (oldClass?.system.abilities ?? [])
          .filter(a => a.tier === "basic" && a.uuid)
          .map(a => a.uuid)
      );
      const toDelete = this.items
        .filter(i => i.type === "npc-ability" && basicUUIDs.has(i.system?.sourceUUID))
        .map(i => i.id);
      if (toDelete.length) await this.deleteEmbeddedDocuments("Item", toDelete);
    }

    // Inherit stats from the new class
    const classItem = this.items.get(itemId);
    if (classItem) {
      const s = classItem.system.stats;
      await this.update({
        "system.npcClassId":  itemId,
        "system.hp.max":      s.maxHP,
        "system.hp.value":    Math.min(this.system.hp.value, s.maxHP),
        "system.stats.armor": s.armor,
        "system.stats.def":   s.def,
        "system.stats.spd":   s.spd
      });
    } else {
      await this.update({ "system.npcClassId": itemId });
    }

    await this._autoGrantNPCBasicAbilities(itemId);
  }

  /**
   * Auto-grant the basic npc-ability items from an npc-class onto this NPC.
   * Skips abilities already present (matched via sourceUUID).
   * @param {string} classItemId  Embedded npc-class item ID.
   */
  async _autoGrantNPCBasicAbilities(classItemId) {
    const classItem = this.items.get(classItemId);
    if (!classItem) return;

    const basicEntries = (classItem.system.abilities ?? [])
      .filter(a => a.tier === "basic" && a.uuid);
    if (!basicEntries.length) return;

    const grantedUUIDs = new Set(
      this.items.filter(i => i.system?.sourceUUID).map(i => i.system.sourceUUID)
    );

    const toCreate = [];
    for (const entry of basicEntries) {
      if (grantedUUIDs.has(entry.uuid)) continue;
      try {
        const src = await fromUuid(entry.uuid);
        if (!src) continue;
        const data = src.toObject();
        foundry.utils.setProperty(data, "system.sourceUUID", entry.uuid);
        toCreate.push(data);
      } catch(e) {
        console.warn(`Shard | Could not fetch npc-ability ${entry.uuid}:`, e);
      }
    }

    if (toCreate.length) await this.createEmbeddedDocuments("Item", toCreate);
  }

  /**
   * Grant the basic npc-ability items from an npc-template onto this NPC.
   * Does NOT inherit stats. Skips duplicates by sourceUUID.
   * @param {string} templateItemId  Embedded npc-template item ID.
   */
  async _autoGrantNPCTemplateBasicAbilities(templateItemId) {
    const tmpl = this.items.get(templateItemId);
    if (!tmpl) return;

    const basicEntries = (tmpl.system.abilities ?? [])
      .filter(a => a.tier === "basic" && a.uuid);
    if (!basicEntries.length) return;

    const grantedUUIDs = new Set(
      this.items.filter(i => i.system?.sourceUUID).map(i => i.system.sourceUUID)
    );

    const toCreate = [];
    for (const entry of basicEntries) {
      if (grantedUUIDs.has(entry.uuid)) continue;
      try {
        const src = await fromUuid(entry.uuid);
        if (!src) continue;
        const data = src.toObject();
        foundry.utils.setProperty(data, "system.sourceUUID", entry.uuid);
        toCreate.push(data);
      } catch(e) {
        console.warn(`Shard | Could not fetch npc-ability ${entry.uuid}:`, e);
      }
    }

    if (toCreate.length) await this.createEmbeddedDocuments("Item", toCreate);
  }
}
