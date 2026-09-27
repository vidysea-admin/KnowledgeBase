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
 * **Build-session constraint (explicit, from the unit brief): no real Windows Scheduled Task is
 * created while building/testing this unit.** Every test below injects a fake `execFileFn`; the
 * real path is read-reviewed, never exercised against the live `schtasks.exe` in this session —
 * recorded as a known gap in the manifest, not silently skipped.
 */
import { execFile } from "node:child_process";

export interface ScheduleOnceOptions {
  /** Unique Scheduled Task name — the caller is responsible for making this stable per
   * `sessionKey` so a re-run of `schtasks /create` with the same name is idempotent (`/f`
   * overwrites rather than erroring on "already exists"). */
  taskName: string;
  /** When the task should fire, as an ISO datetime in the LOCAL timezone the task should run in
   * (schtasks takes local wall-clock time, not UTC). */
  runAtIso: string;
  /** The command to run at that time — always `powershell.exe` for this unit's one caller
   * (`schedule-tick.ts`), kept generic here so this module stays reusable. */
  command: string;
  args: string[];
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
 * (never a shell string — args are passed as an array, so a title/URL containing `"`/`&`/`|`
 * can't break out of the command line) but is injectable for tests.
 */
export function createWindowsTaskScheduler(execFileFn: ExecFileFn = execFile as unknown as ExecFileFn): TaskScheduler {
  return {
    scheduleOnce(opts: ScheduleOnceOptions): Promise<void> {
      const { st, sd } = toSchtasksDateTime(opts.runAtIso);
      const taskRun = [opts.command, ...opts.args].map((a) => `"${a.replace(/"/g, '\\"')}"`).join(" ");
      const args = [
        "/create", "/f",
        "/tn", opts.taskName,
        "/sc", "once",
        "/st", st,
        "/sd", sd,
        "/tr", taskRun,
      ];
      return new Promise((resolve, reject) => {
        execFileFn("schtasks", args, (error, _stdout, stderr) => {
          if (error) {
            reject(new Error(`schtasks /create failed for task '${opts.taskName}': ${stderr || error.message}`));
            return;
          }
          resolve();
        });
      });
    },
  };
}
