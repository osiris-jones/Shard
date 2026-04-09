/**
 * model-npc-class.mjs — TypeDataModel for NPC Classes.
 *
 * An NPC class has a small stat block (Max HP, Armor, DEF, SPD) and
 * serves as a container for NPC Ability items, sorted by tier
 * (basic = auto-granted, optional = selectable).
 */

const { fields } = foundry.data;

export class NpcClassDataModel extends foundry.abstract.TypeDataModel {

  static defineSchema() {
    return {

      /* ---- Description --------------------------------------------- */
      description: new fields.HTMLField({ initial: "" }),

      /* ---- Base Stats ----------------------------------------------- */
      stats: new fields.SchemaField({
        // HP formula: hp + hpBonus × tier  (templates leave both at 0)
        hp:      new fields.NumberField({ integer: true, initial: 10, min: 0 }),
        hpBonus: new fields.NumberField({ integer: true, initial: 0,  min: 0 }),
        armor:   new fields.NumberField({ integer: true, initial: 0,  min: 0 }),
        def:     new fields.NumberField({ integer: true, initial: 10, min: 0 }),
        spd:     new fields.NumberField({ integer: true, initial: 5,  min: 0 })
      }),

      /* ---- Abilities ------------------------------------------------ */
      // Each entry stores a UUID pointing to an npc-ability item.
      // tier: "basic" = auto-granted, "optional" = selectable by GM.
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
