/**
 * packages/ai/src/router.test.ts — T-019 C7 (router half). `route()` resolves an ordered
 * chain; `complete()` tries providers in order and stops at first success; throws
 * `AllProvidersFailedError` when every provider in the chain fails; `recordJob` fires exactly
 * once per attempt via the injectable `write`.
 */
import { test } from "node:test";
import assert from "node:assert/strict";

import type { CompleteResult, EmbedJob, EmbedResult, Job, Provider } from "./provider.js";
import { AllProvidersFailedError, complete, embed, route, type RoutingConfig } from "./router.js";
import type { JobEntry } from "./jobs.js";

const FIXTURE_JOB: Job = { kind: "test", messages: [{ role: "user", content: "hi" }] };

function okResult(provider: string): CompleteResult {
  return { text: "ok", usage: { inputTokens: 1, outputTokens: 1 }, provider, model: "m", costUsd: 0 };
}

function succeedingProvider(name: string): Provider {
  return { name, complete: async () => okResult(name), listModels: async () => [] };
}

function failingProvider(name: string, message = "boom"): Provider {
  return {
    name,
    complete: async () => {
      throw new Error(message);
    },
    listModels: async () => [],
  };
}

function recordingWrite(): { write: RoutingConfig["write"]; calls: JobEntry[] } {
  const calls: JobEntry[] = [];
  return {
    write: async (entry) => {
      calls.push(entry);
    },
    calls,
  };
}

test("route() resolves the ordered chain to Provider instances", () => {
  const gemini = succeedingProvider("gemini");
  const claudeCode = succeedingProvider("claude-code");
  const providers = route("transcribe", {
    chains: { transcribe: ["gemini", "claude-code"] },
    providers: { gemini, "claude-code": claudeCode },
  });
  assert.deepEqual(providers, [gemini, claudeCode]);
});

test("route() throws on an unknown jobKind or unknown provider name", () => {
  assert.throws(() => route("missing", { chains: {}, providers: {} }));
  assert.throws(() =>
    route("x", { chains: { x: ["nope"] }, providers: {} }),
  );
});

test("complete() tries providers in order and stops at first success", async () => {
  const first = failingProvider("first");
  const second = succeedingProvider("second");
  const { write, calls } = recordingWrite();

  const result = await complete("test-kind", FIXTURE_JOB, {
    chains: { "test-kind": ["first", "second"] },
    providers: { first, second },
    write,
    tenantId: "tenant-1",
  });

  assert.equal(result.provider, "second", "result must come from the first SUCCEEDING provider");
  assert.equal(calls.length, 2, "one jobs-ledger write per attempt (failed first, done second)");
  assert.equal(calls[0]!.status, "failed");
  assert.equal(calls[0]!.provider, "first");
  assert.equal(calls[1]!.status, "done");
  assert.equal(calls[1]!.provider, "second");
});

test("complete() throws AllProvidersFailedError when every provider fails, never a silent empty result", async () => {
  const first = failingProvider("first", "err-1");
  const second = failingProvider("second", "err-2");
  const { write, calls } = recordingWrite();

  await assert.rejects(
    () =>
      complete("test-kind", FIXTURE_JOB, {
        chains: { "test-kind": ["first", "second"] },
        providers: { first, second },
        write,
        tenantId: "tenant-1",
      }),
    (err: unknown) => {
      assert.ok(err instanceof AllProvidersFailedError);
      assert.equal(err.jobKind, "test-kind");
      assert.deepEqual(
        err.attempts.map((a) => a.provider),
        ["first", "second"],
      );
      return true;
    },
  );

  assert.equal(calls.length, 2, "recordJob called exactly once per attempt, even on total failure");
  assert.ok(calls.every((c) => c.status === "failed"));
});

test("complete() records exactly one jobs entry for a single-provider chain success", async () => {
  const only = succeedingProvider("only");
  const { write, calls } = recordingWrite();

  await complete("k", FIXTURE_JOB, {
    chains: { k: ["only"] },
    providers: { only },
    write,
    tenantId: "t",
  });

  assert.equal(calls.length, 1);
  assert.equal(calls[0]!.status, "done");
});

