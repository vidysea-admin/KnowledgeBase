// Public synthetic Mongo model; the actual tenant-scoped accessor and CAS writer run above it.
import assert from "node:assert/strict";
import test from "node:test";
import type { Db } from "mongodb";
import type { MeetingCandidates } from "@lkb/core";
import {createIfNew} from "./meeting-candidates.js";

type Row = Record<string, unknown>;
const receivedAt = "2026-10-01T12:00:00.000Z";
const watch = {url: "https://www.youtube.com/watch?v=abcdefghijk", videoId: "abcdefghijk", source: "body" as const};
function candidate(extra: Row = {}): Omit<MeetingCandidates, "tenantId"> {
  return {_id: "scan-id", messageId: "mail-1", subject: "Synthetic webinar", senderEmail: "sender@example.test",
    senderDomain: "example.test", threadId: "thread-1", status: "pending", detectedAt: receivedAt, ...extra};
}
function old(extra: Row = {}): Row {
  return {...candidate(), _id: "persisted-id", tenantId: "owner", status: "rejected", decidedAt: receivedAt,
    meetingUrl: "https://zoom.us/j/1234567890", startTime: receivedAt, occurrenceKey: "immutable-occurrence", ...extra};
}
function memory(seed: Row[], beforeUpdate?: (rows: Row[]) => void) {
  const rows = structuredClone(seed);
  const calls: Array<{op: string; filter?: Row; update?: Row}> = [];
  const equal = (left: unknown, right: unknown) => JSON.stringify(left) === JSON.stringify(right);
  function matches(row: Row, filter: Row) {
    return Object.entries(filter).every(([key, expected]) => {
      if (key === "$expr") {
        const conditions = (expected as {$and: Array<{$eq: [{$getField: {field: {$literal: string}; input: string}}, {$literal: unknown}]} >}).$and;
        return conditions.every(condition => {
          const [field, literal] = condition.$eq;
          assert.equal(field.$getField.input, "$$ROOT");
          return equal(row[field.$getField.field.$literal], literal.$literal);
        });
      }
      if (expected && typeof expected === "object") {
        const condition = expected as Row;
        if (Object.hasOwn(condition, "$exists")) return Object.hasOwn(row, key) === condition.$exists;
        if (Object.hasOwn(condition, "$eq")) return equal(row[key], condition.$eq) ||
          (Array.isArray(row[key]) && (row[key] as unknown[]).some(element => equal(element, condition.$eq)));
        throw new Error("Unsupported model filter; do not silently accept operators");
      }
      return row[key] === expected || (Array.isArray(row[key]) && (row[key] as unknown[]).includes(expected));
    });
  }
  const db = {collection(name: string) {
    assert.equal(name, "meeting_candidates");
    return {
      async findOne(filter: Row) {calls.push({op: "find", filter}); return structuredClone(rows.find(row => matches(row, filter)) ?? null);},
      async insertOne(doc: Row) {calls.push({op: "insert"}); rows.push(structuredClone(doc)); return {insertedId: doc._id};},
      async updateOne(filter: Row, update: Row) {
        calls.push({op: "update", filter, update}); beforeUpdate?.(rows);
        const row = rows.find(value => matches(value, filter));
        if (!row) return {matchedCount: 0, modifiedCount: 0};
        Object.assign(row, structuredClone(update.$set)); return {matchedCount: 1, modifiedCount: 1};
      },
    };
  }} as unknown as Db;
  return {db, rows, calls};
}

test("old rejected source refreshes literal provenance without reviving or replacing any preserved field", async () => {
  const original = old({senderAuthenticated: false, registrationOnly: true, registrationUrl: "https://publisher.example/register"});
  const m = memory([original]);
  const result = await createIfNew("owner", candidate({senderAuthenticated: true, receivedAt, youtubeWatch: watch,
    status: "auto_approved", decidedAt: "2099-01-01T00:00:00.000Z", meetingUrl: "https://other.example", occurrenceKey: "replacement"}), m.db);
  assert.equal(result, false);
  assert.deepEqual(m.rows[0], {...original, senderAuthenticated: true, receivedAt, youtubeWatch: watch});
  assert.deepEqual(m.calls.find(c => c.op === "update")?.update, {$set: {senderAuthenticated: true, receivedAt, youtubeWatch: watch}});
  assert.equal(m.calls.find(c => c.op === "update")?.filter?.tenantId, "owner");
});

