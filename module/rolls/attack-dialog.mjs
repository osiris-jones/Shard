/**
 * attack-dialog.mjs — Attack Roll Dialog, Chat Cards, and Resistance Rolls.
 *
 * Resolution system: 3d6kh3 base.
 *   Advantage: add dice, still keep highest 3  → (3+net)d6kh3
 *   Disadvantage: add dice, keep LOWEST 3       → (3+|net|)d6kl3
 *   Flat bonus: reserved field, added after keep (not yet sourced from attributes).
 *
 * Concealment: separate d6 roll. If result ≤ concealment value → attack total = 0.
 */

/* -------------------------------------------------------------------- */
/*  Helpers                                                               */
/* -------------------------------------------------------------------- */

/**
 * Build the 3d6kh3 / kl3 attack roll formula.
 * @param {number} net        Positive = advantage, negative = disadvantage.
 * @param {number} flatBonus  Reserved for future attribute bonuses.
 * @returns {string}
 */
function buildAttackFormula(net, flatBonus = 0) {
  const baseDice = 3;
  const totalDice = baseDice + Math.abs(net);
  const keep = net >= 0 ? `kh${baseDice}` : `kl${baseDice}`;
  let formula = `${totalDice}d6${keep}`;
  // Flat bonus — reserved: wired up but sourced as 0 until attributes exist
  if (flatBonus > 0) formula += ` + ${flatBonus}`;
  if (flatBonus < 0) formula += ` - ${Math.abs(flatBonus)}`;
  return formula;
}

/**
 * Build the resistance roll formula (same dice system, no flat bonus yet).
 */
function buildResistFormula(net) {
  return buildAttackFormula(net, 0);
}

/* -------------------------------------------------------------------- */
/*  Attack Dialog                                                         */
/* -------------------------------------------------------------------- */

export class ShardAttackDialog extends Dialog {

  static async show(actor, ability) {
    const rawTargets  = [...game.user.targets].filter(t => t.actor);
    const tokenImgMap = Object.fromEntries(
      rawTargets.map(t => [t.actor.id, t.document?.texture?.src ?? t.actor.img ?? ""])
    );
    const baseAdv    = actor.netAdvantage;
    const offGuardId = game.settings.get("shard", "offGuardConditionId") ?? "";
    const proneId    = game.settings.get("shard", "proneConditionId")    ?? "";
    const { STATUS_EFFECTS } = game.shard.SHARD;

    // Build flat target data objects (isOffGuard / isProne flags for the template)
    const targets = rawTargets.map(t => ({
      name:       t.actor.name,
      img:        tokenImgMap[t.actor.id] ?? t.actor.img ?? "",
      def:        t.actor.system?.stats?.def ?? "?",
      isOffGuard: !!offGuardId && !!(t.actor.statuses?.has(offGuardId)),
      isProne:    !!proneId    && !!(t.actor.statuses?.has(proneId)),
      _actor:     t.actor,
      _tokenId:   t.id ?? null   // Token document ID — needed for unlinked token lookup
    }));

    const content = await renderTemplate(
      "systems/shard/templates/dialogs/attack-dialog.hbs",
      {
        actor, ability, targets, baseAdv,
        statuses: STATUS_EFFECTS.filter(s => actor.statuses?.has(s.id))
      }
    );

    return new Promise(resolve => {
      new ShardAttackDialog({
        title:   `Attack: ${ability.name}`,
        content,
        buttons: {
          roll: {
            icon:     "<i class='fas fa-dice-d6'></i>",
            label:    "Roll Attack",
            callback: async html => {
              const formData     = new FormDataExtended(html[0].querySelector("form")).object;
              const actorTargets = targets.map(t => t._actor);
              const tokenIds     = targets.map(t => t._tokenId ?? null);
              await ShardAttackDialog._executeRoll({ actor, ability, targets: actorTargets, tokenIds, tokenImgMap, formData, baseAdv });
              resolve(true);
            }
          },
          cancel: {
            icon:     "<i class='fas fa-times'></i>",
            label:    "Cancel",
            callback: () => resolve(false)
          }
        },
        default: "roll"
      }, { classes: ["shard", "dialog", "attack-dialog"], width: 420 }).render(true);
    });
  }

