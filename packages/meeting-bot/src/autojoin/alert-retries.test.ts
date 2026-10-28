/** Durable alert delivery fixtures: real state/feed files, fake GWS only, no network. */
import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { clearRulesDegraded, flushFailureDigest, raiseAlert, raiseRulesDegraded, type AlertDeps } from "./alerts.js";
import { AUTOJOIN_OFF } from "./config.js";
import { readBotEvents } from "./bot-events.js";

const START = Date.parse("2026-10-15T09:00:00Z");
const input = { kind: "about-to-join" as const, sessionKey: "session-one", title: "Career webinar",
  startTime: "2026-10-15T10:00:00Z", endTime: "2026-10-15T11:00:00Z" };
function fixture() {
  const stateDir = mkdtempSync(path.join(tmpdir(), "lkb-alert-retry-")), calls: string[][] = [], logs: string[] = [];
  let now = START, failEmail = false, failCalendar = false;
  const deps: AlertDeps = { stateDir, tenantId: "tenant-a", now: () => new Date(now).toISOString(), log: m => logs.push(m),
    cfg: { ...AUTOJOIN_OFF, present: true,
      alerts: { email: true, dashboard: true, calendar: true, emailTo: "operator@example.org", emailTestData: false },
      rateLimit: { emailPerHour: 6, failureEmailPerHour: 3, calendarMinGapSeconds: 60 } },
    gws: async args => { calls.push(args); if ((args[0] === "gmail" && failEmail) || (args[0] === "calendar" && failCalendar)) throw new Error("transport unavailable");
      return args[0] === "calendar" && args[2] === "insert" ? '{"id":"marker-one"}' : "{}"; } };
  const file = path.join(stateDir, "autojoin-alert-state.tenant-a.json");
  const read = () => JSON.parse(readFileSync(file, "utf8"));
  return { deps, calls, logs, read, file, email: (v: boolean) => { failEmail = v; }, calendar: (v: boolean) => { failCalendar = v; },
    advance: (ms: number) => { now += ms; }, done: () => rmSync(stateDir, { recursive: true, force: true }) };
}
const count = (calls: string[][], channel: string) => calls.filter(c => c[0] === channel).length;

test("one-shot email failure survives restart and flush; delivered channels never repeat", async () => {
  const f = fixture();
  try {
    f.email(true);
    assert.deepEqual(await raiseAlert(f.deps, input), { email: "failed", calendar: "created", dashboard: "sent" });
    assert.equal(f.read().retries.length, 1);
    f.email(false); f.advance(300_000);
    assert.equal(await flushFailureDigest({ ...f.deps }), false, "boolean means digest only");
    assert.equal(count(f.calls, "gmail"), 2);
    assert.equal(count(f.calls, "calendar"), 1);
    assert.equal(readBotEvents(f.deps.stateDir, "tenant-a", 100).length, 1);
    assert.equal(f.read().retries.length, 0);
    await flushFailureDigest({ ...f.deps });
    assert.equal(count(f.calls, "gmail"), 2);
  } finally { f.done(); }
});

test("three transport attempts remain bounded across drains/reconstructed dependencies", async () => {
  const f = fixture();
  try {
    f.email(true);
    await raiseAlert(f.deps, input);
    for (let i = 0; i < 6; i++) { f.advance(300_000); await flushFailureDigest({ ...f.deps }); }
    assert.equal(count(f.calls, "gmail"), 3);
    assert.equal(count(f.calls, "calendar"), 1);
    assert.equal(f.read().retries.length, 0);
  } finally { f.done(); }
});

test("ordinary rate limit retains one-shot work without spending transport attempts", async () => {
  const f = fixture();
  try {
    f.deps.cfg.rateLimit.emailPerHour = 1;
    await raiseAlert(f.deps, input);
    await raiseAlert(f.deps, { ...input, sessionKey: "session-two" });
    await flushFailureDigest(f.deps);
    assert.equal(count(f.calls, "gmail"), 1);
    assert.equal(f.read().retries.length, 1);
    assert.deepEqual(f.read().failed, {});
    f.advance(3_600_001); await flushFailureDigest({ ...f.deps });
    assert.equal(count(f.calls, "gmail"), 2);
    assert.equal(f.read().retries.length, 0);
  } finally { f.done(); }
});

test("calendar-only failure is drained even with email disabled", async () => {
  const f = fixture();
  try {
    f.deps.cfg.alerts.email = false; f.calendar(true);
    await raiseAlert(f.deps, input);
    f.calendar(false); f.advance(300_000);
    await flushFailureDigest({ ...f.deps });
    assert.equal(count(f.calls, "gmail"), 0);
    assert.equal(count(f.calls, "calendar"), 2);
    assert.equal(f.read().retries.length, 0);
  } finally { f.done(); }
});

