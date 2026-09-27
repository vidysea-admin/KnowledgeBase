/**
 * packages/meeting-bot/src/calendar/task-scheduler.ts — U5 (u5-auto-record-scheduler). Hands a
 * to-schedule item to `scripts/webinar/start-record-detached.ps1` through a one-off Windows
 * Scheduled Task — the same mechanism the 2026-09-24 Zoho webinar run used (a one-time
 * `schtasks /create /sc once` firing the detached-launcher script at the join time), so a
 * `schedule-tick` invocation that happens well before a meeting's lead window still results in
 * the recording actually starting at the right moment, instead of depending on being re-invoked
 * at exactly that minute (today's poller is manual/cron-less — U6's 5-minute Task Scheduler
 * poller is a separate, later unit per docs/plan.md).
 *
 * Real-by-default-but-fakeable, same pattern as every other adapter in this codebase
 * (`joiners/*.ts`, `capture/obs-windows.ts`'s injectable clients): `createWindowsTaskScheduler`'s
 * `execFileFn` defaults to a real `child_process.execFile` call to `schtasks.exe`, but tests
 * inject a fake and never invoke the real binary.
 *
 * **ISS-317 (fix cycle 2) — command-injection fix.** The first draft built `/tr` by
 * string-joining a caller-supplied `command`/`args` array with naive `\"`-escaping; `args` came
 * straight from the (partly email-sourced) candidate's `title`/`url`/`sessionId`. Task Scheduler
 * re-parses `/tr` with real Windows command-line rules when the task fires, so a crafted title
 * could break out of the intended quoting and inject extra `powershell.exe` arguments —
 * confirmed by the checker with a standalone `CommandLineToArgvW`-rules simulation. Fix: no
 * caller-supplied free text (title/url/sessionId) is ever placed in `/tr` again. `scheduleOnce`
 * now takes only a `jobKey` (validated against `JOB_KEY_RE`, refused otherwise) and a
 * `launcherPath` (a repo-controlled absolute path, never sender/candidate data) and always
 * builds the exact same fixed shape: `powershell.exe -NoProfile -ExecutionPolicy Bypass -File
 * "<launcherPath>" -Job "<jobKey>"`. The sensitive fields (url, full end datetime, title,
 * sessionId) are persisted out-of-band to a per-job JSON file (`schedule-state.ts`'s
 * `writeScheduledJob`) that the launcher reads via its new `-Job` parameter
 * (`start-record-detached.ps1`) — never passed as a Task Scheduler argument, so the join-link
 * token no longer appears in `/tr` either (the checker's aggravating-detail finding).
 *
 * **Build-session constraint (explicit, from the unit brief): no real Windows Scheduled Task is
 * created while building/testing this unit.** Every test below injects a fake `execFileFn`; the
 * real path is read-reviewed, never exercised against the live `schtasks.exe` in this session —
 * recorded as a known gap in the manifest, not silently skipped.
 */
import { execFile } from "node:child_process";
import { createHash } from "node:crypto";

/** The ONLY caller-supplied text ever allowed into `/tr` (as the `-Job` argument). Deliberately
 * narrow — lowercase ascii letters, digits, hyphen, 1-64 chars — so nothing matching it can ever
 * contain a quote, backslash, `&`, `|`, `;`, `$(...)`, a backtick, `%VAR%`, or a newline. */
export const JOB_KEY_RE = /^[a-z0-9-]{1,64}$/;

/** Hex characters of the SHA-256 digest kept in the jobKey (ISS-321). 10 hex chars = 40 bits —
 * this system schedules a handful of concurrent webinars, not billions, so a 40-bit space makes an
 * accidental collision astronomically unlikely without bloating the key. */
const JOB_KEY_HASH_HEX_LEN = 10;

/**
 * Derives a safe job key from an internal `sessionKey` (`"gmail:<id>"`, `"cal:<id>"` —
 * `auto-join.ts`'s `normalizeCandidate`/`normalizeCalendarEvent`, built from our own Mongo `_id`
 * / calendar event id, never from `title`/`url` free text).
 *
 * **ISS-321 fix (fix cycle 0).** The original version lower-cased and collapsed any run of
 * characters outside `[a-z0-9]` to a single `-`. That collapse is LOSSY: `"gmail:abc_123"`,
 * `"gmail:abc-123"` and `"GMAIL:ABC-123"` all collapsed to the identical `"gmail-abc-123"`, and
 * both `writeScheduledJob` and `scheduleOnce`'s `schtasks /create /f` then overwrote whatever was
 * already scheduled under that key with no detection (ISS-321's own reproduction — 4 such pairs).
 * The jobKey is now `<readable-prefix>-<hash>`: the same lower-cased, punctuation-collapsed prefix
 * as before (kept for humans skimming `schtasks /query` output or the `scheduled/` directory) plus
 * a fixed-length hex slice of a SHA-256 digest of the FULL, UN-collapsed `sessionKey`. Collapsing
 * can no longer erase the distinction between two different sessionKeys, because the hash is taken
 * before any collapsing happens. Same input always derives the same jobKey (required — a session
 * re-scheduled by a later tick must land on its own existing job file, not a fresh one).
 *
 * Still returns `null` (never throws) for a truly empty `sessionKey`, and — as a structural
 * guarantee, not an expected runtime path — for the unreachable case of the assembled candidate
 * failing `JOB_KEY_RE` (e.g. a hash implementation change producing non-hex output). Callers MUST
 * refuse to schedule on `null` rather than fall back to the raw `sessionKey` or any other
 * unvalidated text. This is a defensive floor, not the primary trust boundary (sessionKey ids are
 * not attacker-authored free text like title/url), but `scheduleOnce` re-validates independently
 * below so a caller cannot smuggle unsafe characters through even if this function were bypassed.
 *
 * **Migration note (see manifest):** this changes the jobKey format for every sessionKey, so any
 * already-scheduled Windows Task or `scheduled/<jobKey>.json` file written under the OLD lossy
 * jobKey is orphaned by this change — it is not renamed or migrated. See the manifest's
 * "Migration" section for what happens to those and why that is acceptable here.
 */
