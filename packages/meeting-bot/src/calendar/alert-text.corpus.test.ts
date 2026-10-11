import { test } from "node:test";
import assert from "node:assert/strict";
import { buildAttentionAlerts, renderStart, alertIdFor, selectNewAlerts, canonicalStart } from "./attention-alerts.js";
import { sanitize, neutralizeText, keywordIndex } from "./alert-text.js";

const NOW = "2026-10-10T00:00:00.000Z";
const u = (...cp: number[]) => String.fromCodePoint(...cp);
const fw = (s: string) => Array.from(s).map((c) => (c === " " ? c : u(c.charCodeAt(0) + 0xfee0))).join("");
const esc = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
type Res = ReturnType<typeof buildAttentionAlerts>;
/** The two routes the verdict names. `start` rides in startTimes (skipped route) or the job row (job route). */
const skipped = (title: unknown, start?: unknown, key = "cal:corpus"): Res =>
  buildAttentionAlerts({ timeZone: "UTC", now: NOW, skipped: [{ sessionKey: key, title, reason: "overlap-lost" }], ...(start !== undefined ? { startTimes: { [key]: start } } : {}) } as never);
const job = (title: unknown, start?: unknown, key = "job-corpus"): Res =>
  buildAttentionAlerts({ timeZone: "UTC", now: NOW, jobs: { [key]: { status: "action_required", reason: "retry-limit", title, ...(start !== undefined ? { startTime: start } : {}) } } } as never);
const ROUTES = [skipped, job];
/** whole alert JSON (alert, key, id, ignored); the 20-hex id/key digest hashes an unrelated input so it is removed first */
const blob = (r: Res) => JSON.stringify(r).replace(/[0-9a-f]{20}/g, "");
const has = (json: string, s: string) => new RegExp(`(?<![\\p{L}\\p{M}\\p{Nd}])${esc(s)}(?![\\p{L}\\p{M}\\p{Nd}])`, "u").test(json);

