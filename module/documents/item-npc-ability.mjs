/**
 * item-npc-ability.mjs — NPC Ability Item document class.
 */

import { ShardItem } from "./item.mjs";
import { postAbilityToChat } from "../rolls/attack-dialog.mjs";

export class ShardNPCAbilityItem extends ShardItem {

  async activate() {
    const actor = this.parent;
    if (!actor) return;
    return postAbilityToChat(actor, this);
  }
}
