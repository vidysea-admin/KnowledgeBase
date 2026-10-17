import { createHash } from "node:crypto";
import type { OutputItem } from "./types.js";

/** Content binding for a server-produced AI assessment; never a human-verification or DB-admin signature. */
export function outputAssessmentDigest(sourceDigest: string, item: Pick<OutputItem, "id" | "kind" | "text" | "citationIds">): string {
  return createHash("sha256").update(JSON.stringify({ sourceDigest, id: item.id, kind: item.kind, text: item.text, citationIds: item.citationIds })).digest("hex");
}