interface Repro { issue: string; title: string; secrets: string[]; key?: string; start?: string }
const ZW = [0x200b, 0x200d, 0x2060, 0x180e, 0xad, 0xfe0f];
const r = (issue: string, title: string, ...secrets: string[]): Repro => ({ issue, title, secrets });
const I1 = "ISS-R1ALERTS-001", I2 = "ISS-R1ALERTS-002", I5 = "ISS-R1ALERTS-005", I6 = "ISS-R1ALERTS-006", I7 = "ISS-R1ALERTS-007", I8 = "ISS-R1ALERTS-008";
const KEY_002 = "cal:x https://zoom.us/j/1?pwd=SKEY bob@evil.example\nACTION";
/** Leak reproductions recorded in qa/issues.r1alerts.jsonl, verbatim, plus the verdict-table extras. */
const LEAKS: Repro[] = [
  r(I1, "Meeting ID: 987 6543 2100 Passcode 778899", "987", "6543", "2100", "778899"), r(I1, "Meeting ID 987 6543 2100 pwd abc123", "987", "6543", "2100", "abc123"),
  r(I1, "pwd abc123XYZ", "abc123XYZ", "abc123"), r(I1, "meetingPassword=Sekret9", "Sekret9"), r(I1, '"passcode":"Q123"', "Q123"),
  ...ZW.map((cp, i) => r(I1, "pass" + u(cp) + "code=ZWS" + i, "ZWS" + i)),
  r(I1, "https://zoom.us/j/1?pwd=\nSPLIT", "SPLIT", "zoom.us"), r(I1, "https%3A%2F%2Fzoom.us%2Fj%2F1%3Fpwd%3DPCT", "PCT", "zoom.us", "https"),
  r(I1, "zoom.us%2Fj%2F1%3Fpwd%3DPCT2", "PCT2", "zoom.us"), r(I1, "zoom.us/j/123?pwd=abc", "zoom.us", "123", "pwd=abc"),
  r(I1, fw("https://") + "zoom.us/j/1?pwd=FW", "FW", "zoom.us"), r(I1, "https:" + u(0x2215, 0x2215) + "zoom.us" + u(0x2215) + "j" + u(0x2215) + "1?pwd=LOOK", "LOOK", "zoom.us"),
  r(I1, "Dial in +1 555 123 4567 PIN 889900#", "555", "123", "4567", "889900"), r(I1, "key sk-ant-api03-AAAAAAAAAAAAAAAAAAAA", "sk-ant", "AAAAAAAA"),
  r(I1, "AKIAIOSFODNN7EXAMPLE", "AKIA", "IOSFODNN7"), r(I1, "bob(at)evil.example", "bob", "evil"),
  r("verdict", "call +91 98765 43210", "98765", "43210"), r("verdict", "Your code is 482913", "482913"), r("verdict", "hxxps://zoom.us/j/1?pwd=HXX", "HXX", "zoom.us"),
  r("verdict", "x https://x.example/r?tk=REG1", "REG1", "x.example"), r("verdict", "Passcode: 123456", "123456"),
  { issue: I2, title: "t", key: KEY_002, secrets: ["SKEY", "bob", "evil.example", "zoom.us", "ACTION", "cal:x"] },
  r(I5, "pass" + u(0) + "code=Cc1x", "Cc1x"), r(I5, "key" + u(0x85) + "Sekretw", "Sekretw"), r(I5, "98" + u(0x85) + "76" + u(0) + "54", "987654"),
  // ISS-R1ALERTS-006 (all strings of the row, verbatim)
  r(I6, "passcode: tiger seven blue", "tiger", "seven", "blue"), r(I6, "password is correct horse battery staple", "correct", "horse", "battery", "staple"),
  r(I6, "passphrase tiger seven blue", "tiger", "seven", "blue"), r(I6, "code abc def ghi", "abc", "def", "ghi"), r(I6, "secret word: banana", "banana"),
  r(I6, "meeting password tiger blue", "tiger", "blue"), r(I6, "zoom password: aB3 xY", "aB3", "xY"), r(I6, "PASS CODE: 12 34", "12", "34"),
  r(I6, "passcode 12 34", "12", "34"), r(I6, "pin 4 2 1 7", "4", "2", "1", "7"), r(I6, "OTP 42 17", "42", "17"), r(I6, "PIN is 7 3", "7", "3"),
  r(I6, "Pass: 42 17", "42", "17"), r(I6, "pw 42 17", "42", "17"), r(I6, "pw: tiger", "tiger"), r(I6, "pass 42", "42"), r(I6, "psw tiger", "tiger"),
  r(I6, "pswd 42", "42"), r(I6, "passkey tiger", "tiger"), r(I6, "login: tiger", "tiger"), r(I6, "kood 12", "12"), r(I6, "kód 42", "42"),
  r(I6, "mot de passe tiger", "tiger"), r(I6, "contraseña tiger", "tiger"), r(I6, "पासकोड: 12", "12"), r(I6, "पिन 42", "42"),
  r(I6, "पासवर्ड tiger seven", "tiger", "seven"), r(I6, "कोड tiger", "tiger"), r(I6, "paasvard tiger", "tiger"), r(I6, "p i n 42", "42"), r(I6, "P.I.N. 42", "42"),
  r(I6, "1 2 3 4 5", "1 2", "3 4"), r(I6, "12 34 5", "12 34"), r(I6, "12.34.5", "12.34"),
  r(I6, u(0x967, 0x968, 0x969, 0x96a, 0x96b, 0x96c), u(0x967, 0x968, 0x969)), r(I6, u(0x661, 0x662, 0x663, 0x664, 0x665, 0x666), u(0x661, 0x662, 0x663)),
  r(I6, "12" + u(0x969, 0x96a) + "56", "12" + u(0x969)),
  r(I7, "12_34_56", "123456", "12_34"), r(I7, "12[]34", "1234", "12[]"), r(I7, "pass_x_code tiger", "tiger"),
  { issue: I8, title: "t", start: "Mon Oct 12 2026 (pwd=Sekret9 https://zoom.us/j/1) 10:00", secrets: ["Sekret9", "zoom.us", "pwd", "https", "Mon Oct"] },
  { issue: I8, title: "t", start: "2026-10-12T10:00:00Z (passcode tiger seven)", secrets: ["tiger", "seven", "passcode"] },
];
const CLOSURES: [string, string, () => boolean][] = [
  ["ISS-R1ALERTS-003", "New_York label", () => renderStart("2026-03-08T07:30:00Z", "America/New_York") === "2026-03-08 03:30 (America/New_York)"],
  ["ISS-R1ALERTS-003", "Los_Angeles label", () => renderStart("2026-03-08T07:30:00Z", "America/Los_Angeles") === "2026-03-07 23:30 (America/Los_Angeles)"],
  ["ISS-R1ALERTS-003", "Buenos_Aires label", () => renderStart("2026-03-08T07:30:00Z", "America/Argentina/Buenos_Aires") === "2026-03-08 04:30 (America/Argentina/Buenos_Aires)"],
  ["ISS-R1ALERTS-003", "undefined zone is UTC", () => renderStart("2026-10-10T19:00:00Z", undefined as never) === "2026-10-10 19:00 (UTC)"],
  ["ISS-R1ALERTS-004", "three colliding keys stay distinct", () => {
    const a = ["cal:a b", "cal:a/b", "cal:a_b"].flatMap((k) => skipped("t", undefined, k).alerts);
    return new Set(a.map((x) => x.key)).size === 3 && selectNewAlerts(a, []).fresh.length === 3;
  }],
  ["ISS-R1ALERTS-004", "200-char shared prefix", () => skipped("t", undefined, "p".repeat(200) + "A").alerts[0]!.key !== skipped("t", undefined, "p".repeat(200) + "B").alerts[0]!.key],
  [I5, "retention over maxKeys trims oldest", () => {
    const a = ["k1", "k2", "k3", "k4", "k5"].flatMap((k) => skipped("t", undefined, k).alerts);
    const s = selectNewAlerts(a, [], 3);
    return s.keys.length === 3 && s.keys[0] === a[2]!.key;
  }],
];

