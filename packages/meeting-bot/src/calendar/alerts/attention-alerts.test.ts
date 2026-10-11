import { test } from "node:test";
import assert from "node:assert/strict";
import type { SkippedItem } from "@lkb/core";
import { buildAttentionAlerts, selectNewAlerts, neutralizeText, renderStart, alertIdFor } from "./attention-alerts.js";

const NOW = "2026-10-10T00:00:00.000Z";
const sk = (reason: string, key = "cal:e1", title = "Weekly Webinar"): SkippedItem =>
  ({ sessionKey: key, source: "calendar", sourceId: "e1", title, reason } as SkippedItem);
const run = (extra: Record<string, unknown> = {}) =>
  buildAttentionAlerts({ titlePolicy: "masked", timeZone: "Asia/Kolkata", now: NOW, ...extra } as never);
function deepFreeze<T>(o: T): T {
  if (o && typeof o === "object") { Object.freeze(o); for (const v of Object.values(o)) deepFreeze(v); }
  return o;
}

test("each skipped reason maps to the right case", () => {
  const cases: Record<string, string> = { "needs-registration": "needs-registration", "overlap-lost": "overlap-lost",
    "untrusted-sender": "untrusted-sender", "no-join-link": "join-link", "unsafe-join-link": "join-link" };
  for (const [reason, c] of Object.entries(cases)) {
    const r = run({ skipped: [sk(reason)] });
    assert.equal(r.alerts.length, 1, reason);
    assert.equal(r.alerts[0]!.case, c);
    assert.match(r.alerts[0]!.body, /What to do:/);
    assert.match(r.alerts[0]!.body, /Weekly Webinar/);
  }
  const none = run({ skipped: [sk("past"), sk("cancelled"), sk("duplicate-session")] });
  assert.equal(none.alerts.length, 0);
  assert.equal(none.ignored.count, 3);
});

test("action_required job rows: mapped reasons and generic reason", () => {
  const r = run({ jobs: {
    a: { status: "action_required", reason: "needs-registration", title: "A" },
    b: { status: "action_required", reason: "retry-limit", title: "B" },
    c: { status: "action_required", reason: "evil <b>reason</b>", title: "C" },
    d: { status: "ready", title: "D" },
  } });
  const by = Object.fromEntries(r.alerts.map((a) => [a.id, a])) as Record<string, (typeof r.alerts)[number]>;
  assert.equal(by[alertIdFor("a")]!.case, "needs-registration");
  assert.equal(by[alertIdFor("b")]!.case, "action-required");
  assert.match(by[alertIdFor("b")]!.body, /Reason: retry-limit\./);
  assert.match(by[alertIdFor("c")]!.body, /Reason: unspecified\./);
  assert.equal(r.ignored.reasons["job-not-action-required"], 1);
});

test("dedupe key stable across ticks, differs by event and case, has no time or url", () => {
  const a1 = run({ skipped: [sk("overlap-lost")], startTimes: { "cal:e1": "2026-10-12T10:00:00Z" } }).alerts[0]!;
  const a2 = buildAttentionAlerts({ titlePolicy: "masked", skipped: [sk("overlap-lost", "cal:e1", "Renamed title")], timeZone: "UTC", now: "2026-10-11T00:00:00Z",
    startTimes: { "cal:e1": "2026-10-12T10:00:00Z" } }).alerts[0]!;
  assert.equal(a1.key, a2.key);
  assert.notEqual(a1.key, run({ skipped: [sk("overlap-lost", "cal:e2")] }).alerts[0]!.key);
  assert.notEqual(a1.key, run({ skipped: [sk("needs-registration")] }).alerts[0]!.key);
  assert.equal(a1.key, `attn:overlap-lost:${alertIdFor("cal:e1")}`);
  assert.match(a1.key, /^attn:overlap-lost:[0-9a-f]{20}$/);
  // same situation seen as skip and as job row dedupes together
  const j = run({ jobs: { "cal:e1": { status: "action_required", reason: "overlap-lost", title: "x" } } }).alerts[0]!;
  assert.equal(j.key, a1.key);
});

test("redaction: pwd, registrant token, passcode never appear", () => {
  const title = "Join https://zoom.us/j/123?pwd=SECRETPWD&tk=REGTOKEN987 passcode: 445566 mail bob@evil.example token=abc123 www.x.com/?pwd=zz";
  const r = run({
    skipped: [sk("needs-registration", "cal:e1", title)],
    jobs: { j1: { status: "action_required", reason: "needs-registration", title,
      registration: { url: "https://x.example/register?tk=REGTOKEN987", email: "me@corp.example" }, meetingUrl: "https://z.us/j/1?pwd=SECRETPWD" } },
  });
  const s = JSON.stringify(r);
  for (const bad of ["SECRETPWD", "REGTOKEN987", "445566", "bob@evil.example", "me@corp.example", "abc123", "https://", "x.example"]) {
    assert.ok(!s.includes(bad), bad);
  }
});

