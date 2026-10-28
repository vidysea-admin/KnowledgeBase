import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import path from "node:path";
import { raiseAlert, flushFailureDigest, raiseRulesDegraded, clearRulesDegraded, type AlertDeps } from "../../packages/meeting-bot/src/autojoin/alerts.js";
import { AUTOJOIN_OFF, type AutojoinConfig } from "../../packages/meeting-bot/src/autojoin/config.js";
import { readBotEvents } from "../../packages/meeting-bot/src/autojoin/bot-events.js";

const initial = "2026-10-15T09:00:00.000Z";
const alert = { sessionKey: "checker-session", title: "Career guidance", startTime: "2026-10-15T10:00:00Z", endTime: "2026-10-15T11:00:00Z" };
function fixture(channels: Partial<AutojoinConfig["alerts"]> = {}, caps: Partial<AutojoinConfig["rateLimit"]> = {}) {
  const stateDir = mkdtempSync(path.join(process.cwd(), ".cache", "alert-checker-"));
  let time = Date.parse(initial), failEmail = false, failCalendar = false;
  const calls: string[][] = [], logs: string[] = [];
  const cfg: AutojoinConfig = { ...AUTOJOIN_OFF, present: true, alerts: { email: true, dashboard: true, calendar: true, emailTo: "checker@example.org", emailTestData: false, ...channels }, rateLimit: { ...AUTOJOIN_OFF.rateLimit, ...caps } };
  const deps = (): AlertDeps => ({ cfg, stateDir, tenantId: "checker-a", now: () => new Date(time).toISOString(), log: m => logs.push(m), gws: async args => {
    calls.push(args);
    if (args[0] === "gmail" && failEmail || args[0] === "calendar" && failCalendar) throw new Error("offline https://private.example/?token=CHECKERSECRET");
    return args[0] === "calendar" && args[2] === "insert" ? '{"id":"checker123"}' : "{}";
  } });
  return { stateDir, calls, logs, deps, advance: (ms: number) => time += ms, emailFail: (v: boolean) => failEmail = v, calendarFail: (v: boolean) => failCalendar = v, done: () => rmSync(stateDir, { recursive: true, force: true }) };
}

test("checker: disappeared lifecycle transition drains failed email after restart without repeating successful channels", async () => {
  const f = fixture();
  try {
    f.emailFail(true);
    await raiseAlert(f.deps(), { ...alert, kind: "capture-started", title: "Career https://private.example/?token=CHECKERSECRET", detail: "https://private.example/?token=CHECKERSECRET" });
    assert.equal(f.calls.filter(a => a[0] === "gmail").length, 1);
    assert.equal(readBotEvents(f.stateDir, "checker-a", 100).length, 1);
    assert.equal(readBotEvents(f.stateDir, "checker-b", 100).length, 0);
    const persisted = readFileSync(path.join(f.stateDir, "autojoin-alert-state.checker-a.json"), "utf8");
    assert.doesNotMatch(persisted + f.logs.join("\n"), /CHECKERSECRET|private\.example/);
    f.emailFail(false); f.advance(300_000);
    assert.equal(await flushFailureDigest(f.deps()), false, "boolean means digest delivered, not lifecycle replay delivered");
    assert.equal(f.calls.filter(a => a[0] === "gmail").length, 2);
    assert.equal(f.calls.filter(a => a[0] === "calendar").length, 1);
    assert.equal(readBotEvents(f.stateDir, "checker-a", 100).length, 1);
    f.advance(300_000); await flushFailureDigest(f.deps());
    assert.equal(f.calls.filter(a => a[0] === "gmail").length, 2);
  } finally { f.done(); }
});

test("checker: three transport attempts total survive reconstructed dependencies and six drain ticks", async () => {
  const f = fixture();
  try {
    f.emailFail(true); await raiseAlert(f.deps(), { ...alert, kind: "capture-done" });
    for (let i = 0; i < 6; i++) { f.advance(300_000); await flushFailureDigest(f.deps()); }
    assert.equal(f.calls.filter(a => a[0] === "gmail").length, 3);
    assert.equal(f.calls.filter(a => a[0] === "calendar").length, 1);
    assert.equal(readBotEvents(f.stateDir, "checker-a", 100).length, 1);
  } finally { f.done(); }
});

test("checker: email-disabled calendar failure drains after lifecycle disappears", async () => {
  const f = fixture({ email: false });
  try {
    f.calendarFail(true); await raiseAlert(f.deps(), { ...alert, kind: "capture-started" });
    f.calendarFail(false); f.advance(300_000); await flushFailureDigest(f.deps());
    assert.equal(f.calls.filter(a => a[0] === "calendar").length, 2);
    assert.equal(f.calls.filter(a => a[0] === "gmail").length, 0);
    assert.equal(readBotEvents(f.stateDir, "checker-a", 100).length, 1);
  } finally { f.done(); }
});

test("checker: cap deferral and calendar gap drain without repeating dashboard or raising original lifecycle again", async () => {
  const f = fixture({}, { emailPerHour: 1 });
  try {
    await raiseAlert(f.deps(), { ...alert, kind: "about-to-join" });
    f.advance(10_000); await raiseAlert(f.deps(), { ...alert, kind: "capture-started" });
    assert.equal(f.calls.filter(a => a[0] === "gmail").length, 1);
    assert.equal(f.calls.filter(a => a[0] === "calendar").length, 1);
    f.advance(60_000); await flushFailureDigest(f.deps());
    assert.equal(f.calls.filter(a => a[0] === "calendar").length, 2);
    assert.equal(f.calls.filter(a => a[0] === "gmail").length, 1);
    f.advance(3_600_000); await flushFailureDigest(f.deps());
    assert.equal(f.calls.filter(a => a[0] === "gmail").length, 2);
    assert.equal(f.calls.filter(a => a[0] === "calendar").length, 2);
    assert.equal(readBotEvents(f.stateDir, "checker-a", 100).length, 2);
  } finally { f.done(); }
});

test("checker: safety outage bypasses exhausted lifecycle cap once, survives restart and re-arms after recovery", async () => {
  const f = fixture({}, { emailPerHour: 1 });
  try {
    await raiseAlert(f.deps(), { ...alert, kind: "about-to-join" });
    const event = { tenantId: "checker-a", reason: "primary-unavailable", usingSnapshot: false };
    const first = await raiseRulesDegraded(f.deps(), event);
    assert.equal(first.email, "sent");
    assert.equal(first.dashboard, "sent");
    assert.equal(first.calendar, "skipped-no-times");
    f.advance(300_000); await raiseRulesDegraded(f.deps(), event); await flushFailureDigest(f.deps());
    assert.equal(f.calls.filter(a => a[0] === "gmail").length, 2);
    assert.equal(readBotEvents(f.stateDir, "checker-a", 100).filter(a => a.kind === "rules-degraded").length, 1);
    f.advance(15 * 24 * 3_600_000); await raiseRulesDegraded(f.deps(), event);
    assert.equal(f.calls.filter(a => a[0] === "gmail").length, 2, "outage dedupe must survive ordinary lifecycle retention expiry");
    clearRulesDegraded(f.deps()); await raiseRulesDegraded(f.deps(), event);
    assert.equal(f.calls.filter(a => a[0] === "gmail").length, 3);
    assert.equal(readBotEvents(f.stateDir, "checker-a", 100).filter(a => a.kind === "rules-degraded").length, 2);
    const prior = f.calls.length;
    assert.equal((await raiseRulesDegraded(f.deps(), { ...event, tenantId: "checker-b" })).email, "tenant-mismatch");
    assert.equal(f.calls.length, prior);
  } finally { f.done(); }
});
