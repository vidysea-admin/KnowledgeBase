/** Schedule tick with autojoin deps (fakes only) and the capture watcher. No Gmail, Calendar, browser or Task Scheduler is touched. */
import { test } from "node:test";
import assert from "node:assert/strict";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { runScheduleTickOnce, type ScheduleTickDeps } from "../calendar/schedule-tick.js";
import { readScheduledJob, writeScheduledJob } from "../calendar/state/schedule-state.js";
import { deriveJobKey } from "../calendar/task-scheduler.js";
import { loadTopicConfig } from "./topic-priority.js";
import { loadAutojoinConfig } from "./config.js";
import { BOT_EVENT_TITLE_PREFIX, type AutojoinTickDeps } from "./tick-wiring.js";
import { watchCaptures } from "./capture-watch.js";
import type { AlertInput } from "./alerts.js";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..", "..", "..");
const TEN = "ten-t";
const NOW = "2026-10-15T09:56:00Z";
const ev = (id: string, title: string, n: number) => ({ id, title, startTime: "2026-10-15T10:00:00Z", endTime: "2026-10-15T11:00:00Z", meetingUrl: `https://us02web.zoom.us/w/${n}00000000`, organizer: "o@x.org" });

function setup(events: ReturnType<typeof ev>[], over: Partial<ScheduleTickDeps> = {}) {
  const dir = mkdtempSync(path.join(tmpdir(), "lkb-aj-tick-"));
  const raised: AlertInput[] = [], scheduled: string[] = [], logs: string[] = [];
  const aj: AutojoinTickDeps = { cfg: { ...loadAutojoinConfig(ROOT, { LKB_AUTOJOIN_CONFIG: path.join(ROOT, "config", "autojoin.json") }) }, topic: loadTopicConfig(ROOT), tagsDir: path.join(dir, "capture-tags"), raise: async (a) => { raised.push(a); } };
  const deps: ScheduleTickDeps = { loadCalendarEvents: async () => events, loadCandidates: async () => [], now: () => NOW, stateDir: dir, stateTenantId: TEN, everyWebinar: true,
    scheduler: { scheduleOnce: async (o) => { scheduled.push(o.jobKey); } }, log: (m) => logs.push(m), autojoin: aj, ...over };
  return { dir, deps, raised, scheduled, logs, aj, done: () => rmSync(dir, { recursive: true, force: true }) };
}

test("the committed deployment config turns discovery, webinar auto-join and all three alert channels on", () => {
  const c = loadAutojoinConfig(ROOT, {});
  assert.deepEqual([c.present, c.discovery, c.webinarAutoJoin, c.careerPriority, c.testDataRouting, c.alerts.email, c.alerts.dashboard, c.alerts.calendar, c.alerts.emailTo],
    [true, true, true, true, true, true, true, true, "umeshsugara@vidysea.com"]);
});

test("career webinar: scheduled, tagged career-guidance with its matched keywords, tags file written, about-to-join raised", async () => {
  const s = setup([ev("c1", "Career Counselling Masterclass", 1)]);
  try {
    const r = await runScheduleTickOnce(s.deps, false);
    assert.equal(r.toSchedule.length, 1, "a masterclass is a webinar under the extended classifier");
    const job = readScheduledJob(s.dir, deriveJobKey(r.toSchedule[0]!.sessionKey)!, TEN)!;
    assert.deepEqual([job.careerGuidance, job.testData, job.startTime], [true, false, "2026-10-15T10:00:00Z"]);
    assert.deepEqual(job.matchedKeywords?.sort(), ["career", "counselling"]);
    const tags = JSON.parse(readFileSync(path.join(s.aj.tagsDir, `${r.toSchedule[0]!.sessionKey}.json`), "utf8"));
    assert.equal(tags.testData, false);
    assert.deepEqual(s.raised.map((a) => [a.kind, a.careerGuidance, a.testData]), [["about-to-join", true, false]]);
    assert.ok(s.logs.some((l) => /career guidance: priority.*matched: .*career/.test(l)));
  } finally { s.done(); }
});

test("non-career webinar is still captured, tagged testData:true", async () => {
  const s = setup([ev("g1", "Google Cloud OnAir: Gemini agents", 2)]);
  try {
    const r = await runScheduleTickOnce(s.deps, false);
    assert.equal(r.toSchedule.length, 1);
    const job = readScheduledJob(s.dir, deriveJobKey(r.toSchedule[0]!.sessionKey)!, TEN)!;
    assert.deepEqual([job.careerGuidance, job.testData], [false, true]);
    assert.equal(JSON.parse(readFileSync(path.join(s.aj.tagsDir, `${r.toSchedule[0]!.sessionKey}.json`), "utf8")).testData, true);
    assert.equal(s.raised[0]?.testData, true);
  } finally { s.done(); }
});

test("overlap: the career event is scheduled, the non-career one is skipped overlap-lost", async () => {
  const s = setup([ev("g1", "Google Cloud OnAir: Gemini agents", 2), ev("c1", "Study abroad admission webinar", 1)]);
  try {
    const r = await runScheduleTickOnce(s.deps, false);
    assert.deepEqual(r.toSchedule.map((i) => i.sourceId), ["c1"]);
    assert.equal(r.skipped.find((x) => x.sourceId === "g1")?.reason, "overlap-lost");
  } finally { s.done(); }
});