  /* ------------------------------------------------------------------ */
  /*  Roll Execution                                                      */
  /* ------------------------------------------------------------------ */

  static async _executeRoll({ actor, ability, targets, tokenIds = [], tokenImgMap = {}, formData, baseAdv }) {
    const manualAdj   = parseInt(formData.netAdvantage ?? 0, 10);
    const flatBonus   = parseInt(formData.flatBonus    ?? 0, 10);
    const bonusDamage = (formData.bonusDamage ?? "").trim();
    const ignoreArmor = !!formData.ignoreArmor;
    const offGuardId  = game.settings.get("shard", "offGuardConditionId") ?? "";
    const proneId     = game.settings.get("shard", "proneConditionId")    ?? "";

    const TE       = foundry.applications.ux.TextEditor.implementation;
    const allRolls = [];

    // One roll per target; if no targets selected, one untargeted roll.
    const rollTargets = targets.length > 0 ? targets : [null];
    const targetResults = [];

    for (let i = 0; i < rollTargets.length; i++) {
      const targetActor  = rollTargets[i];
      const coverRaw     = formData[`cover_${i}`];
      const coverDis     = (coverRaw === true || coverRaw === "true") ? 1 : 0;
      const concealVal   = parseInt(formData[`concealment_${i}`] ?? 0, 10);
      const isOffGuard   = !!offGuardId && !!(targetActor?.statuses?.has(offGuardId));
      const isProne      = !!proneId    && !!(targetActor?.statuses?.has(proneId));
      const condAdv      = (isOffGuard ? 1 : 0) + (isProne ? 1 : 0);
      const net          = baseAdv + manualAdj - coverDis + condAdv;

      const roll = new Roll(buildAttackFormula(net, flatBonus));
      await roll.evaluate();
      allRolls.push(roll);

      let concealBlocked = false, concealRoll = null;
      if (concealVal > 0) {
        concealRoll = new Roll("1d6");
        await concealRoll.evaluate();
        concealBlocked = concealRoll.total <= concealVal;
        allRolls.push(concealRoll);
      }

      const attackTotal = concealBlocked ? 0 : roll.total;
      const targetDEF   = targetActor?.system?.stats?.def ?? null;
      const hit         = targetDEF !== null ? attackTotal >= targetDEF : null;
      const armor       = (ignoreArmor || !targetActor) ? 0 : (targetActor.system?.stats?.armor ?? 0);

      const tokenImg = tokenImgMap[targetActor?.id]
        ?? canvas.tokens?.placeables.find(t => t.actor?.id === targetActor?.id)?.document?.texture?.src
        ?? targetActor?.img ?? "";

      const isCrit = hit === true && attackTotal >= 17;

      targetResults.push({
        actor: targetActor, tokenId: tokenIds[i] ?? null,
        tokenImg, rollHTML: await roll.render(),
        attackTotal, targetDEF, hit, isCrit,
        concealBlocked, concealRoll, concealVal,
        net, armor, isOffGuard, isProne
      });

      // Off Guard is consumed by the attack; Prone persists.
      if (isOffGuard && targetActor) {
        if (targetActor.isOwner) {
          await targetActor.toggleStatusEffect(offGuardId, { active: false });
        } else {
          // Non-owner: delegate to the GM via socket so the status is
          // removed regardless of attacker's permission on the target.
          game.socket.emit("system.shard", {
            action:   "removeStatusEffect",
            actorId:  targetActor.id,
            tokenId:  tokenIds[i] ?? null,
            sceneId:  canvas.scene?.id ?? null,
            statusId: offGuardId
          });
        }
      }
    }

    const hitAny  = targetResults.some(r => r.hit === true);
    const missAny = targetResults.some(r => r.hit === false);
    const critAny = targetResults.some(r => r.isCrit);

    const baseFormula   = ability.system.resolveDamageFormula(actor);
    const damageFormula = bonusDamage && baseFormula ? `${baseFormula} + ${bonusDamage}` : baseFormula;
    const grazeFormula  = ability.system.resolveGrazeFormula(actor);

    // Compute flat ATK/MAG bonus: bonus-per-AP × AP cost, applied at roll time.
    const rawDamage  = ability.system.damage ?? "";
    const apCost     = ability.system.apCost ?? 0;
    let   damageBonus = 0;
    if (apCost > 0) {
      if (/\[atk\]/i.test(rawDamage)) damageBonus += apCost * (actor.system.atkBonus ?? 0);
      if (/\[mag\]/i.test(rawDamage)) damageBonus += apCost * (actor.system.magBonus ?? 0);
    }
    const resistFormula = ability.system.resolveResistFormula(actor);

    const effectHTML = ability.system.effect
      ? await TE.enrichHTML(ability.system.effect, { async: true })
      : "";

    const resistanceDV = ability.system.resolveResistanceDV(actor);

    const focusSpent = ability.system.focusCost ?? 0;

    const html = await renderTemplate(
      "systems/shard/templates/chat/attack-card.hbs",
      {
        actor, ability, effectHTML,
        iconSrc:       null,   // placeholder — future: tag-based generic icon
        tags:          ability.system.tags ?? [],
        targetResults, hitAny, missAny, critAny,
        flatBonus,
        damageFormula, grazeFormula,
        hasGraze:      ability.system.hasGraze,
        hasResistance: ability.system.hasResistance,
        resistanceDV,
        resistFormula
      }
    );

    return ChatMessage.create({
      content: html,
      speaker: ChatMessage.getSpeaker({ actor }),
      rolls:   allRolls,
      flags: {
        shard: {
          attackCard:    true,
          actorId:       actor.id,
          abilityId:     ability.id,
          perTarget:     targetResults.map(r => ({
            id:      r.actor?.id   ?? null,
            tokenId: r.tokenId     ?? null,
            hit:     r.hit,
            isCrit:  r.isCrit,
            armor:   r.armor
          })),
          hitAny, missAny, critAny,
          damageFormula, grazeFormula, resistFormula, damageBonus,
          hasGraze:      ability.system.hasGraze,
          hasResistance: ability.system.hasResistance,
          resistanceDV,
          focusSpent,
          focusRefunded: 0
        }
      }
    });
  }
}

