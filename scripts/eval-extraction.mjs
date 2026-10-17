#!/usr/bin/env node
/** Offline artifact replay. Usage: node scripts/eval-extraction.mjs --input corpus.json
 * Manifest v1: cases[{id,tenantId,sessionId,artifacts:{turns,persisted?,rawText?,parsed?,filtered?},
 * labels?,expectedFacts?,factLabels?,predictedEntities?,entityLabels?,mediaDuration?}], optional inventoryDirectory.
 * Artifact paths are relative to manifest; labels bind the case artifactHash in the report.
 * JSON only stdout. No provider, Mongo, dotenv, or quality thresholds. */
import { readFileSync, readdirSync, statSync, existsSync, writeFileSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { dirname, resolve, relative, isAbsolute, sep } from "node:path";
import { fileURLToPath } from "node:url";
import { createHash } from "node:crypto";
import { register } from "tsx/esm/api";
register();
const {evaluateExtractionCase, aggregateExtractionReports} = await import("../packages/index/src/eval/extraction.ts");
const {buildReconciliationReport, findMissingArtifacts, renderReconciliationMarkdown} = await import("../packages/index/src/eval/corpus-reconcile.ts");
const sha = bytes => createHash("sha256").update(bytes).digest("hex");
const obj = v => v && typeof v === "object" && !Array.isArray(v);
const validText = v => typeof v === "string" && v.length > 0 && v.length <= 512 && !/[\x00-\x1f]/.test(v);
/** Load bounded local bytes without exposing source content or provider diagnostics. */
export function loadManifest(path) {
  let totalBytes = 0;
  const read = file => {
    const size = statSync(file).size;
    if (size > 16 * 1024 * 1024 || (totalBytes += size) > 64 * 1024 * 1024) throw new Error("artifact-size-limit");
    return readFileSync(file);
  };
  const bytes = read(path), manifest = JSON.parse(bytes.toString("utf8")), root = dirname(resolve(path));
  if (!obj(manifest) || manifest.version !== 1 || !Array.isArray(manifest.cases) || manifest.cases.length === 0 || manifest.cases.length > 500) throw new Error("invalid-manifest");
  const reports = [], artifacts = [], failures = [], declared = new Set(), ids = new Set();
  for (const c of [...manifest.cases].sort((a, b) => String(a?.id).localeCompare(String(b?.id), "en"))) {
    if (!obj(c) || !validText(c.id) || ids.has(c.id)) throw new Error("invalid-or-duplicate-case"); ids.add(c.id);
    try {
      if (!obj(c.artifacts) || !validText(c.artifacts.turns)) throw new Error("missing-turn-artifact");
      declared.add(dirname(resolve(root, c.artifacts.turns)));
      const input = {id: c.id, tenantId: c.tenantId, sessionId: c.sessionId, turns: [], artifactHash: ""};
      const hashes = {}, paths = {};
      for (const [kind, p] of Object.entries(c.artifacts).sort(([a], [b]) => a.localeCompare(b, "en"))) {
        if (!["turns", "rawText", "parsed", "filtered", "persisted"].includes(kind) || !validText(p)) throw new Error("invalid-artifact-path");
        const target = resolve(root, p); if (kind === "turns") declared.add(dirname(target));
        const data = read(target); hashes[kind] = sha(data); paths[kind] = target;
        input[kind] = kind === "rawText" ? data.toString("utf8") : JSON.parse(data.toString("utf8"));
      }
      input.artifactHash = sha(JSON.stringify({version: 1, id: c.id, tenantId: c.tenantId, sessionId: c.sessionId, mediaDuration: c.mediaDuration, expectedFacts: c.expectedFacts, predictedEntities: c.predictedEntities, hashes}));
      for (const k of ["mediaDuration", "labels", "expectedFacts", "factLabels", "predictedEntities", "entityLabels"]) if (c[k] !== undefined) input[k] = c[k];
      reports.push(evaluateExtractionCase(input)); artifacts.push({id: c.id, artifactHash: input.artifactHash, hashes});
      declared.add(dirname(paths.turns));
    } catch (e) {
      const reason = e?.code === "ENOENT" ? "artifact-missing" : e instanceof SyntaxError ? "artifact-json-invalid" :
        String(e?.message).startsWith("Invalid human label") ? "human-label-invalid" :
        String(e?.message).startsWith("Invalid fact label") ? "fact-label-invalid" :
        ["artifact-size-limit", "missing-turn-artifact", "invalid-artifact-path"].includes(e?.message) ? e.message : "invalid-case-artifact";
      failures.push({id: c.id, reason});
    }
  }
  let inventory = {measured: false, directories: [], otherEntries: [], undeclared: [], outsideInventory: []};
  if (manifest.inventoryDirectory !== undefined) {
    if (!validText(manifest.inventoryDirectory)) throw new Error("invalid-inventory");
    const directory = resolve(root, manifest.inventoryDirectory), entries = readdirSync(directory, {withFileTypes: true});
    const directories = entries.filter(e => e.isDirectory()).map(e => e.name).sort();
    inventory = {measured: true, directories, otherEntries: entries.filter(e => !e.isDirectory()).map(e => e.name).sort(),
      undeclared: directories.filter(n => !declared.has(resolve(directory, n))),
      outsideInventory: [...declared].filter(p => {const r = relative(directory, p); return isAbsolute(r) || r.startsWith("..") || r.includes("/") || r.includes("\\");}).map(p => relative(directory, p)).sort()};
  }
  const summary = aggregateExtractionReports(reports);
  let baseline = {measured: false};
  if (manifest.baseline !== undefined) {
    const prior = manifest.baseline;
    if (!obj(prior) || !Array.isArray(prior.unresolvedReferences) || !obj(prior.inputHashes)) throw new Error("invalid-baseline");
    const current = reports.flatMap(r => r.stages.persisted.issues.filter(i => i.code === "missing-turn").map(i => ({sessionId: r.sessionId, claimId: i.claimId, turnId: i.turnId})));
    const key = v => JSON.stringify(v), priorKeys = new Set(prior.unresolvedReferences.map(key)), currentKeys = new Set(current.map(key));
    const hashDrift = Object.entries(prior.inputHashes).flatMap(([sessionId, h]) => {
      const a = artifacts.find(a => a.id === sessionId);
      return ["turns", "claims"].filter(k => !a || a.hashes[k === "claims" ? "persisted" : k] !== h[k + "Sha256"]).map(k => ({sessionId, artifact: k}));
    });
    baseline = {measured: true, expectedClaims: prior.claims ?? null, expectedEvidence: prior.evidence ?? null,
      actualClaims: summary.stages.persisted.rows, actualEvidence: summary.stages.persisted.invalidCitationRate.denominator,
      referenceIdentityMatches: priorKeys.size === currentKeys.size && [...priorKeys].every(k => currentKeys.has(k)),
      newlyMissing: current.filter(v => !priorKeys.has(key(v))), previouslyMissingNowResolved: prior.unresolvedReferences.filter(v => !currentKeys.has(key(v))), hashDrift};
  }
  return {version: 1, tool: "offline-extraction-measurement-v1", manifestSha256: sha(bytes),
    complete: failures.length === 0 && summary.incompleteCases.length === 0 && inventory.undeclared.length === 0 && inventory.outsideInventory.length === 0,
    declaredCases: manifest.cases.length, baseline, coverageNote: manifest.coverageNote ?? null, loadedCases: reports.length, artifactBytes: totalBytes, failures, inventory, artifacts, summary, cases: reports};
}
/** Read-only reconciliation. Usage: node scripts/eval-extraction.mjs reconcile --input corpus.json [--out-dir dir]
 * Reads corpus artefacts + raw/TOC transcript file names + git history (git log only, no shell); writes
 * corpus-reconciliation-report.{json,md} into --out-dir (default: the corpus directory). Modifies no corpus data. */
export function loadReconcileInputs(path, repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..")) {
  const bytes = readFileSync(path), manifest = JSON.parse(bytes.toString("utf8")), root = dirname(resolve(path));
  if (!obj(manifest) || manifest.version !== 1 || !Array.isArray(manifest.cases)) throw new Error("invalid-manifest");
  const tryJson = file => { try { return JSON.parse(readFileSync(file, "utf8")); } catch { return undefined; } };
  const firstCommit = dir => {
    const r = spawnSync("git", ["log", "--diff-filter=A", "--format=%h%x09%cI%x09%s", "--", relative(repoRoot, dir).split(sep).join("/")], {cwd: repoRoot, encoding: "utf8", timeout: 20000, shell: false});
    const line = r.status === 0 ? r.stdout.trim().split(/\r?\n/).filter(Boolean).pop() : undefined;
    if (!line) return null; const [hash, date, ...subject] = line.split(/\t/); return {hash, date, subject: subject.join(" ").slice(0, 160)};
  };
  const sessions = [];
  for (const c of [...manifest.cases].sort((a, b) => String(a?.id).localeCompare(String(b?.id), "en"))) {
    if (!obj(c) || !obj(c.artifacts) || !validText(c.artifacts.turns)) continue;
    const turnsFile = resolve(root, c.artifacts.turns), dir = dirname(turnsFile);
    if (!existsSync(turnsFile)) continue;
    const turnBytes = readFileSync(turnsFile), turns = JSON.parse(turnBytes.toString("utf8"));
    const claims = c.artifacts.persisted && existsSync(resolve(root, c.artifacts.persisted)) ? tryJson(resolve(root, c.artifacts.persisted)) : undefined;
    sessions.push({sessionId: c.sessionId ?? c.id, turns: Array.isArray(turns) ? turns : [], claims: Array.isArray(claims) ? claims : undefined, turnsSha256: sha(turnBytes),
      session: tryJson(resolve(dir, "session.json")), source: tryJson(resolve(dir, "source.json")), firstCommit: firstCommit(dir)});
  }
  const missing = findMissingArtifacts(manifest.cases.filter(obj).map(c => ({id: c.id, sessionId: c.sessionId, artifacts: obj(c.artifacts) ? c.artifacts : {}})),
    {exists: existsSync, entries: d => { try { return readdirSync(d); } catch { return null; } }}, rel => resolve(root, rel), dirname);
  const reviewedFile = tryJson(resolve(root, "extraction-reconciliation-reviewed.json"));
  const rawDir = resolve(repoRoot, "raw/TOC/TOC-Materials/Transcripts");
  const rawTranscriptFiles = existsSync(rawDir) ? readdirSync(rawDir).filter(f => f.endsWith(".content.md")).sort() : [];
  let undeclared = [];
  if (validText(manifest.inventoryDirectory ?? "")) {
    const inv = resolve(root, manifest.inventoryDirectory), declared = new Set(manifest.cases.filter(obj).map(c => dirname(resolve(root, c.artifacts?.turns ?? "x/x"))));
    undeclared = readdirSync(inv, {withFileTypes: true}).filter(e => e.isDirectory() && !declared.has(resolve(inv, e.name))).map(e => e.name).sort();
  }
  return {sessions, reviewed: Array.isArray(reviewedFile?.mappings) ? reviewedFile.mappings : [], baselineUnresolved: manifest.baseline?.unresolvedReferences,
    missingArtifacts: missing, rawTranscriptFiles, undeclaredDirectories: undeclared};
}
export function reconcileMain(args) {
  const dirFlag = args.indexOf("--out-dir");
  if (args[0] !== "reconcile" || args[1] !== "--input" || !validText(args[2]) || !(args.length === 3 || (args.length === 5 && dirFlag === 3 && validText(args[4])))) {
    console.log(JSON.stringify({version: 1, failure: "usage: reconcile --input local-manifest.json [--out-dir dir]"})); return 2;
  }
  try {
    const input = resolve(args[2]), out = resolve(args.length === 5 ? args[4] : dirname(input));
    const report = buildReconciliationReport(loadReconcileInputs(input));
    writeFileSync(resolve(out, "corpus-reconciliation-report.json"), JSON.stringify(report, null, 2) + String.fromCharCode(10));
    writeFileSync(resolve(out, "corpus-reconciliation-report.md"), renderReconciliationMarkdown(report));
    console.log(JSON.stringify(report.summary, null, 2)); return 0;
  } catch (e) { console.log(JSON.stringify({version: 1, failure: "reconcile-failed", reason: String(e?.message).slice(0, 200)})); return 2; }
}
export function main(args = process.argv.slice(2)) {
  if (args[0] === "reconcile") return reconcileMain(args);
  if (args.length !== 2 || args[0] !== "--input" || !validText(args[1])) {
    console.log(JSON.stringify({version: 1, complete: false, failure: "usage: --input local-manifest.json"})); return 2;
  }
  try {const report = loadManifest(resolve(args[1])); console.log(JSON.stringify(report, null, 2)); return report.complete ? 0 : 2;}
  catch {console.log(JSON.stringify({version: 1, complete: false, failure: "manifest-acquisition-invalid"})); return 2;}
}
if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) process.exitCode = main();