test("hostile titles are neutralised and bounded", () => {
  const hostile = ["*bold* _it_ `code` [x](javascript:alert(1)) <script>alert(1)</script> <a href=x>", "line1\nline2\r\nline3\u2028x",
    "evil\u202eexe.txt\u2066\u200f", "javascript:alert(1)", "A".repeat(5000)];
  for (const h of hostile) {
    const a = run({ skipped: [sk("overlap-lost", "cal:e1", h)] }).alerts[0]!;
    const t = neutralizeText(h);
    assert.ok(Array.from(t).length <= 80);
    assert.ok(Array.from(a.title).length <= 120);
    assert.doesNotMatch(a.title, /[*_`[\]<>\\]|javascript:|[\u202a-\u202e\u2066-\u2069\u200e\u200f\n\r]/i);
    assert.doesNotMatch(a.body.split("\n")[1]!, /[*_`[\]<>\\\r]|javascript:/i);
    assert.equal(a.body.split("\n").length, 4); // no injected lines
  }
  assert.ok(neutralizeText("word ".repeat(1000)).endsWith("\u2026"));
  assert.equal(neutralizeText("   \n "), "(untitled)");
  assert.equal(neutralizeText(42), "(untitled)");
});

test("time zone: Asia/Kolkata +05:30 across a date boundary, explicit zone", () => {
  assert.equal(renderStart("2026-10-10T19:00:00Z", "Asia/Kolkata"), "2026-10-11 00:30 (Asia/Kolkata)");
  assert.equal(renderStart("2026-10-10T19:00:00Z", "UTC"), "2026-10-10 19:00 (UTC)");
  assert.equal(renderStart("2026-10-10T19:00:00Z", "Not/AZone"), "2026-10-10 19:00 (UTC)");
  assert.equal(renderStart("garbage", "UTC"), "start time unknown");
  const a = run({ skipped: [sk("needs-registration")], startTimes: { "cal:e1": "2026-10-10T19:00:00Z" } }).alerts[0]!;
  assert.match(a.body, /Starts: 2026-10-11 00:30 \(Asia\/Kolkata\)/);
});

test("ordering by start time then key; past starts dropped", () => {
  const r = run({
    skipped: [sk("overlap-lost", "cal:b"), sk("overlap-lost", "cal:a"), sk("overlap-lost", "cal:c"), sk("overlap-lost", "cal:old"), sk("overlap-lost", "cal:nostart")],
    startTimes: { "cal:b": "2026-10-12T00:00:00Z", "cal:a": "2026-10-12T00:00:00Z", "cal:c": "2026-10-11T00:00:00Z", "cal:old": "2026-10-09T00:00:00Z" },
  });
  assert.deepEqual(r.alerts.map((a) => a.id), [alertIdFor("cal:c"), ...["cal:a", "cal:b"].map(alertIdFor).sort(), alertIdFor("cal:nostart")]);
  assert.equal(r.ignored.reasons["already-started"], 1);
});

test("selectNewAlerts: new vs seen, retention bound, in-batch duplicates", () => {
  const mk = (n: number) => run({ skipped: Array.from({ length: n }, (_, i) => sk("overlap-lost", `cal:k${i}`)) }).alerts;
  const alerts = mk(5);
  const first = selectNewAlerts(alerts, [], 100);
  assert.equal(first.fresh.length, 5);
  const second = selectNewAlerts(alerts, first.keys, 100);
  assert.equal(second.fresh.length, 0);
  assert.deepEqual(second.keys, first.keys);
  const capped = selectNewAlerts(alerts, ["old1", "old2"], 4);
  assert.equal(capped.keys.length, 4);
  assert.deepEqual(capped.keys, alerts.slice(1).map((a) => a.key));
  assert.equal(selectNewAlerts([alerts[0]!, alerts[0]!], [], 10).fresh.length, 1);
  assert.equal(selectNewAlerts(alerts, "bad" as never, 0).fresh.length, 5);
});

test("malformed input is counted, never thrown", () => {
  const r = run({ skipped: [null, 7, { sessionKey: 5 }, { sessionKey: "" }, { sessionKey: "k", reason: 3 }, sk("needs-registration")],
    jobs: { x: null, y: "s", z: { status: 4 }, w: [] } });
  assert.equal(r.alerts.length, 1);
  assert.equal(r.ignored.count, 9);
  assert.equal(run({ skipped: "no", jobs: [] }).ignored.count, 2);
  assert.doesNotThrow(() => buildAttentionAlerts(undefined as never));
  assert.doesNotThrow(() => buildAttentionAlerts({ titlePolicy: "masked", timeZone: 5, now: 9 } as never));
});

test("inputs are not mutated (deep-frozen)", () => {
  const input = deepFreeze({ titlePolicy: "masked", skipped: [sk("needs-registration")], jobs: { j: { status: "action_required", reason: "retry-limit", title: "t" } },
    startTimes: { "cal:e1": "2026-10-12T00:00:00Z" }, timeZone: "Asia/Kolkata", now: NOW });
  const r = buildAttentionAlerts(input as never);
  assert.equal(r.alerts.length, 2);
  const seen = deepFreeze(["a"]);
  assert.doesNotThrow(() => selectNewAlerts(deepFreeze(r.alerts), seen, 3));
});
