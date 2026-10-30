/** Shared fixtures for the output workbench tests (tests only; no I/O, no database). */
import type { CompleteResult } from "@lkb/ai";
import type { Claims, Sessions, Turns } from "@lkb/core";
import { createOutputService } from "./service.js";
import { createMemoryOutputRepository } from "./repository.js";
import { OutputError, sectionDefinitions, type OutputDeps, type OutputInput, type OutputSources } from "./types.js";

export const turn = (): Turns => ({ _id: "t1", tenantId: "a", sessionId: "s1", speakerRef: "speaker:1", speakerLabel: "Admissions expert", tStart: 3, tEnd: 9, text: "Applications open Monday. The board decided to extend the deadline." });
export const claim = (): Claims => ({ _id: "c1", tenantId: "a", text: "Applications open Monday.", status: "verified", evidence: [{ turnId: "t1", sessionId: "s1", quote: "Applications open Monday." }] });
export const input = (kind: OutputInput["kind"] = "faq"): OutputInput => ({ kind, title: "Application preparation", purpose: "Prepare admissions questions for Monday", sessionIds: ["s1"] });
export function fixture() {
  let sources: OutputSources = { sessions: [{ _id: "s1", tenantId: "a" } as Sessions], claims: [claim()], turns: [turn()] };
  let supported = true, invalid = false, calls = 0, fail = false;
  let kind: OutputInput["kind"] = "faq";
  const repository = createMemoryOutputRepository();
  const deps: OutputDeps = { repository, now: () => new Date("2026-10-14T12:00:00.000Z"),
    readSources: async (tenantId) => tenantId === "a" ? structuredClone(sources) : { sessions: [], claims: [], turns: [] },
    policy: async (_tenant, selection) => ({ status: "none", questionClass: selection.questionClass }),
    complete: async (_tenant, job): Promise<CompleteResult> => {
      calls++; if (fail) throw new Error("provider SECRET source content");
      const prompt = JSON.parse(job.messages[1]!.content) as { items?: { id: string; text: string }[]; evidence?: { quote: string }[] };
      const json = prompt.items ? { checks: prompt.items.map((i) => ({ id: i.id, supported: supported && !i.text.includes("free tuition") })) }
        : { sections: sectionDefinitions[kind].map((s) => ({ key: s.key, items: s.key === "decisions" ? [] : [{ text: s.kind === "fact" ? (kind === "faq" ? `Q: What does this source state?\nA: ${prompt.evidence?.[0]?.quote ?? ""}` : `${prompt.evidence?.[0]?.quote ?? ""}`) : s.kind === "question" ? "When should we prepare the application?" : "Suggestion: discuss the Monday application opening.", citationIds: [invalid ? "invented" : "e1"] }] })) };
      return { text: JSON.stringify(json), json, provider: "fixture-provider", model: "fixture-model", usage: { inputTokens: 100, outputTokens: 50 }, costUsd: 0 };
    } };
  return { deps, service: createOutputService(deps), repository,
    setKind: (v: OutputInput["kind"]) => { kind = v; }, setSources: (v: OutputSources) => { sources = v; }, sources: () => sources,
    setSupported: (v: boolean) => { supported = v; }, setInvalid: () => { invalid = true; }, setFailure: () => { fail = true; }, calls: () => calls };
}

export const refuses = (code: string) => (e: unknown) => e instanceof OutputError && e.code === code;