export function deriveJobKey(sessionKey: string): string | null {
  if (sessionKey.length === 0) return null;
  const hash = createHash("sha256").update(sessionKey, "utf8").digest("hex").slice(0, JOB_KEY_HASH_HEX_LEN);
  const readablePrefix = sessionKey.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "");
  const maxPrefixLen = 64 - 1 - hash.length; // reserve "-" + hash inside JOB_KEY_RE's 64-char cap
  const prefix = readablePrefix.slice(0, maxPrefixLen);
  const candidate = prefix ? `${prefix}-${hash}` : hash;
  return JOB_KEY_RE.test(candidate) ? candidate : null;
}

/** The Windows Scheduled Task name for a given (already-validated) job key — fixed prefix +
 * jobKey, so the whole name is safe by construction once `jobKey` itself validates. */
export function buildTaskName(jobKey: string): string {
  return `lkb-autorecord-${jobKey}`;
}

export interface ScheduleOnceOptions {
  /** The per-session job identity passed to the launcher via `-Job`. MUST match `JOB_KEY_RE` —
   * `scheduleOnce` rejects (never calls `schtasks`) otherwise. This is the ONLY variable content
   * that ends up inside `/tr`; everything else in the built command line is a fixed string. */
  jobKey: string;
  /** Absolute path to the fixed launcher script (`scripts/webinar/start-record-detached.ps1`).
   * Repo-controlled — must never be built from candidate/title/url data. */
  launcherPath: string;
  /** When the task should fire, as an ISO datetime in the LOCAL timezone the task should run in
   * (schtasks takes local wall-clock time, not UTC). */
  runAtIso: string;
}

export interface TaskScheduler {
  scheduleOnce(opts: ScheduleOnceOptions): Promise<void>;
}

function pad2(n: number): string {
  return n.toString().padStart(2, "0");
}

/** Local-time `HH:mm` — the format both `schtasks /st` and `lkb record --until`/`-Until`
 * (`record-commands.ts`'s `todayAt`) expect. */
export function toLocalHHMM(iso: string): string {
  const d = new Date(iso);
  return `${pad2(d.getHours())}:${pad2(d.getMinutes())}`;
}

/** `schtasks /st`/`/sd` want `HH:mm` and `MM/DD/YYYY` in local time — no timezone suffix. */
export function toSchtasksDateTime(iso: string): { st: string; sd: string } {
  const d = new Date(iso);
  return {
    st: toLocalHHMM(iso),
    sd: `${pad2(d.getMonth() + 1)}/${pad2(d.getDate())}/${d.getFullYear()}`,
  };
}

type ExecFileFn = (
  file: string,
  args: string[],
  callback: (error: Error | null, stdout: string, stderr: string) => void,
) => void;

/**
 * Builds the real scheduler. `execFileFn` defaults to Node's real `child_process.execFile`
 * (never a shell string — args are passed as an array to `schtasks` itself) but is injectable
 * for tests.
 *
 * ISS-317 fix: `/tr` is now always the exact fixed shape below — `opts.jobKey` (validated
 * against `JOB_KEY_RE`, refused otherwise) and `opts.launcherPath` (repo-controlled, never
 * sender/candidate data) are the only two values that ever appear inside it. No title, url,
 * sessionId, or any other caller-supplied free text is placed in `/tr`.
 */
export function createWindowsTaskScheduler(execFileFn: ExecFileFn = execFile as unknown as ExecFileFn): TaskScheduler {
  return {
    scheduleOnce(opts: ScheduleOnceOptions): Promise<void> {
      if (!JOB_KEY_RE.test(opts.jobKey)) {
        return Promise.reject(
          new Error(`refusing to schedule: jobKey '${opts.jobKey}' fails ${JOB_KEY_RE} (ISS-317)`),
        );
      }
      const taskName = buildTaskName(opts.jobKey);
      const { st, sd } = toSchtasksDateTime(opts.runAtIso);
      // Fixed shape, no interpolation of untrusted content: opts.jobKey already validated above
      // can contain only [a-z0-9-], so it needs no escaping; opts.launcherPath is repo-controlled.
      const taskRun = `"powershell.exe" -NoProfile -ExecutionPolicy Bypass -File "${opts.launcherPath}" -Job "${opts.jobKey}"`;
      const args = [
        "/create", "/f",
        "/tn", taskName,
        "/sc", "once",
        "/st", st,
        "/sd", sd,
        "/tr", taskRun,
      ];
      return new Promise((resolve, reject) => {
        execFileFn("schtasks", args, (error, _stdout, stderr) => {
          if (error) {
            reject(new Error(`schtasks /create failed for task '${taskName}': ${stderr || error.message}`));
            return;
          }
          resolve();
        });
      });
    },
  };
}
