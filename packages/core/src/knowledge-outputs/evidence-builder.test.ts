import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import type { Claims } from "../generated/claims.js";
import type { Turns } from "../generated/turns.js";
import { buildEvidenceOutput, type EvidenceOutputRequest } from "./evidence-builder.js";

const turn = (patch: Partial<Turns> = {}): Turns => ({
  _id: "t1", tenantId: "a", sessionId: "s1", speakerRef: "spk:0", tStart: 4, tEnd: 10,
  text: "The source says applications open on Monday.", ...patch,
});
const claim = (patch: Partial<Claims> = {}): Claims => ({
  _id: "c1", tenantId: "a", status: "verified", text: "An unsupported interpretation that must never appear.",
  evidence: [{ turnId: "t1", sessionId: "s1", quote: "applications open on Monday" }], ...patch,
});
const request = (patch: Partial<EvidenceOutputRequest> = {}): EvidenceOutputRequest => ({
  tenantId: "a", sessionIds: ["s1"], kind: "report", title: "Admissions",
  sections: [{ title: "Application timing", claimIds: ["c1"] }], claims: [claim()], turns: [turn()], ...patch,
});

test("literal evidence retains exact quote, stable identity, range and real session anchor", () => {
  const result = buildEvidenceOutput(request());
  assert.equal(result.status, "ready");
  assert.deepEqual(result.sections[0]!.excerpts[0], {
    claimId: "c1", turnId: "t1", sessionId: "s1", speakerRef: "spk:0", start: 4, end: 10,
    unit: "seconds", quote: "applications open on Monday", href: "/sessions/s1#turn-t1",
  });
  assert.match(result.markdown, /> applications open on Monday/u);
  assert.doesNotMatch(result.markdown, /unsupported interpretation/u);
});

test("all three output kinds produce explicitly labelled editable Markdown evidence drafts", () => {
  for (const kind of ["faq", "report", "meeting-brief"] as const) {
    const result = buildEvidenceOutput(request({ kind }));
    assert.equal(result.kind, kind);
    assert.match(result.markdown, /evidence draft/u);
    assert.equal(typeof result.markdown, "string");
    assert.match(result.markdown, /do not establish an inferred answer/u);
  }
});

test("missing quote uses the literal whole turn, never the interpreted claim", () => {
  const result = buildEvidenceOutput(request({ claims: [claim({ evidence: [{ turnId: "t1", sessionId: "s1" }] })] }));
  assert.equal(result.sections[0]!.excerpts[0]!.quote, turn().text);
});

test("review/conflicting/missing claims are visibly withheld", () => {
  for (const status of ["needs-review", "conflicting"] as const) {
    const result = buildEvidenceOutput(request({ claims: [claim({ status })] }));
    assert.equal(result.status, "unavailable");
    assert.equal(result.sections[0]!.withheld[0]!.reason, "claim-unverified");
    assert.match(result.markdown, /No verified evidence available/u);
    assert.doesNotMatch(result.markdown, /applications open/u);
  }
  assert.equal(buildEvidenceOutput(request({ claims: [] })).sections[0]!.withheld[0]!.reason, "claim-unavailable");
});

test("foreign rows refuse the entire request, including unreferenced foreign rows", () => {
  for (const patch of [
    { claims: [claim({ tenantId: "foreign", text: "SECRET" })] },
    { turns: [turn({ tenantId: "foreign", text: "SECRET" })] },
    { turns: [turn(), turn({ _id: "unused", tenantId: "foreign", text: "SECRET" })] },
  ]) {
    assert.throws(() => buildEvidenceOutput(request(patch)), (error: unknown) =>
      error instanceof Error && error.message === "evidence tenant scope mismatch" && !error.message.includes("SECRET"));
  }
});

test("session mismatch, unauthorized session and missing turn cannot become cited evidence", () => {
  for (const patch of [
    { turns: [turn({ sessionId: "other" })] },
    { sessionIds: ["other"] },
    { turns: [] },
    { claims: [claim({ evidence: [{ turnId: "missing", sessionId: "s1" }] })] },
  ]) assert.equal(buildEvidenceOutput(request(patch)).status, "unavailable");
});

test("all evidence must resolve: one good reference cannot mask a missing or foreign source", () => {
  const result = buildEvidenceOutput(request({ claims: [claim({ evidence: [
    { turnId: "t1", sessionId: "s1" }, { turnId: "missing", sessionId: "s1" },
  ] })] }));
  assert.equal(result.status, "unavailable");
  assert.equal(result.sections[0]!.excerpts.length, 0);
});

test("nonliteral, empty and malformed quotes are refused", () => {
  for (const quote of ["Wednesday", "", "  ", null, 123]) {
    const malformed = { turnId: "t1", sessionId: "s1", quote } as unknown as Claims["evidence"][0];
    assert.equal(buildEvidenceOutput(request({ claims: [claim({ evidence: [malformed] })] })).status, "unavailable");
  }
});