/* -------------------------------------------------------------------- */
/*  Ability Activation (non-attack)                                       */
/* -------------------------------------------------------------------- */

/**
 * Post an activated ability to chat with a Resistance Roll button if applicable.
 * Called from item-ability.mjs after focus is deducted.
 */
export async function postAbilityToChat(actor, ability) {
  const effectHTML = ability.system.effect
    ? await foundry.applications.ux.TextEditor.implementation.enrichHTML(ability.system.effect, { async: true })
    : "";

  const resistanceDV = ability.system.resolveResistanceDV(actor);

  const html = await renderTemplate(
    "systems/shard/templates/chat/ability-card.hbs",
    {
      actor, item: ability,
      iconSrc: null,   // placeholder — future: tag-based generic icon
      effectHTML,
      tags:          ability.system.tags ?? [],
      hasResistance: ability.system.hasResistance,
      resistanceDV
    }
  );

  const focusSpent = ability.system.focusCost ?? 0;

  return ChatMessage.create({
    content: html,
    speaker: ChatMessage.getSpeaker({ actor }),
    flags: {
      shard: {
        abilityCard:   true,
        actorId:       actor.id,
        abilityId:     ability.id,
        hasResistance: ability.system.hasResistance,
        resistanceDV,
        resistFormula: ability.system.resolveResistFormula(actor),
        focusSpent,
        focusRefunded: 0
      }
    }
  });
}

/* -------------------------------------------------------------------- */
/*  Resistance Roll Dialog                                                */
/* -------------------------------------------------------------------- */

export class ShardResistDialog extends Dialog {

