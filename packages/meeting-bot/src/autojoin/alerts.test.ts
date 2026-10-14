/** Alerts: email + dashboard feed + private calendar marker, rate limits, dedup, failure isolation. A fake gws runner only; the real binary is never started. */
import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, readFileSync, rmSync, writeFileSync, existsSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";

import { raiseAlert, type AlertDeps } from "./alerts.js";
import { loadAutojoinConfig } from "./config.js";
import { readBotEvents } from "./bot-events.js";
import { buildRawEmail, type AutojoinGwsRunner } from "./gws-channels.js";

const NOW = "2026-10-15T09:00:00.000Z";
const cfg = (over: Record<string, unknown> = {}) => {
  const dir = mkdtempSync(path.join(tmpdir(), "lkb-aj-cfg-"));
  const f = path.join(dir, "autojoin.json");
  writeFileSync(f, JSON.stringify({ discovery: true, webinarAutoJoin: true, alerts: { email: true, dashboard: true, calendar: true, emailTo: "umeshsugara@vidysea.com" }, rateLimit: { emailPerHour: 2, calendarMinGapSeconds: 60 }, ...over }));
  try { return loadAutojoinConfig("/nonexistent", { LKB_AUTOJOIN_CONFIG: f }); } finally { rmSync(dir, { recursive: true, force: true }); }
};

function setup(over: Record<string, unknown> = {}, gwsImpl?: (args: string[]) => string) {
  const stateDir = mkdtempSync(path.join(tmpdir(), "lkb-aj-"));
  const calls: string[][] = [];
  let clock = Date.parse(NOW);
  const gws: AutojoinGwsRunner = async (args) => { calls.push(args); if (gwsImpl) return gwsImpl(args); return args[1] === "events" && args[2] === "insert" ? 'Using keyring backend: keyring\n{"id":"evt12345"}' : "{}"; };
  const logs: string[] = [];
  const deps: AlertDeps = { cfg: cfg(over), stateDir, tenantId: "ten-a", now: () => new Date(clock).toISOString(), log: (m) => logs.push(m), gws };
  return { deps, calls, logs, stateDir, tick: (ms: number) => { clock += ms; }, done: () => rmSync(stateDir, { recursive: true, force: true }) };
}
const A = { sessionKey: "webinar-aaa", title: "Career Counselling Masterclass", startTime: "2026-10-15T10:00:00Z", endTime: "2026-10-15T11:00:00Z", careerGuidance: true, matchedKeywords: ["career", "counselling"] };

test("about-to-join fires all three channels once: email to Umesh, dashboard row, private calendar marker", async () => {
  const s = setup();
  try {
    const r = await raiseAlert(s.deps, { kind: "about-to-join", ...A });
    assert.deepEqual(r, { email: "sent", calendar: "created", dashboard: "sent" });
    const send = s.calls.find((c) => c[0] === "gmail");
    assert.deepEqual(send?.slice(0, 4), ["gmail", "users", "messages", "send"]);
    const raw = JSON.parse(send![send!.indexOf("--json") + 1]!).raw as string;
    const mime = Buffer.from(raw, "base64url").toString("utf8");
    assert.match(mime, /^To: umeshsugara@vidysea\.com\r\n/);
    const cal = s.calls.find((c) => c[0] === "calendar")!;
    const body = JSON.parse(cal[cal.indexOf("--json") + 1]!);
    assert.equal(body.summary, "\u{1F916} LKB bot recording: Career Counselling Masterclass");
    assert.equal(body.visibility, "private");
    assert.equal(body.transparency, "transparent");
    assert.equal(body.attendees, undefined, "no attendees: nobody else is invited or notified");
    assert.equal(JSON.parse(cal[cal.indexOf("--params") + 1]!).sendUpdates, "none");
    assert.match(body.description, /STATUS: JOINING/);
    const rows = readBotEvents(s.stateDir, "ten-a", 10);
    assert.equal(rows.length, 1);
    assert.deepEqual([rows[0]!.kind, rows[0]!.careerGuidance, rows[0]!.matchedKeywords], ["about-to-join", true, ["career", "counselling"]]);
    assert.deepEqual(readBotEvents(s.stateDir, "ten-b", 10), [], "another tenant sees nothing");
  } finally { s.done(); }
});

