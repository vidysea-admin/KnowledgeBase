/**
 * ISS-R1ALERTS-010 (D-015 against qa/issues.r1alerts.jsonl): misspelt and joined forms of the credential keywords hide the title at the
 * DENY-LIST layer itself (sanitize / neutralizeText, the renderer `lkb alert-who` prints titles through), not only behind the masked policy's allowlist.
 * Prints "ISS-R1ALERTS-010: n/m".
 */
import { test, after } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { sanitize, neutralizeText, keywordIndex } from "./alert-text.js";

const ROW = readFileSync(new URL("../../../../../qa/issues.r1alerts.jsonl", import.meta.url), "utf8").trim().split("\n")
  .map((l) => JSON.parse(l) as Record<string, string>).find((r) => r.id === "ISS-R1ALERTS-010")!;
let pass = 0, total = 0;
after(() => console.log(`ISS-R1ALERTS-010: ${pass}/${total} reproductions refused`));

// The 12 inputs of the row's evidence, verbatim ("sanitize(X) -> output ... all leaking 'tiger'").
const RECORDED = ["Webinar pasword tiger", "Webinar pasword: tiger", "Webinar paswrd tiger", "Webinar paswerd tiger", "Webinar pasvard tiger", "Webinar paasward tiger",
  "Webinar pincode tiger", "Webinar p/w tiger", "Webinar Pasccode tiger", "Webinar पासवर्ड़ tiger", "Webinar पासवड tiger", "Webinar पासवरड tiger"];

test("every recorded reproduction is a verbatim string of the ledger row", () => {
  for (const s of RECORDED) assert.ok(ROW.evidence!.includes(`'${s}'`), s);
});

test("ISS-R1ALERTS-010: the 12 recorded reproductions no longer echo the value (sanitize and neutralizeText)", () => {
  for (const s of RECORDED) {
    total++;
    assert.equal(sanitize(s), "(hidden)", s);
    assert.equal(neutralizeText(s), "(hidden)", s);
    assert.ok(keywordIndex(s.normalize("NFKC")) >= 0, s);
    pass++;
  }
});

// More typo shapes of the same families (not in the row; authored extras, reported separately).
const EXTRA = ["pincod tiger", "pin cod tiger", "PASWORD tiger", "pasword:tiger", "pasw0rd tiger", "passwrod tiger", "pssword tiger", "paswrd=tiger", "meetingPasword tiger",
  "pascode tiger", "passcod tiger", "secrit tiger", "tokan tiger", "credentail tiger", "पासवर्ड़: tiger", "पासकड tiger", "पासवरड़ tiger"];
test("authored extras: further typo shapes hide the title too", () => {
  for (const s of EXTRA) assert.equal(sanitize(`Webinar ${s}`), "(hidden)", s);
});

// Ordinary titles must stay readable: the stems are narrow.
const BENIGN = ["Pascal programming basics", "Pasadena meetup", "Weekly Class", "Pass Wednesday planning", "Quarterly review of Passover plans", "Spin code review is not a thing",
  "Pawed Pasta workshop", "Compass and wedding planning", "Pascoe family history", "पासपोर्ट सेवा", "Pavard football analysis", "Introduction to Wordpress"];
test("benign titles that merely look similar are not hidden by the new stems", () => {
  for (const s of BENIGN) {
    const out = sanitize(s);
    // 'Pass Wednesday planning' and 'Spin code review...' contain an EXISTING bounded keyword (pass / code): they were hidden before this change.
    if (/^Pass Wednesday|code review/.test(s)) continue;
    assert.notEqual(out, "(hidden)", s);
  }
});