test("D-015 ledger corpus: every recorded reproduction of ISS-R1ALERTS-001..008, both routes, secret absent from the WHOLE alert JSON", () => {
  const tally: Record<string, [number, number]> = {};
  const bump = (issue: string, ok: boolean) => { const t = (tally[issue] ??= [0, 0]); t[1]++; if (ok) t[0]++; };
  for (const x of LEAKS) {
    let ok = true;
    for (const route of ROUTES) {
      const res = route(x.title, x.start, x.key);
      const json = blob(res);
      const gone = x.secrets.filter((s) => has(json, s));
      assert.deepEqual(gone, [], `${x.issue} ${JSON.stringify(x.title)} (${route.name}) leaked ${gone.join("|")}: ${json}`);
      const a = res.alerts[0]!;
      assert.equal(a.body.split("\n").length, 4);
      if (x.issue === I8) assert.ok(a.startTime === undefined || /^\d{4}-\d\d-\d\dT[\d:.]+Z$/.test(a.startTime), String(a.startTime));
    }
    bump(x.issue, ok);
  }
  for (const [issue, name, fn] of CLOSURES) { const ok = fn(); assert.ok(ok, `${issue} ${name}`); bump(issue, ok); }
  for (let i = 1; i <= 8; i++) { const id = `ISS-R1ALERTS-00${i}`; const t = tally[id]!; assert.ok(t, id); assert.equal(t[0], t[1], id); console.log(`${id}: ${t[0]}/${t[1]}`); }
  console.log(`verdict extras: ${tally.verdict![0]}/${tally.verdict![1]}`);
});

