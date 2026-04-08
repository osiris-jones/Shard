/**
 * model-pc.mjs — TypeDataModel for Player Characters.
 *
 * Derivation order (always computed from scratch):
 *  1. totalLevel  = sum of classLevels entries whose item exists
 *  2. tier        = max(1, floor(totalLevel / 4))
 *  3. Reset all stats to schema defaults
 *  4. Overlay base class stats (ATK, MAG, DEF, SPD, Armor, base HP, base Focus)
 *  5. hp.max  = classBase + totalLevel
 *  6. focus.max = classBase + tier
 *  7. Passive ability modifiers
 *  8. Clamp current values to new maxes
 */

const { fields } = foundry.data;

const STAT_DEFAULTS = { atk: "d6", mag: "d6", def: 10, spd: 5, armor: 0, tier: 1 };
const HP_DEFAULT    = 6;
const FOCUS_DEFAULT = 0;

class ResourceField extends fields.SchemaField {
  constructor() {
    super({
      label:   new fields.StringField({ initial: "" }),
      // nullable: true lets the form submit "" without crashing.
      // No integer: true — Foundry v13 form parser sometimes emits floats
      // for whole-number inputs; the template displays Math.floor() instead.
      value:   new fields.NumberField({ nullable: true, initial: 0, min: 0 }),
      max:     new fields.NumberField({ nullable: true, initial: 0, min: 0 }),
      visible: new fields.BooleanField({ initial: false })
    });
  }
}

export class PCDataModel extends foundry.abstract.TypeDataModel {

  static defineSchema() {
    return {

      hp: new fields.SchemaField({
        value: new fields.NumberField({ required: true, integer: true, initial: 6, min: 0 }),
        max:   new fields.NumberField({ required: true, integer: true, initial: 6, min: 0 }),
        temp:  new fields.NumberField({ required: true, integer: true, initial: 0, min: 0 })
      }),

      // Barrier: absorbs incoming damage before HP; no maximum; set directly on sheet.
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

      biography:     new fields.HTMLField({ initial: "" }),
      notes:         new fields.HTMLField({ initial: "" }),
      narrativeTags: new fields.ArrayField(
        new fields.StringField({ blank: true }),
        { initial: [] }
      ),

      classLevels: new fields.ArrayField(
        new fields.SchemaField({
          itemId: new fields.StringField({ required: true, initial: "" }),
          level:  new fields.NumberField({ required: true, integer: true, initial: 1, min: 1 }),
          isBase: new fields.BooleanField({ initial: false })
        }),
        { initial: [] }
      ),

      statuses: new fields.ArrayField(
        new fields.StringField({ blank: false }),
        { initial: [] }
      ),

      // Flat bonuses added to damage per AP spent (see attack-dialog.mjs).
      atkBonus: new fields.NumberField({ integer: true, initial: 0, nullable: false }),
      magBonus: new fields.NumberField({ integer: true, initial: 0, nullable: false })
    };
  }

  /* ------------------------------------------------------------------ */
  /*  Derived Data                                                        */
  /* ------------------------------------------------------------------ */

  prepareDerivedData() {
    const parent = this.parent;

    // ── 1. Total level ─────────────────────────────────────────────────
    let totalLevel = 0;
    if (parent?.items) {
      for (const cl of this.classLevels) {
        if (parent.items.has(cl.itemId)) totalLevel += cl.level;
      }
    } else {
      totalLevel = this.classLevels.reduce((s, cl) => s + cl.level, 0);
    }
    this.totalLevel = Math.max(1, totalLevel);

    // ── 2. Tier ────────────────────────────────────────────────────────
    const tier = Math.max(1, Math.floor(this.totalLevel / 4));
    this.stats.tier = tier;

    // ── 3. Reset to defaults ───────────────────────────────────────────
    this.stats.atk   = STAT_DEFAULTS.atk;
    this.stats.mag   = STAT_DEFAULTS.mag;
    this.stats.def   = STAT_DEFAULTS.def;
    this.stats.spd   = STAT_DEFAULTS.spd;
    this.stats.armor = STAT_DEFAULTS.armor;

    let baseHP    = HP_DEFAULT;
    let baseFocus = FOCUS_DEFAULT;

    // ── 4. Base class overlay ──────────────────────────────────────────
    if (parent?.items) {
      const baseEntry = this.classLevels.find(
        cl => cl.isBase && parent.items.has(cl.itemId)
      );
      if (baseEntry) {
        const bc = parent.items.get(baseEntry.itemId);
        if (bc?.system?.stats) {
          const cs       = bc.system.stats;
          this.stats.atk   = cs.atk;
          this.stats.mag   = cs.mag;
          this.stats.def   = cs.def;
          this.stats.spd   = cs.spd;
          this.stats.armor = cs.armor;
          baseHP           = cs.maxHP;
          baseFocus        = cs.focusPool;
        }
      }
    }

    // ── 5 & 6. Scaling ────────────────────────────────────────────────
    this.hp.max    = baseHP    + this.totalLevel;
    this.focus.max = baseFocus + tier;

    // ── 7. Passive modifiers ───────────────────────────────────────────
    if (parent?.items) {
      for (const item of parent.items) {
        if (item.type !== "ability" || item.system.cost !== "passive") continue;
        for (const mod of (item.system.modifiers ?? [])) {
          if (!mod.target || mod.value === 0) continue;
          _applyModifier(this, mod.target, mod.value);
        }
      }
    }

    // ── 8. Clamp ───────────────────────────────────────────────────────
    this.hp.value    = Math.min(this.hp.value,    this.hp.max);
    this.focus.value = Math.min(this.focus.value, this.focus.max);
  }
}

function _applyModifier(data, target, value) {
  const parts = target.split(".");
  let obj = data;
  for (let i = 0; i < parts.length - 1; i++) {
    obj = obj?.[parts[i]];
    if (obj == null) return;
  }
  const key = parts[parts.length - 1];
  if (typeof obj[key] === "number") obj[key] += value;
}
