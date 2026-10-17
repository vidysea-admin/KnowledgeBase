/**
 * ISS-WEBHIGH-002 — parity of parseStrictEmail with the shared sender fixture (qa/fixtures/sender-validation.json), which
 * apps/api's isPrintableAsciiSender is asserted against too. Drift in either validator fails its own test.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { parseStrictEmail } from "./join-rules-normalize.js";

const FIXTURE: { cases: { name: string; value: string; accept: boolean }[] } = JSON.parse(readFileSync(new URL("../../../../../qa/fixtures/sender-validation.json", import.meta.url), "utf8"));

test("shared fixture: parseStrictEmail matches every accept/reject row exactly", () => {
  assert.ok(FIXTURE.cases.length >= 20);
  for (const c of FIXTURE.cases) assert.equal(parseStrictEmail(c.value) !== undefined, c.accept, c.name);
});
