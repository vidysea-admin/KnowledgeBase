/** Career-topic classifier, webinar-kind detection and the overlap rule. Pure; the real config/career-topics.json is the keyword source. */
import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { classifyTopic, loadTopicConfig, parseTopicConfig } from "./topic-priority.js";
import { classifyInviteExtended } from "./webinar-kind.js";
import { selectAutoRecordItems } from "../calendar/auto-join.js";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..", "..", "..");
const cfg = loadTopicConfig(ROOT);

test("keywords come from config/career-topics.json: the committed list covers the brief's topics", () => {
  for (const k of ["career", "counselling", "counseling", "guidance", "admission", "study abroad", "university", "college", "course selection", "aptitude", "profile building", "scholarship"]) {
    assert.ok(cfg.keywords.includes(k), `missing keyword ${k}`);
  }
});

test("career-guidance titles score and explain themselves", () => {
  const v = classifyTopic({ title: "Career Counselling Masterclass: Study Abroad Admissions" }, cfg);
  assert.equal(v.careerGuidance, true);
  assert.deepEqual(v.keywords.sort(), ["admission", "career", "counselling", "study abroad"].sort());
  assert.ok(v.matched.every((m) => m.field === "title"));
});

test("non-career webinars are not career guidance (Google Cloud OnAir is test data)", () => {
  for (const title of ["Google Cloud OnAir: Building agents with Gemini", "Zoom webinar: Kubernetes networking deep dive", "Q3 marketing sync"]) {
    assert.equal(classifyTopic({ title }, cfg).careerGuidance, false, title);
  }
});

test("description and sender count, with weights; one weak description hit alone is not enough", () => {
  assert.equal(classifyTopic({ title: "Live session", description: "Learn about college" }, cfg).careerGuidance, false);
  const v = classifyTopic({ title: "Live session", description: "college admission scholarship guidance", sender: "careers@uni.example" }, cfg);
  assert.equal(v.careerGuidance, true);
  assert.ok(v.matched.some((m) => m.field === "sender" && m.keyword === "career"));
});

test("whole-word matching: 'universal' and 'collegiate' do not match 'university'/'college'", () => {
  assert.equal(classifyTopic({ title: "Universal remote basics" }, cfg).score, 0);
  assert.equal(classifyTopic({ title: "Scholarships 2026" }, cfg).careerGuidance, true);
});

test("a malformed or empty config is refused, and a custom file overrides the list", () => {
  assert.throws(() => parseTopicConfig({ keywords: [] }));
  assert.throws(() => parseTopicConfig(null));
  const dir = mkdtempSync(path.join(tmpdir(), "lkb-topic-"));
  try {
    const f = path.join(dir, "k.json");
    writeFileSync(f, JSON.stringify({ keywords: ["robotics"], minScore: 1 }));
    const own = loadTopicConfig(ROOT, { LKB_CAREER_TOPICS_FILE: f });
    assert.equal(classifyTopic({ title: "Robotics club" }, own).careerGuidance, true);
    assert.equal(classifyTopic({ title: "Career guidance" }, own).careerGuidance, false);
  } finally { rmSync(dir, { recursive: true, force: true }); }
});

test("webinar kinds: masterclass, OnAir, Zoom /w/ links and registration mails join; meetings and plain Zoom /j/ do not", () => {
  const w = (title: string, meetingUrl?: string) => classifyInviteExtended({ title, meetingUrl });
  assert.equal(w("Career Masterclass with Dr Rao"), "webinar");
  assert.equal(w("Google Cloud OnAir: Gemini"), "webinar");
  assert.equal(w("Session", "https://us02web.zoom.us/w/95194691654?tk=x"), "webinar");
  assert.equal(w("You're registered: Study abroad fair"), "webinar");
  assert.equal(w("Session", "https://us02web.zoom.us/j/95194691654"), "uncertain");
  assert.equal(w("Team meeting"), "meeting");
  assert.equal(w("Interview masterclass prep"), "meeting", "the base classifier's explicit meeting words still win");
  assert.equal(w("Educator Dialogues"), "webinar");
});

const evt = (id: string, title: string, start: string, end: string) => ({ id, title, startTime: start, endTime: end, meetingUrl: `https://us02web.zoom.us/w/${id.replace(/\D/g, "") || "1"}00000`, organizer: "o@x.org" });
const base = (calendarEvents: ReturnType<typeof evt>[], extra: object = {}) => selectAutoRecordItems({
  calendarEvents, candidates: [], now: "2026-10-15T09:00:00Z", leadMinutes: 5,
  trustedSenders: { emails: [], domains: [] }, alreadyScheduled: [], everyWebinar: true, ...extra,
});

test("overlap: career guidance wins even when it starts later; default behaviour (earliest start) unchanged without priorityOf", () => {
  const events = [
    evt("e1", "Google Cloud OnAir webinar", "2026-10-15T09:00:00Z", "2026-10-15T10:00:00Z"),
    evt("e2", "Career counselling webinar", "2026-10-15T09:05:00Z", "2026-10-15T10:00:00Z"),
  ];
  const plain = base(events);
  assert.deepEqual(plain.toSchedule.map((i) => i.sourceId), ["e1"]);
  const prio = base(events, { priorityOf: (i: { title: string }) => (classifyTopic({ title: i.title }, cfg).careerGuidance ? 1 : 0) });
  assert.deepEqual(prio.toSchedule.map((i) => i.sourceId), ["e2"]);
  const lost = prio.skipped.find((s) => s.sourceId === "e1");
  assert.equal(lost?.reason, "overlap-lost");
  assert.match(lost?.detail ?? "", /higher topic priority/);
});

test("overlap with two career events falls back to the existing earliest-start rule", () => {
  const events = [
    evt("e1", "Career guidance webinar A", "2026-10-15T09:00:00Z", "2026-10-15T10:00:00Z"),
    evt("e2", "Career guidance webinar B", "2026-10-15T09:05:00Z", "2026-10-15T10:00:00Z"),
  ];
  const r = base(events, { priorityOf: () => 1 });
  assert.deepEqual(r.toSchedule.map((i) => i.sourceId), ["e1"]);
});

test("classifyInvite hook admits a masterclass the built-in classifier leaves in needs-review", () => {
  const events = [evt("e3", "Career Masterclass", "2026-10-15T09:00:00Z", "2026-10-15T10:00:00Z")];
  assert.equal(base(events).skipped[0]?.reason, "needs-review");
  assert.deepEqual(base(events, { classifyInvite: classifyInviteExtended }).toSchedule.map((i) => i.sourceId), ["e3"]);
});
