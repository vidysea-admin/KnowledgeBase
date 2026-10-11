import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { buildAttentionAlerts } from "./attention-alerts.js";
import { allowlistTitle, isAllowlistedTitle, SAFE_TITLE_WORDS } from "./title-allowlist.js";

const NOW = "2026-10-10T00:00:00.000Z";
type Res = ReturnType<typeof buildAttentionAlerts>;
const skipped = (title: unknown): Res =>
  buildAttentionAlerts({ titlePolicy: "masked", timeZone: "UTC", now: NOW, skipped: [{ sessionKey: "cal:aw1", title, reason: "overlap-lost" }] } as never);
const job = (title: unknown): Res =>
  buildAttentionAlerts({ titlePolicy: "masked", timeZone: "UTC", now: NOW, jobs: { "job-aw1": { status: "action_required", reason: "retry-limit", title } } } as never);
const ROUTES: [string, (t: unknown) => Res][] = [["skipped", skipped], ["job", job]];
const blob = (r: Res) => JSON.stringify(r);

// The ledger row is read at test time: every title below must occur verbatim in ISS-R1ALERTS-009's own text.
const row = readFileSync(new URL("../../../../../qa/issues.r1alerts.jsonl", import.meta.url), "utf8").trim().split("\n")
  .map((l) => JSON.parse(l) as Record<string, string>).find((r) => r.id === "ISS-R1ALERTS-009")!;
const rowText = `${row.evidence}\n${row.checker_evidence}`;

/** [title as sent, secret that must not appear]. Titles are the checker_evidence cases, each prefixed "Webinar" in the row except those noted. */
const LEDGER_009: [string, string][] = [
  ["Webinar tiger", "tiger"], ["Webinar access: tiger", "tiger"], ["Webinar - mdp: tiger", "tiger"], ["Webinar - пароль: tiger", "tiger"],
  ["Webinar - 암호 tiger", "tiger"], ["Webinar - パスワード tiger", "tiger"], ["Webinar - código tiger", "tiger"],
  ["Webinar 42 17", "42 17"], ["Webinar 4 2 1", "4 2 1"], ["Webinar 42,17", "42,17"], ["Webinar 42/17", "42/17"],
  ["Webinar one two three four", "one two three four"], ["раѕѕсоде tiger", "tiger"], ["Webinar p4ss tiger", "tiger"],
  ["1 2 3 4", "1 2 3 4"], // evidence field: "'1 2 3 4'"
];

test("every ledger title is a verbatim string of the ISS-R1ALERTS-009 row", () => {
  for (const [t] of LEDGER_009) assert.ok(rowText.includes(t) || rowText.includes(`'${t}'`), t);
});

test("ISS-R1ALERTS-009: masked policy, both routes, secret absent from the WHOLE alert JSON (count reported)", () => {
  let redacted = 0;
  for (const [title, secret] of LEDGER_009) {
    const leaks = ROUTES.filter(([, r]) => blob(r(title)).includes(secret));
    if (leaks.length === 0) redacted++;
    else assert.fail(`leaked ${title}: ${leaks.map(([n]) => n)}`);
  }
  console.log(`ISS-R1ALERTS-009: ${redacted}/${LEDGER_009.length} redacted (masked, skipped and job routes)`);
  assert.equal(redacted, LEDGER_009.length);
});

test("additional cases named in the 009 evidence text (authored here, not a substitute for the ledger set)", () => {
  for (const t of ["Webinar p/i/n tiger", "Webinar c0de tiger", "Webinar ԗass tiger", "Webinar Ꭱass tiger", "Webinar 1 2 3 4", "Webinar пароль tiger", "Webinar tiger tiger"])
    for (const [n, r] of ROUTES) assert.ok(!blob(r(t)).includes("tiger") && !blob(r(t)).includes("1 2 3 4"), `${n}: ${t}`);
});

test("ordinary titles built only from allow-listed words still render; one unknown word hides the whole title", () => {
  for (const [, r] of ROUTES) {
    assert.ok(blob(r("Weekly Class")).includes("Weekly Class"));
    assert.ok(blob(r("Product Team Sync - Q&A")).includes("Product Team Sync - Q&A"));
    const a = r("Weekly Class tiger").alerts[0]!;
    assert.ok(a.title.endsWith(": (hidden)") && !a.body.includes("Weekly") && a.body.includes("Event: (hidden)"), a.title);
  }
  assert.equal(allowlistTitle("Weekly Class"), "Weekly Class");
  assert.equal(allowlistTitle("Weekly tiger"), "(hidden)");
  assert.equal(allowlistTitle(""), "(untitled)");
  assert.equal(allowlistTitle(undefined), "(untitled)");
  assert.equal(allowlistTitle({ toString: () => "Weekly Class" }), "(untitled)");
});

test("allow-list shape: lower-case ASCII, no digits, no number words, case-insensitive match, non-ASCII never matches", () => {
  for (const w of SAFE_TITLE_WORDS) assert.match(w, /^[a-z&-]+$/, w);
  for (const w of ["one", "two", "three", "four", "zero", "tiger", "blue", "seven"]) assert.ok(!SAFE_TITLE_WORDS.has(w), w);
  assert.ok(isAllowlistedTitle("WEEKLY sync"));
  assert.ok(!isAllowlistedTitle("Weekly Ѕync")); // Cyrillic S
  assert.ok(!isAllowlistedTitle("Weekly sync 2"));
  assert.ok(!isAllowlistedTitle("- -"));
  assert.ok(!isAllowlistedTitle(""));
});

test("omit stays the default and is unaffected: no title text at all", () => {
  const r = buildAttentionAlerts({ timeZone: "UTC", now: NOW, skipped: [{ sessionKey: "cal:aw1", title: "Weekly Class", reason: "overlap-lost" }] } as never);
  assert.ok(!blob(r).includes("Weekly"));
});
