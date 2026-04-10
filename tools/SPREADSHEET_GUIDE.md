# Shard Compendium — Spreadsheet Guide

Everything lives in three sheets: **Tags**, **Abilities**, and **Classes**.
Edit them, export to CSV, run two commands, then run the Foundry import macro.

---

## Full Pipeline

```
Edit CSVs in tools/templates/
        │
        ▼
node tools/csv-to-source.mjs        → writes source.json
        │
        ▼
node tools/build-compendium.mjs     → writes dist/compendium-data.json
        │
        ▼
Run import macro in Foundry         → creates/updates compendium items
```

Or run both conversion steps at once:
```
cd tools && npm run import
```

---

## Sheet 1 — Tags

File: `tools/templates/tags.csv`

| Column | Type | Notes |
|--------|------|-------|
| `id` | slug | Unique stable identifier. Use lowercase-with-hyphens. **Never change this once abilities reference it.** |
| `name` | text | Display name shown on ability cards and sheets. |
| `description` | text | One-sentence rules clarification. |
| `advantageBonus` | number | How much Advantage this tag grants to the attacker (usually 0). |
| `disadvantageBonus` | number | How much Disadvantage this tag imposes on the attacker (usually 0). |

**Tips:**
- Tag IDs are what abilities reference — choose them carefully and don't rename them later.
- Most tags will have 0/0 bonuses; the bonus fields exist for special cases.

---

## Sheet 2 — Abilities

File: `tools/templates/abilities.csv`

| Column | Required | Type | Valid Values |
|--------|----------|------|--------------|
| `id` | ✓ | slug | Unique. Recommend `classid-abilityname` e.g. `warrior-power-strike` |
| `name` | ✓ | text | Display name |
| `class` | ✓ | slug | Must match a class `id`. Used to assign this ability to the right class. |
| `rank` | ✓ | number | `0` = Basic (auto-granted), `1`–`5` = selectable |
| `cost` | ✓ | enum | `passive` `reaction` `0` `1` `2` `3` |
| `focusCost` | | number | Focus spent to activate. `0` if none. |
| `range` | | text | Free text: `Near`, `Far`, `Self`, `5 squares`, etc. |
| `isAttack` | | bool | `TRUE` or `FALSE` — shows the attack roll button |
| `damage` | | formula | Dice formula. Tokens: `[atk]` `[mag]` `[tier]`. e.g. `[atk]+2` |
| `hasGraze` | | bool | `TRUE` or `FALSE` — shows Graze button on miss |
| `grazeDamage` | | formula | Damage formula for graze hits |
| `hasResistance` | | bool | `TRUE` or `FALSE` — shows Resistance Roll button |
| `resistanceDV` | | number | Difficulty value for the resistance roll. Default `10`. |
| `resistanceDamage` | | formula | Damage on failed resistance (optional) |
| `tags` | | list | Tag IDs from the Tags sheet, **comma-separated with no spaces**: `melee,weapon` |
| `description` | | markdown | Ability description. Markdown is supported. Multiline OK inside quotes. |

### Cost values

| Value | Meaning |
|-------|---------|
| `passive` | No activation — always on. Shows no button. |
| `reaction` | Used as a reaction (outside your turn). |
| `0` | Free action (0 AP). |
| `1` | 1 Action Point. |
| `2` | 2 Action Points. |
| `3` | 3 Action Points — major action. |

### Rank values

| Rank | Meaning | Player Level Required |
|------|---------|-----------------------|
| `0` | Basic — auto-granted when class is set as base | Any |
| `1` | Rank 1 | Level 1 |
| `2` | Rank 2 | Level 2 |
| `3` | Rank 3 | Level 4 |
| `4` | Rank 4 | Level 5 |
| `5` | Rank 5 | Level 8 |

### Formula tokens

| Token | Replaced with |
|-------|---------------|
| `[atk]` | Actor's attack die (`d4`–`d12`) |
| `[mag]` | Actor's magic die (`d4`–`d12`) |
| `[tier]` | Actor's tier (1–5, derived from total level) |

These are resolved at roll time against the acting character.

### Writing descriptions

Descriptions support standard Markdown:
- `**bold**`, `*italic*`
- `-` or `*` for bullet lists
- Use `**Effect:**`, `**Passive:**`, `**Reaction:**` at the start of the mechanical line — this keeps formatting consistent with the rest of the system.

