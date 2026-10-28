/**
 * packages/core/src/domain/slide-turn-alignment.ts — T-041 slice 1 (UNWIRED, PURE). Aligns slide
 * observations (as a future OCR/vision stage would emit them) with transcript turns by time. No I/O,
 * no logging, no storage, no model call; nothing imports this yet.
 *
 * Attachment is BY REFERENCE: the output carries only ids and time ranges (turn id, slide id, overlap
 * range, the same tStart/tEnd seconds-from-session-start as Turns). Slide text is used only to decide
 * sameness inside this call and is never returned, copied into turn text, or logged. Slide text is
 * untrusted (passcodes, personal data); storing it is the wiring slice's decision (needs an owner ruling).
 *
 * Rules (all times are seconds from session start; intervals are half-open [from, to)):
 *  - A slide is on screen from its first observation until the next DIFFERENT slide's observation, or
 *    until `sessionEndSec` (if given) / open-ended (to = null) for the last one.
 *  - Sameness: text equal after NFC + whitespace collapse + trim, nothing fuzzy. Only CONSECUTIVE
 *    (time-sorted) equal observations merge; A,B,A is three segments. Blank text is a "no slide"
 *    frame: it ends the previous slide and attaches nothing.
 *  - Observations sort by (time, id) with plain code-unit comparison. At identical capture times with
 *    different text, the later id wins the screen and the earlier gets an empty span.
 *  - A turn gets every slide it overlaps (overlap > 0), ordered by time; primary = longest overlap, ties
 *    to the earliest. A zero-length turn gets the one slide with from <= t < to (overlap 0). A turn
 *    before the first slide or in a gap gets none.
 *  - Never throws. Bad items are excluded and reported in `errors` with a typed code: non-finite or
 *    negative times, end < start, non-string/empty id, non-string text, bad confidence, and EVERY item
 *    sharing a duplicated id (all of them, so the result cannot depend on input order).
 *  - Complexity: sort O(n log n + m log m); sweep O(n + m + k) with k the number of reported pairs
 *    (two pointers; the slide pointer only moves forward). `options.counter.ops` counts sweep steps.
 */
export interface SlideObservation { id: string; tSec: number; text: string; confidence?: number }
export interface AlignTurn { id: string; tStart: number; tEnd: number; speakerRef?: string }
export interface AlignOptions { sessionEndSec?: number; counter?: { ops: number } }

export type AlignErrorCode =
  | "invalid-input" | "invalid-id" | "duplicate-id" | "invalid-time" | "negative-time"
  | "end-before-start" | "invalid-text" | "invalid-confidence" | "invalid-session-end";
export interface AlignError { kind: "slide" | "turn" | "options"; index: number; id?: string; code: AlignErrorCode }

/** One (turn, slide) pairing: provenance = turn id + slide id + the overlap range in session seconds. */
export interface Attachment { turnId: string; slideId: string; from: number; to: number; overlapSec: number }
export interface TurnSlides { turnId: string; attachments: Attachment[]; primarySlideId: string | null }
export interface SlideCoverage {
  slideId: string; observationIds: string[]; from: number; to: number | null; attachments: Attachment[];
}
export interface AlignResult { turns: TurnSlides[]; slides: SlideCoverage[]; errors: AlignError[] }

type Rec = Record<string, unknown>;
const cmp = (a: string, b: string): number => (a < b ? -1 : a > b ? 1 : 0);

export function normalizeSlideText(text: string): string {
  return text.normalize("NFC").replace(/\s+/gu, " ").trim();
}

function timeCode(v: unknown): AlignErrorCode | null {
  if (typeof v !== "number" || !Number.isFinite(v)) return "invalid-time";
  return v < 0 ? "negative-time" : null;
}

