/** TEST-ONLY. W11 part B: link fixtures for the external-model student-data gate (R-32). `linkCase(w, kind)` rewires the WhatsApp source of a `waWorld` to one link situation. */
import { TENANT, WA_SOURCE, type Row, type waWorld } from "./wa-quarantine.testsupport.js";

export type LinkCase = "yes" | "unknown" | "no" | "legacy" | "missing" | "foreign";
export const LINK_ID = "link-1";
const link = (studentData: string, tenantId: string): Row => ({ _id: LINK_ID, tenantId, studentData, state: "active", live: true });

/** yes/unknown/no: stamped source + a tenant link with that value. legacy: no stamp (a "no" link exists but must NOT be guessed). missing: stamp, no row. foreign: row belongs to another tenant. */
export function linkCase(w: ReturnType<typeof waWorld>, kind: LinkCase): void {
  const source = w.data.sources!.find(row => row._id === WA_SOURCE)!;
  if (kind === "legacy") delete source.sourceMeta; else source.sourceMeta = { whatsappLinkId: LINK_ID };
  w.data.whatsapp_links = kind === "missing" ? [] : kind === "foreign" ? [link("no", "tenant-b")] : [link(kind === "legacy" ? "no" : kind, TENANT)];
}
export const EXCLUDED: LinkCase[] = ["yes", "unknown", "legacy", "missing", "foreign"];
