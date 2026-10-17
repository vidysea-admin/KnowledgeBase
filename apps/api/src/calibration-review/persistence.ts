import { open, rename, rm } from "node:fs/promises";
import { randomUUID } from "node:crypto";
import type { ReviewState } from "./types.js";

/** Publish state AND audit as one fsynced snapshot. Failure before rename leaves prior bytes intact. */
export async function publishCalibrationReviewState(target: string, state: ReviewState): Promise<void> {
  const temporary = `${target}.${randomUUID()}.tmp`;
  try {
    const handle = await open(temporary, "wx", 0o600);
    try { await handle.writeFile(`${JSON.stringify(state)}\n`); await handle.sync(); } finally { await handle.close(); }
    await rename(temporary, target);
  } finally { await rm(temporary, { force: true }).catch(() => undefined); }
}