test("invalid source timing or attribution never appears in a draft", () => {
  for (const patch of [
    { tStart: -1 }, { tEnd: 3 }, { tStart: NaN }, { tEnd: Infinity }, { speakerRef: "" }, { text: " " },
  ]) assert.equal(buildEvidenceOutput(request({ turns: [turn(patch)] })).status, "unavailable");
});

test("duplicate claim/turn identities refuse independently of row ordering", () => {
  for (const rows of [[turn(), turn({ text: "Duplicate" })], [turn({ text: "Duplicate" }), turn()]]) {
    assert.equal(buildEvidenceOutput(request({ turns: rows })).status, "unavailable");
  }
  assert.equal(buildEvidenceOutput(request({ claims: [claim(), claim()] })).status, "unavailable");
});

test("repeat requests/evidence deduplicate without mutating the caller", () => {
  const input = request({ sections: [{ title: "Timing", claimIds: ["c1", "c1"] }],
    claims: [claim({ evidence: [{ turnId: "t1", sessionId: "s1" }, { turnId: "t1", sessionId: "s1" }] })] });
  const before = JSON.stringify(input);
  const result = buildEvidenceOutput(input);
  assert.equal(result.sections[0]!.excerpts.length, 1);
  assert.equal(JSON.stringify(input), before);
});

test("partial/empty sections remain visible rather than pretending full coverage", () => {
  const result = buildEvidenceOutput(request({ sections: [
    { title: "Available", claimIds: ["c1", "missing"] }, { title: "Empty", claimIds: [] },
  ] }));
  assert.equal(result.status, "partial");
  assert.match(result.markdown, /## Empty/u);
  assert.match(result.markdown, /Withheld evidence requests: 1/u);
});

test("document/URL offsets are labelled characters and labels never replace stable speaker IDs", () => {
  for (const speakerRef of ["document", "url"]) {
    const result = buildEvidenceOutput(request({ turns: [turn({ speakerRef, speakerLabel: "Source label" })] }));
    assert.equal(result.sections[0]!.excerpts[0]!.unit, "characters");
    assert.ok(result.markdown.includes(`Source label (${speakerRef}) · 4–10 characters`));
  }
});

test("Markdown metacharacters and HTML cannot create executable source links or headings", () => {
  const id = "s/(x)# !";
  const turnId = "t/(x)# !";
  const result = buildEvidenceOutput(request({ title: "<script>\n# injected", sessionIds: [id],
    turns: [turn({ _id: turnId, sessionId: id, text: "[click](javascript:alert(1))\n<img src=x>" })],
    claims: [claim({ evidence: [{ turnId, sessionId: id }] })] }));
  assert.doesNotMatch(result.markdown, /<script>|<img|\n# injected|\[click\]\(javascript:/u);
  const href = result.sections[0]!.excerpts[0]!.href;
  assert.equal(href, "/sessions/s%2F%28x%29%23%20%21#turn-t%2F%28x%29%23%20%21");
  assert.equal(decodeURIComponent(href.split("#turn-")[1]!), turnId);
});

test("invalid request scope/sections refuse before producing output", () => {
  for (const patch of [
    { tenantId: "" }, { sessionIds: [] }, { sessionIds: ["\ud800"] }, { title: " " }, { sections: [] },
    { sections: [{ title: "", claimIds: ["c1"] }] },
  ]) assert.throws(() => buildEvidenceOutput(request(patch)), /invalid evidence output/u);
});

test("actual TOC sample remains unmodified and its unreviewed claims are withheld", () => {
  const base = new URL("../../../../data/toc-migrated/2026-08-27-in-focus-4/", import.meta.url);
  const claimsPath = new URL("claims.json", base);
  const turnsPath = new URL("turns.json", base);
  const claimsBytes = readFileSync(claimsPath);
  const turnsBytes = readFileSync(turnsPath);
  const claims = JSON.parse(claimsBytes.toString()) as Claims[];
  const turns = JSON.parse(turnsBytes.toString()) as Turns[];
  const result = buildEvidenceOutput(request({ tenantId: "toc", sessionIds: ["2026-08-27-in-focus-4"],
    claims, turns, sections: [{ title: "TOC preparation", claimIds: claims.map((item) => item._id) }] }));
  assert.equal(result.status, "unavailable");
  assert.equal(result.sections[0]!.withheld.length, claims.length);
  assert.equal(result.sections[0]!.excerpts.length, 0);
  assert.deepEqual(readFileSync(claimsPath), claimsBytes);
  assert.deepEqual(readFileSync(turnsPath), turnsBytes);
});
