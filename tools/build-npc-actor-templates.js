/**
 * build-npc-actor-templates.js
 * Foundry macro — populates the "NPC Templates" actor compendium
 * (shard.shard-npc-actors) with one blank NPC actor per NPC class.
 *
 * Run after:
 *   1. Foundry has been restarted with the shard-npc-actors pack registered
 *   2. The shard-npc-classes pack has been populated (via import-npc-macro.js)
 *
 * Re-running wipes and rebuilds the pack from scratch.
 */

const NPC_CLASSES_PACK = "shard.shard-npc-classes";
const ACTORS_PACK      = "shard.shard-npc-actors";

const classPack = game.packs.get(NPC_CLASSES_PACK);
const actorPack = game.packs.get(ACTORS_PACK);

if (!classPack) { ui.notifications.error(`Pack not found: ${NPC_CLASSES_PACK}`); return; }
if (!actorPack) { ui.notifications.error(`Pack not found: ${ACTORS_PACK}`); return; }

// Load all NPC class items (type "npc-class" only; exclude npc-template)
const allItems  = await classPack.getDocuments();
const npcClasses = allItems.filter(c => c.type === "npc-class");

if (!npcClasses.length) {
  ui.notifications.warn(`No npc-class documents found in ${NPC_CLASSES_PACK}.`);
  return;
}

// Wipe existing actors so re-runs stay clean
const existing = await actorPack.getDocuments();
if (existing.length) {
  await Actor.deleteDocuments(existing.map(a => a.id), { pack: ACTORS_PACK });
}

let created = 0;
for (const cls of npcClasses) {
  const s     = cls.system.stats;
  const tier  = 1;
  const maxHP = (s.hp ?? 10) + (s.hpBonus ?? 0) * tier;

  // Embed the class item preserving its _id so npcClassId can reference it
  const itemData = cls.toObject();

  await Actor.create({
    name: cls.name,
    type: "npc",
    img:  cls.img || "icons/svg/mystery-man.svg",
    system: {
      npcClassId:    itemData._id,
      hp:            { value: maxHP, max: maxHP },
      barrier:       0,
      narrativeTags: [],
      stats: {
        tier,
        armor: s.armor ?? 0,
        def:   s.def   ?? 10,
        spd:   s.spd   ?? 5
      }
    },
    items: [itemData]
  }, { pack: ACTORS_PACK });

  created++;
}

ui.notifications.info(`NPC Templates: ${created} actor(s) written to ${ACTORS_PACK}.`);
