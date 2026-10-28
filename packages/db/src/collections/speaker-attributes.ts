// Attribute proposals stay separate from confirmed speaker identities.
import type { SpeakerAttributes } from "@lkb/core";
import type { Db } from "mongodb";
import { getDb } from "../client.js";
import { scopedCollection } from "../lib/tenantScope.js";

export function speakerAttributes(tenantId: string, db: Db = getDb()) {
  return scopedCollection<SpeakerAttributes>(db, "speaker_attributes")(tenantId);
}