test("held calendar transition replays after gap but cannot overwrite a newer terminal marker", async () => {
  const f = fixture();
  try {
    await raiseAlert(f.deps, input); f.advance(10_000);
    await raiseAlert(f.deps, { ...input, kind: "capture-started" });
    assert.equal(f.read().retries.length, 1);
    f.advance(60_000);
    await raiseAlert(f.deps, { ...input, kind: "capture-done" });
    f.advance(60_000); await flushFailureDigest(f.deps);
    assert.equal(count(f.calls, "calendar"), 2);
    assert.equal(f.read().calendar[input.sessionKey].kind, "capture-done");
    assert.equal(f.read().retries.length, 0);
  } finally { f.done(); }
});

test("retry payloads project/sanitize fields and reject foreign, malformed and expired rows", async () => {
  const f = fixture();
  try {
    f.email(true);
    await raiseAlert(f.deps, { ...input, title: "Talk https://zoom.us/j/99?pwd=SECRET", detail: "bad\nhttps://example.org/SECRET" });
    const s = f.read();
    assert.ok(!JSON.stringify(s.retries).includes("SECRET"));
    s.retries[0].input.emailTo = "attacker@evil.example";
    s.retries[0].input.providerCommand = "send secret";
    s.retries.push({ ...s.retries[0], tenantId: "tenant-b", input: { ...input, sessionKey: "foreign" } },
      { tenantId: "tenant-a", at: "not-date", input },
      { tenantId: "tenant-a", at: new Date(START - 15 * 24 * 3_600_000).toISOString(), input: { ...input, sessionKey: "old" } });
    writeFileSync(f.file, JSON.stringify(s));
    f.email(false); f.advance(300_000); await flushFailureDigest({ ...f.deps });
    assert.equal(count(f.calls, "gmail"), 2);
    const raw = JSON.parse(f.calls.filter(c => c[0] === "gmail").at(-1)!.at(-1)!).raw;
    const mime = Buffer.from(raw, "base64url").toString();
    assert.match(mime, /^To: operator@example.org/);
    assert.ok(!mime.includes("attacker"));
    assert.ok(!JSON.stringify(f.read().retries).includes("providerCommand"));
    assert.equal(readBotEvents(f.deps.stateDir, "tenant-b", 100).length, 0);
    assert.ok(f.logs.some(m => /foreign-tenant/.test(m)));
  } finally { f.done(); }
});

test("queue and drain are bounded; overflow reports and original age expires", async () => {
  const f = fixture();
  try {
    f.deps.cfg.alerts.calendar = false; f.email(true);
    for (let i = 0; i < 52; i++) await raiseAlert(f.deps, { ...input, sessionKey: `session-${i}` });
    assert.equal(f.read().retries.length, 50);
    assert.ok(f.logs.some(m => /backlog full/.test(m)));
    const before = count(f.calls, "gmail");
    await flushFailureDigest(f.deps);
    assert.equal(count(f.calls, "gmail") - before, 10);
    assert.equal(f.read().retries[0].at, new Date(START).toISOString());
    f.advance(14 * 24 * 3_600_000);
    await flushFailureDigest(f.deps);
    assert.equal(count(f.calls, "gmail"), before + 10);
    assert.ok(f.logs.some(m => /expired/.test(m)));
  } finally { f.done(); }
});

test("rules degradation immediately persists safe local dashboard and retries first email, no poll spam", async () => {
  const f = fixture();
  try {
    f.deps.cfg.alerts.dashboard = false; f.email(true);
    const event = { tenantId: "tenant-a", reason: "primary-unavailable", usingSnapshot: true, snapshotValidatedAt: START - 1000, snapshotExpiresAt: START - 1000 + 3_600_000 };
    await raiseRulesDegraded(f.deps, event);
    assert.equal(readBotEvents(f.deps.stateDir, "tenant-a", 10)[0]!.kind, "rules-degraded");
    f.email(false); f.advance(300_000); await flushFailureDigest(f.deps);
    await raiseRulesDegraded(f.deps, event);
    assert.equal(count(f.calls, "gmail"), 2);
    assert.equal(count(f.calls, "calendar"), 0);
    assert.equal(readBotEvents(f.deps.stateDir, "tenant-a", 10).length, 1);
    await raiseRulesDegraded(f.deps, { reason: "bad https://SECRET.example/token", usingSnapshot: false });
    assert.ok(!readFileSync(path.join(f.deps.stateDir, "bot-events.jsonl"), "utf8").includes("SECRET"));
    const before = f.calls.length;
    assert.equal((await raiseRulesDegraded(f.deps, { ...event, tenantId: "tenant-b" })).dashboard, "tenant-mismatch");
    assert.equal(f.calls.length, before);
    for (const reason of ["evaluation-failed", "primary-changed"]) {
      await raiseRulesDegraded(f.deps, { tenantId: "tenant-a", reason, usingSnapshot: false });
      assert.ok(readBotEvents(f.deps.stateDir, "tenant-a", 10).some(r => r.detail?.includes(`Reason: ${reason}.`)));
    }
    await raiseRulesDegraded(f.deps, { ...event, snapshotValidatedAt: START, snapshotExpiresAt: START + 3_600_000 });
    assert.equal(readBotEvents(f.deps.stateDir, "tenant-a", 10).filter(r => r.detail?.includes("Reason: primary-unavailable.")).length, 1,
      "changing metadata cannot create unbounded repeated safety transitions within an outage");
  } finally { f.done(); }
});

