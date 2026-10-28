import { test } from "node:test";
import assert from "node:assert/strict";
import type { Job, Transport, TransportRequest, WriteJobFn } from "@lkb/ai";
import { llmVerifier } from "@lkb/index";
import { createSpeakerCloudTransport, createSpeakerSuggestionRouting } from "./routing.js";

const env = { OLLAMA_API_KEY: "offline-test-key", SPEAKERS_PROPOSER_MODEL: "deepseek-v4-pro", SPEAKERS_VERIFIER_MODEL: "gpt-oss:120b" };
const job: Job = { kind: "speakers", messages: [{ role: "user", content: "source evidence" }] };
const reply = { message: { content: '{"verdict":"yes"}' }, prompt_eval_count: 2, eval_count: 3 };
const context = { tenantId: "offline-speaker-tenant", write: async () => {} };

test("construction is lazy and proposer/verifier have separate authenticated models", async () => {
  const requests: TransportRequest[] = [];
  const transport: Transport = async (request) => { requests.push(request); return { status: 200, body: reply }; };
  const entries: Parameters<WriteJobFn>[0][] = [];
  const routes = createSpeakerSuggestionRouting(transport, env, { ...context, write: async (entry) => { entries.push(entry); } });
  assert.equal(requests.length, 0);
  assert.equal(routes.mode, "suggestions-only");
  assert.equal(routes.autoFinal, false);
  assert.ok(Object.isFrozen(routes) && Object.isFrozen(routes.models));
  const proposed = await routes.complete(job);
  const verified = await routes.verifierComplete(job);
  assert.deepEqual(requests.map((r) => (r.body as { model: string }).model), [env.SPEAKERS_PROPOSER_MODEL, env.SPEAKERS_VERIFIER_MODEL]);
  for (const request of requests) {
    assert.equal(request.url, "https://ollama.com/api/chat");
    assert.equal(request.headers?.authorization, `Bearer ${env.OLLAMA_API_KEY}`);
    assert.deepEqual((request.body as { messages: unknown }).messages, job.messages);
  }
  assert.equal(proposed.model, env.SPEAKERS_PROPOSER_MODEL);
  assert.equal(verified.model, env.SPEAKERS_VERIFIER_MODEL);
  assert.deepEqual(entries.map((e) => [e.tenantId, e.status, e.model]), [
    [context.tenantId, "done", env.SPEAKERS_PROPOSER_MODEL], [context.tenantId, "done", env.SPEAKERS_VERIFIER_MODEL],
  ]);
});

test("missing credentials/models and same-model cloud aliases refuse without any call", () => {
  let calls = 0;
  const transport: Transport = async () => { calls++; return { status: 200, body: reply }; };
  for (const invalid of [
    { ...env, OLLAMA_API_KEY: "" }, { ...env, OLLAMA_API_KEY: "key\nsecret" },
    { ...env, SPEAKERS_PROPOSER_MODEL: "" }, { ...env, SPEAKERS_VERIFIER_MODEL: undefined },
    { ...env, SPEAKERS_VERIFIER_MODEL: "DEEPSEEK-V4-PRO:cloud" },
    { ...env, SPEAKERS_VERIFIER_MODEL: "deepseek-v4-pro:latest" },
    { ...env, SPEAKERS_VERIFIER_MODEL: "deepseek-v4-pro-cloud" },
    { ...env, SPEAKERS_VERIFIER_MODEL: "model\nsecret" },
  ]) assert.throws(() => createSpeakerSuggestionRouting(transport, invalid, context));
  assert.throws(() => createSpeakerSuggestionRouting(transport, env, { ...context, tenantId: "" }), /tenant and job recorder/);
  assert.equal(calls, 0);
});

test("unrelated job kinds cannot enter either speaker route", async () => {
  let calls = 0;
  const routes = createSpeakerSuggestionRouting(async () => { calls++; return { status: 200, body: reply }; }, env, context);
  await assert.rejects(routes.complete({ ...job, kind: "answer" }), /speakers jobs only/);
  await assert.rejects(routes.verifierComplete({ ...job, kind: "embedding" }), /speakers jobs only/);
  assert.equal(calls, 0);
});

