import { test } from "node:test";
import assert from "node:assert/strict";
import type { SkippedItem } from "@lkb/core";
import { buildAttentionAlerts, alertIdFor } from "./attention-alerts.js";
import { resolveAlertId, normaliseAlertId, type AlertCandidate } from "./alert-resolve.js";

const NOW = "2026-10-10T00:00:00.000Z";
const cand = (sessionKey: string, title = "T"): AlertCandidate => ({ sessionKey, title, source: "test" });
const KEYS = ["cal:e1", "cal:e2", "gmail:64f0c0ffee0123456789abcd", "webinar-0123456789abcdef01234567", "src-review-9", "cal:a_20261012T100000Z"];

test("hit: the id resolves to exactly the one candidate; miss: no matches, ok=true", () => {
  const cs = KEYS.map((k) => cand(k));
  const r = resolveAlertId(alertIdFor("cal:e2"), cs);
  assert.ok(r.ok); assert.deepEqual(r.matches.map((m) => m.sessionKey), ["cal:e2"]);
  const miss = resolveAlertId(alertIdFor("cal:unknown"), cs);
  assert.ok(miss.ok); assert.equal(miss.matches.length, 0);
  const none = resolveAlertId(alertIdFor("cal:e1"), []);
  assert.ok(none.ok); assert.equal(none.matches.length, 0);
});

test("ISS-ALERTFIX-001 verbatim: ids printed by REAL formatter calls (omit policy) resolve to the right meeting", () => {
  const cs = KEYS.map((k) => cand(k));
  let ok = 0, n = 0;
  const reasons = ["overlap-lost", "untrusted-sender", "no-join-link", "needs-registration"];
  for (const key of KEYS) for (const reason of reasons) {
    const sk = { sessionKey: key, source: "calendar", sourceId: "x", title: "Board call pass 1234", reason } as SkippedItem;
    const a = buildAttentionAlerts({ skipped: [sk], timeZone: "UTC", now: NOW } as never).alerts[0]!;
    const printed = /\[([0-9a-f]{20})\]/.exec(a.title)![1]!; // what the operator copies from the alert
    const viaBody = /Event ref: ([0-9a-f]{20}) /.exec(a.body)![1]!;
    for (const pasted of [printed, `[${printed}]`, viaBody]) {
      n++;
      const r = resolveAlertId(pasted, cs);
      if (r.ok && r.matches.length === 1 && r.matches[0]!.sessionKey === key) ok++;
    }
  }
  console.log(`ISS-ALERTFIX-001: ${ok}/${n} resolved`);
  assert.equal(ok, n); assert.equal(n, KEYS.length * reasons.length * 3);
});

test("accepted forms: bare, [bracketed], padded, upper-case; same id out", () => {
  const id = alertIdFor("cal:e1");
  for (const f of [id, `[${id}]`, `  ${id}\n`, ` [${id}] `, id.toUpperCase(), `[${id.toUpperCase()}]`]) {
    const n = normaliseAlertId(f);
    assert.deepEqual(n, { ok: true, id }, JSON.stringify(f));
  }
});

test("malformed ids are refused with a typed reason and never throw", () => {
  const id = alertIdFor("cal:e1");
  const bad: [unknown, string][] = [[undefined, "not-text"], [null, "not-text"], [42, "not-text"], [{}, "not-text"], ["", "empty"], ["  ", "empty"], ["[]", "empty"],
    [id.slice(1), "wrong-length"], [id + "0", "wrong-length"], ["x".repeat(5000), "wrong-length"], ["g".repeat(20), "not-hex"],
    [`${id.slice(0, 10)} ${id.slice(10)}`, "wrong-length"], [`id:${id}`, "wrong-length"], [`0x${id.slice(2)}`, "not-hex"], [`(${id.slice(1, 19)})`, "not-hex"],
    [`[[${id}]]`, "wrong-length"], [`[${id}`, "wrong-length"], [`${id.slice(0, 19)}е`, "not-hex"], [`${id.slice(0, 19)}\u0000`, "not-hex"]];
  for (const [v, reason] of bad) {
    const r = resolveAlertId(v, [cand("cal:e1")]);
    assert.deepEqual(r, { ok: false, reason }, JSON.stringify(v)?.slice(0, 40));
  }
});

test("collision: every matching candidate is returned (forced at the function boundary via the hash seam)", () => {
  const cs = [cand("k1"), cand("k2"), cand("k3")];
  const id = "a".repeat(20);
  const r = resolveAlertId(id, cs, (k) => (k === "k3" ? "b".repeat(20) : id));
  assert.ok(r.ok); assert.deepEqual(r.matches.map((m) => m.sessionKey), ["k1", "k2"]);
});

test("a throwing hash or a malformed candidate is skipped, not fatal", () => {
  const id = alertIdFor("cal:ok");
  const cs = [cand("cal:ok"), { sessionKey: 5 } as never, null as never, cand("boom")];
  const r = resolveAlertId(id, cs, (k) => { if (k === "boom") throw new Error("x"); return alertIdFor(k); });
  assert.ok(r.ok); assert.deepEqual(r.matches.map((m) => m.sessionKey), ["cal:ok"]);
});

test("production resolver uses the alert formatter's own hash (anchor value pinned by the alert tests)", () => {
  const r = resolveAlertId("69c86e49f0d76452a89a", [cand("cal:e1")]);
  assert.ok(r.ok); assert.equal(r.matches.length, 1);
});
