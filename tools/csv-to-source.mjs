/**
 * csv-to-source.mjs
 *
 * Reads the three CSV files (tags, abilities, classes) from tools/templates/
 * and writes source.json in the system root.
 *
 * Run from anywhere inside the system folder:
 *   node tools/csv-to-source.mjs
 *
 * Or chain with the build step:
 *   node tools/csv-to-source.mjs && node tools/build-compendium.mjs
 *
 * CSV files:
 *   tools/templates/tags.csv
 *   tools/templates/abilities.csv
 *   tools/templates/classes.csv
 */

import { readFileSync, writeFileSync, existsSync } from "fs";
import { parse }                                    from "csv-parse/sync";

/* ------------------------------------------------------------------ */
/*  Paths                                                               */
/* ------------------------------------------------------------------ */

const TAGS_CSV      = new URL("templates/tags.csv",      import.meta.url);
const ABILITIES_CSV = new URL("templates/abilities.csv", import.meta.url);
const CLASSES_CSV   = new URL("templates/classes.csv",   import.meta.url);
const OUT_JSON      = new URL("../source.json",          import.meta.url);

/* ------------------------------------------------------------------ */
/*  Helpers                                                             */
/* ------------------------------------------------------------------ */

/** Parse a CSV file and return an array of row objects (first row = headers). */
function readCSV(url) {
  if (!existsSync(url)) {
    console.error(`  ✗ File not found: ${url.pathname}`);
    process.exit(1);
  }
  return parse(readFileSync(url, "utf8"), {
    columns:          true,
    skip_empty_lines: true,
    trim:             true,
    relax_quotes:     true
  });
}

/** "TRUE" / "yes" / "1" → true, anything else → false */
function toBool(val) {
  return ["true", "yes", "1"].includes(String(val ?? "").toLowerCase().trim());
}

/** Parse integer with fallback default. */
function toInt(val, def = 0) {
  const n = parseInt(String(val ?? ""), 10);
  return isNaN(n) ? def : n;
}

/** Comma-separated string → trimmed array of non-empty strings. */
function toList(val) {
  if (!val || !String(val).trim()) return [];
  return String(val).split(",").map(s => s.trim()).filter(Boolean);
}

/** Keep a string, returning "" for undefined/null. */
function str(val) { return String(val ?? "").trim(); }

/* ------------------------------------------------------------------ */
/*  Parse Tags                                                          */
/* ------------------------------------------------------------------ */

console.log("\n▸ Parsing tags…");
const tagRows = readCSV(TAGS_CSV);

const tags = tagRows.map(row => ({
  id:                str(row.id),
  name:              str(row.name),
  description:       str(row.description),
  advantageBonus:    toInt(row.advantageBonus,    0),
  disadvantageBonus: toInt(row.disadvantageBonus, 0)
})).filter(t => t.id && t.name);

console.log(`  ✓ ${tags.length} tags`);

/* ------------------------------------------------------------------ */
/*  Parse Abilities                                                     */
/* ------------------------------------------------------------------ */

console.log("▸ Parsing abilities…");
const abilityRows = readCSV(ABILITIES_CSV);

const abilities = abilityRows.map(row => {
  const entry = {
    id:            str(row.id),
    name:          str(row.name),
    class:         str(row.class),
    rank:          toInt(row.rank, 1),
    cost:          str(row.cost) || "1",
    focusCost:     toInt(row.focusCost, 0),
    range:         str(row.range),
    isAttack:      toBool(row.isAttack),
    damage:        str(row.damage),
    hasGraze:      toBool(row.hasGraze),
    grazeDamage:   str(row.grazeDamage),
    hasResistance: toBool(row.hasResistance),
    resistanceDV:  str(row.resistanceDV) || "10",
    isInnate:        toBool(row.isInnate),
    isHeroicTalent:  toBool(row.isHeroicTalent),
    tags:            toList(row.tags),
    description:     str(row.description)
  };

  // resistanceDamage is optional — include only if the column exists and has a value
  if (row.resistanceDamage !== undefined && str(row.resistanceDamage))
    entry.resistanceDamage = str(row.resistanceDamage);

  // parent is optional — include only if the column exists and has a value
  if (row.parent !== undefined && str(row.parent))
    entry.parent = str(row.parent);

  return entry;
}).filter(a => a.id && a.name);

console.log(`  ✓ ${abilities.length} abilities`);

/* ------------------------------------------------------------------ */
/*  Parse Classes                                                       */
/* ------------------------------------------------------------------ */

console.log("▸ Parsing classes…");
const classRows = readCSV(CLASSES_CSV);

const classes = classRows.map(row => ({
  id:          str(row.id),
  name:        str(row.name),
  description: str(row.description),
  stats: {
    atk:       str(row.atk)   || "d6",
    mag:       str(row.mag)   || "d6",
    def:       toInt(row.def,       10),
    spd:       toInt(row.spd,        5),
    armor:     toInt(row.armor,      0),
    focusPool: toInt(row.focusPool,  3),
    maxHP:     toInt(row.maxHP,     10)
  },
  abilities: toList(row.abilities)
})).filter(c => c.id && c.name);

console.log(`  ✓ ${classes.length} classes`);

/* ------------------------------------------------------------------ */
/*  Write source.json                                                   */
/* ------------------------------------------------------------------ */

const output = {
  _comment: "Generated by csv-to-source.mjs — edit the CSV files in tools/templates/, not this file directly.",
  tags,
  abilities,
  classes
};

writeFileSync(OUT_JSON, JSON.stringify(output, null, 2), "utf8");

console.log(`\n  ✓ Wrote source.json  (${tags.length} tags, ${abilities.length} abilities, ${classes.length} classes)\n`);
