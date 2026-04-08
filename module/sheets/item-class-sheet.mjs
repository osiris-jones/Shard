/**
 * item-class-sheet.mjs — Sheet for Class items.
 *
 * Abilities are dragged onto this sheet and stored by UUID.
 * Rank is read from the dragged ability's system.rank field,
 * so set the rank on the ability item before dragging it in.
 */

export class ShardClassSheet extends ItemSheet {

  static get defaultOptions() {
    return foundry.utils.mergeObject(super.defaultOptions, {
      classes: ["shard", "sheet", "item", "class"],
      template: "systems/shard/templates/items/class-sheet.hbs",
      width: 620,
      height: 700,
      tabs: [{ navSelector: ".sheet-tabs", contentSelector: ".sheet-body", initial: "basics" }],
      dragDrop: [{ dropSelector: ".ability-drop-zone" }],
      editorOptions: { engine: "prosemirror" }
    });
  }

  async getData() {
    const context          = await super.getData();
    context.system         = this.item.system;
    context.descHTML       = await foundry.applications.ux.TextEditor.implementation
                               .enrichHTML(this.item.system.description, { async: true });
    context.config         = game.shard.SHARD;
    context.abilitiesByRank = this.item.system.abilitiesByRank;
    return context;
  }

  activateListeners(html) {
    super.activateListeners(html);
    if (!this.isEditable) return;

    html.on("click", ".ability-remove",  this._onRemoveAbility.bind(this));
  }

  /* ------------------------------------------------------------------ */
  /*  Drag & Drop — receive ability items                                 */
  /* ------------------------------------------------------------------ */

  async _onDrop(event) {
    let data;
    try {
      data = JSON.parse(event.dataTransfer.getData("text/plain"));
    } catch(e) { return; }

    if (data.type !== "Item") return;

    // Resolve the dropped item
    let item;
    try {
      item = await Item.fromDropData(data);
    } catch(e) { return; }

    if (!item || item.type !== "ability") {
      ui.notifications.warn("Only Ability items can be dropped onto a Class.");
      return;
    }

    const uuid = data.uuid ?? item.uuid;
    const rank = item.system.rank ?? 1;
    const name = item.name;

    // Prevent duplicates
    const already = (this.item.system.abilities ?? []).some(a => a.uuid === uuid);
    if (already) {
      ui.notifications.info(`${name} is already in this class.`);
      return;
    }

    const abilities = [...(this.item.system.abilities ?? []), { uuid, name, rank }];
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
