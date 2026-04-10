/**
 * build-npc-compendium.mjs
 *
 * Reads tools/templates/npc-abilities.csv and tools/templates/npc-classes.csv,
 * validates them, converts Markdown descriptions to HTML, and writes
 * dist/npc-compendium-data.json ready for the Foundry import macro.
 *
 * Usage (from the system root or tools/ directory):
 *   cd tools && npm install   (once)
 *   node tools/build-npc-compendium.mjs
 *
 * CSV columns:
 *   npc-abilities.csv:
 *     id, name, source, isBasic, isCharged, cost, isAttack, damage,
 *     hasGraze, grazeDamage, hasResistance, resistanceDamage, range, tags, description
 *
 *   npc-classes.csv:
 *     id, name, isTemplate, hp, hpBonus, def, spd, armor, abilities, description
 *     (hp/hpBonus/def/spd/armor are ignored for templates)
 */

import { readFileSync, writeFileSync, mkdirSync } from "fs";
import { marked }                                  from "marked";
import { parse }                                   from "csv-parse/sync";

marked.use({ breaks: true });

/* ------------------------------------------------------------------ */
/*  Paths                                                               */
/* ------------------------------------------------------------------ */

const NPC_ABILITIES_CSV = new URL("templates/npc-abilities.csv", import.meta.url);
const NPC_CLASSES_CSV   = new URL("templates/npc-classes.csv",   import.meta.url);
const SOURCE_JSON       = new URL("../source.json",               import.meta.url);
const DIST_DIR          = new URL("../dist/",                     import.meta.url);
const OUT_URL           = new URL("../dist/npc-compendium-data.json", import.meta.url);

/* ------------------------------------------------------------------ */
/*  Helpers                                                             */
/* ------------------------------------------------------------------ */

function readCSV(url) {
  return parse(readFileSync(url, "utf8"), {
    columns:          true,
    skip_empty_lines: true,
    trim:             true,
    relax_quotes:     true
  });
}

function toBool(val)         { return ["true", "yes", "1"].includes(String(val ?? "").toLowerCase().trim()); }
function toInt(val, def = 0) { const n = parseInt(String(val ?? ""), 10); return isNaN(n) ? def : n; }
function toList(val)         { if (!val || !String(val).trim()) return []; return String(val).split(",").map(s => s.trim()).filter(Boolean); }
function str(val)            { return String(val ?? "").trim(); }
function toHTML(md)          { if (!md) return ""; return marked.parse(md.trim()).trim(); }

/* ------------------------------------------------------------------ */
/*  Load shared tag ids from source.json for validation                 */
/* ------------------------------------------------------------------ */

let tagIdSet = new Set();
try {
  const source = JSON.parse(readFileSync(SOURCE_JSON, "utf8"));
  tagIdSet = new Set((source.tags ?? []).map(t => t.id));
} catch(e) {
  console.warn("  ⚠ Could not read source.json for tag validation — tag IDs will not be checked.");
}

/* ------------------------------------------------------------------ */
/*  Parse CSVs                                                          */
/* ------------------------------------------------------------------ */

console.log("\n▸ Parsing NPC abilities…");
const abilityRows = readCSV(NPC_ABILITIES_CSV);

console.log("▸ Parsing NPC classes / templates…");
const classRows = readCSV(NPC_CLASSES_CSV);

/* ------------------------------------------------------------------ */
/*  Build lookup maps for cross-reference validation                    */
/* ------------------------------------------------------------------ */

const VALID_COSTS    = new Set(["passive", "reaction", "0", "1", "2", "3"]);
const abilityIdSet   = new Set(abilityRows.map(r => str(r.id)).filter(Boolean));
const classIdSet     = new Set(classRows.map(r => str(r.id)).filter(Boolean));
const abilityNameMap = Object.fromEntries(abilityRows.map(r => [str(r.id), str(r.name)]));

/* ------------------------------------------------------------------ */
/*  Validation                                                          */
/* ------------------------------------------------------------------ */

let errors = 0;
function err(msg) { console.error(`  ✗ ${msg}`); errors++; }

