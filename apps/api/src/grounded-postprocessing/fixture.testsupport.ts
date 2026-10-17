import type { Job, Provider } from "@lkb/ai";
import type { Turns, Sessions, Sources } from "@lkb/core";
import type { buildIndexer } from "../composition/production.js";
import { transactionalFixture } from "../transcript-review/refresh-testkit.js";

export const QUESTION = "When does the registration window open?";
export const ANSWER = "The registration window opens on the first of April.";
export const FACT = "The programme fee is 1,000 rupees today.";
export const ACTION = "I will send the application checklist tomorrow.";
export const session: Sessions = { _id: "s1", tenantId: "t", sourceId: "src1", title: "Fee registration", org: "Acme University",
  date: "2026-10-14", status: { transcribe: "done", index: "pending" } };
export const source: Sources = { _id: "src1", tenantId: "t", kind: "recording", captureMode: "provided", path: "offline-fixture.wav",
  hash: "offline-fixture-source", consent: { given: true, recordedBy: "offline-fixture" }, createdAt: "2026-10-14T10:00:00Z" };
export const turns: Turns[] = [QUESTION, ANSWER, FACT, ACTION].map((text, index) => ({
  _id: `turn-${index}`, tenantId: "t", sessionId: "s1", speakerRef: index ? "speaker:host" : "speaker:attendee",
  text, tStart: index * 3, tEnd: index * 3 + 2,
}));
const evidence = (index: number) => [{ turnId: turns[index]!._id, sessionId: "s1", quote: turns[index]!.text }];

/** Explicit offline Provider seam; no network, subprocess, live database or authentic-model claim. */
export function routedFixture({ judgeFails = false } = {}) {
  const kinds: string[] = [], jobs: Record<string, unknown>[] = [];
  const provider: Provider = {
    name: "fixture", listModels: async () => [{ id: "fixture", label: "offline fixture" }],
    async complete(job: Job) {
      kinds.push(job.kind);
      let response: unknown;
      if (job.kind === "note-judge") {
        if (judgeFails) throw new Error("fixture judge unavailable");
        const blocks = [...job.messages[1]!.content.matchAll(/<<<NOTE_ITEM \d+>>>\n([^\n]+)\n<<<END_NOTE_ITEM \d+>>>/g)]
          .map((match) => JSON.parse(match[1]!) as { id: string });
        response = { verdicts: blocks.map((row) => ({ id: row.id, verdict: "same", reason: "source preserved" })) };
      } else {
        let payload: Record<string, any>;
        try { payload = JSON.parse(job.messages[1]!.content); } catch { payload = {}; }
        if (payload.phase === "extract-summary") response = {
          processed: payload.inventory,
          items: [
            { kind: "insight", text: FACT, origin: "speaker-statement", verification: "unverified", evidence: evidence(2) },
            { kind: "action", text: ACTION, origin: "speaker-statement", verification: "unverified", evidence: evidence(3) },
          ],
          qa: [{ question: QUESTION, questionEvidence: evidence(0), answer: ANSWER, answerEvidence: evidence(1), status: "answered" }],
        };
        else if (payload.phase === "extract-claims") response = { processed: payload.inventory, claims: [
          { text: FACT, origin: "speaker-statement", verification: "unverified", evidence: evidence(2) },
        ] };
        else if (payload.items) response = { processed: payload.inventory, complete: true, noContent: false, noClaims: false,
          verdicts: payload.items.map((item: { id: string }) => ({ id: item.id, supported: true, categoryCorrect: true, answerRelevant: true })) };
        else response = job.kind === "claims" ? [] : { summary: "Legacy summary", keyInsights: [], decisions: [], actionItems: [] };
      }
      return { text: JSON.stringify(response), json: response, usage: { inputTokens: 1, outputTokens: 1 }, provider: "fixture", model: "fixture", costUsd: 0 };
    },
    async embed(job) { kinds.push("embedding"); return { vectors: job.texts.map(() => [0.1, 0.2, 0.3]), dims: 3, provider: "fixture", model: "fixture" }; },
  };
  const routing: NonNullable<Parameters<typeof buildIndexer>[0]> = {
    chains: { summarize: ["fixture"], claims: ["fixture"], "note-judge": ["fixture"], embedding: ["fixture"] },
    providers: { fixture: provider }, jobWrite: async (job) => { jobs.push({ ...job }); },
  };
  return { routing, kinds, jobs };
}

export function fixture(options: Parameters<typeof routedFixture>[0] = {}) {
  const state = transactionalFixture();
  state.seed("sessions", session); state.seed("sources", source);
  for (const turn of turns) state.seed("turns", turn);
  return { ...state, ...routedFixture(options) };
}
