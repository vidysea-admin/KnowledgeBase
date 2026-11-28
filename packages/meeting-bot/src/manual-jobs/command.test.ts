import { test } from "node:test";
import assert from "node:assert/strict";
import { createHttpManualCommandDeps, runManualJobsCommand } from "./command.js";

const id = "send-now-20261014100000-abcdef";
const summary = { jobId: id, platform: "meet", state: "cancel-requested", requestedAt: "2026-10-14T10:00:00Z", updatedAt: "2026-10-14T10:00:00Z", joined: "unknown", meetingUrl: "https://private.example/?passcode=private", nonce: "private" };
test("CLI sends/list/status/cancel use exact owning-key API routes and emit whitelisted metadata only", async () => {
  const calls: { url: string; init: RequestInit }[] = [], lines: string[] = [];
  const deps = createHttpManualCommandDeps({ LKB_API_URL: "https://api.example.com", LKB_API_KEY: "private-key" }, (async (url, init) => {
    calls.push({ url: String(url), init: init! });
    const value = String(url).endsWith("/jobs") ? { jobs: [summary] } : String(url).endsWith("/send-now") ? { jobId: id, status: "launching", meetingUrl: "private" } : summary;
    return new Response(JSON.stringify(value), { status: 200 });
  }) as typeof fetch);
  deps.write = line => lines.push(line);
  await runManualJobsCommand(["send", "https://meet.google.com/abc-defg-hij", "11:00"], deps);
  await runManualJobsCommand(["list"], deps); await runManualJobsCommand(["status", id], deps); await runManualJobsCommand(["cancel", id], deps);
  assert.equal(calls.length, 4);
  assert.equal((calls[0]!.init.headers as Record<string, string>).authorization, "Bearer private-key");
  assert.deepEqual(JSON.parse(calls[0]!.init.body as string), { meetingUrl: "https://meet.google.com/abc-defg-hij", until: "11:00" });
  assert.deepEqual(JSON.parse(calls[3]!.init.body as string), {});
  assert.equal(calls[3]!.url, `https://api.example.com/calendar/send-now/jobs/${id}/cancel`);
  assert.ok(!lines.join().includes("private")); assert.ok(!lines.join().includes("meetingUrl"));
});
test("CLI rejects credential-bearing/untrusted API origin and invalid job id before issuing requests", async () => {
  for (const LKB_API_URL of ["http://remote.example", "https://u:p@api.example.com", "https://api.example.com/path"]) assert.throws(() => createHttpManualCommandDeps({ LKB_API_URL, LKB_API_KEY: "key" }));
  let calls = 0;
  const deps = createHttpManualCommandDeps({ LKB_API_KEY: "key" }, (async () => { calls++; throw new Error("private"); }) as typeof fetch);
  await assert.rejects(runManualJobsCommand(["cancel", "../../secret"], deps), /invalid manual job/);
  assert.equal(calls, 0);
  await assert.rejects(runManualJobsCommand(["list"], deps), /acceptance is unknown/);
});
test("CLI passes the hosted joined status through (yes/assumed/no with joinedAt) and still refuses junk", async () => {
  const rows = [{ ...summary, joined: "yes", joinedAt: "2026-10-14T10:01:00Z" }, { ...summary, jobId: "send-now-20261014100000-bbbbbb", joined: "no" }];
  const deps = createHttpManualCommandDeps({ LKB_API_URL: "https://api.example.com", LKB_API_KEY: "key" }, (async () => new Response(JSON.stringify({ jobs: rows }), { status: 200 })) as typeof fetch);
  const listed = await deps.list() as { jobs: { joined: string; joinedAt?: string }[] };
  assert.deepEqual(listed.jobs.map(j => [j.joined, j.joinedAt]), [["yes", "2026-10-14T10:01:00Z"], ["no", undefined]]);
  const bad = createHttpManualCommandDeps({ LKB_API_URL: "https://api.example.com", LKB_API_KEY: "key" }, (async () => new Response(JSON.stringify({ jobs: [{ ...summary, joined: "maybe" }] }), { status: 200 })) as typeof fetch);
  await assert.rejects(Promise.resolve(bad.list()), /manual job response invalid/);
});
