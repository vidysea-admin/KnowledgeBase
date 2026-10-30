// Synthetic-corpus benchmark for D-206 K1/K2/K5. In-memory fake exercising the same Mongo access pattern; no live DB.
import { createMongoSearchDeps as newDeps } from "../../../apps/api/src/search-store.ts";
import { createMongoSearchDeps as oldDeps } from "../../../apps/api/src/search-store.oldbench.ts";
import { createAskArmsFor as newArms } from "../../../apps/api/src/ask/ask-arms.ts";
import { createAskArmsFor as oldArms } from "../../../apps/api/src/ask/ask-arms.oldbench.ts";

type Row = Record<string, unknown>;
let seed = 2026;
const rand = () => (seed = (seed * 1103515245 + 12345) & 0x7fffffff) / 0x7fffffff;
const stop = ["the", "in", "for", "of", "to", "a", "is", "and", "uk", "it", "on", "with", "are", "you"];
const content = ["students", "visa", "university", "course", "admission", "scholarship", "loan", "ielts", "canada", "germany", "masters", "fees", "intake", "deadline",
  "counselling", "application", "document", "interview", "budget", "rent", "accommodation", "toronto", "london", "berlin", "program", "degree", "work", "permit", "bank", "statement",
  "gre", "gmat", "profile", "essay", "recommendation", "ranking", "cost", "living", "expenses", "part", "time", "job", "post", "study", "country", "options", "agent", "offer", "letter", "cas"];
const pick = <T,>(a: T[]) => a[Math.min(a.length - 1, Math.floor(Math.pow(rand(), 1.6) * a.length))]!;

const TENANT = "toc", SESSIONS = 25, TURNS = 3000;
const sessions: Row[] = [], sources: Row[] = [], turns: Row[] = [];
for (let s = 0; s < SESSIONS; s++) {
  sources.push({ _id: `src${s}`, tenantId: TENANT, kind: "recording", path: `p${s}`, consent: { given: true, recordedBy: "owner" } });
  sessions.push({ _id: `s${s}`, tenantId: TENANT, sourceId: `src${s}`, title: `Session ${s}`, date: "2026-01-01", status: { transcribe: "done", index: "done" } });
}
for (let i = 0; i < TURNS; i++) {
  const words = Array.from({ length: 12 + Math.floor(rand() * 25) }, () => (rand() < 0.45 ? stop[Math.floor(rand() * stop.length)]! : pick(content)));
  // keep "toronto" rare and "students" common, like the live corpus (rare 0.2s, mid 5.7s, common 23.6s)
  turns.push({ _id: `t${i}`, tenantId: TENANT, sessionId: `s${i % SESSIONS}`, speakerRef: "spk:0", tStart: i, tEnd: i + 1, text: words.join(" ") });
}

function values(value: unknown, keys: string[]): unknown[] {
  if (!keys.length) return [value];
  if (Array.isArray(value)) return value.flatMap((item) => values(item, keys));
  return values(value && typeof value === "object" ? (value as Row)[keys[0]!] : undefined, keys.slice(1));
}
function matches(filter: Row, doc: Row): boolean {
  return Object.entries(filter).every(([key, cond]) => {
    if (key === "$or") return (cond as Row[]).some((b) => matches(b, doc));
    const found = values(doc, key.split("."));
    if (cond && typeof cond === "object") {
      const o = cond as Row;
      if ("$in" in o) return found.some((v) => (o.$in as unknown[]).includes(v));
      if ("$regex" in o) return found.some((v) => typeof v === "string" && new RegExp(String(o.$regex), String(o.$options)).test(v));
    }
    return found.some((v) => v === cond);
  });
}
const sleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));
function makeDb(latencyMs: number) {
  const stats = { calls: 0, rows: 0 };
  const data: Record<string, Row[]> = { turns, sessions, sources, transcript_reviews: [], whatsapp_candidates: [], claims: [], whatsapp_review_log: [], chunks: [] };
  const db = { collection: (name: string) => ({
    find: (filter: Row = {}) => { stats.calls++; let max = Infinity;
      const cur = { limit(n: number) { max = n; return cur; }, toArray: async () => { if (latencyMs) await sleep(latencyMs); const r = (data[name] ?? []).filter((d) => matches(filter, d)).slice(0, max); stats.rows += r.length; return structuredClone(r); } };
      return cur; },
    findOne: async (filter: Row = {}) => { stats.calls++; if (latencyMs) await sleep(latencyMs); const r = (data[name] ?? []).find((d) => matches(filter, d)); return structuredClone(r ?? null); },
  }) };
  return { db: db as never, stats };
}

