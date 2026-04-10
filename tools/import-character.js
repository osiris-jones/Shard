/**
 * Shard — Character Builder Import Macro
 *
 * Paste this entire file into a Foundry World macro (Script type), then
 * execute it. A dialog will appear asking you to paste a build-descriptor
 * JSON that was exported from the Shard Character Builder web app.
 *
 * Prerequisites:
 *   1. The Shard system compendiums must be populated first.
 *      Run the Compendium Import Macro (tools/import-macro.js) at least once.
 *   2. Packs required: shard.shard-classes, shard.shard-abilities
 */

(async () => {

/* ------------------------------------------------------------------ */
/*  Config                                                              */
/* ------------------------------------------------------------------ */

const PACK_IDS = {
  classes:   "shard.shard-classes",
  abilities: "shard.shard-abilities",
};

const EXPECTED_FORMAT  = "shard-character-builder";
const EXPECTED_VERSION = 1;

/* ------------------------------------------------------------------ */
/*  Step 1 — Dialog: paste JSON                                        */
/* ------------------------------------------------------------------ */

const rawJson = await new Promise(resolve => {
  new Dialog({
    title: "Shard — Import Character Build",
    content: `
      <p style="margin:0 0 8px">
        Paste the contents of your <code>*-build.json</code> file below.
      </p>
      <textarea id="shard-build-json"
        style="width:100%;height:220px;font-family:monospace;font-size:11px;
               background:#1a1a2e;color:#c9d1d9;border:1px solid #30363d;
               border-radius:4px;padding:6px;resize:vertical;"
        placeholder='{ "_format": "shard-character-builder", ... }'
      ></textarea>`,
    buttons: {
      import: {
        icon:  '<i class="fas fa-file-import"></i>',
        label: "Import",
        callback: html => resolve(html.find("#shard-build-json").val().trim())
      },
      cancel: {
        icon:  '<i class="fas fa-times"></i>',
        label: "Cancel",
        callback: () => resolve(null)
      }
    },
    default: "import"
  }).render(true);
});

if (!rawJson) return;   // user cancelled

/* ------------------------------------------------------------------ */
/*  Step 2 — Parse & validate                                          */
/* ------------------------------------------------------------------ */

let build;
try {
  build = JSON.parse(rawJson);
} catch (e) {
  ui.notifications.error("Shard Import | Invalid JSON — could not parse the pasted text.");
  console.error("Shard Character Import |", e);
  return;
}

if (build._format !== EXPECTED_FORMAT) {
  ui.notifications.error(
    `Shard Import | Unexpected format "${build._format}". ` +
    `Expected "${EXPECTED_FORMAT}".`
  );
  return;
}

if (build._version !== EXPECTED_VERSION) {
  ui.notifications.warn(
    `Shard Import | Version mismatch (got ${build._version}, expected ${EXPECTED_VERSION}). ` +
    `Attempting import anyway.`
  );
}

if (!build.name || !build.baseClassId || !Array.isArray(build.classLevels)) {
  ui.notifications.error("Shard Import | Build descriptor is missing required fields (name, baseClassId, classLevels).");
  return;
}

/* ------------------------------------------------------------------ */
/*  Step 3 — Resolve compendium packs                                  */
/* ------------------------------------------------------------------ */

const packs = {};
for (const [key, id] of Object.entries(PACK_IDS)) {
  const pack = game.packs.get(id);
  if (!pack) {
    ui.notifications.error(
      `Shard Import | Pack "${id}" not found. ` +
      `Run the Compendium Import Macro first and restart Foundry.`
    );
    return;
  }
  packs[key] = pack;
}

ui.notifications.info("Shard Import | Loading compendium data…");

/* Load all docs up-front to avoid repeated round-trips */
const [classDocs, abilityDocs] = await Promise.all([
  packs.classes.getDocuments(),
  packs.abilities.getDocuments(),
]);

/** Find a compendium document by its stable shard.sourceId flag. */
function findClass(sourceId) {
  return classDocs.find(d => d.flags?.shard?.sourceId === sourceId) ?? null;
}
function findAbility(sourceId) {
  return abilityDocs.find(d => d.flags?.shard?.sourceId === sourceId) ?? null;
}

/* ------------------------------------------------------------------ */
/*  Step 4 — Build embedded items + classLevels                        */
/* ------------------------------------------------------------------ */

const embeddedItems = [];

/**
 * Clone a compendium document into a plain item-data object, strip its
 * compendium `_id`, and assign a fresh temporary `_id` for embedding.
 * Returns { tempId, itemData } or null if the source doc was not found.
 */
function cloneForEmbed(doc, overrides = {}) {
  if (!doc) return null;
  const data = doc.toObject();
  delete data._id;                              // clear compendium id
  data._id = foundry.utils.randomID();          // fresh temp id for embedding
  foundry.utils.mergeObject(data, overrides);
  return { tempId: data._id, itemData: data };
}

/* --- Class items --- */

const classLevelEntries = [];   // will become system.classLevels

for (const entry of build.classLevels) {
  const doc = findClass(entry.classId);
  if (!doc) {
    ui.notifications.warn(
      `Shard Import | Class "${entry.classId}" not found in compendium — skipped.`
    );
    continue;
  }

  const cloned = cloneForEmbed(doc);
  if (!cloned) continue;

  embeddedItems.push(cloned.itemData);
  classLevelEntries.push({
    itemId: cloned.tempId,
    level:  entry.level,
    isBase: entry.isBase ?? false,
  });
}

/* --- Ability items (chosen + auto-granted + innates) --- */

const allAbilityEntries = [
  ...(build.abilities        ?? []),
  ...(build.heroicTalents    ?? []),
  ...(build.innateAbilities  ?? []),
];

const embeddedAbilityIds = new Set();   // guard against duplicates

for (const entry of allAbilityEntries) {
  if (embeddedAbilityIds.has(entry.sourceId)) continue;

  const doc = findAbility(entry.sourceId);
  if (!doc) {
    ui.notifications.warn(
      `Shard Import | Ability "${entry.sourceId}" not found in compendium — skipped.`
    );
    continue;
  }

  const cloned = cloneForEmbed(doc);
  if (!cloned) continue;

  embeddedItems.push(cloned.itemData);
  embeddedAbilityIds.add(entry.sourceId);
}

/* ------------------------------------------------------------------ */
/*  Step 5 — Create the Actor                                          */
/* ------------------------------------------------------------------ */

if (classLevelEntries.length === 0) {
  ui.notifications.error("Shard Import | No valid class levels resolved — aborting actor creation.");
  return;
}

const actorData = {
  name:   build.name,
  type:   "pc",
  system: {
    classLevels: classLevelEntries,
  },
  items: embeddedItems,
};

let actor;
try {
  actor = await Actor.create(actorData);
} catch (e) {
  ui.notifications.error(`Shard Import | Actor.create failed: ${e.message}`);
  console.error("Shard Character Import |", e);
  return;
}

/* ------------------------------------------------------------------ */
/*  Done                                                                */
/* ------------------------------------------------------------------ */

const classCount   = classLevelEntries.length;
const abilityCount = embeddedAbilityIds.size;
const totalLevel   = classLevelEntries.reduce((s, e) => s + e.level, 0);

ui.notifications.info(
  `✓ Shard Import | "${actor.name}" created — ` +
  `level ${totalLevel}, ` +
  `${classCount} class${classCount !== 1 ? "es" : ""}, ` +
  `${abilityCount} abilit${abilityCount !== 1 ? "ies" : "y"}.`
);

console.log("Shard Character Import | Actor created:", actor);

})();
