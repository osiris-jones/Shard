/**
 * Shard — GM Resistance Roll Macro
 *
 * Paste this file into a Foundry World macro (Script type, GM-only).
 * Opens a small dialog to set a roll name and DV, then posts a resistance
 * roll prompt to chat. Players click the Resistance Roll button on their
 * controlled token to respond.
 */

if (!game.user.isGM) {
  ui.notifications.warn("Only the GM can send resistance roll prompts.");
  return;
}

const actor = canvas.tokens?.controlled[0]?.actor ?? null;

const result = await Dialog.prompt({
  title:   "GM Resistance Roll",
  content: `<form style="padding:8px">
    <div class="form-group" style="display:flex;align-items:center;gap:8px;margin-bottom:8px">
      <label style="min-width:120px">Roll Name</label>
      <input name="rollName" type="text" value="Resistance Roll" style="flex:1" />
    </div>
    <div class="form-group" style="display:flex;align-items:center;gap:8px">
      <label style="min-width:120px">Difficulty Value (DV)</label>
      <input name="dv" type="number" value="10" min="1" style="width:70px" />
    </div>
  </form>`,
  callback:    html => ({
    rollName: html.find("[name=rollName]").val().trim() || "Resistance Roll",
    dv:       parseInt(html.find("[name=dv]").val(), 10) || 10
  }),
  rejectClose: false
});

if (!result) return;

const html = await renderTemplate(
  "systems/shard/templates/chat/gm-resist-card.hbs",
  { rollName: result.rollName, dv: result.dv, actorName: actor?.name ?? "" }
);

ChatMessage.create({
  content: html,
  speaker: actor ? ChatMessage.getSpeaker({ actor }) : ChatMessage.getSpeaker(),
  flags: {
    shard: {
      abilityCard:   true,
      hasResistance: true,
      resistanceDV:  result.dv,
      resistFormula: ""
    }
  }
});