test("all human and automatic statuses remain unchanged; refresh never changes creation counters", async () => {
  for (const status of ["pending", "approved", "rejected", "auto_approved"]) {
    const original = old({status}); const m = memory([original]);
    assert.equal(await createIfNew("owner", candidate({receivedAt}), m.db), false);
    assert.deepEqual(m.rows[0], {...original, receivedAt});
  }
});

test("original pre-thread rows refresh source provenance without inventing thread or registration evidence", async () => {
  const original = old({registrationOnly: true}); delete original.threadId;
  const m = memory([original]);
  assert.equal(await createIfNew("owner", candidate({receivedAt, senderAuthenticated: true}), m.db), false);
  assert.deepEqual(m.rows, [{...original, receivedAt, senderAuthenticated: true}]);
  assert.equal(Object.hasOwn(m.rows[0]!, "threadId"), false);
  assert.deepEqual(m.calls.find(c => c.op === "update")?.filter?.threadId, {$exists: false});
});

test("absent fresh fields retain prior receipt, auth, watch and refusal evidence without a write", async () => {
  const original = old({receivedAt, senderAuthenticated: false, youtubeWatch: watch,
    youtubeWatchIssue: "ambiguous", meetingLinkIssue: "host-start-link"});
  const m = memory([original]);
  assert.equal(await createIfNew("owner", candidate(), m.db), false);
  assert.deepEqual(m.rows, [original]); assert.equal(m.calls.filter(c => c.op === "update").length, 0);
});

test("wrong sender, domain, thread, subject or explicit owner refuses without changing stored rows", async () => {
  for (const changed of [{senderEmail: "foreign@example.test"}, {senderDomain: "foreign.test"},
    {threadId: "another-thread"}, {threadId: undefined}, {subject: "Changed source"}, {tenantId: "foreign"}]) {
    const original = old(); const m = memory([original]);
    await assert.rejects(createIfNew("owner", candidate({...changed, receivedAt}), m.db), /mismatch/);
    assert.deepEqual(m.rows, [original]); assert.equal(m.calls.filter(c => c.op === "update").length, 0);
  }
});

test("tenant scoping preserves foreign same-message rows while healthy new rows still insert", async () => {
  const foreign = old({tenantId: "foreign"}); const m = memory([foreign]);
  assert.equal(await createIfNew("owner", candidate({receivedAt}), m.db), true);
  assert.deepEqual(m.rows[0], foreign); assert.deepEqual(m.rows[1], {...candidate({receivedAt}), tenantId: "owner"});
  assert.deepEqual(m.calls[0]?.filter, {messageId: "mail-1", tenantId: "owner"});
  const poison = memory([]);
  await assert.rejects(createIfNew({$ne: null} as unknown as string, candidate(), poison.db), /tenantId/);
  assert.equal(poison.calls.length, 0);
});

test("decision, identity, occurrence and concurrent provenance races each refuse atomically", async () => {
  for (const changed of [{status: "approved"}, {decidedAt: "2026-10-02T12:00:00.000Z"},
    {_id: "replacement"}, {senderEmail: "foreign@example.test"}, {threadId: "another-thread"},
    {occurrenceKey: "another-occurrence"}, {occurrence: {providerKey: "changed"}},
    {meetingUrl: "https://changed.example"}, {senderAuthenticated: false},
    {receivedAt: "2026-10-02T12:00:00.000Z"}]) {
    const original = old({status: "pending", occurrence: {providerKey: "original"}});
    const m = memory([original], rows => Object.assign(rows[0]!, changed));
    await assert.rejects(createIfNew("owner", candidate({receivedAt, senderAuthenticated: true}), m.db), /changed during/);
    assert.deepEqual(m.rows, [{...original, ...changed}]);
  }
});

