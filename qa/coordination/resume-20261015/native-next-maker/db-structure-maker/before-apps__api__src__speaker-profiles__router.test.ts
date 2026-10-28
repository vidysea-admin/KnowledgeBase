import { test } from "node:test";
import assert from "node:assert/strict";
import { createServer } from "../server.js";
import { buildTestDeps, fakeKeyStore } from "../fixtures.js";
import type { SpeakerProfile } from "../../../../packages/index/src/pipeline/speaker-profiles/profile.js";
import type { SpeakerProfileDeps } from "./router.js";
import { readFileSync, readdirSync, mkdirSync, writeFileSync } from "node:fs";
import { resolve, join } from "node:path";
import type { Turns, Sessions, Speakers, Sources } from "@lkb/core";
import { resolveSpeakers } from "../../../../packages/index/src/pipeline/speakers.js";
import { buildSpeakerProfile } from "../../../../packages/index/src/pipeline/speaker-profiles/profile.js";
import { createMongoSpeakerProfileDeps } from "./store.js";
import { memoryDb } from "../../../../packages/db/src/collections/speaker-suggestions.testdb.js";
import type { Db } from "mongodb";

const profile: SpeakerProfile = { personId: "person:priya", aliases: ["Priya"], identityStatus: "human-confirmed", ambiguity: null, recordedConfidence: null, identityEvidence: [{ sessionId: "s", sessionTitle: "Session", turnId: "t", tStart: 0, tEnd: 9, quote: "Welcome Priya to the panel" }], organizations: [], roles: [], unavailable: ["organizations", "roles", "claims", "topics"], claims: [], topics: [], sessions: [{ id: "s", title: "Session", date: "2026-10-14" }], attribution: [], withheld: { claims: 0, blocks: 0, identityEvidence: 0, profileFields: 0 } };
const keyStore = fakeKeyStore({ "key-a": { tenantId: "A", scopes: ["sessions"] }, "key-b": { tenantId: "B", scopes: ["sessions"] }, "key-noscope": { tenantId: "A", scopes: ["ask"] } });
async function boot(deps: SpeakerProfileDeps, keys = keyStore) {
  // No local test-only mount: this must reach the route through the central production-shaped server.
  const app = createServer(buildTestDeps({ keyStore: keys, ...{ speakerProfiles: deps } }));
  const server = app.listen(0, "127.0.0.1");
  await new Promise<void>((resolve, reject) => { server.once("listening", resolve); server.once("error", reject); });
  const address = server.address(); assert.ok(address && typeof address === "object");
  return { url: `http://127.0.0.1:${address.port}`, close: () => new Promise<void>(resolve => server.close(() => resolve())) };
}
test("route uses verified tenant, sessions scope, safe errors and private no-store", async () => {
  const calls: string[] = []; const server = await boot({ async get(tenantId) { calls.push(tenantId); return tenantId === "A" ? profile : null; } });
  const call = (key: string | null, id = "person:priya") => fetch(`${server.url}/speaker-profiles/${encodeURIComponent(id)}?tenantId=A`, { headers: { ...(key ? { authorization: `Bearer ${key}` } : {}), "X-LKB-Tenant": "A" } });
  try {
    assert.equal((await call(null)).status, 401); assert.equal((await call("revoked")).status, 401); assert.equal((await call("key-noscope")).status, 403);
    const a = await call("key-a"); assert.equal(a.status, 200); assert.equal(a.headers.get("cache-control"), "private, no-store"); assert.deepEqual(await a.json(), { profile });
    const b = await call("key-b"); assert.equal(b.status, 404); assert.equal((await b.text()).includes("Priya"), false);
    assert.equal((await call("key-a", "spk:1")).status, 400); assert.deepEqual(calls, ["A", "B"]);
  } finally { await server.close(); }
});
test("store errors hide credentials, transcript and raw exception", async () => {
  const server = await boot({ async get() { throw new Error("SECRET transcript credential"); } });
  try { const r = await fetch(`${server.url}/speaker-profiles/person:priya`, { headers: { authorization: "Bearer key-a" } }); assert.equal(r.status, 503); assert.deepEqual(await r.json(), { error: "speaker_profile_unavailable" }); }
  finally { await server.close(); }
});

