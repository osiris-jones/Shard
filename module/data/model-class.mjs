/**
 * model-class.mjs — TypeDataModel for PC Classes.
 *
 * A class is a container for abilities as well as a stat template.
 * Abilities are dragged onto the class sheet and stored by UUID.
 *
 * Ability ranks:
 *   0 = Basic — automatically granted when this is a PC's base class
 *   1-5 = Class abilities — player selects from the PC sheet
 */

const { fields } = foundry.data;

export class ClassDataModel extends foundry.abstract.TypeDataModel {

  static defineSchema() {
    return {

      /* ---- Description --------------------------------------------- */
      description: new fields.HTMLField({ initial: "" }),

      /* ---- Base Stats ----------------------------------------------- */
      stats: new fields.SchemaField({
        atk:       new fields.StringField({ initial: "d6", choices: ["d4","d6","d8","d10","d12"] }),
        mag:       new fields.StringField({ initial: "d6", choices: ["d4","d6","d8","d10","d12"] }),
        def:       new fields.NumberField({ integer: true, initial: 10, min: 0 }),
        spd:       new fields.NumberField({ integer: true, initial: 5,  min: 0 }),
        armor:     new fields.NumberField({ integer: true, initial: 0,  min: 0 }),
        focusPool: new fields.NumberField({ integer: true, initial: 3,  min: 0 }),
        maxHP:     new fields.NumberField({ integer: true, initial: 10, min: 1 })
      }),

      /* ---- Abilities ------------------------------------------------ */
      // Unified list — rank 0 = Basic (auto-granted), rank 1-5 = class abilities.
      // Each entry stores the Foundry UUID of the source ability item so it can
      // be fetched and copied onto a PC when selected.
      abilities: new fields.ArrayField(
        new fields.SchemaField({
          uuid: new fields.StringField({ initial: "" }),   // compendium or world UUID
          name: new fields.StringField({ initial: "" }),   // cached for display
          rank: new fields.NumberField({ integer: true, initial: 1, min: 0, max: 5 })
        }),
        { initial: [] }
      )
    };
  }

  /* ------------------------------------------------------------------ */
  /*  Derived Data                                                        */
  /* ------------------------------------------------------------------ */

  prepareDerivedData() {
    // Group abilities by rank for template iteration: { 0: [...], 1: [...], ... }
    this.abilitiesByRank = { 0: [], 1: [], 2: [], 3: [], 4: [], 5: [] };
    for (const entry of this.abilities) {
      const r = entry.rank ?? 1;
      if (this.abilitiesByRank[r]) this.abilitiesByRank[r].push(entry);
    }
  }
}
