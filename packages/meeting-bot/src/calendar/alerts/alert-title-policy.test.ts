import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { SKIP_REASONS } from "@lkb/core";
import { buildAttentionAlerts, alertIdFor, resolveTitlePolicy, DEFAULT_TITLE_POLICY, KNOWN_SKIP_REASONS, type TitlePolicy } from "./attention-alerts.js";
import { sanitize } from "./alert-text.js";

const NOW = "2026-10-10T00:00:00.000Z";
type Res = ReturnType<typeof buildAttentionAlerts>;
const policyField = (p: unknown): Record<string, unknown> => (p === "absent" ? {} : { titlePolicy: p });
const skipped = (title: unknown, p: unknown, key = "cal:p1", start?: string): Res =>
  buildAttentionAlerts({ ...policyField(p), timeZone: "UTC", now: NOW, skipped: [{ sessionKey: key, title, reason: "overlap-lost" }],
    ...(start ? { startTimes: { [key]: start } } : {}) } as never);
const job = (title: unknown, p: unknown, key = "job-p1", start?: string): Res =>
  buildAttentionAlerts({ ...policyField(p), timeZone: "UTC", now: NOW,
    jobs: { [key]: { status: "action_required", reason: "retry-limit", title, ...(start ? { startTime: start } : {}) } } } as never);
const ROUTES: [string, typeof skipped][] = [["skipped", skipped], ["job", job]];
const blob = (r: Res) => JSON.stringify(r);

// ---- the ledger rows, read at test time so every case is verbatim ----
const LEDGER = readFileSync(new URL("../../../../../qa/issues.r1alerts.jsonl", import.meta.url), "utf8").trim().split("\n")
  .map((l) => JSON.parse(l) as Record<string, string>);
const rowText = (id: string) => { const x = LEDGER.find((r) => r.id === id)!; return `${x.evidence}\n${x.checker_evidence ?? ""}`; };
interface Repro { title: string; secrets: string[] }
const rp = (title: string, ...secrets: string[]): Repro => ({ title, secrets });
const R009: Repro[] = [rp("Webinar tiger", "tiger"), rp("Webinar access: tiger", "tiger"), rp("Webinar - mdp: tiger", "tiger"),
  rp("Webinar - пароль: tiger", "tiger"), rp("Webinar - 암호 tiger", "tiger"), rp("Webinar - パスワード tiger", "tiger"), rp("Webinar - código tiger", "tiger"),
  rp("Webinar 42 17", "42 17"), rp("Webinar 4 2 1", "4 2 1"), rp("Webinar 42,17", "42,17"), rp("Webinar 42/17", "42/17"),
  rp("Webinar one two three four", "one two three four"), rp("раѕѕсоде tiger", "tiger"), rp("Webinar p4ss tiger", "tiger"), rp("1 2 3 4", "1 2 3 4")];
const R010: Repro[] = ["pasword tiger", "pasword: tiger", "paswrd tiger", "paswerd tiger", "pasvard tiger", "paasward tiger", "pincode tiger", "p/w tiger",
  "Pasccode tiger", "पासवर्ड़ tiger", "पासवड tiger", "पासवरड tiger"].map((t) => rp(`Webinar ${t}`, "tiger"));
const R011: Repro[] = [rp("tiger seven blue is the passcode", "tiger", "seven", "blue"), rp("Webinar - tiger is the password", "tiger"),
  rp("Webinar with tiger as the passcode", "tiger"), rp("Topic (banana = password)", "banana"), rp("12 34 - pin", "12 34")];
const CORPUS: [string, Repro[]][] = [["ISS-R1ALERTS-009", R009], ["ISS-R1ALERTS-010", R010], ["ISS-R1ALERTS-011", R011]];

test("every reproduction below is a verbatim string of its ledger row", () => {
  for (const [id, cases] of CORPUS) {
    const text = rowText(id);
    for (const c of cases) assert.ok(text.includes(c.title.replace(/^Webinar (?=\S+ tiger$)/, "")) || text.includes(c.title), `${id}: ${c.title}`);
  }
});

