// audit-closed-class.test.mjs -- ISS-U24SMART-002 (D-015): the closed-class audit must probe the CURRENT grounded reply shape
// {label, name, evidenceQuote, evidenceKind}, so it can report a bypass (planted) and report clean (compliant). Offline, no network.
// Run from the repo root:  node --test --import tsx scripts/qa/audit-closed-class.test.mjs
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { shipsAsPerson, probeCurrent, setProbeShape, selfTest } from "../lib/audit-closed-class.mjs";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
const PIPELINE = join(ROOT, "packages", "index", "src", "pipeline");
const { words } = JSON.parse(readFileSync(join(PIPELINE, "closed-class-audit-words.json"), "utf8"));
const real = await import(pathToFileURL(join(PIPELINE, "speakers-llm.ts")).href);

// Planted bypass: a fake extractor that trusts any grounded-shape model reply and ships its name (a broken gate).
const leaky = async (_turns, complete) => {
  const reply = await complete({ kind: "speakers", messages: [] });
  const e = Array.isArray(reply.json) ? reply.json.find((x) => typeof x?.evidenceQuote === "string") : undefined;
  return e ? { resolved: [{ speakerRef: e.label, displayName: e.name, personId: "person:x", evidence: [], blocks: [] }] } : { resolved: [] };
};

test("ISS-U24SMART-002 recorded repro: the production gate drops the legacy reply shape (why the old probe was vacuous)", async () => {
  const complete = async () => ({ text: "", json: [{ speakerRef: "spk:0", displayName: "Priya Nair", turnIds: ["t1"] }], usage: { inputTokens: 1, outputTokens: 1 }, provider: "fake", model: "fake-1", costUsd: 0 });
  const out = await real.extractSpeakers([{ _id: "t1", tenantId: "t1", sessionId: "s1", speakerRef: "spk:0", tStart: 0, tEnd: 0, text: "My name is Priya Nair." }], complete);
  assert.equal(out.resolved.length, 0);
});

test("probe reports a planted bypass in a fake model reply (all words in the recorded corpus)", async () => {
  const caught = await probeCurrent(words, { extractSpeakers: leaky });
  assert.equal(caught.length, words.length, `ISS-U24SMART-002: ${caught.length}/${words.length} planted bypasses reported`);
});

test("probe reports clean on the compliant production extractor", async () => {
  assert.deepEqual(await probeCurrent(words.slice(0, 60), real), []);
  assert.equal(await shipsAsPerson(real.extractSpeakers, "Priya Nair", (c) => `My name is ${c}`), true);
});

test("a probe broken back to the legacy shape is detected as blind, never a vacuous clean", async () => {
  setProbeShape("legacy");
  try {
    await assert.rejects(() => probeCurrent(words.slice(0, 3), { extractSpeakers: leaky }), /vacuous/);
  } finally { setProbeShape("new"); }
});

test("built-in self-test passes both directions", async () => {
  assert.equal(await selfTest(), true);
});