  /**
   * Open resistance roll dialog for a token's actor.
   * @param {Actor}  actor      The actor making the resistance roll.
   * @param {object} flags      Flags from the originating chat message.
   */
  static async show(actor, flags) {
    const baseAdv  = actor.netAdvantage;
    const tokenImg = canvas.tokens?.placeables.find(t => t.actor?.id === actor.id)
      ?.document?.texture?.src ?? actor.img ?? "";

    const content = await renderTemplate(
      "systems/shard/templates/dialogs/resist-dialog.hbs",
      { actor, tokenImg, baseAdv, resistanceDV: flags.resistanceDV }
    );

    return new Promise(resolve => {
      new ShardResistDialog({
        title:   `Resistance Roll — DV ${flags.resistanceDV}`,
        content,
        buttons: {
          roll: {
            icon:     "<i class='fas fa-dice-d6'></i>",
            label:    "Roll Resistance",
            callback: async html => {
              const formData = new FormDataExtended(html[0].querySelector("form")).object;
              await ShardResistDialog._executeResist({ actor, tokenImg, formData, baseAdv, flags });
              resolve(true);
            }
          },
          cancel: {
            icon: "<i class='fas fa-times'></i>", label: "Cancel",
            callback: () => resolve(false)
          }
        },
        default: "roll"
      }, { classes: ["shard", "dialog", "resist-dialog"], width: 320 }).render(true);
    });
  }

  static async _executeResist({ actor, tokenImg = "", formData, baseAdv, flags }) {
    const manualAdj = parseInt(formData.netAdvantage ?? 0, 10);
    const flatBonus = parseInt(formData.flatBonus    ?? 0, 10);
    const net       = baseAdv + manualAdj;
    const formula   = buildResistFormula(net);

    const roll = new Roll(formula);
    await roll.evaluate();

    const total     = roll.total + flatBonus;
    const dv        = flags.resistanceDV ?? 10;
    const resisted  = total >= dv;

    const html = await renderTemplate(
      "systems/shard/templates/chat/resist-card.hbs",
      { actor, tokenImg, roll, total, dv, resisted, net, flatBonus }
    );

    return ChatMessage.create({
      content: html,
      speaker: ChatMessage.getSpeaker({ actor }),
      rolls:   [roll],
      flags:   { shard: { resistCard: true, resisted, actorId: actor.id } }
    });
  }
}

/* -------------------------------------------------------------------- */
/*  Chat Card Hooks                                                       */
/* -------------------------------------------------------------------- */

Hooks.on("renderChatMessage", (message, html) => {
  // Collapse embedded dice rolls inside shard cards on initial render.
  // Foundry v13 uses an "expanded" CSS class to show/hide .dice-tooltip and
  // attaches its own click handler — we just need to ensure the class is
  // absent on first render (Roll#render() may set it) and clear any leftover
  // inline display style, then Foundry's handler takes it from there.
  setTimeout(() => {
    html.find(".shard-chat-card .dice-roll").each(function() {
      $(this).removeClass("expanded");
      $(this).find(".dice-tooltip").css("display", "");
    });
  }, 0);

  const flags = message.flags?.shard ?? {};

  // Damage / graze / crit-damage buttons on attack cards
  if (flags.attackCard) {
    html.on("click",       ".roll-damage-btn",      () => _rollDamageFromCard(message, false));
    html.on("click",       ".roll-graze-btn",       () => _rollDamageFromCard(message, true));
    html.on("click",       ".roll-crit-damage-btn", () => _rollCritDamageFromCard(message));
    html.on("contextmenu", ".roll-damage-btn, .roll-graze-btn, .roll-crit-damage-btn",
      ev => _showDamageContextMenu(ev, message));
  }

  // Resistance roll button — visible to anyone with a controlled/selected token
  if (flags.abilityCard || flags.attackCard) {
    html.on("click", ".resist-roll-btn", () => _openResistDialog(message));
  }

  // Right-click focus badge on attack/ability cards to refund focus
  if (flags.attackCard || flags.abilityCard) {
    const remaining = (flags.focusSpent ?? 0) - (flags.focusRefunded ?? 0);
    // Sync the badge's data-attr and dim it if exhausted (visual cue)
    const badge = html[0].querySelector(".focus-cost.focus-refundable");
    if (badge) {
      badge.dataset.focusRemaining = String(Math.max(0, remaining));
      if (remaining <= 0) badge.classList.add("focus-cost-exhausted");
    }
    html.on("contextmenu", ".focus-cost.focus-refundable",
      ev => _showFocusRefundMenu(ev, message));
  }

  // Undo button on damage cards — restores HP to the damaged actor
  if (flags.damageCard) {
    if (flags.undone) {
      html[0].querySelector(".shard-chat-card")?.classList.add("damage-undone");
    } else {
      html.on("click", ".undo-damage-btn", () => _undoDamage(message));
    }
  }

  // Undo button on macro heal cards — reverses healing
  if (flags.macroHealCard) {
    if (flags.undone) {
      html[0].querySelector(".shard-chat-card")?.classList.add("damage-undone");
    } else {
      html.on("click", ".undo-heal-btn", () => _undoHeal(message));
    }
  }

  // Undo button on focus refund cards — reverses the focus refund
  if (flags.focusRefundCard) {
    if (flags.undone) {
      html[0].querySelector(".shard-chat-card")?.classList.add("focus-refund-undone");
    } else {
      html.on("click", ".undo-focus-refund-btn", () => _undoFocusRefund(message));
    }
  }
});