const QUESTIONS = ["cost of living in Toronto for students", "IELTS requirement for UK masters", "best universities in Canada", "visa requirements for Germany", "students"];
const med = (a: number[]) => [...a].sort((x, y) => x - y)[Math.floor(a.length / 2)]!;

async function timeSearch(label: string, mk: (db: never) => { search: (t: string, q: string, k: number) => Promise<unknown[]> }, latencyMs: number, reps: number, questions = QUESTIONS) {
  for (const q of questions) {
    const times: number[] = []; let calls = 0, hits = 0;
    for (let r = 0; r < reps; r++) {
      const { db, stats } = makeDb(latencyMs);
      const deps = mk(db); // fresh deps each rep => cold cache, same as a first request
      const t0 = performance.now(); const out = await deps.search(TENANT, q, 5); times.push(performance.now() - t0); calls = stats.calls; hits = out.length;
    }
    console.log(`${label} | lat=${latencyMs}ms | ${JSON.stringify(q).padEnd(42)} | median ${med(times).toFixed(0).padStart(6)} ms | db calls ${String(calls).padStart(6)} | hits ${hits}`);
  }
}

const mode = process.argv[2] ?? "all";
const tick = performance.now(); await sleep(1); const resolution = performance.now() - tick;
console.log(`corpus: ${TURNS} turns / ${SESSIONS} sessions; timer sleep(1) actually took ${resolution.toFixed(2)} ms`);
const candidateCounts: string[] = [];
for (const q of QUESTIONS) {
  const tokens = [...new Set(q.toLowerCase().match(/[\p{L}\p{M}\p{N}_]+/gu) ?? [])];
  const n = turns.filter((t) => tokens.some((tok) => new RegExp(tok, "i").test(String(t.text)))).length;
  candidateCounts.push(`${JSON.stringify(q)}: ${n} candidate turns`);
}
console.log(candidateCounts.join("\n"));
if (mode === "all" || mode === "new") {
  console.log("--- AFTER (D-206), cache cold ---");
  await timeSearch("after /search", (db) => newDeps({ db }), 0, 5);
  await timeSearch("after /search", (db) => newDeps({ db }), 1, 3);
  console.log("--- AFTER, cache warm (same deps, 2nd identical request) ---");
  const { db, stats } = makeDb(1); const deps = newDeps({ db }); await deps.search(TENANT, QUESTIONS[0]!, 5); const before = stats.calls;
  const t0 = performance.now(); await deps.search(TENANT, QUESTIONS[0]!, 5); console.log(`warm repeat: ${(performance.now() - t0).toFixed(0)} ms, ${stats.calls - before} db calls (fingerprint reads only)`);
}
if (mode === "all" || mode === "old") {
  console.log("--- BEFORE (HEAD 1c864477) ---");
  await timeSearch("before /search", (db) => oldDeps({ db }), 0, 1);
}
if (mode === "oldlat") {
  console.log("--- BEFORE with simulated 1ms round trip, 'students' + 1 natural question ---");
  await timeSearch("before /search", (db) => oldDeps({ db }), 1, 1, ["students", QUESTIONS[2]!]);
}
if (mode === "all" || mode === "arms") {
  console.log("--- /ask arms (lexical arm only, no embedder) ---");
  for (const [label, mk] of [["before arms", oldArms], ["after  arms", newArms]] as const) {
    for (const lat of [0, 1]) {
      if (label === "before arms" && lat === 1 && mode !== "armslat") continue;
      for (const q of QUESTIONS.slice(0, 2).concat(["students"])) {
        const { db, stats } = makeDb(lat); const tree = { node_id: "tenant:toc", title: "t", level: "tenant", summary: "", children: sessions.map((s) => ({ node_id: `tenant:toc/session:${s._id}`, title: String(s._id), level: "session", summary: "", children: [], evidence: { sessionRef: s._id } })) };
        const t0 = performance.now(); const out = await (mk as typeof newArms)({ db })(TENANT)(q, tree as never); const ms = performance.now() - t0;
        console.log(`${label} | lat=${lat}ms | ${JSON.stringify(q).padEnd(42)} | ${ms.toFixed(0).padStart(6)} ms | db calls ${String(stats.calls).padStart(6)} | nodes ${out.arms.flat().length} | degraded ${out.degraded}`);
      }
    }
  }
}