test("D-015 per policy: ISS-R1ALERTS-009 / -010 / -011 reproductions, both routes, secret absent from the WHOLE alert JSON", () => {
  const tally: Record<string, [number, number]> = {};
  for (const policy of ["omit", "masked"] as const) {
    for (const [id, cases] of CORPUS) {
      let refused = 0;
      for (const c of cases) {
        const leaks = ROUTES.flatMap(([name, route]) => {
          const j = blob(route(c.title, policy));
          return c.secrets.filter((s) => j.includes(s)).map((s) => `${name}:${s}`);
        });
        if (leaks.length === 0) refused++;
        else if (policy === "omit") assert.fail(`omit leaked ${c.title}: ${leaks}`);
      }
      tally[`${policy} ${id}`] = [refused, cases.length];
      console.log(`[${policy}] ${id}: ${refused}/${cases.length} refused`);
      if (policy === "omit" || id === "ISS-R1ALERTS-011") assert.equal(refused, cases.length, `${policy} ${id}`);
    }
  }
  // masked policy: documented limit. 009 and 010 are NOT closed by it (no keyword / misspelt keyword).
  assert.ok(tally["masked ISS-R1ALERTS-009"]![0] < R009.length);
  assert.ok(tally["masked ISS-R1ALERTS-010"]![0] < R010.length);
});

test("masked -011: a keyword ANYWHERE hides the WHOLE title with exactly one (hidden)", () => {
  for (const c of R011) assert.equal(sanitize(c.title), "(hidden)", c.title);
  for (const [, route] of ROUTES) {
    const a = route("Webinar - tiger is the password", "masked").alerts[0]!;
    assert.ok(a.title.endsWith(": (hidden)") && a.title.split("(hidden)").length === 2, a.title);
    assert.match(a.body, /\nEvent: \(hidden\)\n/);
  }
});

test("policy resolution: omit by default and for every absent, invalid or unknown value; masked only when asked by name", () => {
  assert.equal(DEFAULT_TITLE_POLICY, "omit");
  for (const v of [undefined, null, "", "OMIT", "Masked", "MASKED", "mask", "full", "raw", 0, 1, true, {}, [], ["masked"], () => "masked", Symbol("masked")]) {
    assert.equal(resolveTitlePolicy(v), "omit", String(typeof v));
    for (const [name, route] of ROUTES) assert.deepEqual(route("Weekly Class", v), route("Weekly Class", "omit"), `${name} ${String(typeof v)}`);
  }
  for (const [name, route] of ROUTES) {
    assert.deepEqual(route("Weekly Class", "absent"), route("Weekly Class", "omit"), name);
    assert.ok(blob(route("Weekly Class", "masked")).includes("Weekly Class"), name);
    assert.ok(!blob(route("Weekly Class", "omit")).includes("Weekly"), name);
  }
  const trap = { get titlePolicy(): TitlePolicy { throw new Error("boom"); }, timeZone: "UTC", now: NOW, skipped: [{ sessionKey: "cal:t", title: "Weekly Class", reason: "overlap-lost" }] };
  const r = buildAttentionAlerts(trap as never);
  assert.equal(r.alerts.length, 1);
  assert.ok(!blob(r).includes("Weekly"));
});

test("omit: exact shape of the alert, a handle that tells two meetings at one start time apart, same 4-line body", () => {
  const start = "2026-10-12T10:00:00Z";
  const a = skipped("Weekly Class", "omit", "cal:e1", start).alerts[0]!;
  const id = alertIdFor("cal:e1");
  assert.equal(a.title, `Session dropped: overlap: 2026-10-12 10:00 (UTC) [${id}]`);
  assert.equal(a.body, [
    "This session overlaps another one and was dropped, so it will not be recorded.",
    `Event ref: ${id} (title not shown)`,
    "Starts: 2026-10-12 10:00 (UTC)",
    "What to do: If you need both, record one manually or start a second capture."].join("\n"));
  const b = skipped("Weekly Class", "omit", "cal:e2", start).alerts[0]!;
  assert.notEqual(a.title, b.title); assert.notEqual(a.body, b.body); assert.notEqual(a.id, b.id); assert.notEqual(a.key, b.key);
  const j1 = job("T", "omit", "job-1", start).alerts[0]!, j2 = job("T", "omit", "job-2", start).alerts[0]!;
  assert.notEqual(j1.title, j2.title);
  assert.equal(j1.body.split("\n").length, 4);
  assert.equal(skipped("x", "omit").alerts[0]!.title, `Session dropped: overlap: start time unknown [${alertIdFor("cal:p1")}]`);
  // masked keeps its existing 4-line shape
  assert.equal(skipped("Weekly Class", "masked", "cal:e1", start).alerts[0]!.body.split("\n").length, 4);
});

