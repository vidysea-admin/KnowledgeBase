/**
 * packages/meeting-bot/src/alert-who-command.ts - r1-alert-id-resolver (W9).
 * `lkb alert-who <id> [--tenant T] [--tz ZONE] [--include-untagged]`: tells a LOCAL operator which meeting an attention-alert id names.
 * READ-ONLY: it opens files for reading and prints to the terminal; it creates, writes and sends nothing.
 *
 * Sources, and what each can honestly claim about tenancy (established from the writers: schedule-state.ts recordScheduled /
 * writeScheduledJob, both under ONE shared dir <repo>/raw/webinars, neither writing any tenant field):
 *   - <data/webinar-release>/operations.json   TENANT-TAGGED: read through `readWebinarOperationState`, which refuses another tenant's file.
 *   - <raw/webinars>/schedule-state.json       UNTAGGED, shared by every tenant on this machine ({sessionKey,title,scheduledAt})
 *   - <raw/webinars>/scheduled/*.json          UNTAGGED, shared                                  ({url,until,title,sessionId})
 * Untagged records cannot be shown to belong to the requested tenant, so by default they are NOT searched (only counted, and the
 * count is printed). `--include-untagged` searches them and labels every such match "tenant unknown (shared schedule file)".
 * No message claims a tenant scope the data does not have. The tenant is chosen as every lkb command does (`captureTenant`),
 * NEVER from the id.
 * SKIPPED sessions: webinar-identity keys (overlap-lost, untrusted-sender) resolve through operations.json rows; `cal:<id>` and
 * `gmail:<id>` keys (no-join-link, unsafe-join-link, needs-registration) resolve through operations.json `source.reconciliation`
 * (the provider ids the poller has seen). All tenant-tagged.
 *
 * Display safety: title goes through `neutralizeText`; the join URL is NOT printed, only the platform and the bare host. Every
 * other value is cut to a plain charset. Each source must resolve (realpath) to inside the data root: links out are not followed.
 */