test("the same event is never alerted twice, across ticks (state persisted)", async () => {
  const s = setup();
  try {
    await raiseAlert(s.deps, { kind: "about-to-join", ...A });
    const before = s.calls.length;
    s.tick(300_000);
    const r = await raiseAlert(s.deps, { kind: "about-to-join", ...A });
    assert.deepEqual(r, { email: "duplicate", calendar: "duplicate", dashboard: "duplicate" });
    assert.equal(s.calls.length, before);
    assert.equal(readBotEvents(s.stateDir, "ten-a", 10).length, 1);
  } finally { s.done(); }
});

test("status changes update the SAME calendar marker (patch, by our stored id), no second event", async () => {
  const s = setup({ rateLimit: { emailPerHour: 10, calendarMinGapSeconds: 60 } });
  try {
    await raiseAlert(s.deps, { kind: "about-to-join", ...A });
    s.tick(600_000);
    const r = await raiseAlert(s.deps, { kind: "capture-started", ...A });
    assert.equal(r.calendar, "updated");
    s.tick(600_000);
    await raiseAlert(s.deps, { kind: "capture-done", ...A, outputPath: "data/toc-migrated/webinar-aaa" });
    const cal = s.calls.filter((c) => c[0] === "calendar");
    assert.deepEqual(cal.map((c) => c[2]), ["insert", "patch", "patch"]);
    const last = JSON.parse(cal[2]![cal[2]!.indexOf("--json") + 1]!);
    assert.match(last.description, /STATUS: DONE/);
    assert.match(last.description, /Output: data\/toc-migrated\/webinar-aaa/);
    assert.match(last.description, /joining > .*recording > .*done/);
    assert.equal(JSON.parse(cal[1]![cal[1]!.indexOf("--params") + 1]!).eventId, "evt12345");
  } finally { s.done(); }
});

test("calendar updates for one session are at least calendarMinGapSeconds apart; the update is retried, not lost", async () => {
  const s = setup();
  try {
    await raiseAlert(s.deps, { kind: "about-to-join", ...A });
    s.tick(10_000);
    assert.equal((await raiseAlert(s.deps, { kind: "capture-started", ...A })).calendar, "rate-limited");
    s.tick(120_000);
    assert.equal((await raiseAlert(s.deps, { kind: "capture-started", ...A })).calendar, "updated");
  } finally { s.done(); }
});

test("email cap: at most emailPerHour per rolling hour, but failure events always go out", async () => {
  const s = setup({ rateLimit: { emailPerHour: 2, calendarMinGapSeconds: 60 } });
  try {
    const out: string[] = [];
    for (const sk of ["s1", "s2", "s3"]) out.push((await raiseAlert(s.deps, { kind: "about-to-join", ...A, sessionKey: sk })).email);
    assert.deepEqual(out, ["sent", "sent", "rate-limited"]);
    assert.equal((await raiseAlert(s.deps, { kind: "capture-failed", ...A, sessionKey: "s3", detail: "no recording" })).email, "sent");
    s.tick(3_700_000);
    assert.equal((await raiseAlert(s.deps, { kind: "about-to-join", ...A, sessionKey: "s3" })).email, "sent", "cap window rolled over, the held alert goes out");
  } finally { s.done(); }
});

test("test-data (non-career) webinars: dashboard + calendar always, email only on failure", async () => {
  const s = setup();
  try {
    const t = { ...A, title: "Google Cloud OnAir", careerGuidance: false, testData: true, matchedKeywords: [] };
    assert.equal((await raiseAlert(s.deps, { kind: "about-to-join", ...t })).email, "skipped-test-data");
    assert.equal(s.calls.filter((c) => c[0] === "gmail").length, 0);
    assert.equal((await raiseAlert(s.deps, { kind: "capture-stopped-early", ...t, detail: "recorder exited" })).email, "sent");
  } finally { s.done(); }
});

