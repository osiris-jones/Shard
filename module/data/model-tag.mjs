/**
 * model-tag.mjs — TypeDataModel for Tags.
 *
 * Tags are lightweight compendium items (Attack, Spell, Melee, Ranged, etc.)
 * that can be attached to abilities. They're stored by name reference on
 * the ability for portability, but exist as full items in the compendium
 * so they can carry descriptions and mechanical effects in future.
 */

const { fields } = foundry.data;

export class TagDataModel extends foundry.abstract.TypeDataModel {

  static defineSchema() {
    return {
      // Short description of what this tag means mechanically (HTML)
      description: new fields.HTMLField({ initial: "" }),

      // Optional: does this tag confer advantage/disadvantage on attacks?
      advantageBonus:    new fields.NumberField({ integer: true, initial: 0 }),
      disadvantageBonus: new fields.NumberField({ integer: true, initial: 0 })
    };
  }
}
