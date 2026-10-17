#!/usr/bin/env node
/** T022: authoritative review export + genuine owner confirmation receipts -> bounded current judge.
 * Never manufactures approvals, tunes production, rewrites proxy reports, or calls a provider before gates.
 */
import { createHash, randomUUID } from "node:crypto";
import { readFileSync, writeFileSync, mkdirSync, existsSync, readdirSync, realpathSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { createRequire } from "node:module";
import { fileURLToPath, pathToFileURL } from "node:url";
import { exportCalibrationReferences } from "./calibration-review.mjs";
const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
const hash = v => createHash("sha256").update(typeof v === "string" ? v : JSON.stringify(v)).digest("hex");
const requireValue = (ok, message) => { if (!ok) throw new Error(message); };
const implementationPaths = ["scripts/eval/human-calibration.mjs", "scripts/eval/calibration-review.mjs", "scripts/eval/llm-eval.mjs", "apps/api/src/score.ts", "packages/ask/src/eval/calibration.ts"];
const resolutionPaths = ["package.json", "pnpm-lock.yaml", "pnpm-workspace.yaml", "tsconfig.base.json",
  "apps/api/package.json", "apps/api/tsconfig.json", "packages/ai/package.json", "packages/ai/tsconfig.json"];
const byteBinding = (path, absolute) => {
  const bytes = readFileSync(absolute); return { path, bytes: bytes.length, sha256: createHash("sha256").update(bytes).digest("hex") };
};
function runtimeIdentity(root) {
  const require = createRequire(resolve(root, "apps/api/src/score.ts"));
  const aiEntry = realpathSync(require.resolve("@lkb/ai"));
  requireValue(aiEntry === realpathSync(resolve(root, "packages/ai/src/index.ts")), "unexpected evaluator AI package resolution");
  const tsxEntry = realpathSync(fileURLToPath(import.meta.resolve("tsx/esm/api")));
  return { executable: realpathSync(process.execPath), version: process.version, platform: process.platform, arch: process.arch,
    execArgvSha256: hash(process.execArgv), nodeOptionsSha256: hash(process.env.NODE_OPTIONS ?? ""),
    aiEntry, tsxEntry: byteBinding(tsxEntry, tsxEntry) };
}
/** Conservative local inventory includes the eagerly loaded AI barrel. External transitive bytes are not certified.
 * The identity injection is for isolated fixtures only; the CLI always measures its actual process/resolution. */
export function implementationBindings(root = ROOT, identity = runtimeIdentity(root)) {
  const aiPaths = [];
  const visit = path => {
    for (const entry of readdirSync(resolve(root, path), { withFileTypes: true }).sort((a, b) => a.name.localeCompare(b.name))) {
      const child = `${path}/${entry.name}`;
      requireValue(!entry.isSymbolicLink(), "unresolved AI source symlink");
      if (entry.isDirectory()) visit(child);
      else if (entry.isFile() && entry.name.endsWith(".ts") && !entry.name.endsWith(".test.ts")) {
        // This package currently has no runtime dynamic imports. New ones require an explicit resolution policy.
        requireValue(!/\b(?:import|require)\s*\(/.test(readFileSync(resolve(root, child), "utf8")), "unresolved dynamic AI dependency");
        aiPaths.push(child);
      }
    }
  };
  visit("packages/ai/src");
  requireValue(aiPaths.includes("packages/ai/src/index.ts"), "missing evaluator AI entry");
  return { format: "t022-executed-local-provenance-v1", runtime: identity,
    files: [...new Set([...implementationPaths, ...resolutionPaths, ...aiPaths])].sort().map(path => byteBinding(path, resolve(root, path))),
    limitation: "Conservative local source inventory and actual resolver/runtime entry; lock-bound external transitive bytes are not independently certified." };
}
const bindingsAtModuleLoad = implementationBindings(ROOT);

/** Cap physical HTTP attempts too, including adapter retries; redirects cannot forward keys/private prompts. */
export function createHumanCalibrationTransport(provider, baseUrl, maxCalls, fetchImpl = fetch) {
  const origin = new URL(provider === "ollama" ? baseUrl : "https://generativelanguage.googleapis.com").origin;
  const allowed = provider === "ollama" ? ["https://ollama.com", "http://localhost:11434"] : ["https://generativelanguage.googleapis.com"];
  requireValue(allowed.includes(origin) && Number.isInteger(maxCalls) && maxCalls > 0 && maxCalls <= 30, "unapproved physical transport configuration");
  const stats = { requests: 0, failed: 0, httpErrors: 0, maxCalls, requestTimeoutMs: 30000, runTimeoutMs: maxCalls * 30000 };
  const deadline = Date.now() + stats.runTimeoutMs;
  const transport = async req => {
    const url = new URL(req.url);
    requireValue(req.kind === "http" && url.origin === origin && !url.username && !url.password, "unapproved provider request target");
    requireValue(stats.requests < maxCalls && Date.now() < deadline, "physical transport call/deadline cap reached");
    stats.requests++;
    const abort = new AbortController(), relay = () => abort.abort();
    req.signal?.addEventListener("abort", relay, { once: true }); if (req.signal?.aborted) relay();
    const timer = setTimeout(() => abort.abort(), Math.min(30000, Math.max(1, deadline - Date.now())));
    try {
      const result = await fetchImpl(url.toString(), { method: req.method ?? "GET", headers: req.headers,
        ...(req.body === undefined ? {} : { body: JSON.stringify(req.body) }), redirect: "error", signal: abort.signal });
      if (result.status < 200 || result.status >= 300) stats.httpErrors++;
      const text = await result.text(); let body; try { body = JSON.parse(text); } catch { body = text; }
      return { status: result.status, body, text };
    } catch (error) { stats.failed++; throw error; }
    finally { clearTimeout(timer); req.signal?.removeEventListener("abort", relay); }
  };
  return { transport, stats };
}

/** Receipts are owner evidence references, not a software-created certification of human identity. */
export async function validateHumanCalibrationInputs(artifact, confirmations, root = ROOT, verification) {
  requireValue(artifact?.format === "calibration-reviewed-export-v1" && artifact.humanGoldVerified === false,
    "require authoritative stored-review export; proxy or fabricated humanGold refused");
  const neutral = { ...artifact.packet, items: artifact.packet.items.map(i => ({ ...i,
    humanReview: { score: null, rationale: null, approvedBy: null, approvedAt: null } })) };
  requireValue(artifact.packetSha256 === hash(neutral) && artifact.tenantId === neutral.tenantId,
    "export packet/tenant binding mismatch");
  const references = await exportCalibrationReferences(artifact.packet, root);
  requireValue(Array.isArray(artifact.audit), "authenticated review audit required");
  requireValue(confirmations?.format === "calibration-human-confirmations-v1" && confirmations.tenantId === artifact.tenantId
    && confirmations.packetSha256 === artifact.packetSha256 && Array.isArray(confirmations.items) && confirmations.items.length === 30,
    "30 genuine individually recorded Umesh confirmations required before live scoring");
  requireValue(new Set(confirmations.items.map(i => i.id)).size === 30, "duplicate human confirmation IDs");
  requireValue(artifact.audit.every(a => references.pairs.some(p => p.id === a.itemId)), "foreign audit item refused");
  for (const pair of references.pairs) {
    const audits = artifact.audit.filter(a => a.itemId === pair.id).sort((a, b) => a.revision - b.revision);
    requireValue(audits.length > 0, `authenticated audit missing: ${pair.id}`);
    for (let i = 0; i < audits.length; i++) {
      const a = audits[i];
      requireValue(a.revision === i + 1 && a.tenantId === artifact.tenantId && a.inputSha256 === pair.inputSha256
        && /^api-key-sha256:[a-f0-9]{64}$/.test(a.authenticatedActor)
        && a.identityBasis === "tenant-api-key; Umesh identity is asserted, not verified"
        && JSON.stringify(a.before) === JSON.stringify(i === 0 ? null : audits[i - 1].after), `audit provenance invalid: ${pair.id}`);
      requireValue(a.after?.approvedBy === "Umesh" && typeof a.after.score === "number" && Number.isFinite(a.after.score)
        && a.after.score >= 0 && a.after.score <= 1 && typeof a.after.rationale === "string" && a.after.rationale.trim()
        && a.at === a.after.approvedAt && typeof a.at === "string" && new Date(a.at).toISOString() === a.at,
        `audit judgment invalid: ${pair.id}`);
    }
    const last = audits.at(-1), confirmation = confirmations.items.find(i => i.id === pair.id);
    requireValue(JSON.stringify(last.after) === JSON.stringify(pair.review) && last.at === pair.review.approvedAt,
      `stored approval/audit mismatch: ${pair.id}`);
    requireValue(confirmation?.confirmedBy === "Umesh" && confirmation.inputSha256 === pair.inputSha256
      && confirmation.score === pair.referenceScore && confirmation.rationale === pair.review.rationale
      && confirmation.revision === last.revision && confirmation.authenticatedActor === last.authenticatedActor
      && typeof confirmation.evidenceReference === "string" && confirmation.evidenceReference.trim()
      && !/synthetic|test[_ -]?only|fixture/i.test(confirmation.evidenceReference)
      && typeof confirmation.confirmedAt === "string" && new Date(confirmation.confirmedAt).toISOString() === confirmation.confirmedAt,
      `genuine matching owner confirmation receipt required: ${pair.id}`);
  }
  // A tenant credential or typed JSON cannot certify a person's judgments. Only an operator-configured
  // digest of a separate independently checked receipt authorizes the live consumer. No receipt is created here.
  const receipt = verification?.receipt, trusted = verification?.trustedReceiptSha256;
  requireValue(typeof trusted === "string" && /^[a-f0-9]{64}$/.test(trusted) && receipt && hash(receipt) === trusted,
    "independently checked human-confirmation receipt is not configured or does not match");
  requireValue(receipt.format === "calibration-checked-human-confirmations-v1" && receipt.verdict === "human-labels-verified"
    && receipt.actualIndividualHumanReviews === 30 && receipt.testFixture !== true
    && receipt.exportSha256 === hash(artifact) && receipt.confirmationsSha256 === hash(confirmations)
    && receipt.packetSha256 === artifact.packetSha256 && receipt.tenantId === artifact.tenantId
    && typeof receipt.independentChecker === "string" && receipt.independentChecker.trim()
    && typeof receipt.evidenceReference === "string" && receipt.evidenceReference.trim()
    && !/synthetic|test[_ -]?only|fixture/i.test(receipt.evidenceReference)
    && typeof receipt.checkedAt === "string" && new Date(receipt.checkedAt).toISOString() === receipt.checkedAt,
    "current30 genuine human reviews lack an independent, operator-bound verification receipt");
  return { references, exportSha256: hash(artifact), confirmationsSha256: hash(confirmations),
    verifiedReceiptSha256: trusted,
    humanAttribution: "Owner confirmation receipts supplied; actual Umesh attribution must be independently verified, not inferred from typed fields." };
}

export async function evaluateHumanCalibration(inputs, runJudge) {
  const result = await runJudge(inputs.references.pairs);
  requireValue(Array.isArray(result.details) && result.details.every(d => {
    const pair = inputs.references.pairs.find(p => p.id === d.id);
    return pair && d.reference === pair.referenceScore && Number.isFinite(d.predicted)
      && d.predicted >= 0 && d.predicted <= 1 && Math.abs(d.absError - Math.abs(d.predicted - pair.referenceScore)) < 1e-12;
  }), "judge details do not match approved references");
  requireValue(new Set(result.details.map(d => d.id)).size === result.details.length && result.n === result.details.length
    && result.n + result.notScored === 30, "judge coverage/identity mismatch");
  const recomputed = result.n === 0 ? null : result.details.reduce((sum, d) => sum + d.absError, 0) / result.n;
  requireValue(recomputed === null ? result.mae === null : Number.isFinite(result.mae) && Math.abs(recomputed - result.mae) < 1e-12,
    "judge MAE arithmetic mismatch");
  const complete = result.n === 30 && result.notScored === 0 && result.fallbackIds.length === 0
    && result.details.length === 30 && result.details.every(d => Number.isFinite(d.predicted) && d.predicted >= 0 && d.predicted <= 1);
  return { kind: "human-reference-calibration", status: complete ? "complete-provider-evidence-awaiting-independent-check" : "partial-or-fallback-not-final-calibration",
    humanGoldVerified: false,
    humanAttribution: inputs.humanAttribution, exportSha256: inputs.exportSha256, confirmationsSha256: inputs.confirmationsSha256, verifiedReceiptSha256: inputs.verifiedReceiptSha256,
    referencePacketSha256: inputs.references.packetSha256, sources: inputs.references.sources,
    referenceCount: 30, pairsScored: result.n, pairsNotScored: result.notScored, fallbackIds: result.fallbackIds,
    mae: result.mae, details: result.details, thresholdChanged: false, routingChanged: false,
    remainingGate: "Independently verify genuine owner attribution, all30 source-bound scores, provider receipts and MAE; no invented acceptance threshold or automatic tuning." };
}

/** Re-read the actual bound corpus at the immediate live consumer, not just at intake. */
export async function assertHumanCalibrationSourcesCurrent(inputs, reviewedPacket, root = ROOT) {
  const current = await exportCalibrationReferences(reviewedPacket, root);
  requireValue(hash(current) === hash(inputs.references), "current human-reference corpus changed before or during calibration");
  return current.sources;
}

/** D164 sequence uses only complete current human-reference receipts, never legacy proxy/embedding reports. */
export function validateHumanProviderOrder(inputs, provider, model, previous = [], currentImplementation = implementationBindings()) {
  requireValue(provider !== "ollama" || ["glm-5.3-flash", "deepseek-v4.1-flash"].includes(model), "use D164-approved Ollama models");
  const required = provider === "gemini" ? ["glm-5.3-flash", "deepseek-v4.1-flash"]
    : model === "deepseek-v4.1-flash" ? ["glm-5.3-flash"] : [];
  requireValue(Array.isArray(previous), "predecessors must be separately retained report objects");
  return required.map(expectedModel => {
    const report = previous.find(r => r?.provider === "ollama" && r.model === expectedModel);
    requireValue(report?.kind === "human-reference-calibration" && report.status === "complete-provider-evidence-awaiting-independent-check"
      && report.exportSha256 === inputs.exportSha256 && report.confirmationsSha256 === inputs.confirmationsSha256
      && report.verifiedReceiptSha256 === inputs.verifiedReceiptSha256 && report.pairsScored === 30 && report.pairsNotScored === 0
      && report.sourceDriftDetected === false && Array.isArray(report.fallbackIds) && report.fallbackIds.length === 0
      && report.calls?.failed === 0 && report.calls.heuristicFallbacks === 0 && report.physicalTransport?.requests === 30
      && report.physicalTransport.failed === 0 && report.physicalTransport.httpErrors === 0,
      `complete current human-reference ${expectedModel} predecessor required`);
    requireValue(JSON.stringify(report.implementationBindings) === JSON.stringify(currentImplementation)
      && JSON.stringify(report.bindingsAfterExecution) === JSON.stringify(currentImplementation),
      `predecessor executed implementation mismatch: ${expectedModel}`);
    const pairs = inputs.references.pairs;
    requireValue(Array.isArray(report.details) && report.details.length === 30 && new Set(report.details.map(d => d.id)).size === 30
      && report.details.every(d => {
        const pair = pairs.find(p => p.id === d.id);
        return pair && d.reference === pair.referenceScore && Number.isFinite(d.predicted) && d.predicted >= 0 && d.predicted <= 1
          && Math.abs(d.absError - Math.abs(d.predicted - d.reference)) < 1e-12;
      }) && Math.abs(report.mae - report.details.reduce((sum, d) => sum + d.absError, 0) / 30) < 1e-12,
      `predecessor approved-reference/MAE mismatch: ${expectedModel}`);
    if (expectedModel === "deepseek-v4.1-flash") {
      const glm = previous.find(r => r?.provider === "ollama" && r.model === "glm-5.3-flash");
      requireValue(glm && report.predecessorBindings?.some(b => b.provider === "ollama" && b.model === "glm-5.3-flash" && b.reportSha256 === hash(glm)),
        "DeepSeek predecessor must itself bind the supplied current GLM run");
    }
    return { provider: "ollama", model: expectedModel, reportSha256: hash(report) };
  });
}

export async function runHumanCalibration(argv, root = ROOT) {
  const option = name => { const i = argv.indexOf(name); requireValue(i >= 0 && argv[i + 1] && !argv[i + 1].startsWith("--"), `missing ${name}`); return argv[i + 1]; };
  const exportPath = resolve(option("--review-export")), confirmationsPath = resolve(option("--human-confirmations")), out = resolve(option("--out"));
  requireValue(!existsSync(out), "output exists; never overwrite historical evidence");
  const receiptPath = resolve(option("--verified-receipt"));
  const artifact = JSON.parse(readFileSync(exportPath, "utf8"));
  const inputs = await validateHumanCalibrationInputs(artifact, JSON.parse(readFileSync(confirmationsPath, "utf8")), root,
    { receipt: JSON.parse(readFileSync(receiptPath, "utf8")), trustedReceiptSha256: process.env.T022_VERIFIED_CONFIRMATIONS_SHA256 });
  requireValue(argv.includes("--llm"), "--llm required; heuristic calibration is not final");
  const selectedProvider = argv.includes("--provider") ? option("--provider") : "ollama";
  requireValue(["ollama", "gemini"].includes(selectedProvider), "unapproved provider refused");
  const selectedBase = argv.includes("--base-url") ? option("--base-url") : "https://ollama.com";
  const permittedEndpoint = new URL(selectedProvider === "ollama" ? selectedBase : "https://generativelanguage.googleapis.com");
  const allowedOrigins = selectedProvider === "ollama" ? ["https://ollama.com", "http://localhost:11434"] : ["https://generativelanguage.googleapis.com"];
  requireValue(!permittedEndpoint.username && !permittedEndpoint.password && !permittedEndpoint.search && !permittedEndpoint.hash
    && allowedOrigins.includes(permittedEndpoint.origin)
    && permittedEndpoint.pathname === "/", "unapproved provider endpoint refused before credentials or private corpus transport");
  const bindingsBeforeExecution = implementationBindings(root);
  const predecessors = validateHumanProviderOrder(inputs, selectedProvider, option("--model"),
    argv.includes("--predecessors") ? JSON.parse(readFileSync(resolve(option("--predecessors")), "utf8")) : [], bindingsBeforeExecution);
  if (resolve(root) === ROOT) requireValue(JSON.stringify(bindingsAtModuleLoad) === JSON.stringify(bindingsBeforeExecution),
    "implementation changed after entry; refuse before provider imports or calls");
  // Provider modules and credentials are loaded ONLY after all current reviews/confirmations validate.
  const { parseLlmArgs, redactor, createEvalComplete, createLlmScoreFn, calibrateLlm, callSummary, CapReached } = await import("./llm-eval.mjs");
  await import("dotenv/config");
  const redact = redactor([process.env.OLLAMA_API_KEY, process.env.GEMINI_API_KEY]);
  try {
    const options = parseLlmArgs(argv, process.env); requireValue(!options.error, options.error);
    requireValue(Number.isInteger(options.maxCalls) && options.maxCalls > 0 && options.maxCalls <= 30 && options.limitQuestions === undefined,
      "use an integer --max-calls between1and30; no question limit for human calibration");
    const endpoint = new URL(options.provider === "ollama" ? options.baseUrl : "https://generativelanguage.googleapis.com");
    requireValue(!endpoint.username && !endpoint.password && !endpoint.search && !endpoint.hash, "effective provider endpoint must not contain credentials or query parameters");
    const { computeMAE } = await import("../../packages/ask/src/eval/calibration.ts");
    const physical = createHumanCalibrationTransport(options.provider, options.baseUrl, options.maxCalls);
    const { scoreFn, stats } = await createLlmScoreFn(await createEvalComplete(options, process.env, physical.transport), options);
    requireValue(JSON.stringify(bindingsBeforeExecution) === JSON.stringify(implementationBindings(root)),
      "implementation changed during provider setup; refuse before calls");
    await assertHumanCalibrationSourcesCurrent(inputs, artifact.packet, root);
    const boundedScore = (query, node) => {
      if (physical.stats.requests >= physical.stats.maxCalls) throw new CapReached("physical request cap reached");
      return scoreFn(query, node);
    };
    const report = await evaluateHumanCalibration(inputs, pairs => calibrateLlm(pairs, boundedScore, computeMAE));
    let bindingsAfterExecution; try { bindingsAfterExecution = implementationBindings(root); } catch { bindingsAfterExecution = null; }
    let corpusDriftDetected = false;
    try { await assertHumanCalibrationSourcesCurrent(inputs, artifact.packet, root); } catch { corpusDriftDetected = true; }
    const sourceDriftDetected = corpusDriftDetected || JSON.stringify(bindingsBeforeExecution) !== JSON.stringify(bindingsAfterExecution);
    if (sourceDriftDetected) report.status = "implementation-drift-not-final-calibration";
    Object.assign(report, { runId: randomUUID(), generatedAt: new Date().toISOString(), provider: options.provider, model: options.model,
      jobKind: "evaluator", scorer: "apps/api/src/score.ts:createLlmScorer", effectiveBaseUrl: endpoint.toString(),
      effectiveRouting: { chain: [{ provider: options.provider, model: options.model }], jobKind: "evaluator", productionRoutingChanged: false },
      predecessorBindings: predecessors,
      implementationBindings: bindingsBeforeExecution, bindingsAfterExecution, sourceDriftDetected, corpusDriftDetected,
      physicalTransport: physical.stats, calls: callSummary(stats, options) });
    mkdirSync(dirname(out), { recursive: true }); writeFileSync(out, `${redact(JSON.stringify(report, null, 2))}\n`, { flag: "wx" });
    console.log(`human calibration: ${report.pairsScored}/30, ${report.status}; wrote new output; T022 not automatically closed`);
    return report;
  } catch (error) { throw new Error(redact(error instanceof Error ? error.message : String(error))); }
}
if (process.argv[1] && pathToFileURL(resolve(process.argv[1])).href === import.meta.url)
  runHumanCalibration(process.argv.slice(2)).catch(() => { console.error("Human calibration refused; check current source-bound reviews, actual confirmation receipts, provider configuration and new output path. No whole-task completion claimed."); process.exitCode = 2; });