test("absent decisions use existence guard so a concurrently stamped null is not treated as missing", async () => {
  const original = old(); delete original.decidedAt;
  const m = memory([original], rows => {rows[0]!.decidedAt = null;});
  await assert.rejects(createIfNew("owner", candidate({receivedAt}), m.db), /changed during/);
  assert.deepEqual(m.calls.find(c => c.op === "update")?.filter?.decidedAt, {$exists: false});
  assert.equal(m.rows[0]?.receivedAt, undefined);
});

test("Mongo array-element query equality cannot admit scalar-to-array decision or source races", async () => {
  for (const key of ["status", "senderEmail", "threadId", "decidedAt", "detectedAt", "occurrence"]) {
    const original = old({occurrence: {providerKey: "original"}});
    const m = memory([original], rows => {rows[0]![key] = [original[key]];});
    await assert.rejects(createIfNew("owner", candidate({receivedAt}), m.db), /changed during/);
    assert.deepEqual(m.rows, [{...original, [key]: [original[key]]}]);
    const filter = m.calls.find(c => c.op === "update")?.filter;
    assert.ok(filter?.$expr, "whole-field aggregation guard supplements query element equality");
  }
});

test("invalid or conflicting receipt and authentication provenance refuses without partial refresh", async () => {
  for (const extra of [{receivedAt: "yesterday"}, {receivedAt: "2026-02-30T12:00:00.000Z"},
    {receivedAt: "2026-10-01T12:00:00Z"}, {receivedAt: "2099-01-01T00:00:00.000Z"}, {senderAuthenticated: "true"}]) {
    const original = old(); const m = memory([original]);
    await assert.rejects(createIfNew("owner", candidate({...extra, youtubeWatch: watch}), m.db), /Invalid/);
    assert.deepEqual(m.rows, [original]);
  }
  const original = old({receivedAt}); const m = memory([original]);
  await assert.rejects(createIfNew("owner", candidate({receivedAt: "2026-10-02T12:00:00.000Z"}), m.db), /conflicting/);
  assert.deepEqual(m.rows, [original]);
});

test("watch ambiguity and older link refusals persist; conflicting or poisoned targets cannot be selected", async () => {
  const original = old({youtubeWatchIssue: "ambiguous", meetingLinkIssue: "host-start-link"}); const m = memory([original]);
  assert.equal(await createIfNew("owner", candidate({receivedAt, youtubeWatch: watch, meetingLinkIssue: "registration-only"}), m.db), false);
  assert.deepEqual(m.rows, [{...original, receivedAt}]);
  for (const poisoned of [{...watch, url: "https://youtube.com.attacker.test/watch?v=abcdefghijk"},
    {...watch, extra: "untrusted"}, {...watch, videoId: "lmnopqrstuv", url: "https://www.youtube.com/watch?v=lmnopqrstuv"}]) {
    const prior = old({youtubeWatch: watch}); const p = memory([prior]);
    await assert.rejects(createIfNew("owner", candidate({youtubeWatch: poisoned, receivedAt}), p.db), /provenance/);
    assert.deepEqual(p.rows, [prior]);
  }
});

test("a new ambiguity is recorded, never erased by a later scan, and identical provenance is idempotent", async () => {
  const m = memory([old()]);
  assert.equal(await createIfNew("owner", candidate({youtubeWatchIssue: "ambiguous", meetingLinkIssue: "ambiguous"}), m.db), false);
  const snapshot = structuredClone(m.rows);
  assert.equal(await createIfNew("owner", candidate(), m.db), false);
  assert.deepEqual(m.rows, snapshot);
  assert.equal(await createIfNew("owner", candidate({youtubeWatchIssue: "ambiguous", meetingLinkIssue: "ambiguous"}), m.db), false);
  assert.equal(m.calls.filter(c => c.op === "update").length, 1);
});