test("ISS-R1ALERTS-006 shape: the keyword hides everything from it to the END of the title; the topic before it stays", () => {
  assert.equal(sanitize("UK visa webinar - passcode: a b c d"), "UK visa webinar - (hidden)");
  assert.equal(sanitize("Study in Canada, Zoom password is correct horse battery staple"), "Study in Canada, Zoom (hidden)");
  assert.equal(sanitize("Webinar OTP 42 17 and more"), "Webinar (hidden)");
  assert.equal(sanitize("Passcode: 12 34"), "(hidden)");          // keyword at the very start: the whole title is hidden
  assert.equal(neutralizeText("Passcode: 12 34"), "(hidden)");
  const a = skipped("Passcode: 12 34", "2026-10-12T10:00:00Z").alerts[0]!;
  assert.equal(a.title, "Session dropped: overlap: (hidden)");
  assert.match(a.body, /Starts: 2026-10-12 10:00 \(UTC\)/);
  assert.match(a.id, /^[0-9a-f]{20}$/);
  assert.equal(sanitize("pаsscode tiger seven"), "(hidden)");        // Cyrillic a: look-alike keyword hides the rest too
  assert.equal(sanitize("Webinar tiger"), "Webinar tiger");          // OPEN (ISS-R1ALERTS-009): no keyword, no digit or shape
  for (const w of ["Keynote talk", "spinning pinned codecs", "monkey business", "Tokenize this", "authority", "decode it", "Passover seder", "पिनाक कोडिंग"]) assert.equal(sanitize(w), w, w);
});

test("keyword recognition is Unicode-aware, case/separator tolerant and total over the listed forms", () => {
  const forms = ["pw", "pwd", "pass", "psw", "passwd", "password", "passcode", "pass code", "pin", "otp", "code", "secret", "key", "token", "access code", "kood", "mot de passe",
    "पासकोड", "पासवर्ड", "पिन", "कोड", "ओटीपी", "paasvard", "paascode", "p i n", "P.I.N.", "PASS_CODE", "Pass-Word", "OTP", "Pin", "apiKey", "meetingPassword"];
  for (const k of forms) {
    for (const t of [`${k} 4217 x`, `Topic ${k}: tiger blue`, `Topic - ${k}=a b c`, `Topic (${k}) q`]) assert.ok(keywordIndex(t.normalize("NFKC")) >= 0 && sanitize(t).endsWith("(hidden)") && !/tiger|blue|4217|a b c| q$/.test(sanitize(t)), `${k} :: ${t}`);
  }
  for (const k of ["p" + u(0x131) + "n", "k" + u(0xf3) + "d", "contrase" + u(0xf1) + "a", fw("password"), "pin", "PIN"]) assert.ok(sanitize(`${k} tiger`).endsWith("(hidden)") && !sanitize(`${k} tiger`).includes("tiger"), k);
});

// ---- ISS-R1ALERTS-007: the fixed-point repeat must have teeth ----
test("fixed point: shapes whose secret exists only after the allowlist removes a character need 2 and 3 passes; non-convergence fails closed", () => {
  const needs = (x: string, k: number, want: string) => {
    assert.equal(sanitize(x, k), want, `${x} with ${k} passes`);
    assert.equal(sanitize(x, k - 1), "(hidden)", `${x} with ${k - 1} passes must fail closed, not echo partial text`);
  };
  needs("Study 123456 tips", 2, "Study (hidden) tips");            // masked on pass 1, confirmed on pass 2
  for (const [x, want] of [["Study 12_34_56 tips", "Study (hidden) tips"], ["Q 12[]34 and 5", "Q (hidden) and 5"], ["Study 1#2#3#4 tips", "Study (hidden) tips"], ["a 12{}3{}4 b", "a (hidden) b"]] as const) needs(x, 3, want);
  assert.equal(sanitize("Hello World", 1), "Hello World");
  assert.equal(sanitize("anything", 0), "(hidden)");
  for (const x of ["12_34_56", "Study 12_34_56 tips", "12[]34", "Study pa{}ss12# tips", "Q 1#2#3#4"]) assert.ok(!/\d{3}/.test(sanitize(x)) && !/pass12/.test(sanitize(x)), x);
  assert.ok(!JSON.stringify(skipped("Study 12_34_56 tips")).includes("123456"));
  assert.ok(!JSON.stringify(job("12[]34")).includes("1234"));
});

