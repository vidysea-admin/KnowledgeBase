/**
 * Test-only helpers for the retention dry-run report tests: builds a temp data root in the real
 * on-disk layout, runs the command, and snapshots a directory tree (content hash, size, mtime).
 */
import { createHash } from "node:crypto";
import { mkdirSync, mkdtempSync, readFileSync, readdirSync, statSync, utimesSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { isAbsolute, join, relative, resolve } from "node:path";
import { runRetentionReport } from "./retention-report.js";
import { tenantSegment } from "./retention-report-state.js";

export const NOW = Date.parse("2026-10-11T12:00:00.000Z");
export const DAY = 86_400_000;
const FIXED_MTIME = new Date("2026-01-02T03:04:05.000Z");
export const iso = (msAgo: number): string => new Date(NOW - msAgo).toISOString();

export function tempRoot(): string {
  return mkdtempSync(join(tmpdir(), "t046dry-fixture-"));
}

export interface SessionSpec {
  tenant?: string;               // directory tenant (default "toc")
  name: string;                  // session directory name
  title?: string;
  srcTenant?: string | null;     // source.json tenantId (default = tenant; null = omit)
  kind?: string;
  mediaId?: string;
  mediaPath?: string | null;     // relative to media root; default `m/<name>.webm`; null = no path in source.json. File created with `mediaBytes` bytes
  mediaBytes?: number;
  mediaMtimeMs?: number;         // default NOW - 30 days (old and quiet); the file is created only when mediaPath is a string or default
  createMedia?: boolean;         // false = write the path but not the file
  recordedBytes?: number;        // source.json sizeBytes
  status?: { transcribe?: string; index?: string };
  processedAt?: unknown;         // undefined = omit
  purgedAt?: unknown;
  claims?: unknown;              // default: one verified claim citing t1
  turns?: unknown;
  raw?: Partial<Record<"source.json" | "session.json" | "claims.json" | "turns.json", string>>; // verbatim file text
}

/** Writes one session in the layout scripts/upload/submit.mjs produces. Returns its directory. */
export function writeSession(root: string, mediaRoot: string, s: SessionSpec): string {
  const tenant = s.tenant ?? "toc";
  const dir = join(root, tenantSegment(tenant), s.name);
  mkdirSync(dir, { recursive: true });
  const id = s.mediaId ?? `${s.name}-src`;
  const srcTenant = s.srcTenant === undefined ? tenant : s.srcTenant;
  const mediaPath = s.mediaPath === undefined ? `m/${s.name}.webm` : s.mediaPath;
  const source = {
    _id: id, ...(srcTenant === null ? {} : { tenantId: srcTenant }), kind: s.kind ?? "recording",
    ...(mediaPath ? { path: mediaPath } : {}), ...(s.recordedBytes !== undefined ? { sizeBytes: s.recordedBytes } : {}),
  };
  const session = {
    _id: s.name, tenantId: tenant, title: s.title ?? s.name, status: s.status ?? { transcribe: "done", index: "done" },
    ...(s.processedAt !== undefined ? { processedAt: s.processedAt } : {}),
    ...(s.purgedAt !== undefined ? { retention: { purgeAfterVerified: false, purgedAt: s.purgedAt } } : {}),
  };
  const turnId = `${s.name}-t1`;
  const turns = s.turns ?? [{ _id: turnId, tenantId: tenant, sessionId: s.name, speakerRef: "a", tStart: 100, tEnd: 110, text: "x" }];
  const claims = s.claims ?? [{ _id: `${s.name}-c1`, tenantId: tenant, text: "x", status: "verified", evidence: [{ turnId, sessionId: s.name }] }];
  const files: Record<string, string> = {
    "source.json": JSON.stringify(source), "session.json": JSON.stringify(session),
    "claims.json": JSON.stringify(claims), "turns.json": JSON.stringify(turns), ...s.raw,
  };
  for (const [f, text] of Object.entries(files)) writeFileSync(join(dir, f), text);
  const inside = mediaPath ? relative(resolve(mediaRoot), resolve(mediaRoot, mediaPath)) : "..";
  if (mediaPath && s.createMedia !== false && !mediaPath.includes("\0") && !isAbsolute(mediaPath) && !inside.startsWith("..")) {
    const full = join(mediaRoot, mediaPath);
    mkdirSync(join(full, ".."), { recursive: true });
    writeFileSync(full, Buffer.alloc(s.mediaBytes ?? 10, 1));
    const when = new Date(s.mediaMtimeMs ?? NOW - 30 * DAY);
    utimesSync(full, when, when);
  }
  return dir;
}

export interface Ran { code: number; out: string; err: string }

export function runCmd(args: string[], now = NOW): Ran {
  const out: string[] = [];
  const err: string[] = [];
  const code = runRetentionReport(args, { now: () => now, write: (l) => out.push(l), error: (l) => err.push(l) });
  return { code, out: out.join("\n"), err: err.join("\n") };
}

export function baseArgs(root: string, mediaRoot: string, extra: string[] = [], tenant = "toc"): string[] {
  return ["--tenant", tenant, "--data-root", root, "--media-root", mediaRoot, "--min-age-days", "7", "--clip-padding-seconds", "15", ...extra];
}

/** Pins every mtime so a later snapshot differs if anything is touched. */
export function freezeTree(dir: string): void {
  for (const e of readdirSync(dir, { withFileTypes: true })) {
    const p = join(dir, e.name);
    if (e.isDirectory()) freezeTree(p);
    utimesSync(p, FIXED_MTIME, FIXED_MTIME);
  }
  utimesSync(dir, FIXED_MTIME, FIXED_MTIME);
}

/** Relative path -> kind, size, mtime (ms) and content hash, for every entry under `dir`. */
export function snapshot(dir: string, base = dir): Record<string, string> {
  const snap: Record<string, string> = {};
  for (const e of readdirSync(dir, { withFileTypes: true })) {
    const p = join(dir, e.name);
    const st = statSync(p);
    const rel = p.slice(base.length);
    snap[rel] = e.isDirectory() ? `dir mtime=${st.mtimeMs}` : `file size=${st.size} mtime=${st.mtimeMs} sha=${createHash("sha256").update(readFileSync(p)).digest("hex")}`;
    if (e.isDirectory()) Object.assign(snap, snapshot(p, base));
  }
  snap["."] = `dir mtime=${statSync(dir).mtimeMs}`;
  return snap;
}
