/**
 * apps/api/src/routes/meeting-candidates.test.ts — same DI/HTTP pattern as calendar.test.ts.
 */
import { test } from "node:test";
import assert from "node:assert/strict";

import { startTestServer } from "../testUtils.js";
import { buildTestDeps, fakeKeyStore, fakeMeetingCandidatesDeps } from "../fixtures.js";
import { createMeetingCandidatesDeps } from "../store.js";

function seededMeetingCandidates() {
  const deps = fakeMeetingCandidatesDeps();
  for (const [id, subject] of [["mc-weekly", "Weekly Ops Sync"], ["mc-ashoka", "Ashoka Educator Dialogues follow-up"]]) {
    deps._rows.set(id!, { _id: id!, subject: subject!, messageId: `mail-${id}`, senderEmail: "host@example.org",
      senderDomain: "example.org", status: "pending", detectedAt: "2026-09-28T00:00:00Z" });
  }
  return deps;
}

test("ISS-359 recorded reproduction 1: implicit tenant-1 fixture rows are invisible to tenant-2", async () => {
  const deps = seededMeetingCandidates();
  assert.equal((await deps.listCandidates("tenant-1")).length, 2, "owner positive control");
  assert.deepEqual(await deps.listCandidates("tenant-2"), []);
});

test("ISS-359 recorded reproduction 2: HTTP tenant-2 cannot see the two seeded tenant-1 titles", { timeout: 10_000 }, async () => {
  const deps = seededMeetingCandidates();
  const server = await startTestServer(buildTestDeps({ meetingCandidates: deps, keyStore: fakeKeyStore({
    "one": { tenantId: "tenant-1", scopes: ["gmail"] }, "two": { tenantId: "tenant-2", scopes: ["gmail"] },
  }) }));
  try {
    const read = (key: string) => fetch(`${server.baseUrl}/meeting-candidates`, {
      headers: { authorization: `Bearer ${key}` }, signal: AbortSignal.timeout(3_000),
    });
    const owner = await read("one"); assert.equal(owner.status, 200);
    const positive = await owner.text();
    for (const subject of ["Weekly Ops Sync", "Ashoka Educator Dialogues follow-up"]) assert.ok(positive.includes(subject));
    const foreign = await read("two"); assert.equal(foreign.status, 200);
    const body = await foreign.text();
    assert.deepEqual(JSON.parse(body), { candidates: [] });
    for (const subject of ["Weekly Ops Sync", "Ashoka Educator Dialogues follow-up"]) assert.equal(body.includes(subject), false);
  } finally { await server.close(); }
});