async function _rollDamageFromCard(message, isGraze, isHalf = false) {
  const flags   = message.flags?.shard ?? {};
  const formula = isGraze ? flags.grazeFormula : flags.damageFormula;
  if (!formula) return;

  const roll = new Roll(formula);
  await roll.evaluate();

  const rollFull = roll.total + (isGraze ? 0 : (flags.damageBonus ?? 0));
  const raw      = isHalf ? Math.ceil(rollFull / 2) : rollFull;

  // Collect targets eligible for this roll (hit targets for damage, miss for graze)
  const perTarget  = flags.perTarget ?? [];
  const applicable = perTarget.filter(t => t.id && (isGraze ? t.hit === false : t.hit === true));

  const appliedTargets = [];
  for (const t of applicable) {
    // Prefer looking up the actor via the canvas token so unlinked NPC tokens are
    // updated correctly (game.actors.get() returns the base template, not the token copy).
    const sceneToken  = t.tokenId ? canvas.scene?.tokens?.get(t.tokenId) : null;
    const targetActor = sceneToken?.actor ?? game.actors.get(t.id);
    if (!targetActor) continue;
    const armor = t.armor ?? 0;
    let barrierTaken = 0, hpTaken = 0;
    if (game.user.isGM) {
      try {
        ({ barrierTaken, hpTaken } = await targetActor.applyDamage(raw, { armor }));
      } catch(err) {
        console.error("Shard | applyDamage failed for", targetActor.name, err);
        ui.notifications.error(`Failed to apply damage to ${targetActor.name} — see console for details.`);
        continue;
      }
    } else {
      // Non-GM: compute display values without applying
      hpTaken = Math.max(0, raw - armor);
    }
    appliedTargets.push({ actor: targetActor, tokenId: t.tokenId ?? null, armor, reduced: hpTaken, barrierTaken });
  }

  const rollHTML = await roll.render();
  const html = await renderTemplate(
    "systems/shard/templates/chat/damage-card.hbs",
    { roll, rollHTML, raw, rollFull, isGraze, isHalf, appliedTargets }
  );

  return ChatMessage.create({
    content: html,
    speaker: message.speaker,
    rolls:   [roll],
    flags:   {
      shard: {
        damageCard:     true,
        appliedTargets: appliedTargets.map(t => ({
          id:           t.actor.id,
          tokenId:      t.tokenId ?? null,
          reduced:      t.reduced,
          barrierTaken: t.barrierTaken
        }))
      }
    }
  });
}

/**
 * Roll maximized (critical) damage and apply it only to targets that scored a crit.
 * Maximizing substitutes each die with its maximum face value — no randomness.
 */