/**
 * U1.1 — the embedding chain. The behaviour worth pinning is the one that differs from
 * `complete()`: a provider with no `embed()` is SKIPPED rather than counted as a failure, because
 * a chain shared with other jobKinds will contain claude-code/anthropic, neither of which has an
 * embedding endpoint. Get this wrong and every embedding request dies on its first chain member.
 */
const EMBED_JOB: EmbedJob = { kind: "embedding", texts: ["a", "b"] };

function embeddingProvider(name: string): Provider {
  return {
    name,
    complete: async () => okResult(name),
    listModels: async () => [],
    embed: async (): Promise<EmbedResult> => ({
      vectors: [[1, 0], [0, 1]],
      dims: 2,
      provider: name,
      model: "e",
    }),
  };
}

/** Deliberately has NO embed method — the claude-code / anthropic shape. */
function completeOnlyProvider(name: string): Provider {
  return { name, complete: async () => okResult(name), listModels: async () => [] };
}

test("embed() SKIPS a provider with no embed() and uses the next capable one", async () => {
  const { write, calls } = recordingWrite();
  const config: RoutingConfig = {
    chains: { embedding: ["nope", "yes"] },
    providers: { nope: completeOnlyProvider("nope"), yes: embeddingProvider("yes") },
    tenantId: "t",
    write,
  };
  const r = await embed("embedding", EMBED_JOB, config);
  assert.equal(r.provider, "yes");
  assert.equal(r.dims, 2);
  // The skip must NOT be recorded as a failed job — nothing went wrong, the provider simply
  // cannot do this kind of work.
  assert.equal(calls.filter((c) => c.status === "failed").length, 0);
  assert.equal(calls.filter((c) => c.status === "done").length, 1);
});

test("embed() falls back past a provider whose embed() throws, and records the failure", async () => {
  const { write, calls } = recordingWrite();
  const boom: Provider = {
    name: "boom",
    complete: async () => okResult("boom"),
    listModels: async () => [],
    embed: async () => {
      throw new Error("rate limited");
    },
  };
  const config: RoutingConfig = {
    chains: { embedding: ["boom", "yes"] },
    providers: { boom, yes: embeddingProvider("yes") },
    tenantId: "t",
    write,
  };
  const r = await embed("embedding", EMBED_JOB, config);
  assert.equal(r.provider, "yes");
  assert.equal(calls.filter((c) => c.status === "failed").length, 1);
});

test("embed() throws rather than returning zero vectors when NO chain member can embed", async () => {
  // A silent empty result here would look exactly like a corpus with nothing in it — the worst
  // possible failure mode for an index build, because it succeeds.
  const { write } = recordingWrite();
  const config: RoutingConfig = {
    chains: { embedding: ["a", "b"] },
    providers: { a: completeOnlyProvider("a"), b: completeOnlyProvider("b") },
    tenantId: "t",
    write,
  };
  await assert.rejects(embed("embedding", EMBED_JOB, config), (err: unknown) => {
    assert.ok(err instanceof AllProvidersFailedError);
    assert.match(String(err), /no embed\(\)/);
    return true;
  });
});

test("an aborted job.signal stops the chain: no further provider is attempted after the abort (ISS-421)", async () => {
  const ctl = new AbortController();
  let secondCalled = false;
  const first: Provider = { name: "first", listModels: async () => [], complete: async () => { ctl.abort(); throw new Error("aborted"); } };
  const second: Provider = { name: "second", listModels: async () => [], complete: async () => { secondCalled = true; return okResult("second"); } };
  const { write } = recordingWrite();
  await assert.rejects(complete("k", { ...FIXTURE_JOB, signal: ctl.signal }, { chains: { k: ["first", "second"] }, providers: { first, second }, write, tenantId: "t" }));
  assert.equal(secondCalled, false);
  const pre = new AbortController(); pre.abort();
  await assert.rejects(complete("k", { ...FIXTURE_JOB, signal: pre.signal }, { chains: { k: ["first", "second"] }, providers: { first, second }, write, tenantId: "t" }));
  assert.equal(secondCalled, false, "an already-aborted job attempts nobody");
});