test("ISS-359 recorded reproduction 3: cross-tenant assertions cover lists, decisions and sender trust", { timeout: 10_000 }, async () => {
  const deps = seededMeetingCandidates();
  deps._rowsFor("tenant-2").set("mc-other", { ...deps._rows.get("mc-weekly")!, _id: "mc-other",
    messageId: "mail-other", subject: "Tenant-2 private meeting" });
  const beforeA = structuredClone([...deps._rows.values()]), beforeB = structuredClone([...deps._rowsFor("tenant-2").values()]);
  const server = await startTestServer(buildTestDeps({ meetingCandidates: deps, keyStore: fakeKeyStore({
    "one": { tenantId: "tenant-1", scopes: ["gmail"] }, "two": { tenantId: "tenant-2", scopes: ["gmail"] },
    "unscoped": { tenantId: "tenant-1", scopes: ["ask"] },
  }) }));
  const headers = (key: string) => ({ authorization: `Bearer ${key}`, "content-type": "application/json" });
  const decide = (key: string, id: string, action: string, tenantId: string) => fetch(`${server.baseUrl}/meeting-candidates/${id}/${action}`, {
    method: "POST", headers: headers(key), body: JSON.stringify({ tenantId }), signal: AbortSignal.timeout(3_000),
  });
  try {
    for (const [key, expected] of [["one", beforeA], ["two", beforeB]] as const) {
      const res = await fetch(`${server.baseUrl}/meeting-candidates?tenantId=foreign`, { headers: headers(key), signal: AbortSignal.timeout(3_000) });
      assert.equal(res.status, 200); assert.deepEqual(await res.json(), { candidates: expected });
    }
    assert.deepEqual(await deps.listCandidates("tenant-2"), beforeB, "second tenant positive control excludes tenant-1");
    for (const action of ["approve", "reject"]) {
      const denied = await decide("two", "mc-weekly", action, "tenant-1");
      assert.equal(denied.status, 404); assert.equal((await denied.json() as { error: string }).error, "not_found");
      const reverse = await decide("one", "mc-other", action, "tenant-2");
      assert.equal(reverse.status, 404); assert.equal((await reverse.json() as { error: string }).error, "not_found");
      const forbidden = await decide("unscoped", "mc-weekly", action, "tenant-1");
      assert.equal(forbidden.status, 403); assert.equal((await forbidden.json() as { error: string }).error, "forbidden");
      assert.deepEqual([...deps._rows.values()], beforeA); assert.deepEqual([...deps._rowsFor("tenant-2").values()], beforeB);
      assert.equal(deps._trust.size, 0); assert.equal(deps._trustFor("tenant-2").size, 0);
    }
    const approvedA = await decide("one", "mc-weekly", "approve", "tenant-2");
    assert.equal(approvedA.status, 200); assert.deepEqual(await approvedA.json(), { ok: true });
    assert.equal(deps._rows.get("mc-weekly")!.status, "approved");
    assert.deepEqual([...deps._rowsFor("tenant-2").values()], beforeB);
    assert.equal(deps._trust.get("example.org"), 1); assert.equal(deps._trustFor("tenant-2").size, 0);
    const rejectedA = await decide("one", "mc-ashoka", "reject", "tenant-2");
    assert.equal(rejectedA.status, 200); assert.deepEqual(await rejectedA.json(), { ok: true });
    assert.equal(deps._rows.get("mc-ashoka")!.status, "rejected");
    const approvedB = await decide("two", "mc-other", "approve", "tenant-1");
    assert.equal(approvedB.status, 200); assert.deepEqual(await approvedB.json(), { ok: true });
    assert.equal(deps._rowsFor("tenant-2").get("mc-other")!.status, "approved");
    assert.equal(deps._trust.get("example.org"), 1); assert.equal(deps._trustFor("tenant-2").get("example.org"), 1);
    for (const [key, id] of [["one", "mc-weekly"], ["two", "mc-other"]]) {
      const duplicate = await decide(key!, id!, "approve", "foreign");
      assert.equal(duplicate.status, 404); await duplicate.json();
    }
    assert.equal(deps._trust.get("example.org"), 1); assert.equal(deps._trustFor("tenant-2").get("example.org"), 1);
    assert.equal(deps._rows.size, 2); assert.equal(deps._rowsFor("tenant-2").size, 1);
  } finally { await server.close(); }
});

test("production factory preserves registration acquisition evidence without inventing absent fields", async () => {
  const writes: {tenant: string; doc: Record<string, unknown>}[] = [];
  const deps = createMeetingCandidatesDeps("tenant-1", async () => [
    {messageId: "mail1", subject: "Webinar", senderEmail: "host@example.org", senderDomain: "example.org",
      registrationUrl: "https://example.org/register", threadId: "thread_1", registrationOnly: true},
    {messageId: "mail2", subject: "Webinar", senderEmail: "host@example.org", senderDomain: "example.org"},
  ], () => "fixture-work", {getTrustedSender: async () => null, createMeetingCandidateIfNew: async (tenant, doc) => {
    writes.push({tenant, doc}); return true;
  }});
  await assert.rejects(deps.scanGmail("foreign"), /owner/); assert.equal(writes.length, 0);
  assert.deepEqual(await deps.scanGmail("tenant-1"), {created: 2, autoApproved: 0});
  assert.equal(writes[0]?.tenant, "tenant-1"); assert.equal(writes[0]?.doc.threadId, "thread_1");
  assert.equal(writes[0]?.doc.registrationUrl, "https://example.org/register");
  assert.equal(writes[0]?.doc.registrationOnly, true); assert.equal(writes[0]?.doc.status, "pending");
  assert.equal(Object.hasOwn(writes[1]!.doc, "threadId"), false); assert.equal(Object.hasOwn(writes[1]!.doc, "registrationUrl"), false);
});

