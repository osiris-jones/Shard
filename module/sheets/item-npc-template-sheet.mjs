/**
 * item-npc-template-sheet.mjs — Sheet for NPC Template items.
 *
 * NPC Templates contain only Basic/Optional abilities with no stat block.
 * They layer additional abilities on top of an NPC's base class.
 */

export class ShardNPCTemplateSheet extends ItemSheet {

  static get defaultOptions() {
    return foundry.utils.mergeObject(super.defaultOptions, {
      classes: ["shard", "sheet", "item", "npc-template"],
      template: "systems/shard/templates/items/npc-template-sheet.hbs",
      width: 580,
      height: 600,
      dragDrop: [{ dropSelector: ".ability-drop-zone" }],
      editorOptions: { engine: "prosemirror" }
    });
  }

  async getData() {
    const context           = await super.getData();
    context.system          = this.item.system;
    context.descHTML        = await foundry.applications.ux.TextEditor.implementation
                                .enrichHTML(this.item.system.description, { async: true });
    context.abilitiesByTier = this.item.system.abilitiesByTier;
    return context;
  }

  activateListeners(html) {
    super.activateListeners(html);
    if (!this.isEditable) return;

    html.on("click", ".ability-remove", this._onRemoveAbility.bind(this));
  }

  /* ------------------------------------------------------------------ */
  /*  Drag & Drop — receive npc-ability items                             */
  /* ------------------------------------------------------------------ */

  async _onDrop(event) {
    let data;
    try {
      data = JSON.parse(event.dataTransfer.getData("text/plain"));
    } catch(e) { return; }

    if (data.type !== "Item") return;

    let item;
    try {
      item = await Item.fromDropData(data);
    } catch(e) { return; }

    if (!item || item.type !== "npc-ability") {
      ui.notifications.warn("Only NPC Ability items can be dropped onto an NPC Template.");
      return;
    }

    const uuid = data.uuid ?? item.uuid;
    const tier = item.system.tier ?? "basic";
    const name = item.name;

    const already = (this.item.system.abilities ?? []).some(a => a.uuid === uuid);
    if (already) {
      ui.notifications.info(`${name} is already in this template.`);
      return;
    }

    const abilities = [...(this.item.system.abilities ?? []), { uuid, name, tier }];
    return this.item.update({ "system.abilities": abilities });
  }

  /* ------------------------------------------------------------------ */
  /*  Ability Removal                                                     */
  /* ------------------------------------------------------------------ */

  async _onRemoveAbility(event) {
    const uuid      = event.currentTarget.dataset.uuid;
    const abilities = (this.item.system.abilities ?? []).filter(a => a.uuid !== uuid);
    return this.item.update({ "system.abilities": abilities });
  }
}
