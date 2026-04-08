/**
 * model-npc-template.mjs — TypeDataModel for NPC Templates.
 *
 * An NPC Template has no base stat block; it is purely a container for
 * NPC Ability items sorted by tier (basic / optional).
 * Templates layer on top of an NPC's base class on the NPC sheet.
 */

const { fields } = foundry.data;

export class NpcTemplateDataModel extends foundry.abstract.TypeDataModel {

  static defineSchema() {
    return {

      /* ---- Description --------------------------------------------- */
      description: new fields.HTMLField({ initial: "" }),

      /* ---- Abilities ------------------------------------------------ */
      abilities: new fields.ArrayField(
        new fields.SchemaField({
          uuid: new fields.StringField({ initial: "" }),
          name: new fields.StringField({ initial: "" }),
          tier: new fields.StringField({ initial: "basic", choices: ["basic", "optional"] })
        }),
        { initial: [] }
      )
    };
  }

  /* ------------------------------------------------------------------ */
  /*  Derived Data                                                        */
  /* ------------------------------------------------------------------ */

  prepareDerivedData() {
    this.abilitiesByTier = { basic: [], optional: [] };
    for (const entry of this.abilities) {
      const t = entry.tier ?? "basic";
      if (this.abilitiesByTier[t]) this.abilitiesByTier[t].push(entry);
    }
  }
}
