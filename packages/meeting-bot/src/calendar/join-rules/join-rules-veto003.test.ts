/**
 * ISS-T037VETO-003 (ruling 2): invalid rule set stays fail-closed; the validation error is logged once per tick and alerted;
 * enforcement stays OFF by default. Recorded reproductions from qa/issues.jsonl are replayed verbatim.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import type { AutoRecordItem, SelectAutoRecordItemsResult } from "@lkb/core";
import { applyJoinRules } from "./join-rules-select.js";
import { enforceJoinRules, parseJoinRulesEnforce, type JoinRulesDegradation } from "./join-rules-enforce.js";
import type { JoinRuleSet } from "./join-rules.js";
import type { StoredJoinRules } from "./join-rules-store.js";

const item = (id: string, sender?: string): AutoRecordItem => ({ sessionKey: `cal:${id}`, source: "calendar", sourceId: id, title: id,
  startTime: "2026-10-10T10:00:00Z", endTime: "2026-10-10T11:00:00Z", meetingUrl: `https://meet.google.com/abc-defg-hi${id}`, sender });
const sel = (): SelectAutoRecordItemsResult => ({ toSchedule: [item("e1", "a@x.com"), item("e2")], skipped: [] });

// Verbatim from ISS-T037VETO-003 evidence: {version:2,ownDomains:[],rules:[]}, null, {}, [], "str"; state null/{}.
const BAD_SETS: unknown[] = [{ version: 2, ownDomains: [], rules: [] }, null, {}, [], "str"];
const BAD_STATES: unknown[] = [null, {}];
const GOOD: JoinRuleSet = { version: 1, ownDomains: [], rules: [] };

test("ISS-T037VETO-003 reproductions: every bad rule set / state still removes ALL items (fail closed), logged exactly once", () => {
  let n = 0;
  for (const bad of BAD_SETS) {
    const logs: string[] = [];
    const r = applyJoinRules(sel(), bad as JoinRuleSet, { log: (m) => logs.push(m) });
    assert.equal(r.toSchedule.length, 0); assert.equal(r.skipped.length, 2);
    assert.ok(r.skipped.every((s) => s.reason === "rules-unevaluable"));
    assert.equal(logs.length, 1, "once per tick, not once per item");
    assert.match(logs[0]!, /rule set: .+/); // carries the validation error detail
    n++;
  }
  for (const bad of BAD_STATES) {
    const logs: string[] = [];
    const r = applyJoinRules(sel(), GOOD, { state: bad as never, log: (m) => logs.push(m) });
    assert.equal(r.toSchedule.length, 0);
    assert.equal(logs.length, 1);
    assert.match(logs[0]!, /state: .+/);
    n++;
  }
  assert.equal(n, 7); // ISS-T037VETO-003: 7/7 reproductions replayed
});

test("valid empty rule set and undefined rules keep everything and log nothing", () => {
  const logs: string[] = []; const s = sel();
  assert.equal(applyJoinRules(s, GOOD, { log: (m) => logs.push(m) }), s);
  assert.equal(applyJoinRules(s, undefined, { log: (m) => logs.push(m) }), s);
  assert.deepEqual(logs, []);
});

test("a throwing log sink never widens access", () => {
  const r = applyJoinRules(sel(), null as never, { log: () => { throw new Error("sink"); } });
  assert.equal(r.toSchedule.length, 0);
});

test("log line is sanitised (no control characters or paths)", () => {
  const logs: string[] = [];
  applyJoinRules(sel(), GOOD, { state: null as never, log: (m) => logs.push(m) });
  assert.ok(!/[\u0000-\u001f]/.test(logs[0]!) && logs[0]!.length < 600);
});

for (const mode of ["fail-closed", "last-valid"] as const) {
  test(`enforce (${mode}): invalid stored rule set -> logged once and an alert raised through onDegraded`, async () => {
    const logs: string[] = []; const events: JoinRulesDegradation[] = [];
    const out = await enforceJoinRules(sel(), { mode, tenantId: "ten-a", keyTenantId: "ten-a", stateDir: "/nonexistent", log: (m) => logs.push(m),
      io: { load: () => ({ ruleSet: { version: 2, ownDomains: [], rules: [] }, state: { approvedSenders: [], approvedDomains: [], optedOutEventIds: [] } }) as unknown as StoredJoinRules },
      onDegraded: (e) => { events.push(e); } });
    assert.equal(out.toSchedule.length, 0);
    assert.equal(logs.filter((l) => l.includes("invalid rule set")).length, 1);
    // last-valid may also report an unrelated snapshot-write-failed (no real state dir here); the evaluation alert must be present once.
    assert.equal(events.filter((e) => e.reason === "evaluation-failed").length, 1);
    if (mode === "fail-closed") assert.equal(events.length, 1);
  });
}

test("enforcement flag is OFF by default: absent / unknown values parse to off and the selection is returned untouched", async () => {
  for (const v of [undefined, null, "", "off", "true", "1", "garbage"]) assert.equal(parseJoinRulesEnforce(v), "off", String(v));
  const s = sel(); const events: unknown[] = [];
  const out = await enforceJoinRules(s, { mode: undefined, tenantId: "ten-a", stateDir: "/nonexistent", log: () => {}, onDegraded: (e) => { events.push(e); },
    io: { load: () => { throw new Error("must not load when off"); } } });
  assert.equal(out, s);
  assert.deepEqual(events, []);
});