async function _rollCritDamageFromCard(message, isHalf = false) {
  const flags   = message.flags?.shard ?? {};
  const formula = flags.damageFormula;
  if (!formula) return;

  const roll = new Roll(formula);
  await roll.evaluate({ maximize: true });

  const rollFull = roll.total + (flags.damageBonus ?? 0);
  const raw      = isHalf ? Math.ceil(rollFull / 2) : rollFull;

  const perTarget  = flags.perTarget ?? [];
  const applicable = perTarget.filter(t => t.id && t.isCrit === true);

  const appliedTargets = [];
  for (const t of applicable) {
    const sceneToken  = t.tokenId ? canvas.scene?.tokens?.get(t.tokenId) : null;
    const targetActor = sceneToken?.actor ?? game.actors.get(t.id);
    if (!targetActor) continue;
    const armor = t.armor ?? 0;
    let barrierTaken = 0, hpTaken = 0;
    if (game.user.isGM) {
      try {
        ({ barrierTaken, hpTaken } = await targetActor.applyDamage(raw, { armor }));
      } catch(err) {
        console.error("Shard | applyDamage (crit) failed for", targetActor.name, err);
        ui.notifications.error(`Failed to apply critical damage to ${targetActor.name} — see console.`);
        continue;
      }
    } else {
      hpTaken = Math.max(0, raw - armor);
    }
    appliedTargets.push({ actor: targetActor, tokenId: t.tokenId ?? null, armor, reduced: hpTaken, barrierTaken });
  }

  const rollHTML = await roll.render();
  const html = await renderTemplate(
    "systems/shard/templates/chat/damage-card.hbs",
    { roll, rollHTML, raw, rollFull, isGraze: false, isCrit: true, isHalf, appliedTargets }
  );

  return ChatMessage.create({
    content: html,
    speaker: message.speaker,
    rolls:   [roll],
    flags:   {
      shard: {
        damageCard:     true,
        appliedTargets: appliedTargets.map(t => ({
          id:           t.actor.id,
          tokenId:      t.tokenId ?? null,
          reduced:      t.reduced,
          barrierTaken: t.barrierTaken
        }))
      }
    }
  });
}

function _showDamageContextMenu(event, message) {
  event.preventDefault();
  event.stopPropagation();

  // Remove any existing menu
  document.querySelectorAll(".shard-damage-ctx").forEach(el => el.remove());

  const btn     = event.currentTarget;
  const isGraze = btn.classList.contains("roll-graze-btn");
  const isCrit  = btn.classList.contains("roll-crit-damage-btn");
  const fullLabel = isCrit ? "Critical Damage" : isGraze ? "Graze" : "Roll Damage";

  const menu = document.createElement("div");
  menu.className = "shard-damage-ctx";
  menu.innerHTML = `
    <div class="ctx-item ctx-full"><i class="fas fa-skull"></i> ${fullLabel}</div>
    <div class="ctx-item ctx-half"><i class="fas fa-adjust"></i> Deal Half</div>
  `;

  // Position below the button; flip above if near the viewport bottom
  const rect      = btn.getBoundingClientRect();
  const MENU_H    = 76;
  const top       = (rect.bottom + MENU_H > window.innerHeight)
    ? rect.top - MENU_H - 4
    : rect.bottom + 4;
  menu.style.top  = `${top}px`;
  menu.style.left = `${rect.left}px`;
  document.body.appendChild(menu);

  const close = () => {
    menu.remove();
    document.removeEventListener("click",       close, true);
    document.removeEventListener("contextmenu", close, true);
  };
  // Defer so this event doesn't immediately close the menu
  setTimeout(() => {
    document.addEventListener("click",       close, true);
    document.addEventListener("contextmenu", close, true);
  }, 0);

  menu.querySelector(".ctx-full").addEventListener("click", e => {
    e.stopPropagation();
    close();
    if (isCrit) _rollCritDamageFromCard(message, false);
    else        _rollDamageFromCard(message, isGraze, false);
  });
  menu.querySelector(".ctx-half").addEventListener("click", e => {
    e.stopPropagation();
    close();
    if (isCrit) _rollCritDamageFromCard(message, true);
    else        _rollDamageFromCard(message, isGraze, true);
  });
}

/* -------------------------------------------------------------------- */
/*  Focus Refund                                                          */
/* -------------------------------------------------------------------- */

/**
 * Right-click handler on a .focus-cost.focus-refundable badge.
 * Shows a discrete menu of refund amounts 1..remaining (plus a "Refund All"
 * shortcut when remaining > 1).
 */