// ---- seeded generator: any script, any content ----
function rng(seed: number) { let a = seed >>> 0; return () => { a = (a + 0x6d2b79f5) >>> 0; let t = a; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }
const ALPHABETS: string[][] = [
  Array.from("abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ"), Array.from("0123456789"), Array.from("абвгдежзийклмнопрстуфхцчшщыэюя"),
  Array.from("अआइईउऊएऐओऔकखगघचछजझटठडढणतथदधनपफबभमयरलवशषसह़्ाि"), Array.from("日本語中文字한국어漢字テストパスワード"), Array.from("مرحباسلامكلمةالسر"),
  Array.from(" .,:;'\"!?()/&+-%=@#_[]{}<>$*~`|^\\"), [" ", " ", " ", "\n", "\t", "​", "‮", "­", "﻿"], ["😀", "🔑", "🧑‍💻", "\u{1F1EE}\u{1F1F3}"],
  ["pass", "code", "pin", "otp", "password", "https://", "zoom.us/j/", "pwd=", "@", "token", "secret", "tiger"],
];
function genTitle(rand: () => number): string {
  const n = Math.floor(rand() * 110);
  const mono = rand() < 0.5 ? ALPHABETS[Math.floor(rand() * ALPHABETS.length)]! : undefined;
  let s = "";
  for (let i = 0; i < n; i++) { const al = mono ?? ALPHABETS[Math.floor(rand() * ALPHABETS.length)]!; s += al[Math.floor(rand() * al.length)]!; }
  return s;
}
const windows = (s: string): string[] => { const cp = Array.from(s); const out: string[] = []; for (let i = 0; i + 3 <= cp.length; i++) out.push(cp.slice(i, i + 3).join("")); return out; };

test("omit generator: 400 seeded arbitrary titles, both routes: nothing of the title appears and nothing is derived from it", () => {
  const rand = rng(20261011);
  let checked = 0, exempt = 0;
  for (let k = 0; k < 400; k++) {
    const title = genTitle(rand);
    for (const [name, route] of ROUTES) {
      const key = `${name}:g${k}`;
      const res = route(title, "omit", key, "2026-10-12T10:00:00Z");
      const base = route(undefined, "omit", key, "2026-10-12T10:00:00Z"); // same alert with NO title: the boilerplate the alert always carries
      assert.deepEqual(res, base, `${name} title #${k} changed the alert`); // nothing derived from the title, not even its length
      const j = blob(res), bj = blob(base);
      // length >= 3 substrings contain a length-3 window, so checking every window checks them all; a window that the
      // title-less alert already contains (boilerplate, the id) cannot be a leak and is counted as exempt
      for (const w of windows(title)) { if (bj.includes(w)) { exempt++; continue; } checked++; assert.ok(!j.includes(w), `${name} #${k} leaked ${JSON.stringify(w)}`); }
    }
  }
  console.log(`generator: 400 titles x 2 routes, ${checked} windows checked, ${exempt} exempt (boilerplate), 0 leaks`);
  assert.ok(checked > 20000);
});

test("omit: non-string and hostile title values change nothing", () => {
  const base = blob(skipped(undefined, "omit"));
  for (const t of [null, 7, {}, [], "x".repeat(100000), "\u0000", { toString() { throw new Error("t"); } }]) assert.equal(blob(skipped(t, "omit")), base);
});

test("W10 / ISS-T037W1-003: every core SKIP_REASONS value is a known reason; an unknown one is `other`", () => {
  assert.equal(SKIP_REASONS.length, 14);
  assert.equal(KNOWN_SKIP_REASONS.size, SKIP_REASONS.length);
  const mapped = new Set(["needs-registration", "overlap-lost", "untrusted-sender", "no-join-link", "unsafe-join-link"]);
  let passed = 0;
  for (const reason of SKIP_REASONS) {
    const r = buildAttentionAlerts({ timeZone: "UTC", now: NOW, skipped: [{ sessionKey: "cal:r", title: "t", reason }] } as never);
    if (mapped.has(reason)) { assert.equal(r.alerts.length, 1, reason); passed++; continue; }
    assert.deepEqual(r.ignored.reasons, { [`no-alert-for-reason:${reason}`]: 1 }, reason);
    passed++;
  }
  for (const [reason, label] of [["brand-new-reason", "other"], ["", "other"], ["no-alert-for-reason:x", "other"]] as const) {
    const r = buildAttentionAlerts({ timeZone: "UTC", now: NOW, skipped: [{ sessionKey: "cal:r", title: "t", reason }] } as never);
    assert.deepEqual(r.ignored.reasons, { [`no-alert-for-reason:${label}`]: 1 }, reason);
  }
  for (const v of ["opted-out", "rule-denied", "rules-unevaluable"]) assert.ok(KNOWN_SKIP_REASONS.has(v), v);
  console.log(`ISS-T037W1-003 attention-alerts: ${passed}/${SKIP_REASONS.length} core reasons pass through, unknown -> other`);
});
