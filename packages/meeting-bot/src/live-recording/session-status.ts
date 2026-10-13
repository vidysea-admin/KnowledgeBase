/**
 * packages/meeting-bot/src/live-recording/session-status.ts - ISS-SENDNOWAPI-003 (status half). Answers "is the recorder started for
 * this send-now job id still running?" from the live-recording view every `cli.ts record` claims (the job id IS the session id).
 * It reports PROCESS liveness only: a live entry means the recorder process holds the meeting, NOT that the bot has joined it.
 * Reader rules as readLiveRecordings: only the caller tenant's directory is read; anything unreadable, malformed or tagged for
 * another tenant THROWS ("cannot tell"). Read-only: never writes, claims or removes anything.
 */
import { existsSync, readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import { entryIsLive, parseEntry, type LiveProbes } from "./live-recording.js";

export type SessionStatus =
  | { running: true; meetingKey: string; startedAt: string; until: string | null }
  | { running: false };

const TENANT = /^[a-zA-Z0-9][a-zA-Z0-9._-]{0,99}$/;

export function readSessionStatus(src: { dir: string; tenantId: string; sessionId: string }, now: Date, probes: LiveProbes = {}): SessionStatus {
  if (!TENANT.test(src.tenantId)) throw new Error("invalid tenant id");
  const tdir = path.join(src.dir, src.tenantId);
  if (!existsSync(tdir)) return { running: false };
  let found: SessionStatus = { running: false };
  for (const name of readdirSync(tdir)) {
    if (name.startsWith(".tmp-")) continue;
    if (!name.endsWith(".json")) throw new Error(`unexpected file ${name} in the live-recording directory`);
    const entry = parseEntry(readFileSync(path.join(tdir, name), "utf8"), name, src.tenantId);
    if (entry.sessionId === src.sessionId && entryIsLive(entry, now, probes)) {
      found = { running: true, meetingKey: entry.meetingKey, startedAt: entry.startedAt, until: entry.until };
    }
  }
  return found;
}