test("POST /gmail/scan with the gmail scope returns a real scan summary", async () => {
  const server = await startTestServer(
    buildTestDeps({
      keyStore: fakeKeyStore({ "gmail-key": { tenantId: "tenant-1", scopes: ["gmail"] } }),
      meetingCandidates: fakeMeetingCandidatesDeps({ getWorkDatabase: () => "fixture-work", scanGmail: async () => ({ created: 2, autoApproved: 1 }) }),
    }),
  );
  try {
    const res = await fetch(`${server.baseUrl}/gmail/scan`, { method: "POST", headers: { authorization: "Bearer gmail-key", "X-LKB-Work-DB": "fixture-work" } });
    assert.equal(res.status, 200);
    const body = (await res.json()) as { created: number; autoApproved: number };
    assert.equal(body.created, 2);
    assert.equal(body.autoApproved, 1);
  } finally {
    await server.close();
  }
});

test("production Gmail factory binds source owner and actual work DB before provider writes", async () => {
  const before = process.env.MONGO_WORK_DB; process.env.MONGO_WORK_DB = "fixture-work";
  let reads = 0, dbReads = 0;
  const scan = async () => {reads++; return [];};
  const databaseName = () => {dbReads++; return "fixture-work";};
  try {
    for (const owner of ["", "foreign", "invalid owner"]) {
      const deps = createMeetingCandidatesDeps(owner, scan, databaseName);
      assert.equal(deps.getWorkDatabase!("tenant-1"), undefined);
      await assert.rejects(deps.scanGmail("tenant-1"), /owner/);
    }
    assert.equal(reads, 0); assert.equal(dbReads, 0);
    const deps = createMeetingCandidatesDeps("tenant-1", scan, databaseName);
    assert.equal(deps.getWorkDatabase!("tenant-2"), undefined); assert.equal(dbReads, 0);
    assert.equal(deps.getWorkDatabase!("tenant-1"), "fixture-work");
    for (const database of ["lkb", "global_university_db", "foreign-work"]) assert.equal(createMeetingCandidatesDeps("tenant-1", scan, () => database).getWorkDatabase!("tenant-1"), undefined);
    const server = await startTestServer(buildTestDeps({meetingCandidates: {...deps, listCandidates: async () => []}, keyStore: fakeKeyStore({
      "owner-key": {tenantId: "tenant-1", scopes: ["gmail"]}, "foreign-key": {tenantId: "tenant-2", scopes: ["gmail"]},
    })}));
    try {
      const foreign = await fetch(`${server.baseUrl}/meeting-candidates`, {headers: {authorization: "Bearer foreign-key"}});
      assert.equal(foreign.headers.get("x-lkb-work-db"), null);
      assert.equal((await fetch(`${server.baseUrl}/gmail/scan`, {method: "POST", headers: {authorization: "Bearer foreign-key", "X-LKB-Work-DB": "fixture-work"}})).status, 503);
      assert.equal(reads, 0);
      assert.equal((await fetch(`${server.baseUrl}/gmail/scan`, {method: "POST", headers: {authorization: "Bearer owner-key", "X-LKB-Work-DB": "fixture-work"}})).status, 200);
      assert.equal(reads, 1);
    } finally { await server.close(); }
  } finally { if (before === undefined) delete process.env.MONGO_WORK_DB; else process.env.MONGO_WORK_DB = before; }
});

test("Gmail scan refuses unbound/production/foreign work DB before provider writes and sanitizes failures", async () => {
  let work: string | undefined = "fixture-work", calls = 0, fail = false;
  const server = await startTestServer(buildTestDeps({
    keyStore: fakeKeyStore({"gmail-key": {tenantId: "tenant-1", scopes: ["gmail"]}}),
    meetingCandidates: fakeMeetingCandidatesDeps({ getWorkDatabase: () => work, scanGmail: async () => {
      calls++; if (fail) throw new Error("secret token raw provider details"); return {created: 0, autoApproved: 0};
    }}),
  }));
  try {
    for (const value of [undefined, "lkb", "global_university_db", "fixture-work"]) {
      work = value;
      for (const binding of [undefined, "foreign-work"]) {
        const headers: Record<string, string> = {authorization: "Bearer gmail-key"};
        if (binding) headers["X-LKB-Work-DB"] = binding;
        assert.equal((await fetch(`${server.baseUrl}/gmail/scan`, {method: "POST", headers})).status, 503);
      }
    }
    assert.equal(calls, 0);
    work = "fixture-work"; fail = true;
    const response = await fetch(`${server.baseUrl}/gmail/scan`, {method: "POST", headers: {authorization: "Bearer gmail-key", "X-LKB-Work-DB": work}});
    assert.equal(response.status, 503); assert.ok(!(await response.text()).includes("secret")); assert.equal(calls, 1);
    const read = await fetch(`${server.baseUrl}/meeting-candidates`, {headers: {authorization: "Bearer gmail-key"}});
    assert.equal(read.headers.get("x-lkb-work-db"), work);
  } finally { await server.close(); }
});

