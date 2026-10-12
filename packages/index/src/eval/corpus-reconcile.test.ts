/**
 * packages/index/src/eval/corpus-reconcile.test.ts — reconciliation logic on small fixtures (no repo corpus needed),
 * plus the `reconcile` subcommand over a temp-dir corpus. Every case asserts something a wrong implementation breaks.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, rmSync, readdirSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, dirname, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import {
  reconcileCitations, findInvalidTurnTimes, findMissingArtifacts, reconcileProvenance, lexicalHint,
  buildReconciliationReport, renderReconciliationMarkdown, type SessionSnapshot,
} from "./corpus-reconcile.js";

const turn = (s: string, n: number, text: string, tStart = n * 10, tEnd = n * 10 + 5) =>
  ({_id: `${s}-t${String(n).padStart(3, "0")}`, tenantId: "toc", sessionId: s, speakerRef: "a", tStart, tEnd, text});
const claim = (s: string, n: number, text: string, turnId: string, sessionId = s) =>
  ({_id: `${s}-c${n}`, tenantId: "toc", text, status: "needs-review", evidence: [{turnId, sessionId}]});

const A = "2026-01-01-alpha";
const alpha: SessionSnapshot = {
  sessionId: A, turnsSha256: "sha-a",
  turns: [turn(A, 1, "Welcome everyone to the session on scholarships."),
    turn(A, 2, "The Fulbright scholarship covers tuition, airfare and living stipend for graduate students abroad."),
    turn(A, 3, "Thanks for joining, see you next week.")],
  claims: [
    claim(A, 1, "ok claim", `${A}-t002`),                                       // resolvable -> not reported
    claim(A, 2, "The Fulbright scholarship covers tuition, airfare and a living stipend for graduate students.", `${A}-t040`), // off-range
    claim(A, 3, "x", "turn-7"),                                                  // id format
    claim(A, 4, "x", "2026-02-02-beta-t001"),                                    // prefix mismatch (different session id prefix)
    claim(A, 5, "x", `${A}-t001`, "2099-ghost"),                                // cited session not loaded
  ],
};
const B = "2026-02-02-beta";
const beta: SessionSnapshot = {
  sessionId: B, turnsSha256: "sha-b",
  turns: [turn(B, 1, "one"), turn(B, 3, "three")],                // t002 absent but in range
  claims: [claim(B, 1, "gap", `${B}-t002`)],
};

test("every unresolved citation gets exactly one reason; resolvable citations are not reported", () => {
  const f = reconcileCitations([alpha, beta]);
  const by = Object.fromEntries(f.map(x => [x.claimId, x.reason]));
  assert.deepEqual(by, {
    [`${A}-c2`]: "turn-off-range", [`${A}-c3`]: "id-format", [`${A}-c4`]: "session-prefix-mismatch",
    [`${A}-c5`]: "session-missing", [`${B}-c1`]: "turn-gap-in-range",
  });
  assert.equal(f.some(x => x.claimId === `${A}-c1`), false, "the resolvable claim must not appear");
  const off = f.find(x => x.claimId === `${A}-c2`)!;
  assert.deepEqual(off.detail, {citedIndex: 40, sessionTurnCount: 3, maxTurnIndex: 3, overshoot: 37});
});

test("a reviewed mapping is the proposal only when it is for this citation and bound to the current turns", () => {
  const mapping = {claimId: `${A}-c2`, currentTurnsSha256: "sha-a", originalEvidence: [{turnId: `${A}-t040`}],
    proposedEvidence: [{turnId: `${A}-t002`, reviewRole: "assertion support"}]};
  const ok = reconcileCitations([alpha], [mapping]).find(x => x.claimId === `${A}-c2`)!;
  assert.equal(ok.proposal.basis, "independently-reviewed-mapping");
  assert.deepEqual(ok.proposal.turnIds, [`${A}-t002`]);
  // Stale mapping (turns changed since review): must NOT be offered as the proposal.
  const stale = reconcileCitations([alpha], [{...mapping, currentTurnsSha256: "other"}]).find(x => x.claimId === `${A}-c2`)!;
  assert.notEqual(stale.proposal.basis, "independently-reviewed-mapping");
  assert.equal(stale.reviewedMapping.boundToCurrentTurns, false);
  // Mapping that was written for a different original citation: not applicable.
  const wrong = reconcileCitations([alpha], [{...mapping, originalEvidence: [{turnId: `${A}-t099`}]}]).find(x => x.claimId === `${A}-c2`)!;
  assert.notEqual(wrong.proposal.basis, "independently-reviewed-mapping");
});

test("lexical hint: unambiguous only with majority coverage and a lead; weak or tied claims give none/ambiguous", () => {
  const f = reconcileCitations([alpha]).find(x => x.claimId === `${A}-c2`)!;
  assert.equal(f.lexicalHint.status, "unambiguous");
  assert.equal(f.proposal.basis, "lexical-hint-unreviewed");
  assert.deepEqual(f.proposal.turnIds, [`${A}-t002`]);
  assert.match(f.proposal.note, /NOT reviewed, NOT gold/);
  assert.equal(lexicalHint("too short", alpha.turns).status, "none");
  const twins = [turn(A, 1, "scholarship tuition airfare stipend graduate abroad"), turn(A, 2, "scholarship tuition airfare stipend graduate abroad")];
  assert.equal(lexicalHint("scholarship tuition airfare stipend graduate abroad", twins).status, "ambiguous", "tied candidates are not unambiguous");
});

test("invalid times report the offending values and the specific problem", () => {
  const S = "s";
  const bad: SessionSnapshot = {sessionId: S, turns: [turn(S, 1, "ok"), turn(S, 2, "rev", 2008, 213), turn(S, 3, "neg", -1, 4),
    {...turn(S, 4, "nan"), tEnd: "9"}, {...turn(S, 5, "nostart"), tStart: Number.NaN}]};
  const t = findInvalidTurnTimes([bad, alpha]);
  assert.deepEqual(t.map(x => [x.turnId, x.problem]), [[`${S}-t002`, "end-before-start"], [`${S}-t003`, "negative-start"],
    [`${S}-t004`, "end-not-finite-number"], [`${S}-t005`, "start-not-finite-number"]]);
  assert.deepEqual([t[0]!.tStart, t[0]!.tEnd], [2008, 213]);
  assert.equal(t.some(x => x.sessionId === A), false, "valid sessions are not flagged");
});

test("missing artifacts: expected path, directory state, what is present instead", () => {
  const present = new Set(["/m/ok/turns.json", "/m/ok/claims.json", "/m/half/source.json"]);
  const r = findMissingArtifacts([
    {id: "ok", artifacts: {turns: "ok/turns.json", persisted: "ok/claims.json"}},
    {id: "gone", artifacts: {turns: "gone/turns.json", persisted: "gone/claims.json"}},
    {id: "half", artifacts: {turns: "half/turns.json"}},
  ], {exists: p => present.has(p), entries: d => (d === "/m/half" ? ["source.json"] : null)},
  rel => `/m/${rel}`, p => p.slice(0, p.lastIndexOf("/")));
  assert.deepEqual(r.map(x => [x.id, x.interpretation]), [["gone", "directory-absent"], ["half", "directory-present-artifact-absent"]]);
  assert.deepEqual(r[0]!.artifacts.map(a => [a.kind, a.expectedPath, a.exists]), [["persisted", "gone/claims.json", false], ["turns", "gone/turns.json", false]]);
  assert.deepEqual(r[1]!.directoryEntries, ["source.json"]);
});

test("provenance: originals are those whose source path names a raw transcript; the rest are additions", () => {
  const mk = (id: string, path: string, kind = "document"): SessionSnapshot =>
    ({sessionId: id, turns: [], session: {date: "2026-01-01", title: id}, source: {path, kind, createdAt: "2026-09-25"}});
  const p = reconcileProvenance([mk("a", "raw/TOC/Transcripts/A.content.md"), mk("b", "raw/TOC/Transcripts/B.content.md"),
    mk("new", "raw/TOC/Recordings/new.mp4", "recording")], ["A.content.md", "B.content.md", "Orphan.content.md"]);
  assert.equal(p.originals, 2);
  assert.deepEqual(p.additions.map(a => a.sessionId), ["new"]);
  assert.deepEqual(p.rawTranscriptsWithoutSession, ["Orphan.content.md"]);
});

test("report: baseline cross-check detects a mismatch; markdown and JSON are deterministic", () => {
  const base = {sessions: [alpha, beta], missingArtifacts: [], rawTranscriptFiles: []};
  const all = reconcileCitations([alpha, beta]).map(c => ({sessionId: c.sessionId, claimId: c.claimId, turnId: c.citedTurnId}));
  assert.equal(buildReconciliationReport({...base, baselineUnresolved: all}).summary.citations.matchesCorpusBaseline, true);
  assert.equal(buildReconciliationReport({...base, baselineUnresolved: all.slice(1)}).summary.citations.matchesCorpusBaseline, false);
  const r1 = buildReconciliationReport(base), r2 = buildReconciliationReport(base);
  assert.equal(JSON.stringify(r1), JSON.stringify(r2));
  assert.equal(renderReconciliationMarkdown(r1), renderReconciliationMarkdown(r2));
  assert.equal(r1.summary.citations.unresolved, 5);
});

test("reconcile subcommand reads a temp corpus, writes both reports, and leaves the corpus bytes untouched", async () => {
  const dir = mkdtempSync(join(tmpdir(), "reconcile-"));
  try {
    const eval_ = join(dir, "data/eval"), mig = join(dir, "data/toc-migrated", A);
    mkdirSync(eval_, {recursive: true}); mkdirSync(mig, {recursive: true});
    writeFileSync(join(mig, "turns.json"), JSON.stringify(alpha.turns)); writeFileSync(join(mig, "claims.json"), JSON.stringify(alpha.claims));
    writeFileSync(join(mig, "session.json"), JSON.stringify({_id: A, date: "2026-01-01", title: "Alpha"}));
    writeFileSync(join(mig, "source.json"), JSON.stringify({kind: "document", path: "raw/x/Alpha.content.md"}));
    mkdirSync(join(dir, "raw/TOC/TOC-Materials/Transcripts"), {recursive: true});
    writeFileSync(join(dir, "raw/TOC/TOC-Materials/Transcripts/Alpha.content.md"), "x");
    writeFileSync(join(eval_, "extraction-corpus.json"), JSON.stringify({version: 1, inventoryDirectory: "../toc-migrated", cases: [
      {id: A, tenantId: "toc", sessionId: A, artifacts: {turns: `../toc-migrated/${A}/turns.json`, persisted: `../toc-migrated/${A}/claims.json`}},
      {id: "synthetic-x", tenantId: "toc", sessionId: "synthetic-x", artifacts: {turns: "../toc-migrated/synthetic-x/turns.json"}}]}));
    const before = readdirSync(mig).map(f => readFileSync(join(mig, f), "utf8"));
    const mod = await import(pathToFileURL(resolve(dirname(fileURLToPath(import.meta.url)), "../../../../scripts/eval-extraction.mjs")).href);
    const input = mod.loadReconcileInputs(join(eval_, "extraction-corpus.json"), dir);
    assert.equal(input.sessions.length, 1);
    assert.deepEqual(input.missingArtifacts.map((m: {id: string}) => m.id), ["synthetic-x"]);
    const report = buildReconciliationReport(input);
    assert.equal(report.summary.citations.unresolved, 4, "the four unresolved citations of the fixture session (c2..c5), none from c1");
    assert.equal(report.summary.provenance.originals, 1, "source path basename Alpha.content.md is in the raw transcript listing -> original");
    assert.deepEqual(readdirSync(mig).map(f => readFileSync(join(mig, f), "utf8")), before, "read-only: corpus bytes unchanged");
  } finally { rmSync(dir, {recursive: true, force: true}); }
});
