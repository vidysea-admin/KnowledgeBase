#!/usr/bin/env node
/** Offline artifact replay. Usage: node scripts/eval-extraction.mjs --input corpus.json
 * Manifest v1: cases[{id,tenantId,sessionId,artifacts:{turns,persisted?,rawText?,parsed?,filtered?},
 * labels?,expectedFacts?,factLabels?,predictedEntities?,entityLabels?,mediaDuration?}], optional inventoryDirectory.
 * Artifact paths are relative to manifest; labels bind the case artifactHash in the report.
 * JSON only stdout. No provider, Mongo, dotenv, or quality thresholds. */
import { readFileSync, readdirSync, statSync } from "node:fs";
import { dirname, resolve, relative, isAbsolute } from "node:path";
import { fileURLToPath } from "node:url";
import { createHash } from "node:crypto";
import { register } from "tsx/esm/api";
register();
const {evaluateExtractionCase, aggregateExtractionReports} = await import("../packages/index/src/eval/extraction.ts");
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
export function main(args = process.argv.slice(2)) {
  if (args.length !== 2 || args[0] !== "--input" || !validText(args[1])) {
    console.log(JSON.stringify({version: 1, complete: false, failure: "usage: --input local-manifest.json"})); return 2;
  }
  try {const report = loadManifest(resolve(args[1])); console.log(JSON.stringify(report, null, 2)); return report.complete ? 0 : 2;}
  catch {console.log(JSON.stringify({version: 1, complete: false, failure: "manifest-acquisition-invalid"})); return 2;}
}
if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) process.exitCode = main();