test("first safety email bypasses full ordinary cap; outage restart/changes dedupe and healthy reset re-arms", async () => {
  const f = fixture();
  try {
    for (let i = 0; i < 6; i++) await raiseAlert(f.deps, { ...input, sessionKey: `normal-${i}` });
    const event = { tenantId: "tenant-a", reason: "no-valid-snapshot", usingSnapshot: false };
    await raiseRulesDegraded(f.deps, event);
    assert.equal(count(f.calls, "gmail"), 7, "dedicated safety allowance does not wait on ordinary cap");
    await raiseRulesDegraded({ ...f.deps }, event);
    await raiseRulesDegraded({ ...f.deps }, { ...event, reason: "primary-identity-invalid" });
    assert.equal(count(f.calls, "gmail"), 7, "one email across reason changes in the same outage");
    assert.equal(f.read().emailLog.length, 6, "ordinary rolling cap unchanged");
    clearRulesDegraded({ ...f.deps });
    await raiseRulesDegraded({ ...f.deps }, event);
    assert.equal(count(f.calls, "gmail"), 8, "same reason after healthy reset starts another outage");
    const before = f.calls.length;
    const r = await raiseAlert(f.deps, { ...input, kind: "rules-degraded", sessionKey: "arbitrary-bypass" });
    assert.equal(r.email, "invalid-outage"); assert.equal(f.calls.length, before);
  } finally { f.done(); }
});

test("healthy reset discards undelivered old safety work and failure attempts are per outage", async () => {
  const f = fixture();
  try {
    f.email(true);
    const event = { tenantId: "tenant-a", reason: "no-valid-snapshot", usingSnapshot: false };
    await raiseRulesDegraded(f.deps, event);
    for (let i = 0; i < 5; i++) await flushFailureDigest({ ...f.deps });
    assert.equal(count(f.calls, "gmail"), 3);
    clearRulesDegraded(f.deps);
    f.email(false); await flushFailureDigest(f.deps);
    assert.equal(count(f.calls, "gmail"), 3);
    await raiseRulesDegraded(f.deps, event);
    assert.equal(count(f.calls, "gmail"), 4);
  } finally { f.done(); }
});

test("full ordinary backlog retains and prioritizes safety transport retry", async () => {
  const f = fixture();
  try {
    f.deps.cfg.alerts.calendar = false; f.email(true);
    for (let i = 0; i < 50; i++) await raiseAlert(f.deps, { ...input, sessionKey: `held-${i}` });
    await raiseRulesDegraded(f.deps, { tenantId: "tenant-a", reason: "no-valid-snapshot", usingSnapshot: false });
    assert.equal(f.read().retries.length, 50);
    assert.equal(f.read().retries[0].input.kind, "rules-degraded");
    f.email(false); await flushFailureDigest(f.deps);
    const next = f.calls.filter(c => c[0] === "gmail")[51]!;
    const raw = Buffer.from(JSON.parse(next.at(-1)!).raw, "base64url").toString();
    const subject = raw.match(/Subject: =\?UTF-8\?B\?([^?]+)\?=/)![1]!;
    assert.match(Buffer.from(subject, "base64").toString(), /Join rules DEGRADED/);
    assert.ok(f.read().done[`${f.read().rulesOutage.id}|rules-degraded|email`]);
    assert.ok(f.logs.some(m => /displaced/.test(m)));
  } finally { f.done(); }
});

test("an ongoing outage stays deduplicated after the ordinary 14-day retention period", async () => {
  const f = fixture();
  try {
    const event = { tenantId: "tenant-a", reason: "no-valid-snapshot", usingSnapshot: false };
    await raiseRulesDegraded(f.deps, event);
    f.advance(15 * 24 * 3_600_000);
    await raiseRulesDegraded({ ...f.deps }, event);
    assert.equal(count(f.calls, "gmail"), 1);
    assert.equal(readBotEvents(f.deps.stateDir, "tenant-a", 10).length, 1);
    clearRulesDegraded(f.deps);
    await raiseRulesDegraded(f.deps, event);
    assert.equal(count(f.calls, "gmail"), 2);
  } finally { f.done(); }
});