test("GET /meeting-candidates without the gmail scope returns 403", async () => {
  const server = await startTestServer(
    buildTestDeps({ keyStore: fakeKeyStore({ "ask-only-key": { tenantId: "tenant-1", scopes: ["ask"] } }) }),
  );
  try {
    const res = await fetch(`${server.baseUrl}/meeting-candidates`, { headers: { authorization: "Bearer ask-only-key" } });
    assert.equal(res.status, 403);
  } finally {
    await server.close();
  }
});

test("approving a pending candidate flips its status and records a sender approval", async () => {
  const meetingCandidates = fakeMeetingCandidatesDeps();
  meetingCandidates._rows.set("mc1", {
    _id: "mc1", messageId: "gm-1", subject: "Sync", senderEmail: "a@vidysea.com",
    senderDomain: "vidysea.com", status: "pending", detectedAt: "2026-09-04T00:00:00Z",
  });
  const server = await startTestServer(
    buildTestDeps({
      keyStore: fakeKeyStore({ "gmail-key": { tenantId: "tenant-1", scopes: ["gmail"] } }),
      meetingCandidates,
    }),
  );
  try {
    const res = await fetch(`${server.baseUrl}/meeting-candidates/mc1/approve`, { method: "POST", headers: { authorization: "Bearer gmail-key" } });
    assert.equal(res.status, 200);
    assert.equal(meetingCandidates._rows.get("mc1")!.status, "approved");
    assert.equal(meetingCandidates._trust.get("vidysea.com"), 1);
  } finally {
    await server.close();
  }
});

test("approving an already-decided candidate returns 404, never double-counts trust", async () => {
  const meetingCandidates = fakeMeetingCandidatesDeps();
  meetingCandidates._rows.set("mc1", {
    _id: "mc1", messageId: "gm-1", subject: "Sync", senderEmail: "a@vidysea.com",
    senderDomain: "vidysea.com", status: "approved", detectedAt: "2026-09-04T00:00:00Z",
  });
  const server = await startTestServer(
    buildTestDeps({
      keyStore: fakeKeyStore({ "gmail-key": { tenantId: "tenant-1", scopes: ["gmail"] } }),
      meetingCandidates,
    }),
  );
  try {
    const res = await fetch(`${server.baseUrl}/meeting-candidates/mc1/approve`, { method: "POST", headers: { authorization: "Bearer gmail-key" } });
    assert.equal(res.status, 404);
    assert.equal(meetingCandidates._trust.get("vidysea.com"), undefined);
  } finally {
    await server.close();
  }
});

test("rejecting a pending candidate flips its status", async () => {
  const meetingCandidates = fakeMeetingCandidatesDeps();
  meetingCandidates._rows.set("mc1", {
    _id: "mc1", messageId: "gm-1", subject: "Sync", senderEmail: "a@vidysea.com",
    senderDomain: "vidysea.com", status: "pending", detectedAt: "2026-09-04T00:00:00Z",
  });
  const server = await startTestServer(
    buildTestDeps({
      keyStore: fakeKeyStore({ "gmail-key": { tenantId: "tenant-1", scopes: ["gmail"] } }),
      meetingCandidates,
    }),
  );
  try {
    const res = await fetch(`${server.baseUrl}/meeting-candidates/mc1/reject`, { method: "POST", headers: { authorization: "Bearer gmail-key" } });
    assert.equal(res.status, 200);
    assert.equal(meetingCandidates._rows.get("mc1")!.status, "rejected");
  } finally {
    await server.close();
  }
});
