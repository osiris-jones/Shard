/**
 * build-compendium.mjs
 *
 * Reads source.json from the system root, validates it, converts Markdown
 * descriptions to HTML, and writes dist/compendium-data.json ready for the
 * Foundry import macro.
 *
 * Usage (from the system root or tools/ directory):
 *   cd tools && npm install   (once)
 *   node tools/build-compendium.mjs
 */

import { readFileSync, writeFileSync, mkdirSync } from "fs";
import { marked }                                  from "marked";

// Treat single newlines as <br> — matches how content is authored in spreadsheets.
marked.use({ breaks: true });

/* ------------------------------------------------------------------ */
/*  Paths                                                               */
/* ------------------------------------------------------------------ */

const SOURCE_URL = new URL("../source.json",                   import.meta.url);
const DIST_DIR   = new URL("../dist/",                         import.meta.url);
const OUT_URL    = new URL("../dist/compendium-data.json",     import.meta.url);

/* ------------------------------------------------------------------ */
/*  Markdown → HTML                                                     */
/* ------------------------------------------------------------------ */

function toHTML(md) {
  if (!md || typeof md !== "string") return "";
  return marked.parse(md.trim()).trim();
}

function toInlineHTML(md) {
  if (!md || typeof md !== "string") return "";
  return marked.parseInline(md.trim());
}

/* ------------------------------------------------------------------ */
/*  Read source                                                         */
/* ------------------------------------------------------------------ */

let source;
try {
  source = JSON.parse(readFileSync(SOURCE_URL, "utf8"));
} catch (e) {
  console.error(`\n✗ Could not read source.json: ${e.message}\n`);
  process.exit(1);
}

const tags      = source.tags      ?? [];
const abilities = source.abilities ?? [];
const classes   = source.classes   ?? [];

/* ------------------------------------------------------------------ */
/*  Validation                                                          */
/* ------------------------------------------------------------------ */

const VALID_COSTS = new Set(["passive", "reaction", "0", "1", "2", "3"]);
const VALID_DICE  = new Set(["d4", "d6", "d8", "d10", "d12"]);

let errors = 0;
function err(msg) { console.error(`  ✗ ${msg}`); errors++; }

const tagIdSet     = new Set(tags.map(t => t.id));
const abilityIdSet = new Set(abilities.map(a => a.id));

console.log("\n▸ Validating tags…");
for (const t of tags) {
  if (!t.id)   err(`Tag missing "id": ${JSON.stringify(t)}`);
  if (!t.name) err(`Tag "${t.id}" missing "name"`);
}

console.log("▸ Validating abilities…");
for (const ab of abilities) {
  if (!ab.id)   err(`Ability missing "id": ${JSON.stringify(ab)}`);
  if (!ab.name) err(`Ability "${ab.id}" missing "name"`);
  if (!VALID_COSTS.has(String(ab.cost ?? "")))
    err(`Ability "${ab.id}" invalid cost "${ab.cost}" — must be one of: ${[...VALID_COSTS].join(", ")}`);
  const rank = ab.rank ?? -1;
  if (rank < 0 || rank > 5)
    err(`Ability "${ab.id}" invalid rank "${ab.rank}" — must be 0–5`);
  for (const tid of (ab.tags ?? [])) {
    if (!tagIdSet.has(tid))
      err(`Ability "${ab.id}" references unknown tag id "${tid}"`);
  }
  if (ab.parent !== undefined && !abilityIdSet.has(ab.parent))
    err(`Ability "${ab.id}" references unknown parent id "${ab.parent}"`);
}

console.log("▸ Validating classes…");
for (const cls of classes) {
  if (!cls.id)   err(`Class missing "id": ${JSON.stringify(cls)}`);
  if (!cls.name) err(`Class "${cls.id}" missing "name"`);
  const stats = cls.stats ?? {};
  if (stats.atk && !VALID_DICE.has(stats.atk))
    err(`Class "${cls.id}" invalid stats.atk "${stats.atk}" — must be one of: ${[...VALID_DICE].join(", ")}`);
  if (stats.mag && !VALID_DICE.has(stats.mag))
    err(`Class "${cls.id}" invalid stats.mag "${stats.mag}" — must be one of: ${[...VALID_DICE].join(", ")}`);
  for (const abId of (cls.abilities ?? [])) {
    if (!abilityIdSet.has(abId))
      err(`Class "${cls.id}" references unknown ability id "${abId}"`);
  }
}

