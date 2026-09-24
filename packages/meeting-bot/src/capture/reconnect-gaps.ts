/**
 * packages/meeting-bot/src/capture/reconnect-gaps.ts — T-029 auto-reconnect, the gap → source.json
 * half. py/sb_join.py's ReconnectState (browser-free, its own test_sb_join.py) emits a "gap"
 * JSON-line event {event:"gap", start, end, reason, recovered} (epoch seconds) on the existing
 * stdout event stream that obs-windows.ts already parses line-by-line — the smallest channel
 * available, no new file/pipe needed. Split out of record-commands.ts (not inlined there) so this
 * pure mapping stays unit-testable without spawning ffmpeg/OBS, and to keep record-commands.ts
 * under the 300-LOC budget.
 */
import type { BotEvent } from "./obs-windows.js";

export interface GapWindow {
  start: number; // epoch seconds, as sb_join.py's time.time() emits
  end: number;
  reason: string;
  recovered: boolean;
}

/** The shape written into source.json's `gaps` field: human-readable ISO timestamps. */
export interface GapRecord {
  start: string;
  end: string;
  reason: string;
  recovered: boolean;
}

export function gapsForSourceDoc(gaps: GapWindow[]): GapRecord[] {
  return gaps.map((g) => ({
    start: new Date(g.start * 1000).toISOString(),
    end: new Date(g.end * 1000).toISOString(),
    reason: g.reason,
    recovered: g.recovered,
  }));
}

/** Pushes a completed gap onto `gaps` when `ev` is a "gap" BotEvent; a no-op for every other
 * event (heartbeat, clicked, reconnect-reload, ...). Called from the `onEvent` wired in
 * record-commands.ts's runRecord. */
export function collectGapEvent(gaps: GapWindow[], ev: BotEvent): void {
  if (ev.event !== "gap") return;
  gaps.push({
    start: Number(ev.start),
    end: Number(ev.end),
    reason: String(ev.reason ?? "unknown"),
    recovered: Boolean(ev.recovered),
  });
}