// ---- ISS-R1ALERTS-008 and the echo audit ----
test("startTime is parsed and FORMATTED from the instant; a caller string is never copied", () => {
  assert.equal(canonicalStart("2026-10-12T10:00:00Z"), "2026-10-12T10:00:00.000Z");
  assert.equal(canonicalStart("2026-10-12T15:30:00+05:30"), "2026-10-12T10:00:00.000Z");
  assert.equal(canonicalStart("2026-10-12"), "2026-10-12T00:00:00.000Z");
  for (const bad of ["Mon Oct 12 2026 (pwd=Sekret9) 10:00", "2026-10-12T10:00:00Z (x)", "2026-10-12 10:00", "2026-10-12T10:00", "Oct 12 2026", "0", "", 5, null, {}, "2026-13-45T10:00:00Z", "2026-10-12T10:00:00Z\n"]) assert.equal(canonicalStart(bad), undefined, String(bad));
  for (const route of ROUTES) {
    const a = route("t", "Mon Oct 12 2026 (pwd=Sekret9 https://zoom.us/j/1) 10:00").alerts[0]!;
    assert.equal(a.startTime, undefined);
    assert.match(a.body, /Starts: start time unknown/);
    assert.equal(route("t", "2026-10-12T15:30:00+05:30").alerts[0]!.startTime, "2026-10-12T10:00:00.000Z");
  }
});

test("echo audit: no caller-controlled string reaches ANY field of the result (key, id, title, body, startTime, ignored)", () => {
  const M = "ZMARK";
  const res = buildAttentionAlerts({
    timeZone: `Asia/Kolkata ${M}z`, now: NOW,
    skipped: [{ sessionKey: `cal:${M}a`, title: `Talk passcode ${M}t`, reason: "overlap-lost", detail: M, meetingUrl: `https://zoom.us/j/1?pwd=${M}`, sender: `${M}@x.example` },
      { sessionKey: `cal:${M}b`, title: "Talk x", reason: `pwd-${M.toLowerCase()}r` }, { sessionKey: `cal:c`, title: "t", reason: `${M.toLowerCase()}`.repeat(3) }],
    jobs: { [`job-${M}`]: { status: "action_required", reason: `pwd-${M.toLowerCase()}j`, title: `Job key ${M}`, startTime: `Mon Oct 12 2026 (${M}) 10:00` } },
    startTimes: { [`cal:${M}a`]: `Mon Oct 12 2026 (${M}) 10:00` },
  } as never);
  assert.equal(res.alerts.length, 2);
  assert.ok(!/zmark/i.test(JSON.stringify(res)), JSON.stringify(res));
  assert.deepEqual(Object.keys(res.ignored.reasons).sort(), ["no-alert-for-reason:other"]);
});

