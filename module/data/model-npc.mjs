/**
 * model-npc.mjs — TypeDataModel for Non-Player Characters.
 *
 * NPCs are simpler than PCs: no class system, no focus pool,
 * just flat stats and an abilities list.
 */

const { fields } = foundry.data;

export class NPCDataModel extends foundry.abstract.TypeDataModel {

  static defineSchema() {
    return {

      /* ---- Vitals --------------------------------------------------- */
      hp: new fields.SchemaField({
        value: new fields.NumberField({ required: true, integer: true, initial: 10, min: 0 }),
        max:   new fields.NumberField({ required: true, integer: true, initial: 10, min: 0 })
      }),

      // Barrier: absorbs incoming damage before HP; no maximum; set directly on sheet.
      barrier: new fields.NumberField({ required: true, integer: true, initial: 0, min: 0 }),

      /* ---- Flat Stats ----------------------------------------------- */
      stats: new fields.SchemaField({
        atk:   new fields.StringField({ initial: "d6" }),
        def:   new fields.NumberField({ integer: true, initial: 10, min: 0 }),
        spd:   new fields.NumberField({ integer: true, initial: 5,  min: 0 }),
        armor: new fields.NumberField({ integer: true, initial: 0,  min: 0 }),
        tier:  new fields.NumberField({ integer: true, initial: 1,  min: 1 })
      }),

      /* ---- Resistances / Immunities --------------------------------- */
      // Array of damage type strings the NPC resists (half damage)
      resistances: new fields.ArrayField(
        new fields.StringField({ blank: false }),
        { initial: [] }
      ),
      immunities: new fields.ArrayField(
        new fields.StringField({ blank: false }),
        { initial: [] }
      ),

      /* ---- Narrative ------------------------------------------------ */
      biography: new fields.HTMLField({ initial: "" }),

      narrativeTags: new fields.ArrayField(
        new fields.StringField({ blank: true }),
        { initial: [] }
      ),

      /* ---- Status Effects ------------------------------------------ */
      statuses: new fields.ArrayField(
        new fields.StringField({ blank: false }),
        { initial: [] }
      ),

      /* ---- Class / Template Tracking ------------------------------- */
      // ID of the embedded npc-class item currently active on this NPC.
      // Empty string means no class assigned.
      npcClassId: new fields.StringField({ initial: "", blank: true })
    };
  }

  prepareDerivedData() {
    // NPC stats are set directly on the model (or synced from class via setNPCClass).
  }
}
