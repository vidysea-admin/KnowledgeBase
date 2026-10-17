/**
 * packages/meeting-bot/src/alert-who-command.ts - r1-alert-id-resolver (W9).
 * `lkb alert-who <id> [--tenant T] [--tz ZONE]`: tells a LOCAL operator which meeting an attention-alert id names.
 * READ-ONLY: it opens files for reading and prints to the terminal; it creates, writes and sends nothing.
 *
 * Sources (ISS-ALERTID-006: every one is now TENANT-TAGGED and read only for the requested tenant):
 *   - <data/webinar-release>/operations.json   read through `readWebinarOperationState`, which refuses another tenant's file.
 *   - <raw/webinars>/schedule-state.json       {version,tenantId,entries}; a missing / different tag is REFUSED (not read).
 *   - <raw/webinars>/scheduled/*.json          {...job,tenantId}; each file with a missing / different tag is REFUSED (not read).
 * Files written by older versions carry no tag: they are refused with an operator message, never read, migrated or deleted.
 * The tenant is chosen as every lkb command does (`captureTenant`), NEVER from the id.

 * <raw/webinars>/skipped-sessions.json      {version,tenantId,entries}: one {sessionKey,startTime?,recordedAt,source,tenantId} per skipped session, no title/URL; 30-day retention (D-134, pending append).
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
import { readSkippedRecords } from "./calendar/state/skipped-state.js";
import { assertTenantTag, StateTenantRefusal } from "./calendar/state/state-tenant-tag.js";

const USAGE = "usage: lkb alert-who <alert-id> [--tenant T] [--tz ZONE]";
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
export interface Loaded { tagged: AlertCandidate[]; problems: string[] }

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
 * Merges rows that name the same sessionKey (first non-empty field wins). Total: never throws. Every source is tenant-checked;
 * a file with a missing or different tenant tag contributes nothing and yields a `problems` line.
 */
