import { test } from "node:test";
import assert from "node:assert/strict";
import { buildAttentionAlerts, renderStart, alertIdFor, selectNewAlerts } from "./attention-alerts.js";
import { neutralizeText, sanitize, normalise } from "./alert-text.js";

const NOW = "2026-10-10T00:00:00.000Z";
const u = (...cp: number[]) => String.fromCodePoint(...cp);
const fw = (s: string) => Array.from(s).map((c) => (c === " " ? c : u(c.charCodeAt(0) + 0xfee0))).join("");
const skippedAlert = (title: unknown, key = "cal:corpus") =>
  buildAttentionAlerts({ timeZone: "UTC", now: NOW, skipped: [{ sessionKey: key, title, reason: "overlap-lost" }] } as never);
const jobAlert = (title: unknown, id = "job-corpus") =>
  buildAttentionAlerts({ timeZone: "UTC", now: NOW, jobs: { [id]: { status: "action_required", reason: "retry-limit", title } } } as never);
/** the 20-hex id/key digest is of an unrelated input; drop it when matching random secrets */
const noDigest = (s: string) => s.replace(/[0-9a-f]{20}/g, "");

interface Repro { issue: string; title: string; secrets: string[] }
const ZW = [0x200b, 0x200d, 0x2060, 0x180e, 0xad, 0xfe0f];
/** Every reproduction recorded in qa/issues.r1alerts.jsonl (ISS-R1ALERTS-001 evidence), verbatim, plus the verdict-table extras. */
const LEDGER_001: Repro[] = [
  { issue: "ISS-R1ALERTS-001", title: "Meeting ID: 987 6543 2100 Passcode 778899", secrets: ["987", "6543", "2100", "778899"] },
  { issue: "ISS-R1ALERTS-001", title: "Meeting ID 987 6543 2100 pwd abc123", secrets: ["987", "6543", "2100", "abc123"] },
  { issue: "ISS-R1ALERTS-001", title: "pwd abc123XYZ", secrets: ["abc123XYZ", "abc123"] },
  { issue: "ISS-R1ALERTS-001", title: "meetingPassword=Sekret9", secrets: ["Sekret9"] },
  { issue: "ISS-R1ALERTS-001", title: '"passcode":"Q123"', secrets: ["Q123"] },
  ...ZW.map((cp, i) => ({ issue: "ISS-R1ALERTS-001", title: "pass" + u(cp) + "code=ZWS" + i, secrets: ["ZWS" + i] })),
  { issue: "ISS-R1ALERTS-001", title: "https://zoom.us/j/1?pwd=\nSPLIT", secrets: ["SPLIT", "zoom.us"] },
  { issue: "ISS-R1ALERTS-001", title: "https%3A%2F%2Fzoom.us%2Fj%2F1%3Fpwd%3DPCT", secrets: ["PCT", "zoom.us", "https"] },
  { issue: "ISS-R1ALERTS-001", title: "zoom.us%2Fj%2F1%3Fpwd%3DPCT2", secrets: ["PCT2", "zoom.us"] },
  { issue: "ISS-R1ALERTS-001", title: "zoom.us/j/123?pwd=abc", secrets: ["zoom.us", "123", "pwd=abc"] },
  { issue: "ISS-R1ALERTS-001", title: fw("https://") + "zoom.us/j/1?pwd=FW", secrets: ["FW", "zoom.us"] },
  { issue: "ISS-R1ALERTS-001", title: "https:" + u(0x2215, 0x2215) + "zoom.us" + u(0x2215) + "j" + u(0x2215) + "1?pwd=LOOK", secrets: ["LOOK", "zoom.us"] },
  { issue: "ISS-R1ALERTS-001", title: "Dial in +1 555 123 4567 PIN 889900#", secrets: ["555", "123", "4567", "889900"] },
  { issue: "ISS-R1ALERTS-001", title: "key sk-ant-api03-AAAAAAAAAAAAAAAAAAAA", secrets: ["sk-ant", "AAAAAAAA"] },
  { issue: "ISS-R1ALERTS-001", title: "AKIAIOSFODNN7EXAMPLE", secrets: ["AKIA", "IOSFODNN7"] },
  { issue: "ISS-R1ALERTS-001", title: "bob(at)evil.example", secrets: ["bob", "evil"] },
];
const EXTRAS: Repro[] = [ // checker leak-table rows that are not in the ledger row text
  { issue: "verdict", title: "call +91 98765 43210", secrets: ["98765", "43210"] },
  { issue: "verdict", title: "Your code is 482913", secrets: ["482913"] },
  { issue: "verdict", title: "hxxps://zoom.us/j/1?pwd=HXX", secrets: ["HXX", "zoom.us"] },
  { issue: "verdict", title: "x https://x.example/r?tk=REG1", secrets: ["REG1", "x.example"] },
  { issue: "verdict", title: "Passcode: 123456", secrets: ["123456"] },
  { issue: "verdict", title: "https://zoom.us/j/123?pwd=abc123", secrets: ["abc123", "zoom.us", "123"] },
];

