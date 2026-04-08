/**
 * shard.mjs — Main entry point for the Shard system.
 */

import { ShardActor }            from "./documents/actor.mjs";
import { ShardItem }             from "./documents/item.mjs";
import { ShardAbilityItem }      from "./documents/item-ability.mjs";
import { ShardNPCAbilityItem }   from "./documents/item-npc-ability.mjs";
import { ShardClassItem }        from "./documents/item-class.mjs";
import { ShardNPCClassItem }     from "./documents/item-npc-class.mjs";
import { ShardNPCTemplateItem }  from "./documents/item-npc-template.mjs";
import { ShardPCActorSheet }     from "./sheets/actor-pc-sheet.mjs";
import { ShardNPCActorSheet }    from "./sheets/actor-npc-sheet.mjs";
import { ShardAbilitySheet }     from "./sheets/item-ability-sheet.mjs";
import { ShardNPCAbilitySheet }  from "./sheets/item-npc-ability-sheet.mjs";
import { ShardClassSheet }       from "./sheets/item-class-sheet.mjs";
import { ShardNPCClassSheet }    from "./sheets/item-npc-class-sheet.mjs";
import { ShardNPCTemplateSheet } from "./sheets/item-npc-template-sheet.mjs";
import { SHARD }                 from "./config.mjs";
import { registerDataModels }    from "./data/_index.mjs";
import { ShardAttackDialog, postAbilityToChat } from "./rolls/attack-dialog.mjs";

/* -------------------------------------------- */
/*  Init Hook                                   */
/* -------------------------------------------- */

Hooks.once("init", () => {
  console.log("Shard | Initialising Shard System");

  game.shard = { SHARD };

  // ── Register Shard conditions in Foundry's native status effect HUD ──
  // This makes them appear when right-clicking an actor's token on canvas.
  for (const s of SHARD.STATUS_EFFECTS) {
    CONFIG.statusEffects.push({ id: s.id, name: s.name, img: s.img });
  }

  // ── System Settings ──────────────────────────────────────────────────
  const conditionChoices = { "": "(None)" };
  for (const s of SHARD.STATUS_EFFECTS) conditionChoices[s.id] = s.name;

  game.settings.register("shard", "offGuardConditionId", {
    name:    "Off Guard Condition",
    hint:    "Attackers gain +1 Advantage against this target; the condition is removed after the attack roll.",
    scope:   "world",
    config:  true,
    type:    String,
    default: "offguard",
    choices: { ...conditionChoices }
  });

  game.settings.register("shard", "proneConditionId", {
    name:    "Prone Condition",
    hint:    "Attackers gain +1 Advantage against this target. Unlike Off Guard, the condition is NOT removed after the attack roll.",
    scope:   "world",
    config:  true,
    type:    String,
    default: "prone",
    choices: { ...conditionChoices }
  });

  // Register data models FIRST
  registerDataModels();

  // Base document classes
  CONFIG.Actor.documentClass = ShardActor;
  CONFIG.Item.documentClass  = ShardItem;

  // Per-type document classes — this is what gives ability items their
  // activate() method. typeClasses is the v11+ way to map type → class.
  CONFIG.Item.typeClasses = {
    ability:        ShardAbilityItem,
    "npc-ability":  ShardNPCAbilityItem,
    class:          ShardClassItem,
    "npc-class":    ShardNPCClassItem,
    "npc-template": ShardNPCTemplateItem
  };

  CONFIG.Actor.typeLabels = {
    pc:  "SHARD.ActorTypePC",
    npc: "SHARD.ActorTypeNPC"
  };
  CONFIG.Item.typeLabels = {
    ability:        "SHARD.ItemTypeAbility",
    "npc-ability":  "SHARD.ItemTypeNPCAbility",
    class:          "SHARD.ItemTypeClass",
    "npc-class":    "SHARD.ItemTypeNPCClass",
    "npc-template": "SHARD.ItemTypeNPCTemplate",
    tag:            "SHARD.ItemTypeTag"
  };

  // Sheets
  Actors.unregisterSheet("core", ActorSheet);
  Actors.registerSheet("shard", ShardPCActorSheet, {
    types: ["pc"], makeDefault: true, label: "SHARD.SheetPC"
  });
  Actors.registerSheet("shard", ShardNPCActorSheet, {
    types: ["npc"], makeDefault: true, label: "SHARD.SheetNPC"
  });

  Items.unregisterSheet("core", ItemSheet);
  Items.registerSheet("shard", ShardAbilitySheet, {
    types: ["ability"], makeDefault: true, label: "SHARD.SheetAbility"
  });
  Items.registerSheet("shard", ShardNPCAbilitySheet, {
    types: ["npc-ability"], makeDefault: true, label: "SHARD.SheetNPCAbility"
  });
  Items.registerSheet("shard", ShardClassSheet, {
    types: ["class"], makeDefault: true, label: "SHARD.SheetClass"
  });
  Items.registerSheet("shard", ShardNPCClassSheet, {
    types: ["npc-class"], makeDefault: true, label: "SHARD.SheetNPCClass"
  });
  Items.registerSheet("shard", ShardNPCTemplateSheet, {
    types: ["npc-template"], makeDefault: true, label: "SHARD.SheetNPCTemplate"
  });

  // Preload templates
  loadTemplates([
    "systems/shard/templates/actors/pc-sheet.hbs",
    "systems/shard/templates/actors/npc-sheet.hbs",
    "systems/shard/templates/items/ability-sheet.hbs",
    "systems/shard/templates/items/npc-ability-sheet.hbs",
    "systems/shard/templates/items/npc-class-sheet.hbs",
    "systems/shard/templates/items/npc-template-sheet.hbs",
    "systems/shard/templates/items/class-sheet.hbs",
    "systems/shard/templates/dialogs/attack-dialog.hbs",
    "systems/shard/templates/dialogs/resist-dialog.hbs",
    "systems/shard/templates/chat/attack-card.hbs",
    "systems/shard/templates/chat/ability-card.hbs",
    "systems/shard/templates/chat/damage-card.hbs",
    "systems/shard/templates/chat/resist-card.hbs",
    "systems/shard/templates/chat/gm-resist-card.hbs",
    "systems/shard/templates/chat/macro-heal-card.hbs"
  ]);

  _registerHandlebarsHelpers();

  console.log("Shard | Init complete.");
});