console.log("\n▸ Validating NPC abilities…");
for (const r of abilityRows) {
  if (!r.id)   err(`Ability missing "id": ${JSON.stringify(r)}`);
  if (!r.name) err(`Ability "${r.id}" missing "name"`);
  if (!VALID_COSTS.has(str(r.cost || "1")))
    err(`Ability "${r.id}" invalid cost "${r.cost}" — must be one of: ${[...VALID_COSTS].join(", ")}`);
  if (r.source && !classIdSet.has(str(r.source)))
    err(`Ability "${r.id}" references unknown source "${r.source}"`);
  for (const tid of toList(r.tags)) {
    if (tagIdSet.size > 0 && !tagIdSet.has(tid))
      err(`Ability "${r.id}" references unknown tag id "${tid}"`);
  }
}

console.log("▸ Validating NPC classes / templates…");
for (const r of classRows) {
  if (!r.id)   err(`Class/template missing "id": ${JSON.stringify(r)}`);
  if (!r.name) err(`Class/template "${r.id}" missing "name"`);
  for (const abId of toList(r.abilities)) {
    if (!abilityIdSet.has(abId))
      err(`Class/template "${r.id}" references unknown ability id "${abId}"`);
  }
}

if (errors > 0) {
  console.error(`\n✗ ${errors} error(s). Fix the CSV files and try again.\n`);
  process.exit(1);
}
console.log("  ✓ Validation passed.");

/* ------------------------------------------------------------------ */
/*  Transform: NPC Abilities                                            */
/* ------------------------------------------------------------------ */

console.log("\n▸ Transforming…");

const outNPCAbilities = abilityRows
  .filter(r => r.id && r.name)
  .map(r => ({
    name: str(r.name),
    type: "npc-ability",
    flags: { shard: { sourceId: str(r.id), sourceClass: str(r.source) } },
    system: {
      tier:             toBool(r.isBasic) ? "basic" : "optional",
      cost:             str(r.cost) || "1",
      charged:          toBool(r.isCharged),
      isAttack:         toBool(r.isAttack),
      damage:           str(r.damage),
      hasGraze:         toBool(r.hasGraze),
      grazeDamage:      str(r.grazeDamage),
      hasResistance:    toBool(r.hasResistance),
      resistanceDamage: str(r.resistanceDamage),
      range:            str(r.range),
      effect:           toHTML(r.description),
      // _tagIds resolved by the import macro
      _tagIds:          toList(r.tags)
    }
  }));

/* ------------------------------------------------------------------ */
/*  Transform: NPC Classes and Templates                               */
/* ------------------------------------------------------------------ */

const outNPCClasses   = [];
const outNPCTemplates = [];

for (const r of classRows) {
  if (!r.id || !r.name) continue;
  const isTemplate = toBool(r.isTemplate);

  const abilityIds = toList(r.abilities).map(id => ({
    id,
    name: abilityNameMap[id] ?? id,
    tier: "basic"   // tier is overridden from the ability's own isBasic flag at import time
  }));

  if (isTemplate) {
    outNPCTemplates.push({
      name: str(r.name),
      type: "npc-template",
      flags: { shard: { sourceId: str(r.id) } },
      system: {
        description:  toHTML(r.description),
        _abilityIds:  abilityIds
      }
    });
  } else {
    outNPCClasses.push({
      name: str(r.name),
      type: "npc-class",
      flags: { shard: { sourceId: str(r.id) } },
      system: {
        description: toHTML(r.description),
        stats: {
          hp:      toInt(r.hp,      10),
          hpBonus: toInt(r.hpBonus,  0),
          def:     toInt(r.def,     10),
          spd:     toInt(r.spd,      5),
          armor:   toInt(r.armor,    0)
        },
        _abilityIds: abilityIds
      }
    });
  }
}

/* ------------------------------------------------------------------ */
/*  Write output                                                        */
/* ------------------------------------------------------------------ */

mkdirSync(DIST_DIR, { recursive: true });

writeFileSync(OUT_URL, JSON.stringify(
  { npcAbilities: outNPCAbilities, npcClasses: outNPCClasses, npcTemplates: outNPCTemplates },
  null,
  2
), "utf8");

const total = outNPCAbilities.length + outNPCClasses.length + outNPCTemplates.length;
console.log(`  ✓ Wrote dist/npc-compendium-data.json`);
console.log(`    ${outNPCAbilities.length} abilities  |  ${outNPCClasses.length} classes  |  ${outNPCTemplates.length} templates  (${total} total)\n`);