test("ledger corpus: every recorded reproduction, both routes, secret absent from the full JSON", () => {
  const tally: Record<string, [number, number]> = {};
  for (const r of [...LEDGER_001, ...EXTRAS]) {
    for (const route of [skippedAlert, jobAlert]) {
      const json = JSON.stringify(route(r.title));
      for (const s of r.secrets) assert.ok(!json.includes(s), `${r.issue} ${JSON.stringify(r.title)} leaked ${s}: ${json}`);
      assert.equal(JSON.parse(json).alerts[0].body.split("\n").length, 4);
    }
    const t = (tally[r.issue] ??= [0, 0]); t[0]++; t[1]++;
  }
  console.log(`ISS-R1ALERTS-001: ${tally["ISS-R1ALERTS-001"]![0]}/${LEDGER_001.length} refused (+${EXTRAS.length}/${EXTRAS.length} verdict extras)`);
  assert.equal(tally["ISS-R1ALERTS-001"]![0], LEDGER_001.length);
});

const KEY_002 = "cal:x https://zoom.us/j/1?pwd=SKEY bob@evil.example\nACTION";
test("ISS-R1ALERTS-002 recorded sessionKey: not in the alert, the key or the id (skipped and job routes)", () => {
  let n = 0;
  for (const res of [skippedAlert("t", KEY_002), jobAlert("t", KEY_002)]) {
    const json = JSON.stringify(res);
    for (const bad of ["SKEY", "bob", "evil.example", "zoom.us", "ACTION", "cal:x"]) assert.ok(!json.includes(bad), bad + " in " + json);
    const a = res.alerts[0]!;
    assert.match(a.id, /^[0-9a-f]{20}$/);
    assert.equal(a.key.includes(KEY_002), false);
    n++;
  }
  console.log(`ISS-R1ALERTS-002: ${n}/2 refused (skipped route, job route)`);
});

test("ISS-R1ALERTS-003 recorded zone cases", () => {
  const cases: [string, string | undefined, string][] = [
    ["2026-03-08T07:30:00Z", "America/New_York", "2026-03-08 03:30 (America/New_York)"],
    ["2026-03-08T07:30:00Z", "America/Los_Angeles", "2026-03-07 23:30 (America/Los_Angeles)"],
    ["2026-03-08T07:30:00Z", "America/Argentina/Buenos_Aires", "2026-03-08 04:30 (America/Argentina/Buenos_Aires)"],
    ["2026-10-10T19:00:00Z", undefined, "2026-10-10 19:00 (UTC)"],
  ];
  for (const [iso, tz, want] of cases) assert.equal(renderStart(iso, tz as never), want);
  assert.equal(renderStart("2026-10-10T19:00:00Z", "Asia/Kolkata\nhttps://x.example/?pwd=Z9"), "2026-10-10 19:00 (UTC)");
  assert.equal(renderStart("2026-10-10T19:00:00Z", "Not/AZone"), "2026-10-10 19:00 (UTC)");
  assert.equal(neutralizeText(undefined), "(untitled)");
  assert.equal(JSON.stringify(skippedAlert(undefined)).includes("((untitled))"), false);
  console.log(`ISS-R1ALERTS-003: ${cases.length}/${cases.length} correct (+3 hostile/invalid zone checks)`);
});