import { existsSync, lstatSync, readdirSync, readFileSync, realpathSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { resolveAlertId, type AlertCandidate } from "./calendar/alerts/alert-resolve.js";
import { canonicalStart, renderStart, neutralizeText } from "./calendar/alerts/attention-alerts.js";
import { detectPlatform } from "./platform.js";

const USAGE = "usage: lkb alert-who <alert-id> [--tenant T] [--tz ZONE] [--include-untagged]";
export const UNTAGGED_LABEL = "tenant unknown (shared schedule file)";
export const LIMITS = { fileBytes: 5 * 1024 * 1024, jobBytes: 64 * 1024, jobFiles: 5000, rows: 20000 } as const;

export interface AlertWhoSources { dataRoot: string; stateDir: string; operationsFile: string; tenantId: string }
export interface AlertWhoDeps {
  resolveTenant: (rest: string[]) => string;
  sources: AlertWhoSources;
  /** `readWebinarOperationState`: THROWS on a wrong-tenant, oversize or corrupt file. */
  readOperations: (file: string, tenantId: string, checkedAt: string) => {
    operations: Record<string, Record<string, unknown>>;
    source?: { reconciliation?: { occurrences?: unknown } };
  };
  now: () => Date;
  write: (line: string) => void;
}
export interface Loaded { tagged: AlertCandidate[]; untagged: AlertCandidate[]; problems: string[] }

const str = (v: unknown): string | undefined => (typeof v === "string" ? v : undefined);
const isPlain = (v: unknown): v is Record<string, unknown> => v !== null && typeof v === "object" && !Array.isArray(v);

/** Bare lower-case host of an https URL, or undefined. No path, query, fragment or userinfo is ever returned. */
export function alertWhoHostOnly(raw: unknown): string | undefined {
  if (typeof raw !== "string" || raw.length > 4096) return undefined;
  try {
    const u = new URL(raw);
    return u.protocol === "https:" && /^[a-z0-9.-]{1,253}$/.test(u.hostname) ? u.hostname : undefined;
  } catch { return undefined; }
}

function readJsonCapped(file: string, cap: number): unknown {
  const st = lstatSync(file);
  if (!st.isFile() || st.isSymbolicLink()) throw new Error("not a regular file");
  if (st.size > cap) throw new Error("file too large");
  return JSON.parse(readFileSync(file, "utf8"));
}

/** True iff `p` exists and its real path (links resolved) lies inside the real data root. Never throws. */
export function insideRoot(root: string, p: string): boolean {
  try {
    const rel = path.relative(realpathSync.native(root), realpathSync.native(p));
    return rel === "" || (rel !== ".." && !rel.startsWith(`..${path.sep}`) && !path.isAbsolute(rel));
  } catch { return false; }
}

function bucket() {
  const by = new Map<string, AlertCandidate>();
  return { by, add: (c: AlertCandidate) => {
    const cur = by.get(c.sessionKey);
    if (!cur) { by.set(c.sessionKey, c); return; }
    cur.title ??= c.title; cur.start ??= c.start; cur.end ??= c.end; cur.platform ??= c.platform; cur.host ??= c.host; cur.status ??= c.status;
    if (!cur.source.includes(c.source)) cur.source += `, ${c.source}`;
  } };
}

/**
 * Merges rows that name the same sessionKey (first non-empty field wins). Total: never throws. Tenant-tagged and untagged
 * candidates are kept in SEPARATE lists and are never merged with each other.
 */
export function loadCandidates(src: AlertWhoSources, deps: Pick<AlertWhoDeps, "readOperations" | "now">): Loaded {
  const problems: string[] = [];
  const T = bucket(), U = bucket();

  const stateFile = path.join(src.stateDir, "schedule-state.json");
  if (existsSync(stateFile)) {
    if (!insideRoot(src.dataRoot, stateFile)) problems.push("schedule-state.json resolves outside the data root (link not followed; skipped)");
    else try {
      const v = readJsonCapped(stateFile, LIMITS.fileBytes);
      if (!isPlain(v)) throw new Error("not an object");
      for (const e of Object.values(v).slice(0, LIMITS.rows)) {
        if (isPlain(e) && typeof e.sessionKey === "string") U.add({ sessionKey: e.sessionKey, title: str(e.title), source: "schedule-state" });
      }
    } catch { problems.push("schedule-state.json is unreadable or corrupt (skipped)"); }
  }

  const jobDir = path.join(src.stateDir, "scheduled");
  if (existsSync(jobDir)) {
    if (!insideRoot(src.dataRoot, jobDir)) problems.push("scheduled/ resolves outside the data root (link not followed; skipped)");
    else try {
      const names = readdirSync(jobDir).filter((n) => n.endsWith(".json")).sort();
      if (names.length > LIMITS.jobFiles) problems.push(`scheduled/ has more than ${LIMITS.jobFiles} job files (only the first ${LIMITS.jobFiles} read)`);
      for (const n of names.slice(0, LIMITS.jobFiles)) {
        try {
          const j = readJsonCapped(path.join(jobDir, n), LIMITS.jobBytes);
          if (!isPlain(j) || typeof j.sessionId !== "string") throw new Error("shape");
          const url = str(j.url);
          U.add({ sessionKey: j.sessionId, title: str(j.title), end: str(j.until), source: "scheduled-job",
            platform: url ? detectPlatform(url) : undefined, host: alertWhoHostOnly(url) });
        } catch { problems.push("a scheduled job file is unreadable or corrupt (skipped)"); }
      }
    } catch { problems.push("scheduled/ directory is unreadable (skipped)"); }
  }

  if (existsSync(src.operationsFile)) {
    if (!insideRoot(src.dataRoot, src.operationsFile)) problems.push("operations.json resolves outside the data root (link not followed; skipped)");
    else try {
      const state = deps.readOperations(src.operationsFile, src.tenantId, deps.now().toISOString());
      // Source inventory (written by prepareWebinarSourceState): every calendar event / Gmail candidate the poller has seen, with its
      // provider id. Skipped sessions are keyed `cal:<event id>` / `gmail:<candidate id>`, so this resolves no-join-link,
      // unsafe-join-link and needs-registration alerts. Same file, same tenant validation.
      const occ = state.source?.reconciliation?.occurrences;
      for (const o of isPlain(occ) ? Object.values(occ).slice(0, LIMITS.rows) : []) {
        if (!isPlain(o) || !isPlain(o.snapshot)) continue;
        const snap = o.snapshot;
        if (typeof snap.id !== "string" || (o.source !== "calendar" && o.source !== "gmail")) continue;
        T.add({ sessionKey: `${o.source === "calendar" ? "cal" : "gmail"}:${snap.id}`, title: str(snap.title), start: str(snap.startTime),
          source: "operations source inventory" });
      }
      const ops = state.operations;
      for (const [id, row] of Object.entries(ops).slice(0, LIMITS.rows)) {
        if (!isPlain(row)) continue;
        T.add({ sessionKey: id, title: str(row.title), start: str(row.startTime), source: "operations", status: str(row.status) });
      }
    } catch { problems.push("operations.json is unreadable, corrupt, or belongs to a different tenant (not used)"); }
  }
  return { tagged: [...T.by.values()], untagged: [...U.by.values()], problems };
}

const plain = (v: string | undefined, max = 120): string => (v ? v.replace(/[^A-Za-z0-9:._ ,;-]/g, "?").slice(0, max) : "unknown");

function parse(rest: string[]): { id: string; tz: string; tenantArgs: string[]; includeUntagged: boolean } {
  const pos: string[] = [], tenantArgs: string[] = [];
  let tz = "UTC", includeUntagged = false;
  for (let i = 0; i < rest.length; i++) {
    const a = rest[i]!;
    if (a === "--include-untagged") includeUntagged = true;
    else if (a === "--tenant" || a === "--tz") {
      const v = rest[++i];
      if (v === undefined || v.startsWith("--")) throw new Error(USAGE);
      if (a === "--tz") tz = v; else tenantArgs.push(a, v);
    } else if (a.startsWith("--")) throw new Error(USAGE);
    else pos.push(a);
  }
  if (pos.length !== 1) throw new Error(USAGE);
  return { id: pos[0]!, tz, tenantArgs, includeUntagged };
}

const REFUSALS = { "not-text": "not text", empty: "empty", "wrong-length": "not 20 characters long", "not-hex": "not lower-case hex" } as const;
export const LIMIT_NOTE = "Calendar and Gmail items are resolved from the source inventory in operations.json. A miss means that inventory does not contain this item " +
  "(for example it was never synced into operations.json) or the id belongs to another tenant or machine. Look it up by the start time printed in the alert in the Calendar or Gmail view.";

/** Exit code: 0 = at least one meeting found, 1 = refused or nothing found. Usage errors THROW (as runSendNow does). */
export function runAlertWho(rest: string[], deps: AlertWhoDeps): number {
  const { id, tz, tenantArgs, includeUntagged } = parse(rest);
  const tenantId = deps.resolveTenant(tenantArgs); // from --tenant / the host's env rule only, never from the id
  const { tagged, untagged, problems } = loadCandidates({ ...deps.sources, tenantId }, deps);
  const r = resolveAlertId(id, tagged);
  if (!r.ok) { deps.write(`alert-who refused: the id is ${REFUSALS[r.reason]} (expected the 20 hex characters printed in the alert, optionally in [ ])`); return 1; }
  const seen = new Set(r.matches.map((m) => m.sessionKey));
  const u = includeUntagged ? resolveAlertId(id, untagged) : undefined;
  const loose = (u && u.ok ? u.matches : []).filter((m) => !seen.has(m.sessionKey));
  const all = [...r.matches, ...loose];
  for (const p of problems) deps.write(`warning: ${p}`);
  if (!includeUntagged && untagged.length > 0) {
    deps.write(`notice: ${untagged.length} candidate${untagged.length > 1 ? "s" : ""} in schedule-state.json and scheduled/ were NOT searched: those files are shared ` +
      `by every tenant on this machine and carry no tenant tag, so a match cannot be shown to belong to the tenant you asked for. ` +
      `Add --include-untagged to search them; every such match is labelled "${UNTAGGED_LABEL}".`);
  }
  if (all.length === 0) {
    deps.write(`no record in operations.json matches alert id ${r.id}${includeUntagged ? " (the shared schedule files were searched too: no match)" : ""}.`);
    deps.write(LIMIT_NOTE);
    if (problems.length) deps.write("Some state could not be read, so a missing match is not proof the meeting is absent.");
    return 1;
  }
  deps.write(`alert id ${r.id}: ${all.length} match${all.length > 1 ? "es (id collision: check each)" : ""}`);
  for (const m of all) {
    const iso = canonicalStart(m.start), endIso = canonicalStart(m.end);
    deps.write(`  record:   ${plain(m.sessionKey)}`);
    deps.write(`  title:    ${neutralizeText(m.title)}`);
    deps.write(`  time:     ${iso ? renderStart(iso, tz) : endIso ? `ends ${renderStart(endIso, tz)}` : "unknown"}`);
    deps.write(`  platform: ${plain(m.platform)}${m.host ? ` (${plain(m.host, 100)})` : ""}`);
    deps.write(`  source:   ${loose.includes(m) ? `${UNTAGGED_LABEL}: ` : ""}${plain(m.source, 120)}${m.status ? `; status ${plain(m.status, 40)}` : ""}`);
  }
  return 0;
}

/** Real wiring for cli.ts. Dynamic imports keep this module's tests free of the OBS/browser dependency graph. */
export async function defaultAlertWhoDeps(): Promise<AlertWhoDeps> {
  const [{ captureTenant }, { readWebinarOperationState }] = await Promise.all([
    import("./capture/record-commands.js"), import("./calendar/schedule-state.js"),
  ]);
  const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..", "..");
  return {
    resolveTenant: (rest) => captureTenant(rest),
    sources: { dataRoot: root, stateDir: path.join(root, "raw", "webinars"), operationsFile: path.join(root, "data", "webinar-release", "operations.json"), tenantId: "" },
    readOperations: readWebinarOperationState as AlertWhoDeps["readOperations"],
    now: () => new Date(), write: (line) => console.log(line),
  };
}
