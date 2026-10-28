// Checker-owned Mode D harness API (synthetic data, in-memory, no Mongo, localhost only).
// REAL code under test: requireAuth/requireScope, createOutputRouter, createOutputService (evidence builder, synthesis,
// validator, markdown). FAKE: the repository (memory), the source reader (3 synthetic claims) and the model provider.
import { createRequire } from "node:module";
const express = createRequire(new URL("../../../apps/api/package.json", import.meta.url))("express") as typeof import("express");
import { requireAuth } from "../../../apps/api/src/auth.ts";
import { createOutputRouter } from "../../../apps/api/src/knowledge-outputs/router.ts";
import { createOutputService } from "../../../apps/api/src/knowledge-outputs/service.ts";
import { createMemoryOutputRepository } from "../../../apps/api/src/knowledge-outputs/repository.ts";

const PORT = Number(process.env.HARNESS_PORT ?? 3391);
const turns = [
  { _id: "t1", tenantId: "a", sessionId: "s1", speakerRef: "speaker:1", speakerLabel: "Admissions expert", tStart: 3, tEnd: 9, text: "Applications open Monday. The board decided to extend the deadline." },
  { _id: "t2", tenantId: "a", sessionId: "s1", speakerRef: "speaker:2", speakerLabel: "Financial aid officer", tStart: 40, tEnd: 52, text: "Scholarship forms are due on the fifteenth. Bring two references." },
  { _id: "t3", tenantId: "a", sessionId: "s1", speakerRef: "speaker:3", speakerLabel: "Registrar", tStart: 70, tEnd: 80, text: "Transcripts are waived entirely this year." },
];
const claims = [
  { _id: "c1", tenantId: "a", text: "Applications open Monday.", status: "verified", evidence: [{ turnId: "t1", sessionId: "s1", quote: "Applications open Monday." }] },
  { _id: "c2", tenantId: "a", text: "Scholarship forms are due on the fifteenth.", status: "needs-review", evidence: [{ turnId: "t2", sessionId: "s1", quote: "Scholarship forms are due on the fifteenth." }] },
  { _id: "c3", tenantId: "a", text: "Transcripts are waived entirely this year.", status: "conflicting", evidence: [{ turnId: "t3", sessionId: "s1", quote: "Transcripts are waived entirely this year." }] },
];
const sessionRow = { _id: "s1", tenantId: "a", title: "Admissions briefing (synthetic)", date: "2026-10-14", status: { transcribe: "done", index: "done" } };
const deps = {
  repository: createMemoryOutputRepository(),
  now: () => new Date("2026-10-28T12:00:00.000Z"),
  readSources: async (tenantId: string) => tenantId === "a" ? structuredClone({ sessions: [sessionRow], claims, turns }) : { sessions: [], claims: [], turns: [] },
  policy: async (_t: string, sel: { questionClass: string }) => ({ status: "none", questionClass: sel.questionClass }),
  complete: async (_t: string, job: any) => {
    const prompt = JSON.parse(job.messages[1].content);
    let json: any;
    if (prompt.items) json = { checks: prompt.items.map((i: any) => ({ id: i.id, supported: true })) };
    else json = { sections: [{ key: "faq", items: (prompt.evidence ?? []).map((e: any) => ({ text: `Q: What does this source state?\nA: ${e.quote}`, citationIds: [e.id] })) }] };
    return { text: JSON.stringify(json), json, provider: "harness-fake", model: "harness-fake", usage: { inputTokens: 1, outputTokens: 1 }, costUsd: 0 };
  },
};
const service = createOutputService(deps as never);
const app = express();
const seen: string[] = [];
app.use((req, res, next) => {
  res.set("Access-Control-Allow-Origin", "*"); res.set("Access-Control-Allow-Headers", "Authorization, Content-Type"); res.set("Access-Control-Allow-Methods", "GET,POST,PUT,OPTIONS");
  if (req.method === "OPTIONS") { res.sendStatus(204); return; }
  seen.push(`${req.method} ${req.url}`); next();
});
app.use(express.json());
app.get("/__seen", (_q, r) => { r.json(seen); });
app.use(requireAuth({ verify: async (key: string) => key === "checker-key" ? { tenantId: "a", keyId: "k1", scopes: ["sessions", "ask"] } : null } as never));
app.get("/sessions", (_q, r) => { r.json({ sessions: [sessionRow] }); });
app.get("/sessions/s1", (_q, r) => {
  r.json({ session: sessionRow, page: { summary: "Synthetic briefing." }, claims: claims.map(({ _id, text, status }) => ({ _id, text, status })),
    turns: turns.map(({ _id, speakerRef, speakerLabel, tStart, tEnd, text }) => ({ _id, speakerRef, speakerLabel, tStart, tEnd, text })) });
});
app.use(createOutputRouter(service));
app.listen(PORT, "127.0.0.1", () => console.log(`harness listening ${PORT}`));