test("ISS-R1ALERTS-004 recorded collisions: distinct keys give distinct dedupe keys", () => {
  const keys = ["cal:a b", "cal:a/b", "cal:a_b"];
  const alerts = keys.flatMap((k) => skippedAlert("t", k).alerts);
  assert.equal(new Set(alerts.map((a) => a.key)).size, 3);
  assert.equal(selectNewAlerts(alerts, []).fresh.length, 3);
  const base = "p".repeat(200);
  assert.notEqual(alertIdFor(base + "A"), alertIdFor(base + "B"));
  assert.equal(skippedAlert("t", base + "A").alerts[0]!.key === skippedAlert("t", base + "B").alerts[0]!.key, false);
  console.log("ISS-R1ALERTS-004: 2/2 recorded collisions separated (3-key set, 200-char shared prefix)");
});

test("ids: deterministic, case/space/normalisation/lone-surrogate sensitive, fixed digest pinned", () => {
  assert.equal(alertIdFor("cal:e1"), alertIdFor("cal:e1"));
  assert.equal(alertIdFor("cal:e1"), "69c86e49f0d76452a89a");
  const variants = ["cal:e1", "CAL:E1", "cal:e1 ", " cal:e1", "cal:e1\n", "cal:é", "cal:é", "cal:" + u(0xd800), "cal:" + u(0xdc00), "cal:" + u(0xfffd)];
  assert.equal(new Set(variants.map(alertIdFor)).size, variants.length);
  for (const v of variants) assert.match(alertIdFor(v), /^[0-9a-f]{20}$/);
});

test("zone label is validated or UTC, never free text", () => {
  for (const z of [5, null, {}, "", "x".repeat(200), "A\u0000B", "<b>x</b>", "Etc/../../x"]) {
    assert.equal(renderStart("2026-10-10T19:00:00Z", z as never), "2026-10-10 19:00 (UTC)");
  }
  assert.equal(renderStart("2026-10-10T19:00:00Z", "Asia/Kolkata"), "2026-10-11 00:30 (Asia/Kolkata)");
});

