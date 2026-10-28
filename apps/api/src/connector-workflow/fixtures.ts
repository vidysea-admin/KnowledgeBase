import { isIP } from "node:net";
/** Test-only Mongo/transport stand-ins. Real pipeline, auth, router, stores and indexing run over these rows. */
import { Router, type Request, type Response } from "express";
import type { Db } from "mongodb";
import type { Sources, Media, Sessions, Turns } from "@lkb/core";
import type { NoteJudge } from "@lkb/index";
import { scopedCollection } from "@lkb/db";
import { createGuardedFetcher, createUrlSource, createZoomRecordingSource } from "@lkb/ingest";
import { requireAuth } from "../auth.js";
import { createMongoIntakeSink, createSourceIntakeDeps, type ScopedColl } from "../source-intake/store.js";
import { indexSession } from "../indexing/session.js";
import { embedOk } from "../indexing/testutils.js";
import { createConnectorMongoStore } from "./mongo-store.js";
import { createConnectorWorkflowRouter } from "./router.js";
import type { ConnectorWorkflowDeps } from "./types.js";

type Row = Record<string, any>;
function at(row: Row, path: string): unknown { return path.split(".").reduce<any>((v, p) => v?.[p], row); }
function matches(row: Row, filter: Row): boolean {
  return Object.entries(filter).every(([key, value]) => {
    const actual = at(row, key);
    if (value && typeof value === "object" && !Array.isArray(value)) {
      if ("$in" in value) return value.$in.includes(actual);
      if ("$nin" in value) return !value.$nin.includes(actual);
      if ("$exists" in value) return (actual !== undefined) === value.$exists;
      if ("$gt" in value) return String(actual) > String(value.$gt);
    }
    if (key === "evidence.sessionId") return row.evidence?.some((e: Row) => e.sessionId === value);
    return actual === value;
  });
}
function setAt(row: Row, path: string, value: unknown) {
  const keys = path.split("."); let target = row;
  for (const key of keys.slice(0, -1)) target = target[key] ??= {};
  target[keys[keys.length - 1]!] = value;
}
export function connectorFixture() {
  const tables = new Map<string, Row[]>();
  const writes: { name: string; filter?: Row; docs?: Row[] }[] = [];
  let acknowledge = true;
  const rows = (name: string): Row[] => { if (!tables.has(name)) tables.set(name, []); return tables.get(name)!; };
  const db = { collection(name: string) {
    return {
      find(filter: Row = {}) {
        let limit = Infinity;
        let order: Row = {};
        const cursor = { limit(n: number) { limit = n; return cursor; }, sort(value: Row) { order = value; return cursor; }, toArray: async () => {
          let selected = rows(name).filter((row) => matches(row, filter));
          if (order._id) selected = [...selected].sort((a, b) => String(a._id).localeCompare(String(b._id)) * order._id);
          return structuredClone(selected.slice(0, limit));
        } };
        return cursor;
      },
      findOne: async (filter: Row = {}) => structuredClone(rows(name).find((row) => matches(row, filter)) ?? null),
      async insertOne(doc: Row) {
        if (rows(name).some((r) => r._id === doc._id)) throw new Error("duplicate");
        writes.push({ name, docs: [structuredClone(doc)] }); rows(name).push(structuredClone(doc)); return { acknowledged: acknowledge };
      },
      async insertMany(docs: Row[]) { writes.push({ name, docs: structuredClone(docs) }); rows(name).push(...structuredClone(docs)); return { acknowledged: acknowledge }; },
      async deleteMany(filter: Row) {
        writes.push({ name, filter }); tables.set(name, rows(name).filter((row) => !matches(row, filter))); return { acknowledged: acknowledge };
      },
      async updateOne(filter: Row, update: Row, options: Row = {}) {
        writes.push({ name, filter });
        let row = rows(name).find((r) => matches(r, filter));
        if (!row && options.upsert) { row = structuredClone(filter); rows(name).push(row!); }
        if (!row) return { acknowledged: acknowledge, matchedCount: 0 };
        for (const [k, v] of Object.entries(update.$set ?? {})) setAt(row, k, structuredClone(v));
        for (const [k, v] of Object.entries(update.$setOnInsert ?? {})) if (row[k] === undefined) row[k] = structuredClone(v);
        return { acknowledged: acknowledge, matchedCount: 1 };
      },
      async replaceOne(filter: Row, doc: Row, options: Row = {}) {
        writes.push({ name, filter, docs: [structuredClone(doc)] });
        const found = rows(name).some(row => matches(row, filter));
        if (!found && !options.upsert) return { acknowledged: acknowledge, matchedCount: 0 };
        tables.set(name, [...rows(name).filter((r) => !matches(r, filter)), structuredClone(doc)]); return { acknowledged: acknowledge, matchedCount: found ? 1 : 0, upsertedCount: found ? 0 : 1 };
      },
    };
  } } as unknown as Pick<Db, "collection">;
  let sequence = 0;
  let clock = "2026-10-14T00:00:00.000Z";
  let text = "UK student visa guidance is available from the official portal.\n\nCheck current visa conditions before applying.";
  let failTransport = false;
  let failIndex = false;
  let strictIndex = false;
  let groundedIndex = false;
  let fetches = 0;
  let indexes = 0;
  const fixtureJudge: NoteJudge = async batch => ({ verdicts: batch.map(item => ({ id: item.id,
    verdict: "same" as const, reason: "synthetic source-support verdict" })), costUsd: 0, model: "fixture/judge" });
  const fetcher = createGuardedFetcher({
    lookup: async (host: string) => isIP(host.replace(/^\[|\]$/g, "")) ? [host.replace(/^\[|\]$/g, "")] : ["93.184.216.34"], // literal IPs resolve to themselves, as dns.lookup does
    request: async (_url, options) => { fetches++; if (options.address !== "93.184.216.34") throw new Error("unpinned"); if (failTransport) throw new Error("secret-token: fixture failure"); return { status: 200, body: text, location: null }; },
  });
  const sink = createMongoIntakeSink({
    sources: (t) => scopedCollection<Sources>(db as Db, "sources")(t) as unknown as ScopedColl<Sources>,
    media: (t) => scopedCollection<Media>(db as Db, "media")(t) as unknown as ScopedColl<Media>,
    sessions: (t) => scopedCollection<Sessions>(db as Db, "sessions")(t) as unknown as ScopedColl<Sessions>,
    turns: (t) => scopedCollection<Turns>(db as Db, "turns")(t) as unknown as ScopedColl<Turns>,
  });
  const boundIndex: ConnectorWorkflowDeps["indexSession"] = async (tenantId, sessionId) => {
    indexes++;
    if (failIndex) throw new Error("secret-token: fixture index failure");
    const first = rows("turns").find((t) => t.tenantId === tenantId && t.sessionId === sessionId);
    const complete = async (job: { kind: string; messages: { content: string }[] }) => {
      let result: unknown;
      if (strictIndex) {
        const input = JSON.parse(job.messages[1]!.content);
        const claims = input.spans.map((span: any) => ({ text: span.text, origin: span.origin, verification: "unverified",
          evidence: [{ turnId: span.turnId, sessionId: span.sessionId, quote: span.text }] }));
        if (input.phase === "extract-summary") result = { processed: input.inventory, items: claims.map((claim: any) => ({ ...claim, kind: "insight" })), qa: [] };
        else if (input.phase === "extract-claims") result = { processed: input.inventory, claims };
        else result = { processed: input.inventory, complete: true, noContent: false,
          verdicts: input.items.map((item: any) => ({ id: item.id, supported: true, categoryCorrect: true, answerRelevant: true })) };
      } else result = job.kind === "claims" ? [{ text: first?.text ?? "", turnIds: [first?._id] }] : {
        summary: first?.text ?? "", keyInsights: [], decisions: [], actionItems: [],
      };
      return { text: JSON.stringify(result), provider: "fixture", model: "fixture", usage: { inputTokens: 0, outputTokens: 0 } };
    };
    return indexSession(tenantId, sessionId, { db, complete: complete as never, embed: embedOk, strictWebinar: strictIndex,
      ...(groundedIndex ? { dropUnverified: true, noteJudge: fixtureJudge } : {}),
      extractDecisions: false, suggestSpeakers: false });
  };
  const deps: ConnectorWorkflowDeps = {
    store: createConnectorMongoStore({ MONGODB_DB: "t053_fixture" }, db),
    capabilities: [{ id: "url", label: "Public URL", state: "configured", detail: "Fixture transport" }],
    watched: { fetcher, sink, indexSession: boundIndex }, indexSession: boundIndex,
    now: () => clock, newId: () => `fixture-${++sequence}`,
  };
  deps.sourceIntake = createSourceIntakeDeps({
    adapters: [createUrlSource({ fetcher, hasher: () => `fixture-hash-${text}`, now: deps.now })], sink, now: deps.now, newId: deps.newId,
  });
  const router = Router();
  router.use(requireAuth({ verify: async (key) => key === "a" ? { tenantId: "tenant-a", keyId: "key-a", scopes: ["sources", "ingest"] } : key === "b" ? { tenantId: "tenant-b", keyId: "key-b", scopes: ["sources", "ingest"] } : key === "no-id" ? { tenantId: "tenant-a", scopes: ["sources", "ingest"] } : key === "source" ? { tenantId: "tenant-a", keyId: "key-source", scopes: ["sources"] } : key === "read" ? { tenantId: "tenant-a", scopes: [] } : null }));
  router.use(createConnectorWorkflowRouter(deps));
  async function call(method: string, url: string, body?: unknown, key = "a"): Promise<{ status: number; body: any }> {
    return new Promise((resolve, reject) => {
      let status = 200;
      const req = { method, url, originalUrl: url, query: Object.fromEntries(new URL(url, "https://fixture.example").searchParams), body, headers: {}, header: () => `Bearer ${key}` } as unknown as Request;
      const res = { status(code: number) { status = code; return res; }, json(value: unknown) { resolve({ status, body: value }); return res; } } as unknown as Response;
      (router as any).handle(req, res, (error: unknown) => error ? reject(error) : resolve({ status: 404, body: {} }));
    });
  }
  function watch(id = "watch-a", tenantId = "tenant-a") {
    rows("watched_sources").push({ _id: id, tenantId, url: "https://public.example/visa", reputationTier: "official", checkIntervalHours: 1, active: true });
  }
  function useHostedRecording(withIndexing = false, grounded = false) {
    strictIndex = withIndexing;
    groundedIndex = grounded;
    deps.sourceIntake = createSourceIntakeDeps({ adapters: [createZoomRecordingSource({
      workDir: "/fixture-media", downloader: async () => ({ path: "/fixture-media/recording.mp4" }),
      reader: async () => new Uint8Array([1, 2, 3]), hasher: () => "fixture-recording-hash",
      transcribe: async () => [{ speakerRef: "fixture-speaker", tStart: 0, tEnd: 30, text: "Recording fixture confirms UK student visa guidance." }], now: deps.now,
    })], sink, now: deps.now, newId: deps.newId, ...(withIndexing ? { indexSession: boundIndex } : {}) });
  }
  function useSourceIntakeIndexing() {
    deps.sourceIntake = createSourceIntakeDeps({
      adapters: [createUrlSource({ fetcher, hasher: () => `fixture-hash-${text}`, now: deps.now })],
      sink, now: deps.now, newId: deps.newId, indexSession: boundIndex,
    });
  }
  return { deps, db, rows, writes, call, watch, useHostedRecording, useSourceIntakeIndexing, acknowledgeWrites: (v: boolean) => { acknowledge = v; }, setClock: (v: string) => { clock = v; }, setText: (v: string) => { text = v; }, failTransport: (v: boolean) => { failTransport = v; }, failIndex: (v: boolean) => { failIndex = v; }, counters: () => ({ fetches, indexes }) };
}
