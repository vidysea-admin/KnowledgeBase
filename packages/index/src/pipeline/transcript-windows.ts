/**
 * packages/index/src/pipeline/transcript-windows.ts — T-040 slice: deterministic transcript windowing.
 * Pure, unwired, total. Not called from summarize.ts or any stage.
 *
 * PARAMETERS (source: qa/manifests/webinar-release-repair-plan.md line 59, "Deterministic full
 * coverage in <=16,000-character windows with two-turn overlap; slice oversized turns preserving
 * exact quote/id"; TASKS.md T-040 gives no numbers, so the plan's values are used):
 *   maxChars = 16000, overlapTurns = 2.
 *
 * RULES
 *  - A turn is rendered as one line `[speaker] text` (speaker truncated to 32 chars). A window's
 *    `text` is its lines joined with "\n"; `text.length <= maxChars` ALWAYS.
 *  - Windows are built greedily left to right and never split a turn, EXCEPT a turn whose own line
 *    exceeds maxChars: it is cut into contiguous exact slices of its text (preferring a whitespace
 *    boundary in the last 20% of a slice, never inside a surrogate pair or before a combining mark;
 *    the slices concatenate back to the original text with nothing dropped). Each slice keeps the
 *    turn id and carries `start`/`end` offsets into the original turn text, plus partIndex/partCount.
 *    A slice counts as one entry for overlap purposes.
 *  - Consecutive windows share exactly `overlapTurns` entries when possible. When that many cannot
 *    be shared while still admitting at least one NEW entry (large entries), the overlap shrinks
 *    (2 -> 1 -> 0) so every window advances; `overlap` reports the actual shared entry count.
 *  - Every entry appears in at least one window. Output is a pure function of the input.
 */
export interface WindowTurn { id: string; text: string; speakerRef?: string }
export interface WindowEntry {
  turnId: string; turnIndex: number;
  /** Offsets of this entry's text inside the ORIGINAL turn text (whole turn: 0..text.length). */
  start: number; end: number; partIndex: number; partCount: number;
}
export interface TranscriptWindow {
  index: number;
  text: string;
  charCount: number;
  entries: WindowEntry[];
  /** Distinct turn ids in order, for mapping results back. */
  turnIds: string[];
  /** Number of leading entries shared with the previous window (0 for the first). */
  overlap: number;
}
export interface WindowOptions { maxChars?: number; overlapTurns?: number }

export const DEFAULT_WINDOW_CHARS = 16000;
export const DEFAULT_OVERLAP_TURNS = 2;
const MIN_WINDOW_CHARS = 64;
const MAX_SPEAKER_CHARS = 32;

interface Entry extends WindowEntry { line: string }

function prefixOf(t: WindowTurn): string {
  const sp = typeof t.speakerRef === "string" ? t.speakerRef.slice(0, MAX_SPEAKER_CHARS) : "";
  return sp ? `[${sp}] ` : "";
}

function isCombiningOrLowSurrogate(ch: string): boolean {
  return /[\udc00-\udfff]/.test(ch) || /\p{M}/u.test(ch) || ch === "‍";
}

function sliceTurn(t: WindowTurn, turnIndex: number, maxChars: number): Entry[] {
  const text = typeof t.text === "string" ? t.text : "";
  const prefix = prefixOf(t);
  const id = String(t.id);
  if (prefix.length + text.length <= maxChars) {
    return [{ turnId: id, turnIndex, start: 0, end: text.length, partIndex: 0, partCount: 1, line: prefix + text }];
  }
  const room = maxChars - prefix.length;
  const cuts: number[] = [0];
  let pos = 0;
  while (text.length - pos > room) {
    let cut = pos + room;
    const floor = pos + Math.floor(room * 0.8);
    for (let i = cut; i > floor; i--) { if (/\s/.test(text.charAt(i - 1))) { cut = i; break; } }
    while (cut > pos + 1 && isCombiningOrLowSurrogate(text.charAt(cut))) cut--;
    cuts.push(cut); pos = cut;
  }
  cuts.push(text.length);
  const parts: Entry[] = [];
  for (let i = 0; i + 1 < cuts.length; i++) {
    parts.push({ turnId: id, turnIndex, start: cuts[i]!, end: cuts[i + 1]!, partIndex: i, partCount: cuts.length - 1, line: prefix + text.slice(cuts[i], cuts[i + 1]) });
  }
  return parts;
}

function toWindow(entries: Entry[], index: number, overlap: number): TranscriptWindow {
  const text = entries.map((e) => e.line).join("\n");
  const turnIds: string[] = [];
  for (const e of entries) if (turnIds[turnIds.length - 1] !== e.turnId) turnIds.push(e.turnId);
  return {
    index, text, charCount: text.length, overlap, turnIds,
    entries: entries.map(({ line: _line, ...rest }) => rest),
  };
}

export function windowTranscript(turns: WindowTurn[], options: WindowOptions = {}): TranscriptWindow[] {
  const maxChars = Math.max(MIN_WINDOW_CHARS, Math.floor(Number.isFinite(options.maxChars) ? options.maxChars! : DEFAULT_WINDOW_CHARS));
  const want = Math.max(0, Math.floor(Number.isFinite(options.overlapTurns) ? options.overlapTurns! : DEFAULT_OVERLAP_TURNS));
  const entries: Entry[] = [];
  (Array.isArray(turns) ? turns : []).forEach((t, i) => { if (t) entries.push(...sliceTurn(t, i, maxChars)); });
  const windows: TranscriptWindow[] = [];
  let start = 0;
  let overlap = 0;
  while (start < entries.length) {
    let end = start;
    let size = -1;
    while (end < entries.length && size + 1 + entries[end]!.line.length <= maxChars) { size += 1 + entries[end]!.line.length; end++; }
    // `end > start + overlap` is guaranteed by the overlap search below; the first window starts fresh.
    windows.push(toWindow(entries.slice(start, end), windows.length, overlap));
    if (end >= entries.length) break;
    // Choose the largest overlap k <= want such that a window starting at end-k admits entry `end`.
    let k = Math.min(want, end - start);
    for (; k > 0; k--) {
      let sz = -1;
      for (let i = end - k; i <= end; i++) sz += 1 + entries[i]!.line.length;
      if (sz <= maxChars && end - k > start) break;
    }
    start = end - k;
    overlap = k;
  }
  return windows;
}
