/** Public synthetic T040 policy floor. No authentic transcript, media, provider or human approval. */
import { createHash } from "node:crypto";
import type { Db } from "mongodb";
import type { Claims, Sessions, Sources, Turns } from "@lkb/core";
import type { IndexSessionDeps } from "./session.js";

export const PUBLIC_REVIEW_QUOTE = "The fee is 5000 rupees.";
export const PUBLIC_REVIEW_PARAPHRASE = "Tuition costs five thousand rupees.";
export const PUBLIC_REVIEW_TURN: Turns = {
  _id: "t1", tenantId: "tenant-a", sessionId: "session-a", speakerRef: "person:rao", speakerLabel: "Dr Rao",
  tStart: 12, tEnd: 24, text: "The fee is 5000 rupees. Applications close in March. Please submit the form.",
};
export const PUBLIC_REVIEW_CLAIM: Claims = {
  _id: "claim1", tenantId: "tenant-a", text: PUBLIC_REVIEW_PARAPHRASE, status: "verified",
  evidence: [{ turnId: "t1", sessionId: "session-a", quote: PUBLIC_REVIEW_QUOTE }],
};

type Row = Record<string, unknown>;
function record(value: unknown): value is Row { return value !== null && typeof value === "object" && !Array.isArray(value); }
function values(value: unknown, path: string[]): unknown[] {
  if (Array.isArray(value)) return value.flatMap(item => values(item, path));
  if (!path.length) return [value];
  return record(value) ? values(value[path[0]!], path.slice(1)) : [undefined];
}
function matches(row: Row, filter: Row): boolean {
  return Object.entries(filter).every(([key, expected]) => {
    const actual = values(row, key.split("."));
    if (record(expected)) {
      if ("$exists" in expected) return actual.some(value => value !== undefined) === expected.$exists;
      if (Array.isArray(expected.$in)) return actual.some(value => (expected.$in as unknown[]).includes(value));
      if (Array.isArray(expected.$nin)) return actual.every(value => !(expected.$nin as unknown[]).includes(value));
      throw new Error("Unsupported public model query operator");
    }
    return actual.some(value => value === expected);
  });
}
function setPath(row: Row, path: string, value: unknown): void {
  const parts = path.split("."); let target = row;
  for (const part of parts.slice(0, -1)) {
    if (!record(target[part])) target[part] = {};
    target = target[part] as Row;
  }
  target[parts[parts.length - 1]!] = structuredClone(value);
}

