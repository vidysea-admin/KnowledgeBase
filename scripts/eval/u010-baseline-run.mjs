#!/usr/bin/env node
/** Full-population resumable runner. No keys, DB, routing defaults or historical files are written. */
import { readFileSync, existsSync } from 'node:fs';
import { dirname, basename, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { freezeCorpus, verifySourceBindings, verifyLoadedImplementation, hash, requireValue } from './u010-corpus.mjs';
import { acquireCheckpoint, loadSnapshot, saveSnapshot, saveReport } from './u010-state.mjs';
import { auditRun, validateRun } from './u010-baseline-audit.mjs';
import { productionScorer, boundedHttp, providerConfiguration } from './u010-provider.mjs';
const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
export class Stop extends Error { constructor(reason) { super(reason); this.reason = reason; } }
const positiveInteger = (n) => Number.isSafeInteger(n) && n > 0;

export function validateLimits(limits) {
  for (const field of ['maxCalls', 'maxSeconds', 'callTimeoutMs']) requireValue(positiveInteger(limits[field]), `positive integer ${field} required`);
  requireValue(limits.maxSeconds <= 86400 && limits.callTimeoutMs <= 300000, 'time bounds exceed one day / five minutes');
}

export function validatePredecessors(corpus, configuration, paths) {
  const required = configuration.provider === 'gemini' ? ['glm-5.3-flash', 'deepseek-v4.1-flash']
    : configuration.model === 'deepseek-v4.1-flash' ? ['glm-5.3-flash'] : [];
  const reports = paths.map((path) => {
    const bytes = readFileSync(path);
    const report = auditRun(loadSnapshot(dirname(path), basename(path)));
    requireValue(report.configuration.provider === 'ollama' && report.configuration.kind === configuration.kind && report.execution === configuration.execution
      && report.corpusSha256 === corpus.sha256 && report.fullPopulationScored && !report.sourceDriftDetected, 'incomplete/foreign/drifted predecessor');
    return { path, bytes: bytes.length, sha256: hash(bytes), model: report.configuration.model };
  });
  requireValue(required.every((model) => reports.some((r) => r.model === model)), 'D-164 predecessor evidence required (Ollama first, Gemini last)');
  return reports;
}

export async function runBounded({ corpus, configuration, limits, directory, resume = false, predecessors = [], scorerFactory = productionScorer,
  http = boundedHttp, env = process.env, signal = new AbortController().signal, now = () => Date.now(), computeMAE, inputRoot = ROOT }) {
  validateLimits(limits);
  requireValue(JSON.stringify(configuration) === JSON.stringify(providerConfiguration(configuration.provider, configuration.model, configuration.kind, configuration.execution)), 'unknown provider configuration/host');
  requireValue(configuration.kind !== 'calibration' || corpus.references?.pairs.length === 30, 'pending human references refuse before paid I/O');
  requireValue(configuration.kind !== 'calibration' || configuration.execution === 'synthetic-test' || corpus.humanVerification?.operatorBound === true
    && /^[a-f0-9]{64}$/.test(corpus.humanVerification.verifiedReceiptSha256) && corpus.humanProofInputs?.reviewExport
    && corpus.humanProofInputs.humanConfirmations && corpus.humanProofInputs.verifiedReceipt, 'independent operator-bound human proof required before paid I/O');
  requireValue(configuration.kind !== 'calibration' || typeof computeMAE === 'function', 'real computeMAE consumer required before paid I/O');
  requireValue(configuration.execution === 'synthetic-test' || scorerFactory === productionScorer && http === boundedHttp, 'injected scoring is synthetic test evidence only');
  const binding = hash(JSON.stringify({ corpus: corpus.sha256, configuration }));
  validateRun({ format: 'u010-run-v1', sequence: 0, binding, corpus, configuration, sourceDriftDetected: false, cells: [], attempts: [], invocations: [] }, corpus, configuration);
  requireValue(configuration.execution === 'synthetic-test' || inputRoot === ROOT, 'real paid input root must be the actual repository');
  const currentInputsMatch = async () => {
    if (!verifySourceBindings(inputRoot, corpus.sources)) return false;
    if (configuration.execution === 'synthetic-test') return true;
    if (!verifyLoadedImplementation()) return false;
    // Rebuild from actual files at the exported paid boundary. Typed hashes/flags cannot
    // authorize human labels or a fabricated real corpus; operator trust is process-owned.
    try {
      const current = await freezeCorpus(ROOT, corpus.tenantId, { ...corpus.humanProofInputs, trustedReceiptSha256: process.env.T022_VERIFIED_CONFIRMATIONS_SHA256 });
      return current.sha256 === corpus.sha256;
    } catch { return false; }
  };
  requireValue(await currentInputsMatch(), 'current corpus/source/operator evidence changed before paid I/O');
  const predecessorBindings = validatePredecessors(corpus, configuration, predecessors);
  const release = acquireCheckpoint(directory, resume);
  let state;
  try {
    state = resume ? validateRun(loadSnapshot(directory), corpus, configuration) : { format: 'u010-run-v1', sequence: -1, binding, corpus,
      configuration, sourceDriftDetected: false, cells: [], attempts: [], invocations: [], stopReason: 'not-started' };
    requireValue(!state.sourceDriftDetected, 'invalid source-drift checkpoint cannot reuse completed cells');
    const persist = () => { state.sequence++; return saveSnapshot(directory, state); };
    for (const attempt of state.attempts) if (attempt.status === 'inflight') attempt.status = 'unknown';
    requireValue(limits.maxCalls >= state.attempts.length, 'resume cap below already attempted calls');
    const startedAt = now(), deadline = startedAt + limits.maxSeconds * 1000;
    state.invocations.push({ startedAt: new Date(startedAt).toISOString(), limits, predecessorBindings, requiredFullCalls: configuration.kind === 'recall'
      ? corpus.questions.length * corpus.candidateIds.length : 30, resumed: resume });
    state.stopReason = 'running'; persist();
    let current;
    const check = () => {
      if (signal.aborted) throw new Stop('cancelled');
      if (now() >= deadline) throw new Stop('deadline');
      if (state.attempts.length >= limits.maxCalls) throw new Stop('call-cap');
    };
    const transport = async (req) => {
      check();
      const url = new URL(req.url), origin = url.origin;
      const expectedPath = configuration.provider === 'ollama' ? '/api/chat' : `/v1beta/models/${configuration.model}:generateContent`;
      requireValue(origin === configuration.origin && url.protocol === 'https:' && !url.username && !url.password
        && url.pathname === expectedPath && req.method === 'POST' && req.kind === 'http', 'foreign/credential-bearing/CLI endpoint refused');
      const attempt = { id: state.attempts.length + 1, itemId: current.itemId, sessionId: current.sessionId, status: 'inflight',
        startedAt: new Date(now()).toISOString(), endpointOrigin: origin, requestBodySha256: hash(JSON.stringify(req.body)),
        generationConfigurationSha256: hash(JSON.stringify(req.body?.options ?? req.body?.generationConfig ?? null)) };
      state.attempts.push(attempt); current.attemptIds.push(attempt.id); persist(); // reserve call before any external I/O
      const t0 = now();
      try {
        const timeout = AbortSignal.timeout(Math.max(1, Math.min(limits.callTimeoutMs, deadline - now())));
        const result = await http(req, AbortSignal.any([signal, timeout, ...(req.signal ? [req.signal] : [])]));
        attempt.status = result.status >= 200 && result.status < 300 ? 'returned' : 'failed';
        attempt.httpStatus = result.status; attempt.responseSha256 = hash(JSON.stringify(result.body ?? result.text ?? null));
        const usage = result.body?.usageMetadata;
        const inputTokens = result.body?.prompt_eval_count ?? usage?.promptTokenCount;
        const outputTokens = result.body?.eval_count ?? usage?.candidatesTokenCount;
        attempt.usageAvailable = Number.isSafeInteger(inputTokens) && inputTokens >= 0 && Number.isSafeInteger(outputTokens) && outputTokens >= 0;
        if (attempt.usageAvailable) { attempt.inputTokens = inputTokens; attempt.outputTokens = outputTokens; }
        attempt.costUsd = 0; // adapter-reported cost is unpriced; never invent prices
        return result;
      } catch {
        attempt.status = 'failed'; attempt.failureClass = signal.aborted ? 'cancelled' : now() >= deadline ? 'deadline' : 'transport-failure-or-timeout';
        throw new Error(attempt.failureClass); // sanitized; raw provider error never persisted
      } finally { attempt.elapsedMs = Math.max(0, now() - t0); persist(); }
    };
    const items = configuration.kind === 'recall' ? corpus.questions.flatMap((q) => corpus.nodes.map((candidate) => ({ itemId: q.id, query: q.query, ...candidate })))
      : corpus.references.pairs.map((p) => ({ itemId: p.id, query: p.query, sessionId: p.sessionId, node: p.node }));
    const completed = new Set(state.cells.map((cell) => `${cell.itemId}\0${cell.sessionId}`));
    try {
      if (!await currentInputsMatch()) throw new Stop('source-drift');
      state.invocations.at(-1).sourceCheckedBeforeImportAt = new Date(now()).toISOString();
      const score = await scorerFactory(configuration, transport, env);
      if (!await currentInputsMatch()) throw new Stop('source-drift');
      state.invocations.at(-1).sourceCheckedAfterImportAt = new Date(now()).toISOString();
      for (const item of items) {
        if (completed.has(`${item.itemId}\0${item.sessionId}`)) continue;
        check(); current = { ...item, attemptIds: [] };
        const result = await score(item.query, item.node);
        requireValue(current.attemptIds.length > 0, 'scorer produced no actual provider receipt');
        requireValue(typeof result.score === 'number' && Number.isFinite(result.score) && result.score >= 0 && result.score <= 1 && typeof result.fallback === 'boolean', 'invalid scorer output');
        state.cells.push({ itemId: item.itemId, sessionId: item.sessionId, score: result.score, fallback: result.fallback,
          reasonClass: result.reasonClass, reasonSha256: result.reasonSha256, attemptIds: current.attemptIds });
        persist();
      }
      state.stopReason = signal.aborted ? 'cancelled' : now() >= deadline ? 'deadline' : 'completed';
    } catch (error) {
      state.stopReason = error instanceof Stop ? error.reason : 'scorer-or-checkpoint-failure';
    }
    try {
      if (!await currentInputsMatch()) state.stopReason = 'source-drift';
      else state.invocations.at(-1).sourceCheckedAtCompletion = new Date(now()).toISOString();
    } catch { state.stopReason = 'source-drift'; }
    state.sourceDriftDetected = state.stopReason === 'source-drift';
    state.invocations.at(-1).endedAt = new Date(now()).toISOString();
    state.invocations.at(-1).stopReason = state.stopReason;
    const snapshot = persist(), report = auditRun(state);
    if (configuration.kind === 'calibration') {
      requireValue(typeof computeMAE === 'function', 'real computeMAE consumer required');
      const pairs = corpus.references.pairs.filter((p) => report.scoredIds.includes(p.id));
      if (pairs.length) {
        const byId = new Map(report.rows.map((row) => [row.id, row.predicted]));
        // Interface supplies the exact approved pair input; IDs avoid merging duplicate query strings.
        let index = 0;
        const result = await computeMAE(pairs, () => byId.get(pairs[index++].id));
        requireValue(result.n === report.mixed.n && Math.abs(result.mae - report.mixed.mae) < 1e-12, 'computeMAE/audit disagreement');
        report.computeMAE = { n: result.n, mae: result.mae, consumer: 'packages/ask/src/eval/calibration.ts' };
      }
    }
    const output = saveReport(directory, report, state.sequence);
    return { snapshot, output, report };
  } finally { release(); }
}

function cliOptions(argv) {
  const names = ['--tenant', '--provider', '--model', '--kind', '--max-calls', '--max-seconds', '--call-timeout-ms', '--checkpoint', '--review-export', '--human-confirmations', '--verified-receipt', '--predecessor'];
  const options = { predecessors: [], resume: false };
  for (let i = 0; i < argv.length; i++) {
    const name = argv[i];
    if (name === '--resume') { requireValue(!options.resume, 'duplicate resume'); options.resume = true; continue; }
    requireValue(names.includes(name) && argv[i + 1] && !argv[i + 1].startsWith('--'), 'unknown/missing option');
    if (name === '--predecessor') options.predecessors.push(resolve(argv[++i]));
    else { requireValue(!(name in options), 'duplicate option'); options[name] = argv[++i]; }
  }
  return options;
}

export async function main(argv) {
  const o = cliOptions(argv), configuration = providerConfiguration(o['--provider'], o['--model'], o['--kind']);
  const limits = { maxCalls: Number(o['--max-calls']), maxSeconds: Number(o['--max-seconds']), callTimeoutMs: Number(o['--call-timeout-ms']) };
  validateLimits(limits);
  requireValue(o['--checkpoint'], 'explicit NEW checkpoint directory required');
  const directory = resolve(o['--checkpoint']);
  requireValue(!existsSync(directory) || o.resume, 'existing checkpoint requires explicit resume');
  const corpus = await freezeCorpus(ROOT, o['--tenant'], { reviewExport: o['--review-export'], humanConfirmations: o['--human-confirmations'],
    verifiedReceipt: o['--verified-receipt'], trustedReceiptSha256: process.env.T022_VERIFIED_CONFIRMATIONS_SHA256 });
  requireValue(configuration.kind !== 'calibration' || corpus.references, 'review packet required; derived proxies cannot calibrate human agreement');
  // Load keys only after local input validation. Never echo dotenv contents or secret-bearing exceptions.
  await import('dotenv/config');
  requireValue(configuration.provider === 'ollama' ? process.env.OLLAMA_API_KEY?.trim() : process.env.GEMINI_API_KEY?.trim(), 'provider credential unavailable');
  const cancellation = new AbortController();
  const cancel = () => cancellation.abort(); process.once('SIGINT', cancel); process.once('SIGTERM', cancel);
  try {
    let computeMAE;
    if (configuration.kind === 'calibration') {
      const { register } = await import('tsx/esm/api'); register();
      ({ computeMAE } = await import('../../packages/ask/src/eval/calibration.ts'));
    }
    const result = await runBounded({ corpus, configuration, limits, directory, resume: o.resume, predecessors: o.predecessors, signal: cancellation.signal, computeMAE });
    console.log(`${configuration.kind}: ${result.report.scoredIds.length}/${result.report.available}; ${result.report.terminalStatus}; ${result.output}; whole task HOLD`);
  } finally { process.removeListener('SIGINT', cancel); process.removeListener('SIGTERM', cancel); }
}
if (process.argv[1] && pathToFileURL(resolve(process.argv[1])).href === import.meta.url)
  main(process.argv.slice(2)).catch(() => { console.error('U0.10 refused: invalid inputs/approval/configuration/checkpoint or provider prerequisites; no secret-bearing errors logged'); process.exitCode = 2; });
