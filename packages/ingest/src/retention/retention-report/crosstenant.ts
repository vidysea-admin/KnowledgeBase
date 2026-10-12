/**
 * packages/ingest/src/retention/retention-report/crosstenant.ts - T-046 dry-run report. KEY-ONLY pass over
 * the OTHER tenants' directories under the data root. For each sibling tenant segment
 * (<data-root>/<64 hex>/<session>/source.json) it reads ONLY the media path field and turns it into
 * the physical-file identity keys; nothing else of the record (id, tenant, title, claims, turns)
 * is parsed or kept, and nothing about the other tenant is ever printed. The result is a set of
 * keys: a file in this tenant's eligible set whose key is in it becomes KEEP `shared-across-tenants`
 * with no detail. If a sibling tenant cannot be read, `incomplete` is set and nothing is ELIGIBLE.
 *
 * Why a boolean is acceptable: this is an operator command run on the operator's own machine over
 * the whole data root (--data-root is an argument and --tenant a free value; there is no per-tenant
 * access control on the CLI, and the operator can already list the root). It is not a tenant-facing API.
 */
import { lstatSync, readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { isPlain } from "../../strict-record.js";
import { probeMedia, type MediaIo } from "../retention-report-media.js";

const SEGMENT = /^[0-9a-f]{64}$/;
const MAX_TENANTS = 200;
const MAX_SESSIONS = 500;
const MAX_BYTES = 5 * 1024 * 1024;

export interface Foreign { keys: Set<string>; incomplete: boolean }

export function scanOtherTenants(dataRoot: string, ownSegment: string, mediaRoot: string, io: MediaIo): Foreign {
  const out: Foreign = { keys: new Set(), incomplete: false };
  let segments: string[];
  try { segments = readdirSync(dataRoot, { withFileTypes: true }).filter((d) => d.isDirectory() && SEGMENT.test(d.name) && d.name !== ownSegment).map((d) => d.name); } catch { return { keys: out.keys, incomplete: true }; }
  if (segments.length > MAX_TENANTS) return { keys: out.keys, incomplete: true };
  for (const seg of segments) {
    let sessions: string[];
    try { sessions = readdirSync(join(dataRoot, seg), { withFileTypes: true }).filter((d) => d.isDirectory()).map((d) => d.name); } catch { out.incomplete = true; continue; }
    if (sessions.length > MAX_SESSIONS) { out.incomplete = true; continue; }
    for (const name of sessions) {
      const file = join(dataRoot, seg, name, "source.json");
      let path: string | undefined;
      try {
        const st = lstatSync(file);
        if (!st.isFile() || st.size > MAX_BYTES) throw new Error("unusable");
        const rec = JSON.parse(readFileSync(file, "utf8")) as unknown;
        if (!isPlain(rec)) throw new Error("unusable");
        const r = rec as Record<string, unknown>;
        const p = Object.hasOwn(r, "path") ? r.path : Object.hasOwn(r, "audioPath") ? r.audioPath : undefined;
        path = typeof p === "string" && p ? p : undefined;
      } catch (e) {
        if ((e as NodeJS.ErrnoException).code !== "ENOENT") out.incomplete = true; // a session directory with no source.json is not a record
        continue;
      }
      if (path === undefined) continue;
      const ev = probeMedia(mediaRoot, path, io);
      if (ev.state === "present") for (const k of ev.keys ?? []) out.keys.add(k);
      else if (ev.state === "unreadable") out.incomplete = true; // a file we cannot identify might be ours
    }
  }
  return out;
}