test("mounted knowledge route enforces scope, request bounds, tenant and safe DTO", async () => {
  const view = { tenantId: "A", personId: "person:priya", identityStatus: "human-confirmed" as const, ambiguity: null,
    revision: "a".repeat(64), nodes: [], edges: [], statements: [{ id: "claim", text: "Visa advice", topicIds: [], evidence: profile.identityEvidence }], withheldRelationships: 0 };
  const calls: string[] = [];
  const server = await boot({ async get() { return profile; }, async getKnowledge(tenantId) { calls.push(tenantId); return view; } });
  const call = (key: string, query = "q=Visa") => fetch(`${server.url}/speaker-profiles/person:priya/knowledge?${query}`, { headers: { authorization: `Bearer ${key}` } });
  try {
    assert.equal((await call("key-noscope")).status, 403);
    assert.equal((await call("key-a", "q=x&q=y")).status, 400);
    assert.equal((await call("key-a", `q=${"x".repeat(2001)}`)).status, 400);
    const response = await call("key-a"); assert.equal(response.status, 200); assert.equal(response.headers.get("cache-control"), "private, no-store");
    const body = await response.json() as { knowledge: Record<string, unknown>; retrieval: { passages: unknown[] } };
    assert.equal("tenantId" in body.knowledge, false); assert.equal(body.knowledge.personId, "person:priya"); assert.equal(body.retrieval.passages.length, 1);
    assert.equal((await call("key-b")).status, 503); assert.deepEqual(calls, ["A", "B"]);
  } finally { await server.close(); }
});
test("actual TOC deterministic persona traverses mounted API and produces a downstream response artifact", { skip: process.env.KB_U24_PRIVATE_TOC_TESTS === "1" ? false : "HOLD: private authentic TOC input requires explicit KB_U24_PRIVATE_TOC_TESTS=1" }, async () => {
  const corpus = new URL("../../../../data/toc-migrated/", import.meta.url);
  let sample: SpeakerProfile | null = null;
  let sampleDeps: SpeakerProfileDeps | null = null;
  for (const dir of readdirSync(corpus, { withFileTypes: true }).filter(d => d.isDirectory()).sort((a, b) => a.name.localeCompare(b.name))) {
    const turns = JSON.parse(readFileSync(new URL(`${dir.name}/turns.json`, corpus), "utf8")) as Turns[];
    const session = JSON.parse(readFileSync(new URL(`${dir.name}/session.json`, corpus), "utf8")) as Sessions;
    const identity = resolveSpeakers(turns).resolved[0]; if (!identity) continue;
    const speaker: Speakers = { _id: `${session.tenantId}-${identity.personId}`, tenantId: session.tenantId, personId: identity.personId, aliases: [identity.displayName], evidence: [identity.evidence[0]!, ...identity.evidence.slice(1)] };
    // Only the pure floor over unmodified source is used. No human-confirmed or model fact is manufactured.
    sample = buildSpeakerProfile({ tenantId: session.tenantId, speaker, suggestions: [], turns, sessions: [session], claims: [], topics: [] });
    if (sample) {
      const source = JSON.parse(readFileSync(new URL(`${dir.name}/source.json`, corpus), "utf8")) as Sources;
      assert.equal(source._id, session.sourceId, "authentic session must link to its actual source");
      const fixture = memoryDb();
      fixture.seed("sources", source); fixture.seed("sessions", session); fixture.seed("speakers", speaker);
      for (const turn of turns) fixture.seed("turns", turn);
      // Add cursor limit support to the predicate-enforcing fixture; actual scopedCollection/visibility remain in use.
      const readerDb = { collection(name: string) {
        const collection = fixture.db.collection(name);
        return { findOne: (filter: Record<string, unknown>) => collection.findOne(filter), find(filter: Record<string, unknown>) {
          const cursor = collection.find(filter);
          return { toArray: () => cursor.toArray(), limit(n: number) { return { async toArray() { return (await cursor.toArray()).slice(0, n); } }; } };
        } };
      } } as unknown as Db;
      sampleDeps = createMongoSpeakerProfileDeps(readerDb);
      assert.deepEqual(await sampleDeps.get(session.tenantId, speaker.personId), sample);
      break;
    }
  }
  assert.ok(sample); assert.ok(sampleDeps); const actual = sample;
  // Original TOC records stay private/unmodified; the actual store reads an isolated own-tenant source fixture.
  const server = await boot(sampleDeps, fakeKeyStore({ "key-toc": { tenantId: "toc", scopes: ["sessions"] } }));
  try {
    const response = await fetch(`${server.url}/speaker-profiles/${encodeURIComponent(actual.personId)}`, { headers: { authorization: "Bearer key-toc" } });
    assert.equal(response.status, 200); const body = await response.json(); assert.deepEqual(body, { profile: actual });
    const out = process.env.U24_EVIDENCE_DIR;
    if (out) { mkdirSync(resolve(out), { recursive: true }); writeFileSync(join(resolve(out), "actual-toc-api-response.json"), JSON.stringify(body, null, 2)); }
    console.log(JSON.stringify({ sample: "actual-toc-mounted-api", personId: actual.personId, identityStatus: actual.identityStatus, sourceSessionId: actual.sessions[0]?.id, sourceIdentityCitations: actual.identityEvidence.length, fixtureAuthTenant: "toc", sourceDataTenant: "toc", databaseWrites: 0, providerCalls: 0, artifact: out ? join(resolve(out), "actual-toc-api-response.json") : null }));
  } finally { await server.close(); }
});
