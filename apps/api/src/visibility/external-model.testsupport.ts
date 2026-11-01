/** TEST-ONLY. W11 part B: link fixtures for the external-model student-data gate (R-32). `linkCase(w, kind)` rewires the WhatsApp source of a `waWorld` to one link situation. */
import { TENANT, WA_SOURCE, type Row, type waWorld } from "./wa-quarantine.testsupport.js";

export type LinkCase = "yes" | "unknown" | "no" | "legacy" | "missing" | "foreign" | NonLiveCase;
/** H-14: studentData "no" links in each non-live state of `isLiveLinkState` (packages/db whatsapp-links.ts), plus a row whose `live` field is absent. */
export const NON_LIVE_STATES = ["revoked", "unlinked", "rejected"] as const;
export type NonLiveCase = typeof NON_LIVE_STATES[number] | "suspended" | "live-missing";
export const LINK_ID = "link-1";
const link = (studentData: string, tenantId: string, extra: Row = {}): Row => ({ _id: LINK_ID, tenantId, studentData, state: "active", live: true, ...extra });
/** A `studentData: "no"` link that is NOT eligible: live false for the terminal states, absent for live-missing, and "suspended" as the real derived shape (state suspended, live true by `isLiveLinkState`). */
const nonLive = (kind: NonLiveCase): Row => {
  const row = link("no", TENANT, { state: kind === "live-missing" ? "active" : kind, live: kind === "suspended" });
  if (kind === "live-missing") delete row.live;
  return row;
};

/** yes/unknown/no: stamped source + a tenant link with that value. legacy: no stamp (a "no" link exists but must NOT be guessed). missing: stamp, no row. foreign: row belongs to another tenant. */
export function linkCase(w: ReturnType<typeof waWorld>, kind: LinkCase): void {
  const source = w.data.sources!.find(row => row._id === WA_SOURCE)!;
  if (kind === "legacy") delete source.sourceMeta; else source.sourceMeta = { whatsappLinkId: LINK_ID };
  w.data.whatsapp_links = (NON_LIVE_STATES as readonly string[]).includes(kind) || kind === "suspended" || kind === "live-missing" ? [nonLive(kind as NonLiveCase)] : kind === "missing" ? [] : kind === "foreign" ? [link("no", "tenant-b")] : [link(kind === "legacy" ? "no" : kind, TENANT)];
}
export const EXCLUDED: LinkCase[] = ["yes", "unknown", "legacy", "missing", "foreign", ...NON_LIVE_STATES, "suspended", "live-missing"];