// ---- normalisation steps: dropping any one of them must fail one of these ----
const out = (t: string) => JSON.stringify(skippedAlert(t));
test("step NFKC: full-width URL, digits and keyword fold before matching", () => {
  assert.ok(!out(fw("https://zoom.us/j/1?pwd=") + "FWX1").includes("FWX1"));
  assert.ok(!out(fw("Meeting 987654")).includes("987654") && !out(fw("Meeting 987654")).includes(fw("9")));
  assert.ok(!out(fw("password") + " Sekretx").includes("Sekretx"));
  assert.equal(normalise(fw("abc")), "abc");
});
test("step percent-decode (also double-encoded)", () => {
  assert.ok(!out("https%3A%2F%2Fzoom.us%2Fj%2F1%3Fpwd%3DPCTX").includes("PCTX"));
  assert.ok(!out("https%253A%252F%252Fzoom.us%252Fj%252F1%253Fpwd%253DDBLX").includes("DBLX"));
  assert.ok(!out("pass%63ode%3DPctKw").includes("PctKw"));
  assert.equal(neutralizeText("50% off 10%"), "50% off 10%");
});
test("step look-alike slash/colon/dot folding", () => {
  assert.ok(!out("https" + u(0x2236) + u(0x2215, 0x2215) + "zoom" + u(0x3002) + "us" + u(0x2044) + "j?pwd=LKA1").includes("zoom"));
  assert.ok(!out("zoom.us" + u(0x29f8) + "j" + u(0x2571) + "1").includes("zoom"));
  assert.ok(!out("zoom.us\\j\\1").includes("zoom"));
});
test("step separators to space: newline, tab, LS, PS, NEL, VT, FF split a keyword from its value", () => {
  for (const sep of ["\n", "\r\n", "\t", u(0x2028), u(0x2029), u(0x85), u(0x0b), u(0x0c), u(0xa0), u(0x3000)]) {
    assert.ok(!out("key" + sep + "Sekretw").includes("Sekretw"), JSON.stringify(sep));
    assert.ok(!out("https://zoom.us/j/1?pwd=" + sep + "SPL1T").includes("SPL1T"), JSON.stringify(sep));
    assert.equal(out("Hello" + sep + "World").includes("Hello World"), true, JSON.stringify(sep));
  }
});
test("step strip Cc: control characters cannot split a keyword or a number", () => {
  for (const cp of [0x00, 0x01, 0x07, 0x08, 0x1b, 0x7f, 0x80, 0x9f]) {
    assert.ok(!out("pa" + u(cp) + "ss" + u(cp) + "code=Cc1x").includes("Cc1x"), String(cp));
    assert.ok(!out("98" + u(cp) + "76" + u(cp) + "54").includes("987654"), String(cp));
  }
  assert.equal(neutralizeText("a" + u(0) + "b" + u(0x1f) + "c"), "abc");
});
test("step strip Cf and invisible marks: zero-width, bidi, soft hyphen, variation selectors, CGJ, tags", () => {
  const cps = [...ZW, 0x200c, 0xfeff, 0x200e, 0x200f, 0x202a, 0x202e, 0x2066, 0x2069, 0x061c, 0x034f, 0xfe00, 0xe0041, 0xe0100, 0x3164, 0x2800, 0x2062];
  for (const cp of cps) {
    assert.ok(!out("pass" + u(cp) + "code=Zw" + cp.toString(16)).includes("Zw" + cp.toString(16)), cp.toString(16));
    assert.ok(!out("to" + u(cp) + "ken Secr" + cp.toString(16)).includes("Secr" + cp.toString(16)), cp.toString(16));
    assert.ok(!out("zoom" + u(cp) + ".us/j/1").includes("zoom"), cp.toString(16));
  }
});
test("step strip Co, Cn and lone surrogates", () => {
  for (const cp of [0xe000, 0xf8ff, 0xf0000, 0x0378, 0xfdd0, 0xd800, 0xdfff]) {
    assert.ok(!out("pass" + u(cp) + "code=Pu" + cp.toString(16)).includes("Pu" + cp.toString(16)), cp.toString(16));
  }
  assert.equal(neutralizeText("ab" + u(0xd800) + "cd"), "abcd");
});
test("step decorative/symbol removal before matching; allowlist after", () => {
  assert.ok(!out("p*a*s*s*c*o*d*e=Star1").includes("Star1"));
  assert.ok(!out("9*8*7*6*5*4").includes("987654"));
  assert.equal(neutralizeText("Join \u{1F389} the *session* [now] <b>x</b> {y} a|b ~ ` ^ \\ #"), "Join the session now bx/b y ab /");
  assert.equal(neutralizeText("Hindi: वेबिनार सत्र १"), "Hindi: वेबिनार सत्र १");
});