test("an unreadable topic config disables only topic features, loudly: webinars still join, nothing is tagged", async () => {
  const s = setup([ev("g1", "Google Cloud OnAir: Gemini agents", 2)]);
  try {
    delete (s.aj as { topic?: unknown }).topic;
    const r = await runScheduleTickOnce(s.deps, false);
    assert.equal(r.toSchedule.length, 1);
    assert.equal(readScheduledJob(s.dir, deriveJobKey(r.toSchedule[0]!.sessionKey)!, TEN)!.testData, undefined);
    assert.ok(!existsSync(s.aj.tagsDir));
  } finally { s.done(); }
});

test("the bot's own calendar marker events are never joined", async () => {
  const s = setup([ev("m1", `${BOT_EVENT_TITLE_PREFIX} Career Counselling Masterclass`, 3)]);
  try {
    const r = await runScheduleTickOnce(s.deps, false);
    assert.equal(r.toSchedule.length, 0);
    assert.equal(r.skipped.length, 0);
  } finally { s.done(); }
});

test("dry-run raises no alert and writes nothing", async () => {
  const s = setup([ev("c1", "Career Counselling Masterclass", 1)]);
  try {
    await runScheduleTickOnce(s.deps, true);
    assert.deepEqual([s.raised.length, s.scheduled.length], [0, 0]);
  } finally { s.done(); }
});

test("without autojoin deps a masterclass stays in needs-review and no job carries tags (legacy behaviour)", async () => {
  const s = setup([ev("c1", "Career Counselling Masterclass", 1)], { autojoin: undefined });
  try {
    const r = await runScheduleTickOnce(s.deps, false);
    assert.equal(r.toSchedule.length, 0);
    assert.equal(r.skipped[0]?.reason, "needs-review");
  } finally { s.done(); }
});

test("a failing alert never stops scheduling", async () => {
  const s = setup([ev("c1", "Career Counselling Masterclass", 1)]);
  try {
    s.aj.raise = async () => { throw new Error("gws failed (1)"); };
    const r = await runScheduleTickOnce(s.deps, false);
    assert.equal(r.toSchedule.length, 1);
    assert.equal(s.scheduled.length, 1);
    assert.ok(s.logs.some((l) => /alert not raised/.test(l)));
  } finally { s.done(); }
});

// --- capture watcher ---
function watchSetup(startIso: string, endIso: string, nowIso: string, o: { active?: boolean; output?: boolean } = {}) {
  const dir = mkdtempSync(path.join(tmpdir(), "lkb-aj-watch-"));
  writeScheduledJob(dir, "job-1", { url: "https://x.example/", until: endIso, title: "Career webinar", sessionId: "webinar-abc", startTime: startIso, careerGuidance: true, testData: false }, TEN);
  mkdirSync(dir, { recursive: true });
  const raised: AlertInput[] = [];
  const run = () => watchCaptures({ stateDir: dir, tenantId: TEN, now: () => nowIso, log: () => {}, raise: async (a) => { raised.push(a); },
    readState: () => (o.active ? { pid: 1, sessionId: "webinar-abc", title: "t", platform: "zoom", until: endIso, obsOutputDir: "x", startedAt: startIso } : undefined),
    isPidAlive: () => o.active === true, outputFor: () => (o.output ? "data/toc-migrated/webinar-abc" : undefined) });
  return { dir, raised, run, done: () => rmSync(dir, { recursive: true, force: true }) };
}
const S = "2026-10-15T10:00:00Z", E = "2026-10-15T11:00:00Z";

test("watch: recorder running -> capture-started", async () => {
  const w = watchSetup(S, E, "2026-10-15T10:20:00Z", { active: true });
  try { await w.run(); assert.deepEqual(w.raised.map((a) => a.kind), ["capture-started"]); } finally { w.done(); }
});
test("watch: recorder gone, output registered, window over -> capture-done with the output path", async () => {
  const w = watchSetup(S, E, "2026-10-15T11:10:00Z", { output: true });
  try { await w.run(); assert.deepEqual(w.raised.map((a) => [a.kind, a.outputPath]), [["capture-done", "data/toc-migrated/webinar-abc"]]); } finally { w.done(); }
});
test("watch: recorder gone mid-window with output -> capture-stopped-early; without output -> capture-failed", async () => {
  const a = watchSetup(S, E, "2026-10-15T10:30:00Z", { output: true });
  const b = watchSetup(S, E, "2026-10-15T10:30:00Z");
  try {
    await a.run(); await b.run();
    assert.equal(a.raised[0]?.kind, "capture-stopped-early");
    assert.equal(b.raised[0]?.kind, "capture-failed");
    assert.match(b.raised[0]?.detail ?? "", /did not start/);
  } finally { a.done(); b.done(); }
});
test("watch: nothing yet inside the first 10 minutes; end of window with no output -> failed", async () => {
  const early = watchSetup(S, E, "2026-10-15T10:05:00Z");
  const late = watchSetup(S, E, "2026-10-15T11:30:00Z");
  try {
    await early.run(); await late.run();
    assert.equal(early.raised.length, 0);
    assert.equal(late.raised[0]?.kind, "capture-failed");
  } finally { early.done(); late.done(); }
});
test("watch: another tenant's job file and a job from before autojoin (no startTime) are ignored", async () => {
  const w = watchSetup(S, E, "2026-10-15T10:30:00Z");
  try {
    writeFileSync(path.join(w.dir, "scheduled", "old-1.json"), JSON.stringify({ url: "u", until: E, title: "old", sessionId: "old", tenantId: TEN }));
    writeFileSync(path.join(w.dir, "scheduled", "foreign-1.json"), JSON.stringify({ url: "u", until: E, title: "f", sessionId: "f", startTime: S, tenantId: "someone-else" }));
    await w.run();
    assert.deepEqual(w.raised.map((a) => a.sessionKey), ["webinar-abc"]);
  } finally { w.done(); }
});
