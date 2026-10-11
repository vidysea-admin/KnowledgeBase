import { test } from "node:test";
import assert from "node:assert/strict";
import { buildAttentionAlerts, renderStart, alertIdFor, selectNewAlerts } from "./attention-alerts.js";
import { neutralizeText, sanitize, normalise } from "./alert-text.js";

const NOW = "2026-10-10T00:00:00.000Z";
const u = (...cp: number[]) => String.fromCodePoint(...cp);
const fw = (s: string) => Array.from(s).map((c) => (c === " " ? c : u(c.charCodeAt(0) + 0xfee0))).join("");
const skippedAlert = (title: unknown, key = "cal:corpus") =>
  buildAttentionAlerts({ titlePolicy: "masked", timeZone: "UTC", now: NOW, skipped: [{ sessionKey: key, title, reason: "overlap-lost" }] } as never);
const jobAlert = (title: unknown, id = "job-corpus") =>
  buildAttentionAlerts({ titlePolicy: "masked", timeZone: "UTC", now: NOW, jobs: { [id]: { status: "action_required", reason: "retry-limit", title } } } as never);
/** the 20-hex id/key digest is of an unrelated input; drop it when matching random secrets */
const noDigest = (s: string) => s.replace(/[0-9a-f]{20}/g, "");

const ZW = [0x200b, 0x200d, 0x2060, 0x180e, 0xad, 0xfe0f];
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
  const r = buildAttentionAlerts({ titlePolicy: "masked", timeZone: "UTC", now: NOW, skipped: [getter, proxy, inherited, { sessionKey: "cal:ok", reason: "overlap-lost", title: "ok" }],
    jobs: { a: { get status(): string { throw new Error("x"); } }, b: proxy, c: Object.create({ status: "action_required" }) } } as never);
  assert.equal(r.alerts.length, 1);
  assert.equal(r.alerts[0]!.id, alertIdFor("cal:ok"));
  assert.equal(r.ignored.count, 6);
  assert.doesNotThrow(() => buildAttentionAlerts(proxy as never));
  assert.doesNotThrow(() => buildAttentionAlerts({ titlePolicy: "masked", timeZone: "UTC", now: NOW, skipped: proxy, jobs: proxy } as never));
  const cyc: Record<string, unknown> = { status: "action_required", reason: "retry-limit" }; cyc.title = cyc;
  assert.equal(buildAttentionAlerts({ titlePolicy: "masked", timeZone: "UTC", now: NOW, jobs: { cyc } } as never).alerts.length, 1);
});
