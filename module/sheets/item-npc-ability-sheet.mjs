/**
 * item-npc-ability-sheet.mjs — Sheet for NPC Ability items.
 */

import { MODIFIER_TARGETS } from "../data/model-ability.mjs";
import { NPC_ABILITY_TIERS } from "../data/model-npc-ability.mjs";

export class ShardNPCAbilitySheet extends ItemSheet {

  static get defaultOptions() {
    return foundry.utils.mergeObject(super.defaultOptions, {
      classes: ["shard", "sheet", "item", "npc-ability"],
      template: "systems/shard/templates/items/npc-ability-sheet.hbs",
      width: 540,
      height: 600,
      dragDrop: [{ dropSelector: ".tag-drop-zone" }],
      editorOptions: { engine: "prosemirror" }
    });
  }

  async getData() {
    const context = await super.getData();
    context.system     = this.item.system;
    context.effectHTML = this.item.system.effect
      ? await foundry.applications.ux.TextEditor.implementation.enrichHTML(
          this.item.system.effect, { async: true }
        )
      : "";
    context.activeCosts = Object.fromEntries(
      Object.entries(game.shard.SHARD.ABILITY_COSTS).filter(([k]) => k !== "passive")
    );
    context.config = {
      ...game.shard.SHARD,
      MODIFIER_TARGETS,
      NPC_ABILITY_TIERS
    };

    // Build tag UUID → description map for tooltip display
    const tagDescriptions = {};
    await Promise.all((this.item.system.tags ?? []).map(async t => {
      if (!t.uuid) return;
      try {
        const tag = await fromUuid(t.uuid);
        if (tag?.system?.description) tagDescriptions[t.uuid] = tag.system.description;
      } catch(e) {}
    }));
    context.tagDescriptions = tagDescriptions;

    return context;
  }

  activateListeners(html) {
    super.activateListeners(html);
    if (!this.isEditable) return;

    html.on("change", ".cost-mode-radio", this._onCostModeChange.bind(this));
    html.on("click",  ".tag-remove",      this._onTagRemove.bind(this));
    html.on("click",  ".modifier-add",    this._onModifierAdd.bind(this));
    html.on("click",  ".modifier-remove", this._onModifierRemove.bind(this));
  }

  async _onCostModeChange(event) {
    const mode = event.currentTarget.value;
    if (mode === "passive") {
      await this.item.update({
        "system.cost":          "passive",
        "system.isAttack":      false,
        "system.hasResistance": false
      });
    } else {
      await this.item.update({ "system.cost": "1" });
    }
  }

  async _onDrop(event) {
    let data;
    try { data = JSON.parse(event.dataTransfer.getData("text/plain")); } catch(e) { return; }
    if (data.type !== "Item") return;

    let item;
    try { item = await Item.fromDropData(data); } catch(e) { return; }

    if (!item || item.type !== "tag") {
      ui.notifications.warn("Only Tag items can be dropped here.");
      return;
    }

    const uuid    = data.uuid ?? item.uuid;
    const already = (this.item.system.tags ?? []).some(t => t.uuid === uuid);
    if (already) { ui.notifications.info(`${item.name} is already on this ability.`); return; }

    const tags = [...(this.item.system.tags ?? []), {
      uuid,
      name:        item.name,
      description: item.system.description ?? ""
    }];
    return this.item.update({ "system.tags": tags });
  }

  async _onTagRemove(event) {
    const uuid = event.currentTarget.dataset.uuid;
    const tags = (this.item.system.tags ?? []).filter(t => t.uuid !== uuid);
    return this.item.update({ "system.tags": tags });
  }

  async _onModifierAdd(event) {
    const mods = [...(this.item.system.modifiers ?? [])];
    mods.push({ target: "hp.max", value: 0, label: "" });
    return this.item.update({ "system.modifiers": mods });
  }

  async _onModifierRemove(event) {
    const idx  = parseInt(event.currentTarget.dataset.index, 10);
    const mods = [...(this.item.system.modifiers ?? [])];
    mods.splice(idx, 1);
    return this.item.update({ "system.modifiers": mods });
  }
}
