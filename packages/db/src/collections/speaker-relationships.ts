// Suggested relationships are durable proposals, never graph_edges rows.
import type { SpeakerRelationships } from "@lkb/core";
import type { Db } from "mongodb";
import { getDb } from "../client.js";
import { scopedCollection } from "../lib/tenantScope.js";

export function speakerRelationships(tenantId: string, db: Db = getDb()) {
  return scopedCollection<SpeakerRelationships>(db, "speaker_relationships")(tenantId);
}
