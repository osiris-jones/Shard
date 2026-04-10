/**
 * Shard — Compendium Import Macro
 *
 * Paste the entire contents of this file into a Foundry World macro
 * (Script type), then execute it. Re-running is safe: existing items are
 * updated in-place via flags.shard.sourceId rather than duplicated.
 *
 * Prerequisites:
 *   1. cd tools && npm install       (once, to get `marked`)
 *   2. node tools/build-compendium.mjs   (any time source.json changes)
 *   3. Foundry must be restarted once after adding packs to system.json
 */

(async () => {

/* ------------------------------------------------------------------ */
/*  Config                                                              */
/* ------------------------------------------------------------------ */

const DATA_URL = "systems/shard/dist/compendium-data.json";

const PACK_IDS = {
  tags:      "shard.shard-tags",
  abilities: "shard.shard-abilities",
  classes:   "shard.shard-classes"
};

/* ------------------------------------------------------------------ */
/*  Fetch processed data                                                */
/* ------------------------------------------------------------------ */

ui.notifications.info("Shard Import | Fetching compendium data…");

let data;
try {
  const res = await fetch(DATA_URL);
  if (!res.ok) throw new Error(`HTTP ${res.status} — is dist/compendium-data.json present?`);
  data = await res.json();
} catch (e) {
  ui.notifications.error(`Shard Import | Failed to fetch data: ${e.message}`);
  console.error("Shard Import |", e);
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
      `Shard Import | Pack "${id}" not found. ` +
      `Add it to system.json "packs" and restart Foundry.`
    );
    return;
  }
  packs[key] = pack;
}

/* ------------------------------------------------------------------ */
/*  Helpers                                                             */
/* ------------------------------------------------------------------ */

/**
 * Find an item in a compendium pack by its stable sourceId flag.
 * Returns the Item document or null.
 */
async function findBySourceId(pack, sourceId) {
  const docs = await pack.getDocuments();
  return docs.find(d => d.flags?.shard?.sourceId === sourceId) ?? null;
}

/**
 * Get an existing folder in a pack by name, or create it.
 * Calling pack.getDocuments() first ensures pack.folders is populated.
 */
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

/**
 * Create a new item in a pack, or update the existing one if its
 * sourceId already exists. Returns the resulting Item document.
 */
async function upsert(pack, itemData) {
  const sourceId = itemData.flags?.shard?.sourceId;
  if (!sourceId) {
    console.warn("Shard Import | Item has no sourceId, skipping:", itemData.name);
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
/*  1. Tags                                                             */
/* ------------------------------------------------------------------ */

console.log("Shard Import | Importing tags…");

const tagUuidMap = {};   // sourceId → compendium UUID
const tagNameMap = {};   // sourceId → display name

for (const tagData of (data.tags ?? [])) {
  const item = await upsert(packs.tags, tagData);
  if (!item) continue;
  const sid = tagData.flags.shard.sourceId;
  tagUuidMap[sid] = item.uuid;
  tagNameMap[sid] = item.name;
}

console.log(`Shard Import | Tags done — ${Object.keys(tagUuidMap).length} items.`);

/* ------------------------------------------------------------------ */
/*  2. Abilities (sorted into per-class folders)                        */
/* ------------------------------------------------------------------ */

console.log("Shard Import | Importing abilities…");

// Map classId → class display name for folder creation
const classNameMap = Object.fromEntries(
  (data.classes ?? []).map(c => [c.flags.shard.sourceId, c.name])
);

// Pre-create one folder per unique classId that appears on an ability
const classFolderMap = {};
for (const classId of new Set((data.abilities ?? []).map(a => a.flags.shard.classId).filter(Boolean))) {
  const folderName = classNameMap[classId];
  if (folderName) classFolderMap[classId] = await getOrCreateFolder(packs.abilities, folderName);
}

const abilityUuidMap = {};   // sourceId → compendium UUID
const abilityNameMap = {};   // sourceId → display name

for (const abData of (data.abilities ?? [])) {
  // Resolve _tagIds → [{ uuid, name }]
  const resolvedTags = (abData.system._tagIds ?? []).flatMap(tid => {
    const uuid = tagUuidMap[tid];
    if (!uuid) {
      console.warn(`Shard Import | Ability "${abData.name}" — tag "${tid}" not found in imported tags, skipping.`);
      return [];
    }
    return [{ uuid, name: tagNameMap[tid] ?? tid }];
  });

  const itemData = foundry.utils.deepClone(abData);
  itemData.system.tags   = resolvedTags;
  delete itemData.system._tagIds;

  // Assign to class folder if one exists
  const folder = classFolderMap[abData.flags.shard.classId];
  if (folder) itemData.folder = folder.id;

  const item = await upsert(packs.abilities, itemData);
  if (!item) continue;
  const sid = abData.flags.shard.sourceId;
  abilityUuidMap[sid] = item.uuid;
  abilityNameMap[sid] = item.name;
}

console.log(`Shard Import | Abilities done — ${Object.keys(abilityUuidMap).length} items.`);

/* ------------------------------------------------------------------ */
/*  3. Classes                                                          */
/* ------------------------------------------------------------------ */

console.log("Shard Import | Importing classes…");

let classCount = 0;

for (const clsData of (data.classes ?? [])) {
  // Resolve _abilityIds → [{ uuid, name, rank }]
  const resolvedAbilities = (clsData.system._abilityIds ?? []).flatMap(ref => {
    const uuid = abilityUuidMap[ref.id];
    if (!uuid) {
      console.warn(`Shard Import | Class "${clsData.name}" — ability "${ref.id}" not found in imported abilities, skipping.`);
      return [];
    }
    return [{ uuid, name: abilityNameMap[ref.id] ?? ref.name, rank: ref.rank ?? 1 }];
  });

  const itemData = foundry.utils.deepClone(clsData);
  itemData.system.abilities = resolvedAbilities;
  delete itemData.system._abilityIds;

  await upsert(packs.classes, itemData);
  classCount++;
}

console.log(`Shard Import | Classes done — ${classCount} items.`);

/* ------------------------------------------------------------------ */
/*  Done                                                                */
/* ------------------------------------------------------------------ */

const total =
  Object.keys(tagUuidMap).length +
  Object.keys(abilityUuidMap).length +
  classCount;

ui.notifications.info(
  `✓ Shard Import complete — ${total} items created/updated ` +
  `(${Object.keys(tagUuidMap).length} tags, ` +
  `${Object.keys(abilityUuidMap).length} abilities, ` +
  `${classCount} classes).`
);

})();