In a CSV cell, multiline descriptions work fine as long as the entire cell is wrapped in double quotes:
```
"A powerful strike.

**Effect:** Deal [atk]+[tier] damage."
```

---

## Sheet 3 — Classes

File: `tools/templates/classes.csv`

| Column | Required | Type | Notes |
|--------|----------|------|-------|
| `id` | ✓ | slug | Unique identifier. Referenced by abilities' `class` column. |
| `name` | ✓ | text | Display name |
| `atk` | ✓ | enum | `d4` `d6` `d8` `d10` `d12` — attack die |
| `mag` | ✓ | enum | `d4` `d6` `d8` `d10` `d12` — magic die |
| `def` | ✓ | number | Base DEF. Default `10`. |
| `spd` | ✓ | number | Base SPD. Default `5`. |
| `armor` | ✓ | number | Base armor. Default `0`. |
| `focusPool` | ✓ | number | Base Focus pool size. |
| `maxHP` | ✓ | number | Base HP at level 1 (before level bonuses). |
| `abilities` | ✓ | list | Ability IDs from the Abilities sheet, **comma-separated with no spaces**: `warrior-strike,warrior-parry` |
| `description` | | markdown | Class flavor text and starting notes. Markdown supported. |

**Ability order in the list matters** — abilities are displayed in the order they appear.
Put rank 0 (basic) abilities first, then rank 1, 2, 3, etc.

---

## Exporting from Google Sheets

1. Create a new Google Sheets workbook with three tabs: **Tags**, **Abilities**, **Classes**
2. Copy the header row and example rows from the template CSVs as a starting point
3. When ready to export, export **each tab** separately:
   - `File → Download → Comma-separated values (.csv)`
   - This downloads only the currently visible tab — repeat for each tab
4. Save each file to `tools/templates/` with the exact names:
   - `tags.csv`
   - `abilities.csv`
   - `classes.csv`

> **Tip:** The Google Sheets "Download as CSV" only exports the active tab. Do not rename the files.

---

## Exporting from Excel

1. Open the workbook and select the **Tags** sheet
2. `File → Save As → Browse`
3. Change "Save as type" to **CSV UTF-8 (Comma delimited) (*.csv)**
4. Save to `tools/templates/tags.csv`
5. Repeat for Abilities and Classes sheets

> **Important:** Excel may warn about "features not compatible with CSV" — click **Keep Current Format**. The other sheets are not saved; you must repeat this for each sheet.

---

## Running the conversion

From the system root (`shard/`):

```bash
# First time only — install dependencies
cd tools && npm install && cd ..

# Convert CSVs → source.json → dist/compendium-data.json
node tools/csv-to-source.mjs && node tools/build-compendium.mjs
```

Or from inside the `tools/` folder:
```bash
npm run import
```

If there are validation errors (unknown tag IDs, bad cost values, etc.) the build script will report them before writing anything to `dist/`. Fix them in the CSVs and re-run.

---

## Running the Foundry import macro

1. In Foundry, open **Macro Directory** (hotbar or right-click a slot → Edit Macro)
2. Create a new macro: **Type: Script**
3. Paste the full contents of `tools/import-macro.js`
4. Click **Execute**
5. Watch the notifications — it will tell you how many items were created/updated

Re-running the macro is safe. Existing items are matched by their stable `id` from the CSV and updated in-place — no duplicates are created.

---

## Adding stat modifiers to passive abilities

Passive abilities can modify actor stats (DEF, HP max, etc.). This can't be expressed cleanly in a single CSV cell, so after running `csv-to-source.mjs`, you can open `source.json` and manually add a `modifiers` array to any ability:

```json
{
  "id": "warrior-parry",
  ...
  "modifiers": [
    { "target": "stats.def", "value": 1, "label": "Parry" }
  ]
}
```

Valid `target` values: `hp.max` `focus.max` `stats.def` `stats.spd` `stats.armor` `stats.tier`

These manual additions to `source.json` will be overwritten the next time `csv-to-source.mjs` runs. If you need modifiers often, consider adding a `modifiers` column to `abilities.csv` in a format like `stats.def:1` and updating the script to parse it.