function _showFocusRefundMenu(event, message) {
  event.preventDefault();
  event.stopPropagation();

  // Remove any existing menu
  document.querySelectorAll(".shard-focus-ctx").forEach(el => el.remove());

  const flags     = message.flags?.shard ?? {};
  const spent     = flags.focusSpent    ?? 0;
  const refunded  = flags.focusRefunded ?? 0;
  const remaining = spent - refunded;
  if (remaining <= 0) return;

  const btn  = event.currentTarget;
  const menu = document.createElement("div");
  menu.className = "shard-focus-ctx";

  const items = [];
  for (let n = 1; n <= remaining; n++) {
    items.push(`<div class="ctx-item" data-amount="${n}"><i class="fas fa-undo"></i> Refund ${n}F</div>`);
  }
  if (remaining > 1) {
    items.push(`<div class="ctx-item" data-amount="${remaining}"><i class="fas fa-undo-alt"></i> Refund All (${remaining}F)</div>`);
  }
  menu.innerHTML = items.join("");

  // Position below the badge; flip above if near the viewport bottom
  const rect   = btn.getBoundingClientRect();
  const MENU_H = 28 * (items.length) + 8;
  const top    = (rect.bottom + MENU_H > window.innerHeight)
    ? rect.top - MENU_H - 4
    : rect.bottom + 4;
  menu.style.top  = `${top}px`;
  menu.style.left = `${rect.left}px`;
  document.body.appendChild(menu);

  const close = () => {
    menu.remove();
    document.removeEventListener("click",       close, true);
    document.removeEventListener("contextmenu", close, true);
  };
  setTimeout(() => {
    document.addEventListener("click",       close, true);
    document.addEventListener("contextmenu", close, true);
  }, 0);

  menu.querySelectorAll(".ctx-item").forEach(el => {
    el.addEventListener("click", e => {
      e.stopPropagation();
      close();
      const amount = parseInt(el.dataset.amount, 10);
      if (Number.isFinite(amount) && amount > 0) _refundFocus(message, amount);
    });
  });
}

/**
 * Refund `amount` focus to the source actor, bump the source message's
 * focusRefunded flag, and post a focus-refund chat card with Undo.
 * Delegates actor/flag mutations to a GM via socket for non-owners.
 */
async function _refundFocus(message, amount) {
  const flags    = message.flags?.shard ?? {};
  const actorId  = flags.actorId;
  const spent    = flags.focusSpent    ?? 0;
  const refunded = flags.focusRefunded ?? 0;
  const remaining = spent - refunded;

  if (amount <= 0 || amount > remaining) {
    ui.notifications.warn("Nothing left to refund.");
    return;
  }

  const actor = game.actors.get(actorId);
  if (!actor) {
    ui.notifications.warn("Source actor not found — cannot refund focus.");
    return;
  }

  // Apply focus delta — direct if owner/GM, otherwise via GM socket
  if (actor.isOwner) {
    const cur  = actor.system.focus?.value ?? 0;
    const max  = actor.system.focus?.max   ?? cur;
    const next = Math.max(0, Math.min(max, cur + amount));
    await actor.update({ "system.focus.value": next });
  } else {
    game.socket.emit("system.shard", {
      action: "applyFocusDelta", actorId, delta: amount
    });
  }

  // Bump source message flag — direct if author/GM, else via GM socket
  const newRefunded = refunded + amount;
  if (message.isAuthor || game.user.isGM) {
    await message.setFlag("shard", "focusRefunded", newRefunded);
  } else {
    game.socket.emit("system.shard", {
      action: "setFocusRefundedFlag", messageId: message.id, value: newRefunded
    });
  }

  // Post the refund card
  const html = await renderTemplate(
    "systems/shard/templates/chat/focus-refund-card.hbs",
    { actorName: actor.name, amount }
  );
  return ChatMessage.create({
    content: html,
    speaker: ChatMessage.getSpeaker({ actor }),
    flags: {
      shard: {
        focusRefundCard: true,
        actorId,
        amount,
        sourceMessageId: message.id
      }
    }
  });
}

/**
 * Undo a focus refund — subtract the refunded amount back from the actor
 * and decrement the source message's focusRefunded flag.
 */
