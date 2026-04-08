/**
 * model-ability.mjs — TypeDataModel for PC Abilities.
 */

const { fields } = foundry.data;

/**
 * Valid stat keys that a modifier can target.
 * Adding a new key here is all that's needed to support future modifier targets.
 */
export const MODIFIER_TARGETS = {
  "hp.max":      "Max HP",
  "focus.max":   "Focus Pool",
  "stats.def":   "DEF",
  "stats.spd":   "SPD",
  "stats.armor": "Armor",
  "stats.tier":  "Tier"
};

class ModifierField extends fields.SchemaField {
  constructor() {
    super({
      // Dot-path into the actor's system data, e.g. "hp.max" or "stats.def"
      target: new fields.StringField({ initial: "hp.max" }),
      // Flat numeric bonus (can be negative)
      value:  new fields.NumberField({ integer: true, initial: 0 }),
      // Human-readable label shown in the ability sheet
      label:  new fields.StringField({ initial: "" })
    });
  }
}

export class AbilityDataModel extends foundry.abstract.TypeDataModel {

  static defineSchema() {
    return {

      /* ---- Cost ----------------------------------------------------- */
      cost: new fields.StringField({
        required: true,
        initial: "1",
        choices: ["passive", "reaction", "0", "1", "2", "3"]
      }),
      focusCost: new fields.NumberField({ required: true, integer: true, initial: 0, min: 0 }),

      /* ---- Class Association --------------------------------------- */
      classId:  new fields.StringField({ initial: "" }),
      rank:     new fields.NumberField({ integer: true, initial: 0, min: 0, max: 5 }),
      // Innate abilities (Basic Attack, Study, etc.) are not tied to any class.
      // They appear in their own section on the PC sheet above class-granted abilities.
      isInnate: new fields.BooleanField({ initial: false }),

      /* ---- Attack -------------------------------------------------- */
      isAttack:    new fields.BooleanField({ initial: false }),
      damage:      new fields.StringField({ initial: "" }),
      hasGraze:    new fields.BooleanField({ initial: false }),
      grazeDamage: new fields.StringField({ initial: "" }),

      /* ---- Resistance Roll ----------------------------------------- */
      hasResistance:    new fields.BooleanField({ initial: false }),
      resistanceDV:     new fields.StringField({ initial: "10" }),
      resistanceDamage: new fields.StringField({ initial: "" }),

      /* ---- Passive Modifiers --------------------------------------- */
      // Applied to the owning actor whenever this ability is in their item list
      // and the ability is passive (cost === "passive").
      modifiers: new fields.ArrayField(new ModifierField(), { initial: [] }),

      /* ---- Tags ----------------------------------------------------- */
      // Each entry is a reference to a Tag item: { uuid, name, description }.
      // name and description are cached for display without needing to re-fetch.
      tags: new fields.ArrayField(
        new fields.SchemaField({
          uuid:        new fields.StringField({ initial: "" }),
          name:        new fields.StringField({ initial: "" }),
          description: new fields.StringField({ initial: "" })
        }),
        { initial: [] }
      ),

      /* ---- Range ---------------------------------------------------- */
      range: new fields.StringField({ initial: "" }),

      /* ---- Provenance --------------------------------------------- */
      // Set when this ability was auto-granted or added from a class item.
      // Used to avoid duplicate grants.
      sourceUUID: new fields.StringField({ initial: "" }),

      /* ---- Effect / Description ------------------------------------ */
      effect: new fields.HTMLField({ initial: "" })
    };
  }

  /* ------------------------------------------------------------------ */
  /*  Derived Data                                                        */
  /* ------------------------------------------------------------------ */

  prepareDerivedData() {
    this.isPassive  = this.cost === "passive";
    this.isReaction = this.cost === "reaction";
    this.isFree     = this.cost === "0";
    this.apCost     = ["passive", "reaction", "0"].includes(this.cost)
      ? null
      : Number(this.cost);
  }

  /* ------------------------------------------------------------------ */
  /*  Formula Resolution                                                  */
  /* ------------------------------------------------------------------ */

  _resolveTokens(formula, actor) {
    if (!formula || !actor) return formula ?? "";
    const atk  = actor.system.stats?.atk  ?? "d6";
    const mag  = actor.system.stats?.mag  ?? "d6";
    const tier = actor.system.stats?.tier ?? 1;
    return formula
      .replace(/\[atk\]/gi,  atk)
      .replace(/\[mag\]/gi,  mag)
      .replace(/\[tier\]/gi, String(tier));
  }

  resolveDamageFormula(actor)  { return this._resolveTokens(this.damage,           actor); }
  resolveGrazeFormula(actor)   { return this._resolveTokens(this.grazeDamage,      actor); }
  resolveResistFormula(actor)  { return this._resolveTokens(this.resistanceDamage, actor); }
  resolveResistanceDV(actor) {
    const expr = this._resolveTokens(this.resistanceDV, actor);
    try { return new Roll(expr).evaluateSync().total || 10; }
    catch(e) { return parseInt(expr, 10) || 10; }
  }
}