// ---- seeded generator ----
function rng(seed: number) {
  let a = seed >>> 0;
  return () => { a = (a + 0x6d2b79f5) >>> 0; let t = a; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
}
test("generator: keyword (random case, spacing, punctuation, format characters) + 1 to 5 secret tokens in ASCII, Devanagari and several digit scripts - none survives anywhere", () => {
  const rand = rng(20261011);
  const int = (a: number, b: number) => a + Math.floor(rand() * (b - a + 1));
  const pick = <T,>(xs: readonly T[]): T => xs[int(0, xs.length - 1)]!;
  const kws = ["pw", "pwd", "pass", "psw", "passwd", "password", "passcode", "pass code", "pin", "otp", "code", "secret", "key", "token", "access code", "kood", "mot de passe",
    "login", "paasvard", "पासकोड", "पासवर्ड", "पिन", "कोड", "ओटीपी", "p i n"];
  const joins = [" ", ": ", "=", " is ", "\n", "  ", " - ", "\t", ":", " = ", ", "];
  const fmt = [0x200b, 0x200c, 0x200d, 0x2060, 0xad, 0xfeff, 0xfe0f, 0x200e];
  const topics = ["Study", "abroad", "webinar", "Canada", "results", "weekly", "Admissions", "live", "UK", "intake"];
  const letters = "abcdefghijklmnopqrstuvwxyz";
  const deva = "कखगघचजटडतदनपबमयरलवशसह", matras = ["", "ा", "ि", "ी", "ु", "े", "ो"];
  const digitBases = [0x30, 0x660, 0x966, 0x9e6, 0xff10];
  const tokens = (n: number) => Array.from({ length: n }, (_, i) => {
    const kind = pick(["ascii", "deva", "digits"] as const);
    if (kind === "ascii") return "Zq" + Array.from({ length: int(3, 7) }, () => pick([...letters])).join("");
    if (kind === "deva") return Array.from({ length: int(2, 4) }, () => pick([...deva]) + pick(matras)).join("");
    const base = pick(digitBases); return Array.from({ length: int(1, 4) }, () => u(base + int(1, 9))).join("");
  });
  const mixCase = (s: string) => Array.from(s).map((c) => (rand() < 0.4 ? c.toUpperCase() : c)).join("");
  let cases = 0;
  for (let i = 0; i < 3000; i++) {
    const kw0 = pick(kws);
    let kw = mixCase(kw0).replace(/ /g, () => pick([" ", "-", "_", " ", "."]));
    kw = Array.from(kw).map((c) => (rand() < 0.25 ? c + u(pick(fmt)) : c)).join("");
    const secrets = tokens(int(1, 5));
    const text = [...Array(int(0, 3))].map(() => pick(topics)).join(" ") + pick([" ", ", ", " - "]) + kw + pick(joins) + secrets.join(pick([" ", " ", "  ", "-"]));
    const res = pick(ROUTES)(text, undefined, "k" + i);
    const json = blob(res);
    for (const s of secrets) {
      assert.ok(/^\p{Nd}+$/u.test(s) ? !has(json, s) : !json.includes(s), `case ${i} leaked ${s}: ${JSON.stringify(text)} -> ${json}`);
    }
    assert.equal(res.alerts[0]!.body.split("\n").length, 4);
    cases++;
  }
  console.log(`generator: ${cases} seeded cases, 0 leaks`);
  assert.equal(cases, 3000);
});

// ---- readability trade-off, measured ----
test("readability: 40 realistic titles; how many stay identifiable by title, and the rest by headline, start time and id", () => {
  const titles = ["UK Universities Fair - Live Q&A with admissions officers", "Masters in Germany: Tuition-free options", "Weekly Webinar", "Scholarships for Indian students: how to apply",
    "Australia Student Visa (subclass 500) explained", "Fall 2027 intake: deadlines and documents", "SOP and LOR writing workshop", "GRE vs GMAT: which test is right for you?",
    "Meet the Dean - University of Toronto", "Career counselling session with Priya", "Study MBBS abroad: Russia, Georgia, Philippines", "Free IELTS masterclass | Day 3",
    "Education loan webinar for abroad studies", "Ireland post-study work visa 2026", "PhD funding opportunities in Europe", "How to choose the right course (Part 2)",
    "Open day: Monash University Melbourne", "Parents' session: safety and accommodation abroad", "Python for beginners - Session 4 of 6", "Digital SAT strategy - 1500+ score plan",
    "Zoom Meeting - Admissions Team Sync", "Webinar: US F-1 visa interview tips", "Study in New Zealand - Intake July 2026", "Engineering in USA: STEM OPT explained",
    "Vidysea partner onboarding call", "Statement of purpose clinic (limited seats)", "Q&A: Is a Master's in Canada worth it in 2026?", "Study in Canada 2026 intake webinar",
    "Q3 results call", "IELTS 7.5 band strategy", "Key takeaways from the Australia visa changes", "Code of conduct for student visa applicants",
    "Pin code areas: how to find housing near campus", "Token economy in classrooms", "Student Visa Interview Prep | Day 3", "Study in Canada | Passcode: 482913",
    "Login help session for new students", "विदेश में पढ़ाई: कनाडा वेबिनार", "UK student visa kaise apply karein? Live session", "कोड ऑफ कंडक्ट और वीज़ा नियम"];
  assert.equal(titles.length, 40);
  let same = 0, partial = 0, hidden = 0;
  for (const t of titles) {
    const s = sanitize(t);
    if (s === t) same++;
    else if (s === "(hidden)") { hidden++; const a = skipped(t, "2026-10-12T10:00:00Z").alerts[0]!; assert.ok(/Starts: 2026-10-12 10:00/.test(a.body) && /^[0-9a-f]{20}$/.test(a.id) && a.title.length > 10); }
    else partial++;
  }
  console.log(`readability: ${same} unchanged, ${partial} partly kept, ${hidden} fully hidden (identifiable by headline/start/id only) of 40`);
  assert.ok(same + partial >= 28);
  assert.equal(alertIdFor("cal:e1"), "69c86e49f0d76452a89a");
});