/** ACK/CAS/readback model only: no Mongo durability, native ACL or semantic-review certification. */
export function publicPreservedReviewFixture(options: { preserveReview?: boolean; generatedParaphrase?: boolean } = {}) {
  const source: Sources = {
    _id: "source-a", tenantId: "tenant-a", kind: "recording", path: "synthetic/public-fee-recording",
    hash: createHash("sha256").update(PUBLIC_REVIEW_TURN.text).digest("hex"), captureMode: "provided",
    consent: { given: true, recordedBy: "synthetic-policy-fixture", note: "Model input; no human approval or authentic media" },
    createdAt: "2026-10-15T00:00:00.000Z",
  };
  const session: Sessions = {
    _id: "session-a", tenantId: "tenant-a", sourceId: "source-a", title: "Public synthetic fee policy",
    date: "2026-10-15", status: { transcribe: "done", index: "pending" },
  };
  const tables = new Map<string, Row[]>([
    ["sources", [structuredClone(source) as unknown as Row]],
    ["sessions", [structuredClone(session) as unknown as Row]],
    ["turns", [structuredClone(PUBLIC_REVIEW_TURN) as unknown as Row]],
    ["claims", options.preserveReview === false ? [] : [structuredClone(PUBLIC_REVIEW_CLAIM) as unknown as Row]],
  ]);
  const rows = (name: string): Row[] => { if (!tables.has(name)) tables.set(name, []); return tables.get(name)!; };
  const writes: string[] = [];
  const insert = (name: string, doc: Row) => {
    if (rows(name).some(row => row._id === doc._id)) throw new Error("Duplicate public model identity");
    rows(name).push(structuredClone(doc));
  };
  const db = { collection(name: string) {
    return {
      find(filter: Row = {}) { return { toArray: async () => structuredClone(rows(name).filter(row => matches(row, filter))) }; },
      findOne: async (filter: Row = {}) => structuredClone(rows(name).find(row => matches(row, filter)) ?? null),
      async insertOne(doc: Row) { insert(name, doc); writes.push(name); return { acknowledged: true }; },
      async insertMany(docs: Row[]) { docs.forEach(doc => insert(name, doc)); writes.push(name); return { acknowledged: true }; },
      async deleteMany(filter: Row) {
        const old = rows(name); const kept = old.filter(row => !matches(row, filter)); tables.set(name, kept); writes.push(name);
        return { acknowledged: true, deletedCount: old.length - kept.length };
      },
      async updateOne(filter: Row, update: Row, options: { upsert?: boolean } = {}) {
        if (Object.keys(update).some(key => !["$set", "$setOnInsert"].includes(key))) throw new Error("Unsupported public model update");
        let row = rows(name).find(candidate => matches(candidate, filter)); const found = Boolean(row);
        if (!row && options.upsert) {
          row = Object.fromEntries(Object.entries(filter).filter(([, value]) => !record(value)));
          insert(name, row); row = rows(name)[rows(name).length - 1]!;
        }
        if (!row) return { acknowledged: true, matchedCount: 0, upsertedCount: 0 };
        if (!found && record(update.$setOnInsert)) for (const [key, value] of Object.entries(update.$setOnInsert)) setPath(row, key, value);
        if (record(update.$set)) for (const [key, value] of Object.entries(update.$set)) setPath(row, key, value);
        writes.push(name); return { acknowledged: true, matchedCount: found ? 1 : 0, upsertedCount: found ? 0 : 1 };
      },
      async replaceOne(filter: Row, doc: Row, options: { upsert?: boolean } = {}) {
        const index = rows(name).findIndex(row => matches(row, filter));
        if (index < 0 && !options.upsert) return { acknowledged: true, matchedCount: 0 };
        if (index < 0) insert(name, doc); else rows(name)[index] = structuredClone(doc);
        writes.push(name); return { acknowledged: true, matchedCount: index < 0 ? 0 : 1, upsertedCount: index < 0 ? 1 : 0 };
      },
    };
  } } as unknown as Pick<Db, "collection">;
  const complete: IndexSessionDeps["complete"] = async job => {
    const input = JSON.parse(job.messages[1]!.content);
    const proposals = (input.spans ?? []).map((span: { text: string; origin: string; turnId: string; sessionId: string }) => ({
      text: input.phase === "extract-claims" && options.generatedParaphrase ? PUBLIC_REVIEW_PARAPHRASE : span.text,
      origin: span.origin, verification: "unverified", evidence: [{ turnId: span.turnId, sessionId: span.sessionId,
        quote: input.phase === "extract-claims" && options.generatedParaphrase ? PUBLIC_REVIEW_QUOTE : span.text }],
    }));
    const result = input.phase === "extract-summary" ? { processed: input.inventory, items: proposals.map((item: object) => ({ ...item, kind: "insight" })), qa: [] }
      : input.phase === "extract-claims" ? { processed: input.inventory, claims: proposals }
      : { processed: input.inventory, complete: true, noContent: false, verdicts: input.items.map((item: { id: string }) => ({ id: item.id, supported: true, categoryCorrect: true, answerRelevant: true })) };
    return { text: JSON.stringify(result), provider: "public-synthetic", model: "public-synthetic", costUsd: 0, usage: { inputTokens: 0, outputTokens: 0 } };
  };
  const deps: IndexSessionDeps = {
    db, complete, strictWebinar: true, dropUnverified: true, extractDecisions: false, suggestSpeakers: false,
    embed: async job => ({ vectors: job.texts.map(() => [0.1, 0.2, 0.3]), dims: 3, provider: "public-synthetic", model: "public-synthetic" }),
    noteJudge: async batch => ({ verdicts: batch.map(item => ({ id: item.id, verdict: "same", reason: "Synthetic policy compatibility model" })), costUsd: 0, model: "public-synthetic" }),
  };
  return { db, deps, rows, writes };
}
