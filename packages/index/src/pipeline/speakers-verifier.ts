/**
 * packages/index/src/pipeline/speakers-verifier.ts -- U2.4 cycle 2 (D-132, pending append): the VERIFIER half.
 *
 * Cycle 0-1 tried to decide "does this quote show that THIS label is that person?" with hand-written kind/position
 * regexes. They were both too strict (they killed ~100 correct proposals in the live re-gate) and too loose (a second
 * name in the quote, a one-turn backchannel). The owner asked for judgement, not more regex. So the question is now put
 * to a second, independently framed model call that sees a WINDOW of turns and answers one strict JSON question. The
 * verifier is a plain injectable function, so tests and offline replays fake it.
 */
import type { Turns } from "@lkb/core";
import type { CompleteResult, Job } from "@lkb/ai";
import { parseJsonLoose } from "@lkb/ai";

export type Verdict = "yes" | "no" | "unsure";
export interface VerifierQuestion {
  label: string;
  name: string;
  quote: string;
  quoteTurnId: string;
  /** Turn indexes of the label block the evidence is being tested against. */
  blockStart: number;
  blockEnd: number;
  /** Turns before the block, the block's opening and the quote turn, as `[id:..] [label] text` lines. */
  window: string;
  /** 0..VERIFIER_FRAMINGS-1: each vote uses a different framing (a different prompt, not a different temperature). */
  framing: number;
}
export interface VerifierAnswer { verdict: Verdict; turnId?: string }
export type SpeakerVerifier = (q: VerifierQuestion) => Promise<VerifierAnswer>;

export const VERIFIER_FRAMINGS = 3;
export const WINDOW_BEFORE = 4;
export const WINDOW_OPENING = 2;
const MAX_TURN_CHARS = 320;

/** The turns the verifier sees. Duplicates (quote turn already inside the span) are not repeated. */
export function buildVerifierWindow(turns: Turns[], blockStart: number, blockEnd: number, quoteIdx: number): string {
  const idx = new Set<number>();
  for (let i = Math.max(0, blockStart - WINDOW_BEFORE); i <= Math.min(turns.length - 1, blockStart + WINDOW_OPENING - 1, blockEnd); i++) idx.add(i);
  idx.add(quoteIdx);
  return [...idx].sort((a, b) => a - b).map((i) => {
    const t = turns[i];
    const text = (t?.text ?? "").length > MAX_TURN_CHARS ? `${(t?.text ?? "").slice(0, MAX_TURN_CHARS)}...` : (t?.text ?? "");
    return `[id:${t?._id}] [${t?.speakerRef}] ${text}`;
  }).join("\n");
}

const FRAMES: readonly string[] = [
  "You are checking a claim about a transcript. Decide whether the evidence PROVES the claim, and answer yes only if it does.",
  "A colleague says one anonymous speaker is a named person. Play devil's advocate: look for any reading in which the name belongs to someone else (the previous speaker, the next speaker, a person merely mentioned). Answer yes only if no such reading is plausible.",
  "Read the turns as a human minute-taker would. Who is actually talking in the block that starts after the quoted line? Answer yes only if the transcript itself makes it clear that this speaker is the named person.",
];

export function verifierMessages(q: VerifierQuestion): Job["messages"] {
  return [
    { role: "system", content: `${FRAMES[q.framing % FRAMES.length]} Respond with ONLY JSON: {"verdict": "yes" | "no" | "unsure", "turnId": "<the id of the turn that shows it, or empty>"}. Prefer "unsure" to a guess.` },
    { role: "user", content: [
      `Claim: the speaker labelled ${q.label}, in the stretch of turns that begins at [id:...] marked ${q.label} below, IS ${q.name}.`,
      `Quoted evidence: "${q.quote}" (turn ${q.quoteTurnId}).`,
      `Question: does this evidence show that speaker ${q.label} IS ${q.name}? yes / no / unsure.`,
      "", q.window,
    ].join("\n") },
  ];
}

/** A verifier backed by a model call. Anything unparseable is "unsure" (never a yes). */
export function llmVerifier(complete: (job: Job) => Promise<CompleteResult>): SpeakerVerifier {
  return async (q) => {
    try {
      const c = await complete({ kind: "speakers", messages: verifierMessages(q) });
      const parsed = (c.json ?? parseJsonLoose(c.text)) as { verdict?: unknown; turnId?: unknown } | null;
      const v = typeof parsed?.verdict === "string" ? parsed.verdict.toLowerCase().trim() : "";
      const turnId = typeof parsed?.turnId === "string" && parsed.turnId ? parsed.turnId : undefined;
      return { verdict: v === "yes" || v === "no" ? v : "unsure", turnId };
    } catch {
      return { verdict: "unsure" };
    }
  };
}
