/**
 * _index.mjs — Registers all TypeDataModel subclasses with Foundry.
 *
 * Foundry v11+ supports defining actor/item data schemas via
 * TypeDataModel, which provides validation, default values,
 * and derived data computation cleanly separated from the document class.
 */

import { PCDataModel }           from "./model-pc.mjs";
import { NPCDataModel }          from "./model-npc.mjs";
import { SummonDataModel }       from "./model-summon.mjs";
import { AbilityDataModel }      from "./model-ability.mjs";
import { NPCAbilityDataModel }   from "./model-npc-ability.mjs";
import { ClassDataModel }        from "./model-class.mjs";
import { NpcClassDataModel }     from "./model-npc-class.mjs";
import { NpcTemplateDataModel }  from "./model-npc-template.mjs";
import { TagDataModel }          from "./model-tag.mjs";

export function registerDataModels() {
  // Actors
  CONFIG.Actor.dataModels = {
    pc:     PCDataModel,
    npc:    NPCDataModel,
    summon: SummonDataModel
  };

  // Items
  CONFIG.Item.dataModels = {
    ability:        AbilityDataModel,
    "npc-ability":  NPCAbilityDataModel,
    class:          ClassDataModel,
    "npc-class":    NpcClassDataModel,
    "npc-template": NpcTemplateDataModel,
    tag:            TagDataModel
  };
}
