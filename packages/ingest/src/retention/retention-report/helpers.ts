import { statSync } from "node:fs";
import { runRetentionReport } from "../retention-report.js";
import { REAL_IO, type MediaIo } from "../retention-report-media.js";
import { NOW, type Ran } from "../retention-report.fixtures.js";

/** Shared helpers for the retention-report/*.test.ts files (not a test file). */
export const unverified = (n: string) => [{ _id: `${n}-c`, tenantId: "toc", text: "x", status: "needs-review", evidence: [{ turnId: `${n}-t1`, sessionId: n }] }];
export const block = (out: string, id: string): string => out.split("RECORDING ").find((b) => b.startsWith(`${id}-src`)) ?? "";
export const verdict = (out: string, id: string): string => /=> (ELIGIBLE|KEEP)/.exec(block(out, id))?.[1] ?? "absent";
export const guardOf = (out: string, id: string): string => /guard: ([a-z-]+)/.exec(block(out, id))?.[1] ?? "none";
export const line = (out: string, label: string): string => out.split("\n").find((l) => l.startsWith(`TOTALS ${label}:`)) ?? "";
/** The platform file index is hidden (ino 0), so only the case-folded real path can identify the file. */
export const noInode: MediaIo = { ...REAL_IO, statSync: ((p: string, o?: { bigint: true }) => (o ? { ...statSync(p, { bigint: true }), ino: 0n } : statSync(p))) as MediaIo["statSync"] };
export function runIo(args: string[], io: MediaIo, now = NOW): Ran {
  const out: string[] = [], err: string[] = [];
  const code = runRetentionReport(args, { now: () => now, write: (l) => out.push(l), error: (l) => err.push(l), io });
  return { code, out: out.join("\n"), err: err.join("\n") };
}