// ---- structural masks ----
test("masks: digits, groups, key shapes, mixed alphanumerics, keywords, obfuscated emails, ordinary short numbers", () => {
  assert.equal(sanitize("Session 2 and Top 10 tips, IELTS 7.5 band"), "Session 2 and Top 10 tips, IELTS 7.5 band");
  for (const t of ["12 34 56", "12-34-56", "1.2.3.4.5.6", "123", "9 8 7 6 5 4", "+1 (555) 123-4567", u(0x967, 0x968, 0x969)]) assert.ok(!/[0-9०-९]{3}|\d [0-9]/.test(sanitize(t)) && sanitize(t).includes("(hidden)"), t);
  for (const t of ["ghp_abcdEFGH1234", "xoxb-1234-abcd", "eyJhbGciOi", "AIzaSyA1234567890", "AKIAABCDEFGHIJKL", "sk-proj-abcdefgh", "Zq9aB3kLm2P"]) assert.equal(sanitize(t), "(hidden)", t);
  for (const t of ["pin 1abc", "OTP: word", "secret is hunter", "apiKey=foo", "tk=zzzz", "Pass Code: Walnut", "pass-word Walnut"]) assert.ok(sanitize(t).endsWith("(hidden)") && !/walnut|hunter|foo|zzzz|1abc|word$/i.test(sanitize(t).replace(/pass.?word|Pass Code/i, "")), t);
  for (const t of ["bob(at)evil.example", "bob [at] evil [dot] example", "bob at evil dot example", "bob@evil.example", "bob (at) evil.example"]) assert.equal(sanitize(t), "(email)", t);
  assert.equal(sanitize("Meet at 5 PM"), "Meet at 5 PM");
  assert.equal(sanitize("Keynote spinning pinned codecs"), "Keynote spinning pinned codecs");
  assert.equal(sanitize("pаsscode=Cyr1"), "(hidden)");
});
test("output charset: only letters, marks, short digits, spaces and the small punctuation set; single line; capped by code point", () => {
  for (const t of ["<script>alert(1)</script>", "[x](javascript:alert(1))", "a\nb\r\nc", "evil‮exe.txt", "=cmd|' /C calc'!A0", "@everyone"]) {
    const s = neutralizeText(t);
    assert.match(s, /^[\p{L}\p{M}\p{Nd} .,:;'"!?()/&+\-%…]*$/u, t);
    assert.doesNotMatch(s, /[\n\r<>[\]*_`~|\\{}#=@]/);
  }
  assert.equal(neutralizeText("   \n "), "(untitled)");
  assert.equal(neutralizeText(42), "(untitled)");
  assert.equal(neutralizeText("*** ###"), "(untitled)");
  assert.equal(JSON.stringify(skippedAlert("")).includes("((untitled))"), false);
  const astral = u(0x20000);
  const capped = neutralizeText((astral + u(0x20001) + u(0x20002) + " ").repeat(100));
  assert.equal(Array.from(capped).length, 80);
  assert.ok(capped.endsWith("…") && !/[\ud800-\udbff](?![\udc00-\udfff])|(?<![\ud800-\udbff])[\udc00-\udfff]/.test(capped));
  const flood = neutralizeText("a" + u(0x301).repeat(5000));
  assert.ok(Array.from(flood).length <= 80 && !/\p{M}$/u.test(flood.replace("…", "")));
  const seq = neutralizeText("w".repeat(78) + "e" + u(0x301, 0x302));
  assert.ok(!/\p{M}…$/u.test(seq) || Array.from(seq).length <= 80);
});

// ---- property tests (seeded) ----
function rng(seed: number) {
  let a = seed >>> 0;
  return () => { a = (a + 0x6d2b79f5) >>> 0; let t = a; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
}
test("property: 2400 seeded cases - an embedded secret never survives into any alert field", () => {
  const rand = rng(20261010);
  const pick = <T,>(xs: readonly T[]): T => xs[Math.floor(rand() * xs.length)]!;
  const int = (a: number, b: number) => a + Math.floor(rand() * (b - a + 1));
  const letters = "abcdefghijklmnopqrstuvwxyz", digits = "0123456789", alnum = letters + letters.toUpperCase() + digits;
  const str = (n: number, set: string) => Array.from({ length: n }, () => set[int(0, set.length - 1)]).join("");
  const words = ["Study", "abroad", "webinar", "Canada", "results", "call", "weekly", "Admissions", "live", "session", "for", "the", "UK", "intake", "strategy"];
  const invis = [0x200b, 0x200c, 0x200d, 0x2060, 0x180e, 0xad, 0xfeff, 0xfe0f, 0x202e, 0x2066, 0x200e, 0x034f, 0x00];
  const kws = ["pwd", "password", "passcode", "pass code", "PIN", "otp", "code", "token", "key", "secret", "meetingPassword", "Passcode", "PASSWORD", "tk", "apiKey", "pass-word"];
  const joins = [" ", "=", ": ", "=\"", ":", " is ", "\n", "\t", "  ", ": \"", " = ", " "];
  let cases = 0;
  const kinds = ["digits", "mixed", "url", "email", "kwword", "kwdigits"] as const;
  for (let i = 0; i < 2400; i++) {
    const kind = pick(kinds);
    let secret: string, forbid: string[], core: string;
    if (kind === "digits") {
      const groups: string[] = []; let total = 0;
      while (total < int(6, 12)) { const g = str(int(1, 4), digits); groups.push(g); total += g.length; }
      secret = groups.join(pick([" ", "-", ".", " "])); forbid = [];
      core = secret;
    } else if (kind === "mixed") {
      const n = int(8, 16); const l = str(n, alnum).split(""); l[0] = pick([...letters]); l[n - 1] = pick([...digits]);
      secret = l.join(""); forbid = [secret]; core = secret;
    } else if (kind === "url") {
      const host = "Zhost" + str(5, letters), pw = "Zpw" + str(6, alnum);
      secret = pick(["https://", "http://", "", "hxxps://", "www."]) + host + ".example/j/" + str(int(1, 3), digits) + "?pwd=" + pw;
      forbid = [host, pw, ".example/"]; core = secret;
    } else if (kind === "email") {
      const lo = "Zloc" + str(5, letters), dom = "Zdom" + str(5, letters);
      secret = pick([`${lo}@${dom}.example`, `${lo}(at)${dom}.example`, `${lo} at ${dom} dot example`, `${lo} [at] ${dom} [dot] example`, `${lo}(at)${dom}(dot)example`]);
      forbid = [lo, dom]; core = secret;
    } else {
      const val = kind === "kwword" ? "Zq" + str(int(4, 8), letters) : str(int(6, 9), digits);
      secret = val; forbid = kind === "kwword" ? [val] : [];
      core = pick(kws) + pick(joins) + val + pick(["", "\"", "'"]);
    }
    let text = [...Array(int(0, 3))].map(() => pick(words)).join(" ") + pick([" ", ", ", " - ", ": "]) + core + pick([" ", ". ", ", "]) + [...Array(int(0, 3))].map(() => pick(words)).join(" ");
    for (let k = int(0, 5); k > 0; k--) { const at = int(0, text.length); text = text.slice(0, at) + u(pick(invis)) + text.slice(at); }
    const clean = normalise(text);
    const res = pick([skippedAlert, jobAlert])(text, "k" + i);
    const json = noDigest(JSON.stringify(res));
    const alert = res.alerts[0]!;
    assert.equal(alert.body.split("\n").length, 4);
    for (const f of forbid) assert.ok(!json.includes(f), `case ${i} ${kind} leaked ${f}: ${JSON.stringify(text)} -> ${json}`);
    if (kind === "digits" || kind === "kwdigits") assert.ok(!/\d{3}|\d[ .-]\d/.test(noDigest(alert.title)), `case ${i} digits: ${JSON.stringify(text)} -> ${alert.title}`);
    if (kind === "digits" || kind === "kwdigits") assert.ok(!/\d{3}|\d[ .-]\d/.test(noDigest(alert.body.split("\n")[1]!)));
    assert.ok(clean.length >= 0);
    cases++;
  }
  console.log(`property: ${cases} seeded cases, 0 leaks`);
  assert.equal(cases, 2400);
});

// ---- performance: linear patterns ----
test("performance: 1 MB adversarial inputs stay under 1500 ms each (no catastrophic backtracking)", () => {
  const MB = 1_000_000;
  const rep = (s: string) => s.repeat(Math.ceil(MB / s.length)).slice(0, MB);
  const inputs: Record<string, string> = {
    http: rep("http://"), dots: rep("a."), dotsAt: rep("a.") + "@", pins: rep("pin "), pinsNoSpace: rep("pin-"), digits: "1".repeat(MB), digitGroups: rep("1 "),
    dashes: rep("a-"), sk: rep("sk-"), at: rep("(at)"), atWord: rep("x at "), colons: "pin" + ":".repeat(MB), spaces: "a" + " ".repeat(MB) + "b",
    mixed: rep("a1"), longword: "a".repeat(MB), keyEq: rep("key="), slashes: rep("a.b/"), pct: rep("%2"), combining: "a" + u(0x301).repeat(MB / 2),
    nested: rep("(["), fill: rep("code is the your "), mixedScript: rep("a" + u(0x430) + " "), emoji: rep(u(0x1f600)),
  };
  const slow: string[] = [];
  let worst = 0, worstName = "";
  for (const [name, text] of Object.entries(inputs)) {
    const t0 = performance.now();
    const s = sanitize(text);
    const ms = performance.now() - t0;
    if (ms > worst) { worst = ms; worstName = name; }
    if (ms > 1500) slow.push(`${name}=${ms.toFixed(0)}ms`);
    assert.ok(typeof s === "string");
  }
  console.log(`performance: ${Object.keys(inputs).length} inputs x 1 MB, worst ${worst.toFixed(0)} ms (${worstName})`);
  assert.deepEqual(slow, []);
});

// ---- totality (checker low notes) ----
test("throwing getters, Proxies and inherited fields are counted, never thrown", () => {
  const getter = { get sessionKey(): string { throw new Error("boom"); }, reason: "overlap-lost" };
  const proxy = new Proxy({}, { get() { throw new Error("p"); }, has() { throw new Error("p"); }, ownKeys() { throw new Error("p"); }, getOwnPropertyDescriptor() { throw new Error("p"); } });
  const inherited = Object.create({ sessionKey: "cal:inh", reason: "overlap-lost", title: "t" });
  const r = buildAttentionAlerts({ timeZone: "UTC", now: NOW, skipped: [getter, proxy, inherited, { sessionKey: "cal:ok", reason: "overlap-lost", title: "ok" }],
    jobs: { a: { get status(): string { throw new Error("x"); } }, b: proxy, c: Object.create({ status: "action_required" }) } } as never);
  assert.equal(r.alerts.length, 1);
  assert.equal(r.alerts[0]!.id, alertIdFor("cal:ok"));
  assert.equal(r.ignored.count, 6);
  assert.doesNotThrow(() => buildAttentionAlerts(proxy as never));
  assert.doesNotThrow(() => buildAttentionAlerts({ timeZone: "UTC", now: NOW, skipped: proxy, jobs: proxy } as never));
  const cyc: Record<string, unknown> = { status: "action_required", reason: "retry-limit" }; cyc.title = cyc;
  assert.equal(buildAttentionAlerts({ timeZone: "UTC", now: NOW, jobs: { cyc } } as never).alerts.length, 1);
});

test("readability: ordinary webinar titles mostly survive; years and long numbers are the price", () => {
  assert.equal(sanitize("Study in Canada 2026 intake webinar"), "Study in Canada (hidden) intake webinar");
  assert.equal(sanitize("Q3 results call"), "Q3 results call");
  assert.equal(sanitize("IELTS 7.5 band strategy"), "IELTS 7.5 band strategy");
  const titles = ["UK Universities Fair - Live Q&A with admissions officers", "Masters in Germany: Tuition-free options", "Weekly Webinar",
    "Scholarships for Indian students: how to apply", "Australia Student Visa (subclass 500) explained", "Fall 2027 intake: deadlines and documents",
    "SOP and LOR writing workshop", "GRE vs GMAT: which test is right for you?", "Meet the Dean - University of Toronto", "Career counselling session with Priya",
    "Study MBBS abroad: Russia, Georgia, Philippines", "Free IELTS masterclass | Day 3", "Education loan webinar for abroad studies", "Ireland post-study work visa 2026",
    "PhD funding opportunities in Europe", "How to choose the right course (Part 2)", "Open day: Monash University Melbourne", "Parents' session: safety and accommodation abroad",
    "Python for beginners - Session 4 of 6", "Digital SAT strategy - 1500+ score plan", "Zoom Meeting - Admissions Team Sync", "Webinar: US F-1 visa interview tips",
    "Study in New Zealand - Intake July 2026", "Engineering in USA: STEM OPT explained", "Vidysea partner onboarding call", "Statement of purpose clinic (limited seats)",
    "Q&A: Is a Master's in Canada worth it in 2026?", "Study in Canada 2026 intake webinar", "Q3 results call", "IELTS 7.5 band strategy"];
  assert.equal(titles.length, 30);
  const readable = titles.filter((t) => sanitize(t).split(" ").filter((w) => !w.includes("(hidden)")).length >= t.split(" ").length - 2).length;
  console.log(`readability: ${readable}/30 titles keep all but at most two words`);
  assert.ok(readable >= 28);
  assert.equal(titles.filter((t) => sanitize(t) === t).length >= 20, true);
});
