/** QA-only durable scalar trace; no authority, producer inputs, handlers or timers. */
import { closeSync, fsyncSync, fstatSync, lstatSync, openSync, realpathSync, writeSync } from "node:fs";
import path from "node:path";
const STAGES = ["root", "fixture-seal", "recovery", "provider", "binding", "revocation", "artifact", "alias", "eof", "copied", "orphan", "decoder", "pages", "quota", "journal", "cleanup"] as const;
type Stage = typeof STAGES[number];
type Status = "disabled" | "active" | "refused" | "failed" | "limited";
export interface NativeGuardPhaseLogger {
  (stage: Stage, event: "start" | "complete", ordinal?: number): void;
  readonly status: Status;
}
interface Sink { fd: number; file: string; root: string; dev: number; ino: number; bytes: number; count: number; start: number; status: Status }
let owned: Sink | undefined;
const canonical = (value: string) => process.platform === "win32" ? value.toLowerCase() : value;
/** Separate guard probes only; actual two-node batches retain one descriptor until OS exit. */
export function resetNativeGuardPhaseTraceForTest(): void {
  try { if (owned) closeSync(owned.fd); } catch { /* Diagnostic failure never changes a test assertion. */ }
  owned = undefined;
}
export function createNativeGuardPhaseTrace(testId: "tamper" | "fair"): NativeGuardPhaseLogger {
  let status: Status = "disabled", sink: Sink | undefined;
  const rootInput = process.env.LKB_NATIVE_TEST_PRIVATE_DIR;
  if (rootInput) {
    try {
      if (testId !== "tamper" && testId !== "fair") throw 0;
      if (!path.isAbsolute(rootInput) || /^[/\\]{2}/.test(rootInput)) throw 0;
      const root = path.resolve(rootInput), file = path.join(root, "native-guard-phases.jsonl");
      const selected = process.env.LKB_NATIVE_GUARD_PHASE_LOG;
      if (selected !== undefined && canonical(path.resolve(selected)) !== canonical(file)) throw 0;
      const directory = lstatSync(root);
      if (!directory.isDirectory() || directory.isSymbolicLink() || canonical(realpathSync(root)) !== canonical(root)) throw 0;
      if (owned) {
        if (canonical(owned.file) !== canonical(file)) throw 0;
        sink = owned;
      } else {
        try { lstatSync(file); throw 0; } catch (error) {
          if ((error as NodeJS.ErrnoException | null)?.code !== "ENOENT") throw 0;
        }
        const fd = openSync(file, "wx", 0o600), physical = fstatSync(fd);
        sink = { fd, file, root, dev: physical.dev, ino: physical.ino, bytes: 0, count: 0, start: performance.now(), status: "active" };
        owned = sink;
      }
      status = sink.status;
    } catch { status = "refused"; }
  }
  const mark = ((stage: Stage, event: "start" | "complete", ordinal?: number) => {
    if (!sink || sink.status !== "active") return;
    try {
      if (!(STAGES as readonly unknown[]).includes(stage) || (event !== "start" && event !== "complete") ||
        ordinal !== undefined && (!Number.isInteger(ordinal) || ordinal < 0 || ordinal > 10)) { sink.status = "refused"; return; }
      const physical = lstatSync(sink.file);
      if (!physical.isFile() || physical.isSymbolicLink() || physical.nlink !== 1 || physical.dev !== sink.dev ||
        physical.ino !== sink.ino || physical.size !== sink.bytes || canonical(realpathSync(sink.root)) !== canonical(sink.root)) throw 0;
      const stageId = `${testId === "tamper" ? "node1" : "node2"}-${stage}-${event}${ordinal === undefined ? "" : `-${ordinal}`}`;
      const elapsedMs = Math.min(75000, Math.max(0, Math.round(performance.now() - sink.start)));
      const line = Buffer.from(JSON.stringify({ stageId, elapsedMs }) + "\n");
      if (sink.count >= 256 || sink.bytes + line.length > 65536) { sink.status = "limited"; return; }
      if (writeSync(sink.fd, line) !== line.length) throw 0;
      fsyncSync(sink.fd); sink.bytes += line.length; sink.count++;
    } catch { sink.status = "failed"; }
  }) as NativeGuardPhaseLogger;
  Object.defineProperty(mark, "status", { get: () => sink?.status ?? status });
  return mark;
}