Hooks.once("ready", () => {
  // Expose roll utilities globally so hotbar macros can call them without imports.
  game.shard.ShardAttackDialog = ShardAttackDialog;
  game.shard.postAbilityToChat = postAbilityToChat;
  console.log("Shard | System ready.");
});

/* -------------------------------------------- */
/*  Hotbar — Ability Macro Drop                 */
/* -------------------------------------------- */

Hooks.on("hotbarDrop", (bar, data, slot) => {
  if (!data.shardAbilityMacro) return;  // not our drag; let Foundry handle it

  (async () => {
    const item = await fromUuid(data.uuid).catch(() => null);
    if (!item) return;

    const command =
`// Shard — ${item.name}
const actor = canvas.tokens?.controlled[0]?.actor ?? game.user.character;
if (!actor) return ui.notifications.warn("No actor selected.");
const ability = actor.items.find(i => i.system?.sourceUUID === "${item.uuid}")
  ?? actor.items.find(i => ["ability","npc-ability"].includes(i.type) && i.name === "${item.name}");
if (!ability) return ui.notifications.warn(\`\${actor.name} doesn't have "${item.name}".\`);
const fc = ability.system.focusCost ?? 0;
if (fc > 0) {
  const ok = await actor.spendFocus(fc);
  if (!ok) return ui.notifications.warn("Not enough Focus.");
}
if (ability.system.isAttack) game.shard.ShardAttackDialog.show(actor, ability);
else game.shard.postAbilityToChat(actor, ability);`;

    // Reuse an existing same-named macro this user already owns, otherwise create.
    const existing = game.macros.find(m => m.name === item.name && m.author === game.user.id);
    const macro    = existing ?? await Macro.create({
      name: item.name, type: "script", img: item.img, command
    });
    await game.user.assignHotbarMacro(macro, slot);
  })();

  return false;  // synchronous false suppresses Foundry's default macro creation
});

/* -------------------------------------------- */
/*  Handlebars Helpers                          */
/* -------------------------------------------- */

function _registerHandlebarsHelpers() {
  Handlebars.registerHelper("shardCostLabel", (cost) => {
    if (cost === "passive")  return "Passive";
    if (cost === "reaction") return "\u25C8";   // ◈
    if (cost === "0")        return "\u25C7";   // ◇
    const n = parseInt(cost, 10);
    return isNaN(n) ? cost : "\u25C6".repeat(n);  // ◆ × n
  });

  Handlebars.registerHelper("shardRankLabel", (rank) => `Rank ${rank}`);

  Handlebars.registerHelper("times", (n, block) => {
    let out = "";
    for (let i = 1; i <= n; i++) out += block.fn(i);
    return out;
  });

  Handlebars.registerHelper("eq",       (a, b)     => a === b);
  Handlebars.registerHelper("lte",      (a, b)     => a <= b);
  Handlebars.registerHelper("includes", (arr, val) => Array.isArray(arr) && arr.includes(val));
  Handlebars.registerHelper("lookup",   (obj, key) => obj?.[key]);
}
