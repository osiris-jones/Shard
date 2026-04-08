/**
 * item-class.mjs — Class Item document class.
 */

import { ShardItem } from "./item.mjs";

export class ShardClassItem extends ShardItem {

  /**
   * Check whether a given rank ability is eligible for a PC
   * based on their total level and existing rank abilities in this class.
   *
   * @param {number} rank           The rank to check.
   * @param {Actor}  actor          The PC actor.
   * @param {number} highestUnlocked The highest rank already unlocked in this class.
   * @returns {boolean}
   */
  isRankEligible(rank, actor, highestUnlocked) {
    const { RANK_LEVEL_REQUIREMENTS, RANK_PREREQ } = game.shard.SHARD;
    const totalLevel = actor.totalLevel ?? 1;
    const levelReq  = RANK_LEVEL_REQUIREMENTS[rank] ?? 99;
    const prereqRank = RANK_PREREQ[rank] ?? 0;
    return totalLevel >= levelReq && highestUnlocked >= prereqRank;
  }
}