function screen(raw: unknown, kind: "slide" | "turn", check: (o: Rec) => AlignErrorCode | null, errors: AlignError[]): Rec[] {
  if (!Array.isArray(raw)) {
    if (raw !== undefined) errors.push({ kind, index: -1, code: "invalid-input" });
    return [];
  }
  const ok: { o: Rec; index: number }[] = [];
  const seen = new Map<string, number>();
  for (let index = 0; index < raw.length; index++) {
    const o = raw[index] as unknown;
    if (typeof o !== "object" || o === null) { errors.push({ kind, index, code: "invalid-input" }); continue; }
    const r = o as Rec;
    if (typeof r.id !== "string" || r.id === "") { errors.push({ kind, index, code: "invalid-id" }); continue; }
    const code = check(r);
    if (code) { errors.push({ kind, index, id: r.id, code }); continue; }
    ok.push({ o: r, index });
    seen.set(r.id, (seen.get(r.id) ?? 0) + 1);
  }
  const out: Rec[] = [];
  for (const { o, index } of ok) {
    if ((seen.get(o.id as string) ?? 0) > 1) errors.push({ kind, index, id: o.id as string, code: "duplicate-id" });
    else out.push(o);
  }
  return out;
}

const slideCheck = (o: Rec): AlignErrorCode | null =>
  timeCode(o.tSec) ?? (typeof o.text !== "string" ? "invalid-text"
    : o.confidence !== undefined && !(typeof o.confidence === "number" && o.confidence >= 0 && o.confidence <= 1) ? "invalid-confidence"
    : null);
const turnCheck = (o: Rec): AlignErrorCode | null =>
  timeCode(o.tStart) ?? timeCode(o.tEnd) ?? ((o.tEnd as number) < (o.tStart as number) ? "end-before-start" : null);

interface Seg { id: string; obs: string[]; key: string; from: number; to: number; att: Attachment[] }

export function alignSlidesToTurns(slidesIn: unknown, turnsIn: unknown, options?: AlignOptions): AlignResult {
  const errors: AlignError[] = [];
  const opt: AlignOptions = options && typeof options === "object" ? options : {};
  const counter = opt.counter;
  let end = Infinity;
  if (opt.sessionEndSec !== undefined) {
    if (typeof opt.sessionEndSec === "number" && Number.isFinite(opt.sessionEndSec) && opt.sessionEndSec >= 0) end = opt.sessionEndSec;
    else errors.push({ kind: "options", index: -1, code: "invalid-session-end" });
  }

  const obs = screen(slidesIn, "slide", slideCheck, errors)
    .sort((a, b) => (a.tSec as number) - (b.tSec as number) || cmp(a.id as string, b.id as string));
  const segs: Seg[] = [];
  for (const o of obs) {
    const key = normalizeSlideText(o.text as string);
    const last = segs[segs.length - 1];
    if (last && last.key === key) last.obs.push(o.id as string);
    else segs.push({ id: o.id as string, obs: [o.id as string], key, from: o.tSec as number, to: 0, att: [] });
  }
  for (let k = 0; k < segs.length; k++) {
    const next = k + 1 < segs.length ? segs[k + 1]!.from : Infinity;
    const sg = segs[k]!;
    sg.to = Math.max(sg.from, Math.min(next, end));
  }
  const active = segs.filter((s) => s.key !== "" && s.to > s.from);

  const turns = screen(turnsIn, "turn", turnCheck, errors)
    .sort((a, b) => (a.tStart as number) - (b.tStart as number) || cmp(a.id as string, b.id as string));
  const outTurns: TurnSlides[] = [];
  let lo = 0;
  for (const t of turns) {
    const s = t.tStart as number, e = t.tEnd as number, turnId = t.id as string;
    while (lo < active.length && active[lo]!.to <= s) { lo++; if (counter) counter.ops++; }
    const attachments: Attachment[] = [];
    let primary: Attachment | null = null;
    for (let j = lo; j < active.length; j++) {
      const seg = active[j]!;
      if (counter) counter.ops++;
      if (!(seg.from < e || (e === s && seg.from <= s))) break;
      const from = Math.max(s, seg.from), to = Math.min(e, seg.to);
      const a: Attachment = { turnId, slideId: seg.id, from, to, overlapSec: to - from };
      attachments.push(a);
      seg.att.push(a);
      if (primary === null || a.overlapSec > primary.overlapSec) primary = a;
    }
    outTurns.push({ turnId, attachments, primarySlideId: primary ? primary.slideId : null });
  }
  const slides: SlideCoverage[] = segs.filter((s) => s.key !== "").map((s) => ({
    slideId: s.id, observationIds: s.obs, from: s.from, to: Number.isFinite(s.to) ? s.to : null, attachments: s.att,
  }));
  return { turns: outTurns, slides, errors };
}
