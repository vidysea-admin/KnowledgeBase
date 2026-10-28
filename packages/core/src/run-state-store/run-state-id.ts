/**
 * packages/core/src/run-state-store/run-state-id.ts — T-050 slice 2. Run-id validation for the file store.
 * A run id becomes part of ONE file name under the caller's root, so it must be a plain, lowercase,
 * portable name: no separators, no drive letters, no dots-only parts, no reserved Windows device names.
 */
export const RUN_ID_MAX = 64;
const RESERVED = /^(con|prn|aux|nul|com[1-9]|lpt[1-9])$/;
const SHAPE = /^[a-z0-9][a-z0-9._-]*$/;

/** Returns null when the id is acceptable, else a short reason. */
export function validateRunId(runId: unknown): string | null {
  if (typeof runId !== "string") return "run id must be a string";
  if (runId.length === 0) return "run id is empty";
  if (runId.length > RUN_ID_MAX) return `run id is longer than ${RUN_ID_MAX} characters`;
  if (!SHAPE.test(runId)) return "run id may only use a-z, 0-9, '.', '_' and '-', starting with a letter or digit";
  if (runId.includes("..")) return "run id must not contain '..'";
  if (runId.endsWith(".")) return "run id must not end with '.'";
  if (RESERVED.test(runId.split(".")[0] ?? "")) return "run id is a reserved Windows device name";
  return null;
}
