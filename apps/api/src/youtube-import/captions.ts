/**
 * apps/api/src/youtube-import/captions.ts - WebVTT / SRT text to timestamped transcript turns.
 * Handles cue ids, NOTE/STYLE blocks, inline tags, `hh:mm:ss.mmm` and `mm:ss,mmm` stamps, and the rolling
 * auto-caption shape where each cue repeats the previous cue's last line (those repeats are dropped).
 * Overlapping cues are clipped so turns are monotonic; cues are then grouped into paragraph-sized turns.
 */
export interface CaptionTurn { speakerRef: string; tStart: number; tEnd: number; text: string }

const STAMP = String.raw`(?:(\d{1,3}):)?(\d{1,2}):(\d{2})[.,](\d{1,3})`;
const TIMING = new RegExp(String.raw`^\s*${STAMP}\s*-->\s*${STAMP}`);
const ENTITIES: Record<string, string> = { "&amp;": "&", "&lt;": "<", "&gt;": ">", "&quot;": '"', "&#39;": "'", "&nbsp;": " ", "&lrm;": "", "&rlm;": "" };
export const CAPTION_SPEAKER = "youtube-captions";
const GROUP = { maxChars: 500, maxSpanSec: 45, maxGapSec: 3 };

function seconds(h: string | undefined, m: string, s: string, ms: string): number {
  return Number(h ?? 0) * 3600 + Number(m) * 60 + Number(s) + Number(ms.padEnd(3, "0")) / 1000;
}
function cleanLine(line: string): string {
  return line.replace(/\{\\an?\d+\}/g, "").replace(/<[^>]*>/g, "")
    .replace(/&(?:amp|lt|gt|quot|nbsp|lrm|rlm|#39);/g, (e) => ENTITIES[e] ?? e).replace(/\s+/g, " ").trim();
}

interface Cue { start: number; end: number; lines: string[] }

export function parseCues(raw: string): Cue[] {
  const cues: Cue[] = [];
  for (const block of raw.replace(/^﻿/, "").replace(/\r\n?/g, "\n").split(/\n{2,}/)) {
    const rows = block.split("\n");
    const at = rows.findIndex((r) => TIMING.test(r));
    if (at < 0) continue; // header, NOTE, STYLE, REGION or a stray cue id
    const m = TIMING.exec(rows[at]!)!;
    const start = seconds(m[1], m[2]!, m[3]!, m[4]!);
    const end = Math.max(start, seconds(m[5], m[6]!, m[7]!, m[8]!));
    cues.push({ start, end, lines: rows.slice(at + 1).map(cleanLine).filter(Boolean) });
  }
  return cues.map((c, i) => ({ c, i })).sort((a, b) => a.c.start - b.c.start || a.i - b.i).map((x) => x.c);
}

export function parseCaptions(raw: string): CaptionTurn[] {
  const pieces: { start: number; end: number; text: string }[] = [];
  let previous: string[] = [];
  for (const cue of parseCues(raw)) {
    const fresh = cue.lines.filter((l) => !previous.includes(l));
    previous = cue.lines;
    const last = pieces[pieces.length - 1];
    if (fresh.length === 0) { if (last) last.end = Math.max(last.end, cue.end); continue; }
    if (last && last.end > cue.start) last.end = Math.max(last.start, cue.start); // clip overlap
    pieces.push({ start: cue.start, end: cue.end, text: fresh.join(" ") });
  }
  const turns: CaptionTurn[] = [];
  for (const p of pieces) {
    const t = turns[turns.length - 1];
    if (t && p.start - t.tEnd <= GROUP.maxGapSec && p.end - t.tStart <= GROUP.maxSpanSec && t.text.length + p.text.length < GROUP.maxChars) {
      t.text = `${t.text} ${p.text}`; t.tEnd = Math.max(t.tEnd, p.end);
    } else turns.push({ speakerRef: CAPTION_SPEAKER, tStart: p.start, tEnd: p.end, text: p.text });
  }
  return turns;
}
