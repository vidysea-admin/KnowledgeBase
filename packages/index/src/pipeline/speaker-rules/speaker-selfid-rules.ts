/**
 * packages/index/src/pipeline/speaker-selfid-rules.ts -- ISS-PH3-006 (critical), fix cycle 5: an ALLOW-LIST.
 *
 * "Is THIS occurrence of a name a clean first-person self-introduction?" Cycle 4 answered with a deny-list of bad
 * contexts (reporting verbs, hedges, negation) and the checker found a new unlisted context every cycle ("I am N, he
 * said.", "Repeat after me, I am N.", "Usne kaha I am N."). A list of bad contexts cannot be closed. This module
 * is the opposite: a name is accepted ONLY when the sentence that holds the cue is, end to end, one of a few
 * positively described shapes (SHAPES below), and the sentences around it are harmless by a positive test too.
 * Anything else is refused however innocent it looks; unknown words (any language) simply fail to match.
 *
 * UNIT OF TEXT. Real introductions sit inside long monologues (the one correct name in the recorded corpus is the
 * 4th sentence of a 132-sentence turn), so the unit is the SENTENCE holding the cue, checked as a whole:
 *   sentence  = OPENERS, then a cue, then exactly ONE name (the candidate), then a closed TAIL, then . or ! or nothing.
 *   before it = every earlier sentence of the turn, walking back, is opener-only ("Hi everyone.") until the start of
 *               the turn or a LEAD-IN sentence ("Let me quickly introduce myself first."); a lead-in announces the
 *               speaker's own introduction, so what precedes it is free. Any other sentence directly before (such as
 *               "Repeat after me." or "Quote.") refuses: that is where framing arrives across a full stop.
 *   after it  = the next sentence, if any, must open with a first-person or continuation word (NEXT_OK); "That is
 *               what he said." or "Those were his words." refuses.
 * Typography: straight and curly apostrophes are identical; whitespace is collapsed; no filler is allowed in the
 * sentence ("I'm Rashi, yeah." refuses); a trailing . or ! is optional, a "?" refuses.
 * Hindi cues ("mera naam N hai") are NOT added here: recall for a later, separately checked unit.
 * Places, organisations and role words ("Hello, I'm Google.") are unchanged policy (D-052; open Approver question).
 */

import { looksLikeAName, isDiscourseOnly } from "../speaker-name-rules.js";