if (errors > 0) {
  console.error(`\n✗ ${errors} error(s). Fix source.json and try again.\n`);
  process.exit(1);
}
console.log("  ✓ Validation passed.");

/* ------------------------------------------------------------------ */
/*  Build lookup tables                                                 */
/* ------------------------------------------------------------------ */

/** tag id → name (for embedding in ability tag arrays) */
const tagNameMap = Object.fromEntries(tags.map(t => [t.id, t.name]));

/** ability id → rank (for embedding in class ability arrays) */
const abilityRankMap = Object.fromEntries(abilities.map(a => [a.id, a.rank ?? 1]));
/** ability id → display name */
const abilityNameMap = Object.fromEntries(abilities.map(a => [a.id, a.name]));

/* ------------------------------------------------------------------ */
/*  Transform                                                           */
/* ------------------------------------------------------------------ */

console.log("\n▸ Transforming…");

/* ── Tags ─────────────────────────────────────────────────────────── */

const outTags = tags.map(t => ({
  name: t.name,
  type: "tag",
  flags: { shard: { sourceId: t.id } },
  system: {
    description:       toInlineHTML(t.description ?? ""),
    advantageBonus:    t.advantageBonus    ?? 0,
    disadvantageBonus: t.disadvantageBonus ?? 0
  }
}));

/* ── Abilities ────────────────────────────────────────────────────── */

const outAbilities = abilities.map(ab => ({
  name: ab.name,
  type: "ability",
  flags: { shard: { sourceId: ab.id, classId: ab.class ?? "" } },
  system: {
    cost:          String(ab.cost ?? "1"),
    focusCost:     ab.focusCost     ?? 0,
    rank:          ab.rank          ?? 1,
    range:         ab.range         ?? "",
    isAttack:      ab.isAttack      ?? false,
    damage:        ab.damage        ?? "",
    hasGraze:      ab.hasGraze      ?? false,
    grazeDamage:   ab.grazeDamage   ?? "",
    hasResistance: ab.hasResistance ?? false,
    resistanceDV:  ab.resistanceDV  ?? "10",
    isInnate:        ab.isInnate        ?? false,
    isHeroicTalent:  ab.isHeroicTalent  ?? false,
    modifiers:       ab.modifiers       ?? [],
    effect:          toHTML(ab.description ?? ""),
    // _tagIds — resolved to { uuid, name } objects by the import macro
    _tagIds:         ab.tags ?? [],
    // _parentId — resolved to a uuid by the import macro; omitted when blank
    ...(ab.parent ? { _parentId: ab.parent } : {})
  }
}));

/* ── Classes ──────────────────────────────────────────────────────── */

const outClasses = classes.map(cls => ({
  name: cls.name,
  type: "class",
  flags: { shard: { sourceId: cls.id } },
  system: {
    description: toHTML(cls.description ?? ""),
    stats: {
      atk:       cls.stats?.atk       ?? "d6",
      mag:       cls.stats?.mag       ?? "d6",
      def:       cls.stats?.def       ?? 10,
      spd:       cls.stats?.spd       ?? 5,
      armor:     cls.stats?.armor     ?? 0,
      focusPool: cls.stats?.focusPool ?? 3,
      maxHP:     cls.stats?.maxHP     ?? 10
    },
    // _abilityIds — resolved to { uuid, name, rank } objects by the import macro
    _abilityIds: (cls.abilities ?? []).map(id => ({
      id,
      name: abilityNameMap[id] ?? id,
      rank: abilityRankMap[id] ?? 1
    }))
  }
}));

/* ------------------------------------------------------------------ */
/*  Write output                                                        */
/* ------------------------------------------------------------------ */

mkdirSync(DIST_DIR, { recursive: true });

writeFileSync(OUT_URL, JSON.stringify(
  { tags: outTags, abilities: outAbilities, classes: outClasses },
  null,
  2
), "utf8");

const total = outTags.length + outAbilities.length + outClasses.length;
console.log(`  ✓ Wrote dist/compendium-data.json`);
console.log(`    ${outTags.length} tags  |  ${outAbilities.length} abilities  |  ${outClasses.length} classes  (${total} total)\n`);
