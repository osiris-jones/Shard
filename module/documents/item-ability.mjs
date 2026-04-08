/**
 * item-ability.mjs — Ability Item document class.
 */

import { ShardItem } from "./item.mjs";
import { postAbilityToChat } from "../rolls/attack-dialog.mjs";

export class ShardAbilityItem extends ShardItem {

  /**
   * Activate this ability from a PC sheet.
   * Deducts focus cost, then posts to chat.
   */
  async activate() {
    const actor = this.parent;
    if (!actor) return;

    const focusCost = this.system.focusCost ?? 0;
    if (focusCost > 0) {
      const ok = await actor.spendFocus(focusCost);
      if (!ok) {
        ui.notifications.warn(
          `${actor.name} does not have enough Focus to use ${this.name}.`
        );
        return;
      }
    }

    return postAbilityToChat(actor, this);
  }
}