test("provider errors do not expose credentials or source text", async () => {
  for (const transport of [
    async () => { throw new Error(`${env.OLLAMA_API_KEY} source evidence`); },
    async () => ({ status: 403, body: `${env.OLLAMA_API_KEY} source evidence` }),
  ]) {
    const entries: Parameters<WriteJobFn>[0][] = [];
    const routes = createSpeakerSuggestionRouting(transport, env, { ...context, write: async (entry) => { entries.push(entry); } });
    await assert.rejects(routes.complete(job), { message: "speaker cloud request failed" });
    await assert.rejects(routes.verifierComplete(job), { message: "speaker cloud request failed" });
    assert.equal(entries.length, 2);
    assert.ok(entries.every((e) => e.tenantId === context.tenantId && e.status === "failed" && e.error === "speaker cloud request failed"));
    assert.ok(!JSON.stringify(entries).includes(env.OLLAMA_API_KEY));
  }
});

test("cloud fetch never follows redirects, uses bounded cancellation, and preserves request", async () => {
  const observed: RequestInit[] = [];
  const fetcher: typeof fetch = async (url, options) => {
    assert.equal(url, "https://ollama.com/api/chat");
    observed.push(options!);
    return new Response(JSON.stringify(reply), { status: 200 });
  };
  const routes = createSpeakerSuggestionRouting(createSpeakerCloudTransport(fetcher), env, context);
  await routes.complete(job);
  assert.equal(observed[0]?.redirect, "error");
  assert.ok(observed[0]?.signal instanceof AbortSignal);
  assert.equal(observed[0]?.signal?.aborted, false);
  assert.equal((JSON.parse(observed[0]!.body as string) as { model: string }).model, env.SPEAKERS_PROPOSER_MODEL);
});

test("cloud transport rejects alternate origins/methods before fetch and hides failed bodies", async () => {
  let calls = 0;
  const transport = createSpeakerCloudTransport(async () => { calls++; return new Response("secret-source", { status: 307 }); });
  await assert.rejects(transport({ kind: "http", url: "https://other.example/api/chat", method: "POST" }), /invalid speaker cloud request/);
  await assert.rejects(transport({ kind: "http", url: "https://ollama.com/api/chat", method: "GET" }), /invalid speaker cloud request/);
  assert.equal(calls, 0);
  await assert.rejects(transport({ kind: "http", url: "https://ollama.com/api/chat", method: "POST", body: {} }), { message: "speaker cloud request failed" });
  assert.equal(calls, 1);
});

test("caller cancellation reaches dedicated cloud transport", async () => {
  const controller = new AbortController(); controller.abort();
  const transport = createSpeakerCloudTransport(async (_url, options) => {
    assert.equal(options?.signal?.aborted, true);
    throw new Error("private error");
  });
  await assert.rejects(transport({ kind: "http", url: "https://ollama.com/api/chat", method: "POST", signal: controller.signal }), { message: "speaker cloud request failed" });
});

test("existing verifier consumes the distinct route and returns unsure on provider failure", async () => {
  const requests: TransportRequest[] = [];
  let fail = false;
  const routes = createSpeakerSuggestionRouting(async (request) => {
    requests.push(request);
    if (fail) throw new Error("private provider error");
    return { status: 200, body: reply };
  }, env, context);
  const verify = llmVerifier(routes.verifierComplete);
  const question = {
    label: "spk:1", name: "Priya", quote: "Priya, over to you.", quoteTurnId: "t1",
    blockStart: 1, blockEnd: 3, window: "[id:t1] [spk:0] Priya, over to you.", framing: 1,
  };
  assert.equal((await verify(question)).verdict, "yes");
  const body = requests[0]!.body as { model: string; messages: { content: string }[] };
  assert.equal(body.model, env.SPEAKERS_VERIFIER_MODEL);
  assert.ok(body.messages[0]!.content.includes("devil's advocate"));
  fail = true;
  assert.equal((await verify(question)).verdict, "unsure");
});

test("route snapshots tenant and recorder binding at construction", async () => {
  const entries: Parameters<WriteJobFn>[0][] = [];
  const binding = { tenantId: "original-tenant", write: async (entry: Parameters<WriteJobFn>[0]) => { entries.push(entry); } };
  const routes = createSpeakerSuggestionRouting(async () => ({ status: 200, body: reply }), env, binding);
  binding.tenantId = "different-tenant";
  binding.write = async () => { throw new Error("replacement recorder must not run"); };
  await routes.complete(job);
  await routes.verifierComplete(job);
  assert.deepEqual(entries.map((e) => e.tenantId), ["original-tenant", "original-tenant"]);
});
