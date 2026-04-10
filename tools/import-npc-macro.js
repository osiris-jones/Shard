/**
 * Shard — NPC Compendium Import Macro
 *
 * Paste the entire contents of this file into a Foundry World macro
 * (Script type), then execute it. Re-running is safe: existing items are
 * updated in-place via flags.shard.sourceId rather than duplicated.
 *
 * NPC abilities are sorted into compendium folders named after their
 * source class or template.
 *
 * Prerequisites:
 *   1. cd tools && npm install                  (once)
 *   2. node tools/build-npc-compendium.mjs      (any time the CSV files change)
 *   3. Foundry must be restarted once after adding packs to system.json
 */

(async () => {

/* ------------------------------------------------------------------ */
/*  Config                                                              */
/* ------------------------------------------------------------------ */

const DATA_URL = "systems/shard/dist/npc-compendium-data.json";

const PACK_IDS = {
  tags:         "shard.shard-tags",
  npcAbilities: "shard.shard-npc-abilities",
  npcClasses:   "shard.shard-npc-classes"
};

/* ------------------------------------------------------------------ */
/*  Fetch processed data                                                */
/* ------------------------------------------------------------------ */

ui.notifications.info("Shard NPC Import | Fetching compendium data…");

let data;
try {
  const res = await fetch(DATA_URL);
  if (!res.ok) throw new Error(`HTTP ${res.status} — is dist/npc-compendium-data.json present?`);
  data = await res.json();
} catch (e) {
  ui.notifications.error(`Shard NPC Import | Failed to fetch data: ${e.message}`);
  console.error("Shard NPC Import |", e);
  return;
}

/* ------------------------------------------------------------------ */
/*  Resolve packs                                                       */
/* ------------------------------------------------------------------ */

const packs = {};
for (const [key, id] of Object.entries(PACK_IDS)) {
  const pack = game.packs.get(id);
  if (!pack) {
    ui.notifications.error(
      `Shard NPC Import | Pack "${id}" not found. ` +
      `Add it to system.json "packs" and restart Foundry.`
    );
    return;
  }
  packs[key] = pack;
}

/* ------------------------------------------------------------------ */
/*  Helpers                                                             */
/* ------------------------------------------------------------------ */

async function findBySourceId(pack, sourceId) {
  const docs = await pack.getDocuments();
  return docs.find(d => d.flags?.shard?.sourceId === sourceId) ?? null;
}

async function getOrCreateFolder(pack, name) {
  if (!name) return null;
  await pack.getDocuments();
  let folder = pack.folders.find(f => f.name === name);
  if (!folder) {
    [folder] = await Folder.createDocuments(
      [{ name, type: "Item", sorting: "a" }],
      { pack: pack.collection }
    );
  }
  return folder;
}

async function upsert(pack, itemData) {
  const sourceId = itemData.flags?.shard?.sourceId;
  if (!sourceId) {
    console.warn("Shard NPC Import | Item has no sourceId, skipping:", itemData.name);
    return null;
  }
  const existing = await findBySourceId(pack, sourceId);
  if (existing) {
    await existing.update(itemData);
    return existing;
  }
  const [created] = await Item.createDocuments([itemData], { pack: pack.collection });
  return created;
}

/* ------------------------------------------------------------------ */
/*  1. Resolve tag UUIDs from the shared tags pack                      */
/* ------------------------------------------------------------------ */

console.log("Shard NPC Import | Loading tags…");

const tagUuidMap = {};
const tagNameMap = {};
const tagDocs = await packs.tags.getDocuments();
for (const doc of tagDocs) {
  const sid = doc.flags?.shard?.sourceId;
  if (sid) {
    tagUuidMap[sid] = doc.uuid;
    tagNameMap[sid] = doc.name;
  }
}
console.log(`Shard NPC Import | Tags loaded — ${Object.keys(tagUuidMap).length} entries.`);

/* ------------------------------------------------------------------ */
/*  2. Build source-class → folder name map                             */
/* ------------------------------------------------------------------ */

// sourceId → display name for classes and templates (used for ability folder names)
const sourceNameMap = Object.fromEntries([
  ...(data.npcClasses   ?? []).map(c => [c.flags.shard.sourceId, c.name]),
  ...(data.npcTemplates ?? []).map(t => [t.flags.shard.sourceId, t.name])
]);

// Pre-create one folder per unique sourceClass that appears on an ability
console.log("Shard NPC Import | Creating ability folders…");
const sourceFolderMap = {};
for (const sourceClass of new Set(
  (data.npcAbilities ?? []).map(a => a.flags.shard.sourceClass).filter(Boolean)
)) {
  const folderName = sourceNameMap[sourceClass];
  if (folderName) {
    sourceFolderMap[sourceClass] = await getOrCreateFolder(packs.npcAbilities, folderName);
  }
}

/* ------------------------------------------------------------------ */
/*  3. NPC Abilities                                                    */
/* ------------------------------------------------------------------ */

console.log("Shard NPC Import | Importing NPC abilities…");

const abilityUuidMap = {};
const abilityNameMap = {};
const abilityTierMap = {};

for (const abData of (data.npcAbilities ?? [])) {
  const resolvedTags = (abData.system._tagIds ?? []).flatMap(tid => {
    const uuid = tagUuidMap[tid];
    if (!uuid) {
      console.warn(`Shard NPC Import | Ability "${abData.name}" — tag "${tid}" not found, skipping.`);
      return [];
    }
    return [{ uuid, name: tagNameMap[tid] ?? tid }];
  });

  const itemData = foundry.utils.deepClone(abData);
  itemData.system.tags = resolvedTags;
  delete itemData.system._tagIds;

  const folder = sourceFolderMap[abData.flags.shard.sourceClass];
  if (folder) itemData.folder = folder.id;

  const item = await upsert(packs.npcAbilities, itemData);
  if (!item) continue;

  const sid = abData.flags.shard.sourceId;
  abilityUuidMap[sid] = item.uuid;
  abilityNameMap[sid] = item.name;
  abilityTierMap[sid] = abData.system.tier;
}

console.log(`Shard NPC Import | NPC abilities done — ${Object.keys(abilityUuidMap).length} items.`);

/* ------------------------------------------------------------------ */
/*  4. NPC Classes and Templates (into the same pack)                  */
/* ------------------------------------------------------------------ */

console.log("Shard NPC Import | Importing NPC classes and templates…");

let classCount    = 0;
let templateCount = 0;

for (const clsData of [...(data.npcClasses ?? []), ...(data.npcTemplates ?? [])]) {
  const resolvedAbilities = (clsData.system._abilityIds ?? []).flatMap(ref => {
    const uuid = abilityUuidMap[ref.id];
    if (!uuid) {
      console.warn(`Shard NPC Import | Class "${clsData.name}" — ability "${ref.id}" not found, skipping.`);
      return [];
    }
    return [{ uuid, name: abilityNameMap[ref.id] ?? ref.name, tier: abilityTierMap[ref.id] ?? "basic" }];
  });

  const itemData = foundry.utils.deepClone(clsData);
  itemData.system.abilities = resolvedAbilities;
  delete itemData.system._abilityIds;

  await upsert(packs.npcClasses, itemData);
  if (clsData.type === "npc-template") templateCount++;
  else                                  classCount++;
}

console.log(`Shard NPC Import | Classes done — ${classCount} classes, ${templateCount} templates.`);

/* ------------------------------------------------------------------ */
/*  Done                                                                */
/* ------------------------------------------------------------------ */

const total = Object.keys(abilityUuidMap).length + classCount + templateCount;
ui.notifications.info(
  `✓ Shard NPC Import complete — ${total} items ` +
  `(${Object.keys(abilityUuidMap).length} abilities, ` +
  `${classCount} classes, ${templateCount} templates).`
);

})();