test("one failing channel does not block or repeat the others; failures are retried at most 3 times", async () => {
  const s = setup({}, (args) => { if (args[0] === "gmail") throw new Error("gws failed (1): quota"); return args[2] === "insert" ? '{"id":"evt12345"}' : "{}"; });
  try {
    const first = await raiseAlert(s.deps, { kind: "about-to-join", ...A });
    assert.deepEqual(first, { email: "failed", calendar: "created", dashboard: "sent" });
    for (let i = 0; i < 4; i++) { s.tick(300_000); await raiseAlert(s.deps, { kind: "about-to-join", ...A }); }
    assert.equal(s.calls.filter((c) => c[0] === "gmail").length, 3, "email attempted exactly 3 times then given up");
    assert.equal(s.calls.filter((c) => c[0] === "calendar").length, 1);
    assert.equal(readBotEvents(s.stateDir, "ten-a", 10).length, 1);
  } finally { s.done(); }
});

test("nothing sensitive leaves: URLs are stripped from every channel and the logs", async () => {
  const s = setup();
  try {
    await raiseAlert(s.deps, { kind: "capture-failed", ...A, title: "Talk https://zoom.us/w/123?tk=SECRET9 now", detail: "see https://zoom.us/j/9?pwd=SECRET9" });
    const everything = JSON.stringify(s.calls) + Buffer.from(JSON.parse(s.calls.find((c) => c[0] === "gmail")!.at(-1)!).raw, "base64url").toString() +
      readFileSync(path.join(s.stateDir, "bot-events.jsonl"), "utf8") + s.logs.join("\n");
    assert.ok(!/SECRET9/.test(everything) && !/zoom\.us/.test(everything));
  } finally { s.done(); }
});

test("all channels off or invalid recipient: no call, no files", async () => {
  const s = setup({ alerts: { email: false, dashboard: false, calendar: false, emailTo: "x" } });
  try {
    assert.deepEqual(await raiseAlert(s.deps, { kind: "about-to-join", ...A }), { email: "off", calendar: "off", dashboard: "off" });
    assert.equal(s.calls.length, 0);
    assert.ok(!existsSync(path.join(s.stateDir, "bot-events.jsonl")));
  } finally { s.done(); }
});

test("email is RFC 2047/base64 encoded (non-ASCII safe) and header injection in the subject is impossible", () => {
  const raw = Buffer.from(buildRawEmail("a@b.co", "Career — talk\r\nBcc: evil@x.com", "body é"), "base64url").toString("utf8");
  assert.ok(!/\r\nBcc:/i.test(raw));
  assert.match(raw, /Subject: =\?UTF-8\?B\?[A-Za-z0-9+/=]+\?=/);
});

test("config: file defaults, env overrides, absent file = legacy", () => {
  assert.equal(loadAutojoinConfig("/nonexistent", {}).present, false);
  const c = cfg();
  assert.deepEqual([c.discovery, c.webinarAutoJoin, c.alerts.email, c.alerts.dashboard, c.alerts.calendar], [true, true, true, true, true]);
  const dir = mkdtempSync(path.join(tmpdir(), "lkb-aj-cfg2-"));
  try {
    const f = path.join(dir, "a.json");
    writeFileSync(f, JSON.stringify({ discovery: true, webinarAutoJoin: true, alerts: { email: true, emailTo: "u@x.org" } }));
    const o = loadAutojoinConfig("/nonexistent", { LKB_AUTOJOIN_CONFIG: f, LKB_AUTOJOIN_WEBINARS: "off", LKB_ALERT_EMAIL: "0", LKB_ALERT_EMAIL_TO: "bad address" });
    assert.deepEqual([o.webinarAutoJoin, o.alerts.email, o.alerts.emailTo], [false, false, ""]);
  } finally { rmSync(dir, { recursive: true, force: true }); }
});
