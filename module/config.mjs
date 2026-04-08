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
  // All entries are pushed into CONFIG.statusEffects during init.
  STATUS_EFFECTS: [
    { id: "flying",   name: "Flying",    img: "icons/svg/wing.svg",        advantageBonus: 1, disadvantageBonus: 0 },
    { id: "offguard", name: "Off Guard", img: "icons/svg/net.svg",          advantageBonus: 0, disadvantageBonus: 0 },
    { id: "hidden",   name: "Hidden",    img: "icons/svg/mystery-man.svg",  advantageBonus: 1, disadvantageBonus: 0 },
    { id: "prone",    name: "Prone",     img: "icons/svg/falling.svg",      advantageBonus: 0, disadvantageBonus: 1 },
    { id: "blinded",  name: "Blinded",   img: "icons/svg/blind.svg",        advantageBonus: 0, disadvantageBonus: 1 }
  ],

  ATTACK_MODIFIERS: {
    cover:       { label: "Cover",       disadvantageBonus: 1 },
    concealment: { label: "Concealment", disadvantageBonus: 1 }
  }
};
