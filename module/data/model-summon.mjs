/**
 * model-summon.mjs — TypeDataModel for Summon / Deployable actors.
 *
 * All stats are stored and edited directly — no class derivation.
 * Mirrors the PC stat set (HP, Focus, Barrier, ATK, MAG, DEF, SPD,
 * Armor, Tier, ATK+, MAG+, custom resources) but without classLevels,
 * biography, or narrative tags.
 */

const { fields } = foundry.data;

class ResourceField extends fields.SchemaField {
  constructor() {
    super({
      label:   new fields.StringField({ initial: "" }),
      value:   new fields.NumberField({ nullable: true, initial: 0, min: 0 }),
      max:     new fields.NumberField({ nullable: true, initial: 0, min: 0 }),
      visible: new fields.BooleanField({ initial: false })
    });
  }
}

export class SummonDataModel extends foundry.abstract.TypeDataModel {

  static defineSchema() {
    return {

      hp: new fields.SchemaField({
        value: new fields.NumberField({ required: true, integer: true, initial: 6,  min: 0 }),
        max:   new fields.NumberField({ required: true, integer: true, initial: 6,  min: 0 }),
        temp:  new fields.NumberField({ required: true, integer: true, initial: 0,  min: 0 })
      }),

      barrier: new fields.NumberField({ required: true, integer: true, initial: 0, min: 0 }),

      focus: new fields.SchemaField({
        value: new fields.NumberField({ required: true, integer: true, initial: 0, min: 0 }),
        max:   new fields.NumberField({ required: true, integer: true, initial: 0, min: 0 })
      }),

      resources: new fields.SchemaField({
        r1: new ResourceField(),
        r2: new ResourceField(),
        r3: new ResourceField()
      }),

      stats: new fields.SchemaField({
        atk:   new fields.StringField({ initial: "d6" }),
        mag:   new fields.StringField({ initial: "d6" }),
        def:   new fields.NumberField({ integer: true, initial: 10, min: 0 }),
        spd:   new fields.NumberField({ integer: true, initial: 5,  min: 0 }),
        armor: new fields.NumberField({ integer: true, initial: 0,  min: 0 }),
        tier:  new fields.NumberField({ integer: true, initial: 1,  min: 1 })
      }),

      notes: new fields.HTMLField({ initial: "" }),

      atkBonus: new fields.NumberField({ integer: true, initial: 0, nullable: false }),
      magBonus: new fields.NumberField({ integer: true, initial: 0, nullable: false })
    };
  }
}
