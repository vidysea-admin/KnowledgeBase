/**
 * Per-session capture tags written by the schedule tick (<recordDir>/capture-tags/<sessionId>.json) and merged into the registered
 * source by record-finalize.ts. `testData: true` is what routes a non-career webinar to staging only (scripts/watch/test-data-route.mjs,
 * enforced in scripts/webinar/sync-session.mjs). Tags are advisory input: an unreadable or malformed file yields no tags.
 */
import { existsSync, mkdirSync, readFileSync, statSync, writeFileSync } from "node:fs";
import path from "node:path";

export interface CaptureTags { careerGuidance?: boolean; testData?: boolean; matchedKeywords?: string[] }
const SESSION_ID = /^[a-zA-Z0-9][a-zA-Z0-9._-]{0,149}$/;

export function writeCaptureTags(tagsDir: string, sessionId: string, tags: CaptureTags, log: (m: string) => void): void {
  if (tags.testData === undefined && tags.careerGuidance === undefined) return;
  if (!SESSION_ID.test(sessionId)) return; // finalize would refuse this id anyway
  try {
    if (!existsSync(tagsDir)) mkdirSync(tagsDir, { recursive: true });
    writeFileSync(path.join(tagsDir, `${sessionId}.json`), JSON.stringify(tags) + "\n");
  } catch (e) { log(`  could not write capture tags for ${sessionId}: ${e instanceof Error ? e.message : String(e)}`); }
}

/** Only the three known keys, only with the right types; never throws. */
export function readCaptureTags(recordDir: string, sessionId: string): CaptureTags {
  const file = path.join(recordDir, "capture-tags", `${sessionId}.json`);
  try {
    if (!SESSION_ID.test(sessionId) || !existsSync(file) || statSync(file).size > 16 * 1024) return {};
    const p = JSON.parse(readFileSync(file, "utf8")) as Record<string, unknown>;
    return {
      ...(typeof p.careerGuidance === "boolean" ? { careerGuidance: p.careerGuidance } : {}),
      ...(typeof p.testData === "boolean" ? { testData: p.testData } : {}),
      ...(Array.isArray(p.matchedKeywords) ? { matchedKeywords: p.matchedKeywords.filter((k): k is string => typeof k === "string").slice(0, 20) } : {}),
    };
  } catch { return {}; }
}