const OPENER_WORDS = "hi|hello|hey|namaste|good (?:morning|afternoon|evening|day)|okay|ok|so|well|alright|now|um|uh|thanks|thank you|welcome|everyone|all|folks|friends|and|again|actually|there";
const OPEN = String.raw`(?:(?:${OPENER_WORDS})[,\s]+)*`;
/** A lead-in that announces the speaker's own introduction. */
const LEAD = String.raw`(?:let me|i would like to|i'd like to|i want to|allow me to)(?: (?:quickly|briefly|just|first|also))* introduce myself(?: (?:first|quickly|briefly|to you|to all|to everyone))*`;
const THANKS_INTRO = String.raw`(?:thank you|thanks)(?: (?:so|very) much)?(?: for (?:the|that|your) (?:kind )?(?:introduction|intro|invitation|welcome))?`;
const OPENER_ONLY = new RegExp(String.raw`^(?:(?:(?:${OPENER_WORDS})\b[,\s]*)+|${THANKS_INTRO})[\s,]*[.!]*$`, "iu");
const LEAD_IN_SENTENCE = new RegExp(String.raw`^${OPEN}${LEAD}[\s,]*[.!]*$`, "iu");
const NEXT_OK = /^(?:i|i'm|i'll|i've|i'd|we|we're|we'll|my|our|today|welcome|thank|thanks|and|so|before|first|let|let's|over|hi|hello|good|okay|ok|uh|um|please|now|also)\b/iu;

/** Each shape: what may precede the name in its sentence, and what may follow it. `multi`: the name must have 2+ tokens. */
const SHAPES: { id: string; pre: RegExp; post: RegExp; multi?: boolean; idiom?: boolean }[] = [
  { id: "i-am / my name is", pre: new RegExp(String.raw`^${OPEN}(?:${LEAD}[,:]?\s+)?(?:my name is|my name's|i am|i'm|this side)\s+$`, "iu"), post: /^(?<t>[\s\S]*)$/u },
  { id: "this is <Full Name>", pre: new RegExp(String.raw`^${OPEN}this is\s+$`, "iu"), post: /^(?: speaking)?(?<t>[\s\S]*)$/u, multi: true },
  { id: "<Name> here / speaking", pre: new RegExp(String.raw`^${OPEN}$`, "iu"), post: /^ (?:here|speaking)(?<t>[\s\S]*)$/u, idiom: true },
  { id: "call me (ISS-255 test only)", pre: /^before i invite our next speaker, i should say: call me $/iu, post: /^(?<t>[.!]?)$/u },
];

/** Tail: nothing, " today", " from <organisation or place words>", or " and I lead|am|will be ... <plain lowercase words>". */
const ORG_LOWER = new Set(["the", "of", "team", "office", "department", "university", "college", "school", "institute", "admissions", "marketing", "sales", "international",
  "recruitment", "outreach", "partnerships", "regional", "programme", "program", "group", "company", "centre", "center"]);
/** Words that would turn a first-person role clause into something else. Belt and braces inside a 6-word clause; the allow-list is the defence. */
const STOP = new Set(["not", "no", "never", "nobody", "cannot", "said", "say", "says", "told", "tell", "wrote", "asked", "quote", "unquote", "if", "maybe", "perhaps", "might", "think",
  "thought", "believe", "wish", "suppose", "imagine", "pretend", "movie", "play", "script", "character", "role", "was", "were", "like", "go", "goes", "went", "he", "she", "they", "his", "her", "their"]);
const ROLE_LEAD = /^ and (?:i (?:lead|head|manage|handle|run|look after|work (?:with|on|at|in|for))|i am|i'm|i will be|i'll be|today we(?: will| are|'ll|'re)?|today i(?: will|'ll)?) ?(?<rest>.*)$/iu;

const orgOk = (w: string): boolean => {
  const words = w.trim().split(" ");
  return words.length <= 5 && words.every((x) => /^[\p{L}\p{N}&'-]+$/u.test(x) && (/^[\p{Lu}\p{N}]/u.test(x) || ORG_LOWER.has(x)));
};
const plain = (w: string, max: number): boolean => { const a = w.trim().split(" "); return a.length >= 1 && a.length <= max && a.every((x) => /^[a-z]+(?:-[a-z]+)?$/u.test(x) && !STOP.has(x)); };
const after = (s: string, re: RegExp): string | undefined => re.exec(s)?.groups?.w;
/** Extra tails after "<Name> here|speaking" only; each is pinned by an ISS-098 / ISS-104 recall test (speaker-name-rules.test.ts). */
const IDIOM: ((s: string) => boolean)[] = [
  (s) => ["", " here", " again", " now", " over Zoom", " on Zoom"].includes(s) || /^ \([a-z]+\)$/u.test(s),
  (s) => { const w = after(s, /^ as the (?<w>[a-z ]+)$/u); return w !== undefined && plain(w, 3); },
  (s) => { const w = after(s, /^ to talk about (?<w>[a-z ]+)$/u); return w !== undefined && plain(w, 4); },
  (s) => /^ (?:--|—|-|…)\s*(?:good to be (?:here|with you)|thanks all)$/u.test(s) || s === "… thanks all",
  (s) => { const w = after(s, /^ (?:today|speaking) from (?<w>.+)$/u); return w !== undefined && orgOk(w); },
];

function tailOk(raw: string, idiom = false): boolean {
  const s = raw.replace(/[.!]$/u, "");
  if (s === "" || s === " today" || s === " and welcome" || s === ", and welcome") return true;
  if (idiom && IDIOM.some((ok) => ok(s))) return true;
  const from = after(s, /^,? from (?<w>[^,;:]+)$/u);
  if (from !== undefined) return orgOk(from);
  const role = ROLE_LEAD.exec(s);
  if (!role?.groups) return false;
  const words = role.groups.rest!.trim().split(" ").filter(Boolean);
  const article = /^ and (?:i am|i'm)/iu.test(s);
  return words.length >= 1 && words.length <= 6 && words.every((w) => /^[a-z]+(?:-[a-z]+)?$/u.test(w) && !STOP.has(w)) && (!article || ["a", "an", "the"].includes(words[0]!));
}

const normalise = (s: string): string => s.replaceAll("’", "'").replace(/\s+/gu, " ");
const sentencesOf = (t: string): { s: string; from: number; to: number }[] =>
  [...t.matchAll(/\S[\s\S]*?(?:[.!?]+(?=\s|$)|$)/gu)].map((m) => ({ s: m[0], from: m.index!, to: m.index! + m[0].length }));

/** Does the sentence holding the occurrence at `at` match one whole self-introduction SHAPE, with harmless neighbours? */
export function isCleanSelfIdentificationAt(raw: string, name: string, at: number): boolean {
  const text = normalise(raw), nm = normalise(name).trim();
  const pos = normalise(raw.slice(0, at)).length;
  if (text.slice(pos, pos + nm.length) !== nm) return false;
  const sents = sentencesOf(text);
  const i = sents.findIndex((x) => pos >= x.from && pos < x.to);
  const cur = sents[i];
  if (!cur) return false;
  const [pre, post] = [text.slice(cur.from, pos), text.slice(pos + nm.length, cur.to)];
  const shape = SHAPES.find((sh) => (!sh.multi || nm.split(" ").length > 1) && sh.pre.test(pre) && sh.post.test(post));
  if (!shape || !tailOk(shape.post.exec(post)?.groups?.t ?? post, shape.idiom)) return false;
  for (let k = i - 1; k >= 0; k--) {
    const prev = sents[k]!.s;
    if (LEAD_IN_SENTENCE.test(prev)) break;
    if (!OPENER_ONLY.test(prev)) return false;
  }
  const next = sents[i + 1]?.s;
  return next === undefined || NEXT_OK.test(next);
}

/**
 * FIX CYCLE 6 (ISS-PH3-008, critical; Approver ruling 2026-10-11). WHOLE-TURN AMBIGUITY, judged BEFORE any position / tail filter.
 * A turn that holds a self-introduction CANDIDATE for a DIFFERENT name than `name` is the voice of more than one person (round-table
 * introductions merged by diarization) or a self-correction: it cannot credit `name` to the label. Cycle 5 judged "is this the only
 * name?" AFTER the allow-list had already dropped the second introduction, so the base's contradiction refusal (contract C7) never
 * saw two names. A candidate here is any capitalised name run directly after a self-naming cue ("my name is|i am|i'm|this side|
 * this is|call me") or directly before "here|speaking", ANYWHERE in the turn (no sentence, quote, tail or lead-in test), as long as
 * it passes the two shape checks the base also applies to a proposed name (looksLikeAName, not isDiscourseOnly).
 * NAME EQUALITY: exact, after collapsing whitespace and curly apostrophes. The base keys a label's names by exact string, so
 * "Priya" vs "Priya Sharma" or "PRIYA" are two names there and are two names here (refuse). No case or diacritic folding.
 */
const SELF_CUE = /(?:^|[^\p{L}'])(?:my name is|my name's|i am|i'm|this side|this is|call me)\s+/giu;
const CAP_RUN = new RegExp(String.raw`\p{Lu}[\p{L}'-]*(?: \p{Lu}[\p{L}'-]*)*`, "uy");
const HERE_RUN = /(\p{Lu}[\p{L}'-]*(?: \p{Lu}[\p{L}'-]*)*) (?:here|speaking)(?![\p{L}])/gu;
const LEADING_WORDS = new Set([...OPENER_WORDS.split(/[| ]/u), "i", "i'm", "thank", "you"]);

/** Every name a turn offers as a self-introduction (unfiltered by position), in order of appearance. */
export function selfIntroductionCandidates(raw: string): string[] {
  const text = normalise(raw), out: string[] = [];
  for (const m of text.matchAll(SELF_CUE)) {
    CAP_RUN.lastIndex = m.index! + m[0].length;
    const run = CAP_RUN.exec(text)?.[0];
    if (run) out.push(run);
  }
  for (const m of text.matchAll(HERE_RUN)) {
    const toks = m[1]!.split(" ");
    while (toks.length > 0 && LEADING_WORDS.has(toks[0]!.toLowerCase())) toks.shift();
    if (toks.length > 0) out.push(toks.join(" "));
  }
  return out.filter((c) => looksLikeAName(c) && !isDiscourseOnly(c));
}

/** Does the turn hold a self-introduction candidate that is NOT `name`? Then the turn is ambiguous and credits no name. */
export const turnHoldsOtherSelfIntroduction = (raw: string, name: string): boolean => {
  const nm = normalise(name).trim();
  return selfIntroductionCandidates(raw).some((c) => c !== nm);
};
