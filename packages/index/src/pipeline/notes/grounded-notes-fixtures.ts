/** Shared fake-model fixtures for the T-040 grounded-notes tests (moved verbatim out of grounded-notes.test.ts). */
import type { Turns } from "@lkb/core";
import type { CompleteResult, Job } from "@lkb/ai";
import { summarizeSession } from "../summarize.js";

export type Obj = Record<string, any>;
export const SID = "s1";
export function turn(id: string, speakerRef: string, text: string, tStart = 0, tEnd = tStart + 1, sessionId = SID): Turns {
  return { _id: id, tenantId: "t1", sessionId, speakerRef, tStart, tEnd, text };
}
export const reply = (o: unknown): CompleteResult => ({ text: JSON.stringify(o), usage: { inputTokens: 1, outputTokens: 1 }, provider: "fake", model: "fake-1", costUsd: 0 });
export const ev = (turnId: string, quote: string, sessionId = SID) => ({ turnId, sessionId, quote });

export interface Script {
  /** the fake model's extraction for one window */
  extract: (spans: Obj[], p: Obj) => { items?: Obj[]; qa?: Obj[]; claims?: Obj[] };
  answers?: (questions: Obj[], spans: Obj[]) => Obj[];
  verdict?: (id: string, mode: string, p: Obj) => Partial<{ supported: boolean; categoryCorrect: boolean; answerRelevant: boolean }>;
  mutate?: (phase: string, r: Obj) => void;
}
/** A scripted fake model for the summarize + claims seams. */
export function model(s: Script) {
  return async (job: Job): Promise<CompleteResult> => {
    const p = JSON.parse(job.messages[1]!.content) as Obj;
    let r: Obj;
    if (p.phase === "extract-summary" || p.phase === "extract-claims") r = { processed: p.inventory, items: [], qa: [], claims: [], ...s.extract(p.spans, p) };
    else if (p.phase === "reconcile-questions") r = { processed: p.inventory, answers: (s.answers?.(p.questions, p.spans) ?? p.questions.map((q: Obj) => ({ id: q.id, answer: null, answerEvidence: [] }))) };
    else r = { processed: p.inventory, complete: true, noContent: p.items.length === 0, noClaims: p.items.length === 0,
      verdicts: p.items.map((i: Obj) => ({ id: i.id, supported: true, categoryCorrect: true, answerRelevant: true, ...s.verdict?.(i.id, p.mode, p) })) };
    s.mutate?.(p.phase, r);
    return reply(r);
  };
}
export const item = (kind: string, turnId: string, quote: string, extra: Obj = {}) => ({ kind, text: quote, origin: "speaker-statement", verification: "unverified", evidence: [ev(turnId, quote)], ...extra });
export const run = (turns: Turns[], m: ReturnType<typeof model>, drop = true) => summarizeSession(turns, m, { strictWebinar: true, dropUnverified: drop });
export const kindOf = (p: Obj, id: string) => (p.items as Obj[]).find((i) => i.id === id)?.kind;

export const FEE = "The programme fee is 1,000 rupees today.";
export const DEC = "We decided to open the intake in March.";
export const ACT = "Priya will send the brochure by Friday.";
export const base = () => [turn("t1", "spk:0", FEE, 0, 5), turn("t2", "spk:1", DEC, 10, 14), turn("t3", "spk:1", ACT, 20, 24)];
export const Q = "What is the application deadline for the scholarship?";
export const A = "The scholarship deadline is the fifteenth of March.";
export const THANKS = "Thank you everyone for joining today.";