export function loadCandidates(src: AlertWhoSources, deps: Pick<AlertWhoDeps, "readOperations" | "now">): Loaded {
  const problems: string[] = [];
  const T = bucket();
  const refusal = (e: unknown, fallback: string): string => (e instanceof StateTenantRefusal ? e.message : fallback);

  const stateFile = path.join(src.stateDir, "schedule-state.json");
  if (existsSync(stateFile)) {
    if (!insideRoot(src.dataRoot, stateFile)) problems.push("schedule-state.json resolves outside the data root (link not followed; skipped)");
    else try {
      const v = readJsonCapped(stateFile, LIMITS.fileBytes);
      if (!isPlain(v)) throw new Error("not an object");
      const tagged = assertTenantTag(v, src.tenantId, "schedule-state.json");
      const entries = isPlain(tagged.entries) ? tagged.entries : {};
      for (const e of Object.values(entries).slice(0, LIMITS.rows)) {
        if (isPlain(e) && typeof e.sessionKey === "string") T.add({ sessionKey: e.sessionKey, title: str(e.title), source: "schedule-state" });
      }
    } catch (e) { problems.push(refusal(e, "schedule-state.json is unreadable or corrupt (skipped)")); }
  }

  const skippedFile = path.join(src.stateDir, "skipped-sessions.json");
  if (existsSync(skippedFile)) {
    if (!insideRoot(src.dataRoot, skippedFile)) problems.push("skipped-sessions.json resolves outside the data root (link not followed; skipped)");
    else try {
      readJsonCapped(skippedFile, LIMITS.fileBytes); // size / regular-file guard before the tagged read
      for (const r of Object.values(readSkippedRecords(src.stateDir, src.tenantId)).slice(0, LIMITS.rows)) {
        T.add({ sessionKey: r.sessionKey, start: r.startTime, source: "skipped-sessions" });
      }
    } catch (e) { problems.push(refusal(e, "skipped-sessions.json is unreadable or corrupt (skipped)")); }
  }

  const jobDir = path.join(src.stateDir, "scheduled");
  if (existsSync(jobDir)) {
    if (!insideRoot(src.dataRoot, jobDir)) problems.push("scheduled/ resolves outside the data root (link not followed; skipped)");
    else try {
      const names = readdirSync(jobDir).filter((n) => n.endsWith(".json")).sort();
      if (names.length > LIMITS.jobFiles) problems.push(`scheduled/ has more than ${LIMITS.jobFiles} job files (only the first ${LIMITS.jobFiles} read)`);
      const refused = { untagged: 0, "other-tenant": 0, "invalid-tenant": 0 };
      for (const n of names.slice(0, LIMITS.jobFiles)) {
        try {
          const j = readJsonCapped(path.join(jobDir, n), LIMITS.jobBytes);
          if (!isPlain(j) || typeof j.sessionId !== "string") throw new Error("shape");
          assertTenantTag(j, src.tenantId, n);
          const url = str(j.url);
          T.add({ sessionKey: j.sessionId, title: str(j.title), end: str(j.until), source: "scheduled-job",
            platform: url ? detectPlatform(url) : undefined, host: alertWhoHostOnly(url) });
        } catch (e) {
          if (e instanceof StateTenantRefusal) refused[e.reason]++;
          else problems.push("a scheduled job file is unreadable or corrupt (skipped)");
        }
      }
      if (refused.untagged) problems.push(`${refused.untagged} file(s) in scheduled/ have no tenant tag (written by an older version; the directory is shared by every tenant on this machine) and were refused: not read, changed or deleted. Review them and move them aside yourself; no automatic migration is done.`);
      if (refused["other-tenant"]) problems.push(`${refused["other-tenant"]} file(s) in scheduled/ are tagged for a different tenant and were not read.`);
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
  return { tagged: [...T.by.values()], problems };
}

const plain = (v: string | undefined, max = 120): string => (v ? v.replace(/[^A-Za-z0-9:._ ,;-]/g, "?").slice(0, max) : "unknown");

function parse(rest: string[]): { id: string; tz: string; tenantArgs: string[] } {
  const pos: string[] = [], tenantArgs: string[] = [];
  let tz = "UTC";
  for (let i = 0; i < rest.length; i++) {
    const a = rest[i]!;
    if (a === "--tenant" || a === "--tz") {
      const v = rest[++i];
      if (v === undefined || v.startsWith("--")) throw new Error(USAGE);
      if (a === "--tz") tz = v; else tenantArgs.push(a, v);
    } else if (a.startsWith("--")) throw new Error(USAGE);
    else pos.push(a);
  }
  if (pos.length !== 1) throw new Error(USAGE);
  return { id: pos[0]!, tz, tenantArgs };
}

const REFUSALS = { "not-text": "not text", empty: "empty", "wrong-length": "not 20 characters long", "not-hex": "not lower-case hex" } as const;
export const LIMIT_NOTE = "Calendar and Gmail items are resolved from the source inventory in operations.json. A miss means that inventory does not contain this item " +
  "(for example it was never synced into operations.json) or the id belongs to another tenant or machine. Look it up by the start time printed in the alert in the Calendar or Gmail view.";

/** Exit code: 0 = at least one meeting found, 1 = refused or nothing found. Usage errors THROW (as runSendNow does). */
export function runAlertWho(rest: string[], deps: AlertWhoDeps): number {
  const { id, tz, tenantArgs } = parse(rest);
  const tenantId = deps.resolveTenant(tenantArgs); // from --tenant / the host's env rule only, never from the id
  const { tagged, problems } = loadCandidates({ ...deps.sources, tenantId }, deps);
  const r = resolveAlertId(id, tagged);
  if (!r.ok) { deps.write(`alert-who refused: the id is ${REFUSALS[r.reason]} (expected the 20 hex characters printed in the alert, optionally in [ ])`); return 1; }
  const all = r.matches;
  for (const p of problems) deps.write(`warning: ${p}`);
  if (all.length === 0) {
    deps.write(`no record matches alert id ${r.id} (searched operations.json, schedule-state.json and scheduled/ job files, each only if tagged for the requested tenant).`);
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
    deps.write(`  source:   ${plain(m.source, 120)}${m.status ? `; status ${plain(m.status, 40)}` : ""}`);
  }
  return 0;
}

/** Real wiring for cli.ts. Dynamic imports keep this module's tests free of the OBS/browser dependency graph. */
export async function defaultAlertWhoDeps(): Promise<AlertWhoDeps> {
  const [{ captureTenant }, { readWebinarOperationState }] = await Promise.all([
    import("./capture/record-commands.js"), import("./calendar/state/schedule-state.js"),
  ]);
  const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..", "..");
  return {
    resolveTenant: (rest) => captureTenant(rest),
    sources: { dataRoot: root, stateDir: path.join(root, "raw", "webinars"), operationsFile: path.join(root, "data", "webinar-release", "operations.json"), tenantId: "" },
    readOperations: readWebinarOperationState as AlertWhoDeps["readOperations"],
    now: () => new Date(), write: (line) => console.log(line),
  };
}
