/**
 * config.mjs — Global constants and configuration for the Shard system.
 */

export const SHARD = {

  ABILITY_COSTS: {
    passive:  "Passive",
    reaction: "Reaction",
    0: "Free (0 AP)",
    1: "1 AP",
    2: "2 AP",
    3: "3 AP"
  },

  // Die types for ATK and MAG
  STAT_DICE: {
    "d4":  "d4",
    "d6":  "d6",
    "d8":  "d8",
    "d10": "d10",
    "d12": "d12"
  },

  CLASS_STATS: ["atk", "mag", "def", "spd", "armor", "focusPool", "maxHP"],

  RANK_LEVEL_REQUIREMENTS: { 1: 1, 2: 2, 3: 4, 4: 5, 5: 8 },  // edit here to change unlock levels
  RANK_PREREQ:             { 1: 0, 2: 1, 3: 2, 4: 3, 5: 4 },

  // STATUS_EFFECTS drives both Foundry's token HUD conditions (img / name)
  // and this system's advantage math (advantageBonus / disadvantageBonus).
  // In shard.mjs this array REPLACES CONFIG.statusEffects wholesale — Foundry's
  // built-in conditions are removed so only the entries below appear in the HUD.
  //
  //   Add a condition:    append a new entry with a unique `id`.
  //   Change an icon:     edit the `img` path on its entry.
  //   Adv/disadv math:    set advantageBonus / disadvantageBonus; the
  //                       attack-dialog reads these automatically when the
  //                       affected actor has the matching `id` in `statuses`.
  //
  // The ids "offguard" and "prone" are referenced by the world settings
  // (offGuardConditionId, proneConditionId) — do not rename them.
  STATUS_EFFECTS: [
    // ── Advantage / Disadvantage conditions (wired up in rolls) ─────────
    { id: "offguard", name: "Off Guard", img: "systems/shard/assets/conditions/Off Guard.webp", advantageBonus: 0, disadvantageBonus: 0 },
    { id: "prone",    name: "Prone",     img: "systems/shard/assets/conditions/Prone.webp",     advantageBonus: 0, disadvantageBonus: 1 },
    { id: "flying",   name: "Flying",    img: "systems/shard/assets/conditions/Flying.webp",    advantageBonus: 1, disadvantageBonus: 0 },
    { id: "blinded",  name: "Blinded",   img: "systems/shard/assets/conditions/Blinded.webp",   advantageBonus: 0, disadvantageBonus: 1 },

    // ── Other Shard conditions (no adv math by default; tune as needed) ─
    { id: "bleeding",          name: "Bleeding",          img: "systems/shard/assets/conditions/Bleeding.webp" },
    { id: "blessed",           name: "Blessed",           img: "systems/shard/assets/conditions/Blessed.webp" },
    { id: "combo",             name: "Combo",             img: "systems/shard/assets/conditions/Combo.webp" },
    { id: "concealment",       name: "Concealment",       img: "systems/shard/assets/conditions/Concealment.webp" },
    { id: "damage-resistance", name: "Damage Resistance", img: "systems/shard/assets/conditions/Damage Resistance.webp" },
    { id: "dazed",             name: "Dazed",             img: "systems/shard/assets/conditions/Dazed.webp" },
    { id: "downed",            name: "Downed",            img: "systems/shard/assets/conditions/Downed.webp" },
    { id: "haste",             name: "Haste",             img: "systems/shard/assets/conditions/Haste.webp" },
    { id: "immobilized",       name: "Immobilized",       img: "systems/shard/assets/conditions/Immobilized.webp" },
    { id: "imperial-eye",      name: "Imperial Eye",      img: "systems/shard/assets/conditions/Imperial Eye.webp" },
    { id: "invulnerable",      name: "Invulnerable",      img: "systems/shard/assets/conditions/Invulnerable.webp" },
    { id: "poisoned",          name: "Poisoned",          img: "systems/shard/assets/conditions/Poisoned.webp" },
    { id: "regeneration",      name: "Regeneration",      img: "systems/shard/assets/conditions/Regeneration.webp" },
    { id: "silenced",          name: "Silenced",          img: "systems/shard/assets/conditions/Silenced.webp" },
    { id: "slowed",            name: "Slowed",            img: "systems/shard/assets/conditions/Slowed.webp" },
    { id: "staggered",         name: "Staggered",         img: "systems/shard/assets/conditions/Staggered.webp" },
    { id: "stunned",           name: "Stunned",           img: "systems/shard/assets/conditions/Stunned.webp" },
    { id: "sundered",          name: "Sundered",          img: "systems/shard/assets/conditions/Sundered.webp" },
    { id: "vulnerable",        name: "Vulnerable",        img: "systems/shard/assets/conditions/Vulnerable.webp" },

    // ── Marks 1–5 ───────────────────────────────────────────────────────
    { id: "mark-1", name: "Mark 1", img: "systems/shard/assets/conditions/Mark 1.webp" },
    { id: "mark-2", name: "Mark 2", img: "systems/shard/assets/conditions/Mark 2.webp" },
    { id: "mark-3", name: "Mark 3", img: "systems/shard/assets/conditions/Mark 3.webp" },
    { id: "mark-4", name: "Mark 4", img: "systems/shard/assets/conditions/Mark 4.webp" },
    { id: "mark-5", name: "Mark 5", img: "systems/shard/assets/conditions/Mark 5.webp" }
  ],

  ATTACK_MODIFIERS: {
    cover:       { label: "Cover",       disadvantageBonus: 1 },
    concealment: { label: "Concealment", disadvantageBonus: 1 }
  }
};
