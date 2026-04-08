/**
 * model-npc-ability.mjs — TypeDataModel for NPC Abilities.
 *
 * Differences from player AbilityDataModel:
 *  - No rank (1–5); instead a tier: "basic" | "optional"
 *  - No focusCost; instead a "charged" boolean
 *  - Everything else (cost, isAttack, modifiers, tags, range, effect…) is identical
 */

const { fields } = foundry.data;

export const NPC_ABILITY_TIERS = {
  basic:    "Basic",
  optional: "Optional"
};

class ModifierField extends fields.SchemaField {
  constructor() {
    super({
      target: new fields.StringField({ initial: "hp.max" }),
      value:  new fields.NumberField({ integer: true, initial: 0 }),
      label:  new fields.StringField({ initial: "" })
    });
  }
}

export class NPCAbilityDataModel extends foundry.abstract.TypeDataModel {

  static defineSchema() {
    return {
      /* ---- Tier ---------------------------------------------------- */
      tier: new fields.StringField({
        required: true,
        initial: "basic",
        choices: Object.keys(NPC_ABILITY_TIERS)
      }),

      /* ---- Cost ----------------------------------------------------- */
      cost: new fields.StringField({
        required: true,
        initial: "1",
        choices: ["passive", "reaction", "0", "1", "2", "3"]
      }),
      charged: new fields.BooleanField({ initial: false }),

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
      sourceUUID: new fields.StringField({ initial: "" }),

      /* ---- Effect / Description ------------------------------------ */
      effect: new fields.HTMLField({ initial: "" })
    };
  }

  prepareDerivedData() {
    this.isPassive  = this.cost === "passive";
    this.isReaction = this.cost === "reaction";
    this.isFree     = this.cost === "0";
    this.apCost     = ["passive", "reaction", "0"].includes(this.cost)
      ? null
      : Number(this.cost);
  }

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
