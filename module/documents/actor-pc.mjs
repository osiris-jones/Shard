/**
 * actor-pc.mjs — PC Actor document class.
 *
 * All sheet-facing methods (setBaseClass, setClassLevel, registerClassLevel,
 * totalLevel, netAdvantage, etc.) live on ShardActor so they're always
 * reachable regardless of how Foundry resolves the document class.
 */

import { ShardActor } from "./actor.mjs";

export class ShardPCActor extends ShardActor {}
