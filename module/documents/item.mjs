/**
 * item.mjs — Base Item document class for the Shard system.
 */

export class ShardItem extends Item {

  /** @override */
  prepareData() {
    super.prepareData();
  }

  /* ------------------------------------------------------------------ */
  /*  Chat / Activation                                                   */
  /* ------------------------------------------------------------------ */

  /**
   * Post this item to chat (for abilities, shows cost, effect, etc.)
   * @returns {Promise}
   */
  async toChat() {
    const template = `systems/shard/templates/chat/ability-card.hbs`;
    const html = await renderTemplate(template, {
      item:  this,
      actor: this.parent
    });
    return ChatMessage.create({
      content: html,
      speaker: ChatMessage.getSpeaker({ actor: this.parent })
    });
  }
}
