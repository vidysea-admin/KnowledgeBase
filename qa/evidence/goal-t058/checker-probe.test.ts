import { test } from "node:test";
import assert from "node:assert/strict";
import type { Claims, Sessions, Turns } from "@lkb/core";
import { createOutputService } from "../../../apps/api/src/knowledge-outputs/service.js";
import { createMemoryOutputRepository } from "../../../apps/api/src/knowledge-outputs/repository.js";
import { assertOutputDraft } from "../../../apps/api/src/knowledge-outputs/validator.js";
import { OutputError, type OutputDeps } from "../../../apps/api/src/knowledge-outputs/types.js";

// Independent source-behavior probe. Deliberately synthetic; no real provider, DB or browser.
const refused = (code: string) => (value: unknown): boolean => value instanceof OutputError && value.code === code;
function fixture() {
  const source = {
    sessions: [{ _id: "checker-session", tenantId: "checker-tenant" } as Sessions],
    claims: [{ _id: "checker-claim", tenantId: "checker-tenant", status: "verified", text: "The deadline was extended.",
      evidence: [{ sessionId: "checker-session", turnId: "checker-turn", quote: "The board extended the deadline." }] } as Claims],
    turns: [{ _id: "checker-turn", tenantId: "checker-tenant", sessionId: "checker-session", speakerRef: "person:chair",
      tStart: 1, tEnd: 2, text: "The board extended the deadline." } as Turns],
  };
  const repository = createMemoryOutputRepository();
  const deps: OutputDeps = {
    repository, readSources: async () => structuredClone(source),
    policy: async (_tenant, selection) => ({ status: "none", questionClass: selection.questionClass }),
    complete: async (_tenant, job) => {
      const payload = JSON.parse(job.messages[1]!.content) as { items?: { id: string }[] };
      const json = payload.items ? { checks: payload.items.map((item) => ({ id: item.id, supported: true })) }
        : { sections: [{ key: "faq", items: [{ text: "Q: What did the board do?\nA: The board extended the deadline.", citationIds: ["e1"] }] }] };
      return { text: JSON.stringify(json), json, provider: "independent-fixture", model: "synthetic-checker", usage: { inputTokens: 0, outputTokens: 0 }, costUsd: 0 };
    },
  };
  return { source, repository, deps, service: createOutputService(deps), input: {
    kind: "faq", title: "Board decision FAQ", purpose: "Prepare questions about the recorded board decision", sessionIds: ["checker-session"],
  } };
}

test("independent: source mutation during generation refuses before any insert", async () => {
  const f = fixture(), base = f.deps.complete;
  let calls = 0;
  f.deps.complete = async (tenant, job) => {
    const result = await base(tenant, job);
    if (++calls === 2) f.source.turns[0]!.text += " New qualification after generation started.";
    return result;
  };
  await assert.rejects(f.service.create("checker-tenant", f.input), refused("source_changed"));
  assert.deepEqual(await f.repository.list("checker-tenant"), []);
  assert.equal(calls, 2);
});

test("independent: edited draft wins CAS against already-running revalidation", async () => {
  const f = fixture(), original = await f.service.create("checker-tenant", f.input);
  const base = f.deps.complete;
  let release!: () => void, entered!: () => void;
  const gate = new Promise<void>((resolve) => { release = resolve; });
  const started = new Promise<void>((resolve) => { entered = resolve; });
  f.deps.complete = async (tenant, job) => { entered(); await gate; return base(tenant, job); };
  const pending = f.service.revalidate("checker-tenant", original._id, 1);
  const result = assert.rejects(pending, refused("conflict"));
  await started;
  const edited = await f.service.edit("checker-tenant", original._id, { revision: 1, title: "Updated review draft",
    edits: [{ id: original.sections[0]!.items[0]!.id, text: "Q: What else should we ask?\nA: The board extended the deadline." }] });
  release(); await result;
  const persisted = await f.service.get("checker-tenant", original._id);
  assert.equal(persisted.revision, edited.revision);
  assert.equal(persisted.title, "Updated review draft");
  assert.equal(persisted.sections[0]!.items[0]!.validation, "needs-review");
  await assert.rejects(f.service.export("checker-tenant", original._id, 2), refused("needs_review"));
});

test("independent: assessed factual text, kind and references cannot retain stale fingerprint", async () => {
  const f = fixture(), original = await f.service.create("checker-tenant", f.input);
  for (const mutation of [
    (item: typeof original.sections[number]["items"][number]) => { item.text = "Q: Is tuition free?\nA: Everyone receives free tuition."; },
    (item: typeof original.sections[number]["items"][number]) => { item.kind = "suggestion"; },
    (item: typeof original.sections[number]["items"][number]) => { item.citationIds = ["missing"]; },
  ]) {
    const damaged = structuredClone(original); mutation(damaged.sections[0]!.items[0]!);
    assert.throws(() => assertOutputDraft(damaged), refused("unavailable"));
  }
  const edited = await f.service.edit("checker-tenant", original._id, { revision: 1, title: original.title,
    edits: [{ id: original.sections[0]!.items[0]!.id, text: "Q: Was the deadline extended?\nA: The board extended the deadline." }] });
  assert.equal(edited.sections[0]!.items[0]!.assessmentDigest, "");
  assert.equal(edited.sections[0]!.items[0]!.validation, "needs-review");
});

test("independent: duplicate grounding verdict refuses complete draft persistence", async () => {
  const f = fixture(), base = f.deps.complete;
  f.deps.complete = async (tenant, job) => {
    const payload = JSON.parse(job.messages[1]!.content) as { items?: { id: string }[] };
    if (!payload.items) return base(tenant, job);
    const json = { checks: [{ id: payload.items[0]!.id, supported: true }, { id: payload.items[0]!.id, supported: true }] };
    return { text: JSON.stringify(json), json, provider: "independent-fixture", model: "synthetic-checker", usage: { inputTokens: 0, outputTokens: 0 }, costUsd: 0 };
  };
  await assert.rejects(f.service.create("checker-tenant", f.input), refused("unavailable"));
  assert.deepEqual(await f.repository.list("checker-tenant"), []);
});

test("independent: newly applicable policy invalidates default-policy draft export", async () => {
  const f = fixture(), original = await f.service.create("checker-tenant", f.input);
  f.deps.policy = async () => ({ status: "conflict", questionClass: "faq", conflicts: [] });
  await assert.rejects(f.service.get("checker-tenant", original._id), refused("source_changed"));
  await assert.rejects(f.service.export("checker-tenant", original._id, 1), refused("source_changed"));
});