async function _undoFocusRefund(message) {
  const flags     = message.flags?.shard ?? {};
  const actorId   = flags.actorId;
  const amount    = flags.amount ?? 0;
  const sourceId  = flags.sourceMessageId;
  if (!actorId || amount <= 0) {
    ui.notifications.warn("No refund data — cannot undo.");
    return;
  }

  const actor = game.actors.get(actorId);
  if (!actor) {
    ui.notifications.warn("Source actor not found — cannot undo refund.");
    return;
  }

  // Inverse focus update
  if (actor.isOwner) {
    const cur = actor.system.focus?.value ?? 0;
    await actor.update({ "system.focus.value": Math.max(0, cur - amount) });
  } else {
    game.socket.emit("system.shard", {
      action: "applyFocusDelta", actorId, delta: -amount
    });
  }

  // Decrement source message's focusRefunded flag
  const sourceMsg = sourceId ? game.messages.get(sourceId) : null;
  if (sourceMsg) {
    const curRefunded = sourceMsg.flags?.shard?.focusRefunded ?? 0;
    const newValue    = Math.max(0, curRefunded - amount);
    if (sourceMsg.isAuthor || game.user.isGM) {
      await sourceMsg.setFlag("shard", "focusRefunded", newValue);
    } else {
      game.socket.emit("system.shard", {
        action: "setFocusRefundedFlag", messageId: sourceId, value: newValue
      });
    }
  }

  // Mark this refund card as undone
  if (message.isAuthor || game.user.isGM) {
    await message.setFlag("shard", "undone", true);
  } else {
    // Non-author undo is rare; fall through — GM socket could be extended
    // with a generic setFlag action if needed.
    ui.notifications.info(`Reversed ${amount}F refund for ${actor.name}.`);
    return;
  }
  ui.notifications.info(`Reversed ${amount}F refund for ${actor.name}.`);
}

async function _undoHeal(message) {
  const flags  = message.flags?.shard ?? {};
  const healed = flags.healTargets ?? [];
  if (!healed.length) {
    ui.notifications.warn("No heal data found — cannot undo.");
    return;
  }
  const names = [];
  for (const { id, tokenId, hpRestored, barrierRestored } of healed) {
    const sceneToken = tokenId ? canvas.scene?.tokens?.get(tokenId) : null;
    const a = sceneToken?.actor ?? game.actors.get(id);
    if (!a) continue;
    const update = {};
    if (hpRestored      > 0) update["system.hp.value"] = Math.max(0, (a.system.hp?.value ?? 0) - hpRestored);
    if (barrierRestored > 0) update["system.barrier"]  = Math.max(0, (a.system.barrier   ?? 0) - barrierRestored);
    if (Object.keys(update).length) await a.update(update);
    names.push(a.name);
  }
  await message.setFlag("shard", "undone", true);
  ui.notifications.info(`Reversed healing for: ${names.join(", ")}.`);
}

async function _undoDamage(message) {
  const flags   = message.flags?.shard ?? {};
  const applied = flags.appliedTargets ?? [];
  if (!applied.length) {
    ui.notifications.warn("No damage data found — cannot undo.");
    return;
  }
  const names = [];
  for (const { id, tokenId, reduced, barrierTaken } of applied) {
    const sceneToken = tokenId ? canvas.scene?.tokens?.get(tokenId) : null;
    const a = sceneToken?.actor ?? game.actors.get(id);
    if (!a) continue;
    const update = {};
    if (reduced > 0) {
      const currentHP = a.system.hp?.value ?? 0;
      const maxHP     = a.system.hp?.max   ?? currentHP;
      update["system.hp.value"] = Math.min(currentHP + reduced, maxHP);
    }
    if (barrierTaken > 0) {
      update["system.barrier"] = (a.system.barrier ?? 0) + barrierTaken;
    }
    if (Object.keys(update).length) await a.update(update);
    names.push(a.name);
  }
  await message.setFlag("shard", "undone", true);
  ui.notifications.info(`Restored HP to: ${names.join(", ")}.`);
}

async function _openResistDialog(message) {
  // Use controlled (selected) tokens, or active/owned tokens as fallback
  let tokens = canvas.tokens?.controlled ?? [];
  if (!tokens.length) {
    tokens = canvas.tokens?.placeables?.filter(t => t.actor?.isOwner) ?? [];
  }
  if (!tokens.length) {
    ui.notifications.warn("Select a token to make a resistance roll.");
    return;
  }

  const flags = message.flags?.shard ?? {};
  // Each controlling player rolls for their token
  for (const token of tokens) {
    await ShardResistDialog.show(token.actor, flags);
  }
}
