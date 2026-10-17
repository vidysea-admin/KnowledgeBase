/** Two bounded production strict-claims calls; no database, fallback or semantic gold. */
import { readFileSync, writeFileSync, mkdirSync, realpathSync } from 'node:fs';
import { resolve, join, relative } from 'node:path';
import { createHash } from 'node:crypto';
import { parse } from 'dotenv';
import { GeminiProvider } from '../../../packages/ai/src/providers/gemini.ts';
import { extractClaims } from '../../../packages/index/src/pipeline/claims.ts';
import { runtimeEvidence, runtimeExtractive, runtimeEvidenceOrigin, runtimeWindows } from '../../../packages/index/src/pipeline/grounded.ts';
import { toEvidenceTuple } from '../../../apps/api/src/indexing/evidence-tuples.ts';
import { createRequire } from 'node:module';
import { assertDerivedArtifactsCurrent } from '../../../scripts/lib/transcript-provenance.mjs';

const ROOT = resolve(import.meta.dirname, '../../..');
const PACKET = 'C:/Users/product/Documents/Codex/2026-10-09/what-is-the-current-update-and/work/toc-recovery-v1';
const SESSION = '2026-08-27-in-focus-4';
const PACKET_HASH = '268c94cc13d3c70def84ea2f959b9e0da1a22774f8fd7d74b5653866ef976205';
const PACKET_ID = '477255b83bb0f001a7fce53d48af7631bdc8a92c2e24e85b3108a3c9ece749ef';
const REVIEW_HASH = '8aa7ce9c90ae2b83107fdf815e90491194ac4fea830ae79a4b957d52dc5ea0e5';
const sha = bytes => createHash('sha256').update(bytes).digest('hex');
const requireValue = (condition, code) => { if (!condition) throw new Error(code); };
const read = file => readFileSync(file);
const pinFile = join(ROOT, 'qa/evidence/goal-live-toc/strict-claims-pins.json');
const firstReceiptSHA256 = '548a0b1de6e380849028811658c42a127823741e981fdc40ea9e917d2e701d9d';
const verifyPins = () => {
  const pins = JSON.parse(read(pinFile));
  requireValue(Array.isArray(pins) && pins.length > 5, 'pin-inventory-missing');
  for (const row of pins) requireValue(sha(read(resolve(ROOT, row.path))) === row.sha256, 'source-pin-drift');
  return sha(read(pinFile));
};

function sourceSample() {
  const packetBytes = read(join(PACKET, 'packet.json'));
  requireValue(sha(packetBytes) === PACKET_HASH, 'approved-packet-changed');
  const manifest = JSON.parse(packetBytes);
  requireValue(manifest.packetId === PACKET_ID && manifest.tenantId === 'toc', 'approved-packet-identity');
  requireValue(sha(read(join(PACKET, 'original/reviewed.json'))) === REVIEW_HASH, 'approved-review-changed');
  const dir = join(PACKET, 'sessions', SESSION);
  const generation = assertDerivedArtifactsCurrent(dir);
  for (const name of ['source.json', 'session.json', 'turns.json', 'claims.json', 'session_page.json']) {
    const key = `sessions/${SESSION}/${name}`;
    requireValue(sha(read(join(dir, name))) === manifest.hashes[key], 'approved-selected-bytes-changed');
  }
  const { source, session, turns, page } = generation.documents;
  requireValue(source.tenantId === 'toc' && session.tenantId === 'toc' && session._id === SESSION
    && source.captureMode === 'provided' && source.consent?.given === true
    && source.recovery?.packetId === PACKET_ID, 'source-consent-or-identity');
  requireValue(source.path === 'raw/TOC/TOC-Materials/Transcripts/27th-August-In-Focus.content.md', 'foreign-original-source');
  requireValue(sha(read(join(ROOT, source.path))) === source.hash, 'original-content-changed');
  const parentKey = `original/${SESSION}/turns.json`;
  requireValue(sha(read(join(PACKET, parentKey))) === manifest.parentHashes[parentKey]
    && source.recovery.parentTurnsSha256 === manifest.parentHashes[parentKey], 'parent-turn-proof');
  const selected = [];
  for (const turn of turns.slice(0, 32)) {
    requireValue(turn.tenantId === 'toc' && turn.sessionId === SESSION && turn.recovery?.packetId === PACKET_ID
      && typeof turn.text === 'string' && turn.text.trim() && Number.isFinite(turn.tStart)
      && Number.isFinite(turn.tEnd) && turn.tStart >= 0 && turn.tEnd >= turn.tStart, 'invalid-source-turn');
    if (Buffer.byteLength(JSON.stringify([...selected, turn])) > 12000) break;
    selected.push(turn);
  }
  requireValue(selected.length >= 2, 'sample-empty');
  const firstReceiptBytes = read(join(ROOT, 'qa/evidence/goal-live-toc/one-call-receipt.json'));
  requireValue(sha(firstReceiptBytes) === firstReceiptSHA256, 'first-provider-proof-changed');
  const first = JSON.parse(firstReceiptBytes);
  requireValue(first.status === 'provider-parser-tree-consumed' && first.generationCalls === 1
    && first.sampleSHA256 === sha(JSON.stringify(selected)) && first.selectedTurnCount === selected.length,
    'not-the-same-approved-first-sample');
  requireValue(runtimeWindows(selected).length === 1, 'two-call-cap-requires-one-source-window');
  return { selected, session, page, proof: { firstReceiptSHA256, sessionId: SESSION, tenantId: 'toc', packetId: PACKET_ID,
    packetSHA256: PACKET_HASH, approvedReviewSHA256: REVIEW_HASH, sourceSHA256: source.hash,
    turnArtifactSHA256: manifest.hashes[`sessions/${SESSION}/turns.json`],
    sampleSHA256: sha(JSON.stringify(selected)), selectedTurnCount: selected.length,
    sampleBytes: Buffer.byteLength(JSON.stringify(selected)), semanticAcceptance: false } };
}

async function main() {
  requireValue(process.argv.length === 3 && ['--preflight', '--run'].includes(process.argv[2]), 'choose-preflight-or-run');
  const pinsSHA256 = verifyPins(), sample = sourceSample();
  if (process.argv[2] === '--preflight') {
    console.log(JSON.stringify({ status: 'ready-no-network', pinsSHA256, ...sample.proof,
      provider: 'gemini', modelPolicy: 'current production GeminiProvider default; no override or fallback',
      maxGenerationCalls: 2, callTimeoutMs: 45000, maxOutputTokensPerCall: 1500, maxTotalOutputTokens: 3000, databaseAccess: false }));
    return;
  }
  // This is the broker's child process. Never put credential bytes in arguments or receipts.
  if (!process.env.GEMINI_API_KEY?.trim()) {
    const configured = parse(read(join(ROOT, '.env'))).GEMINI_API_KEY;
    requireValue(typeof configured === 'string' && configured.trim(), 'gemini-credentials-unavailable');
    process.env.GEMINI_API_KEY = configured;
  }
  const credential = process.env.GEMINI_API_KEY;
  const startedAt = new Date().toISOString(), started = Date.now();
  const receipt = { status: 'not-started', startedAt, pinsSHA256, ...sample.proof,
    scope: 'strict production claim extraction + mandatory semantic judge + citation/schema draft validation; no persisted visibility or human gold',
    generationCalls: 0, maxGenerationCalls: 2, callTimeoutMs: 45000, maxOutputTokensPerCall: 1500, maxTotalOutputTokens: 3000,
    databaseAccess: false, provider: 'gemini' };
  const privateDir = join(ROOT, '.cache/provider-validation', startedAt.replaceAll(':', '-'));
  const cacheRelative = relative(realpathSync(ROOT), realpathSync(join(ROOT, '.cache')));
  requireValue(cacheRelative && !cacheRelative.startsWith('..') && !/^[A-Za-z]:|^[/\\]/.test(cacheRelative), 'private-cache-outside-root');
  mkdirSync(privateDir, { recursive: true });
  requireValue(relative(realpathSync(join(ROOT, '.cache')), realpathSync(privateDir)).split(/[\\/]/)[0] !== '..', 'private-output-outside-cache');
  writeFileSync(join(privateDir, 'input.json'), JSON.stringify({ proof: sample.proof, selectedTurns: sample.selected }, null, 2),
    { flag: 'wx', mode: 0o600 });
  const transport = async request => {
    requireValue(request.kind === 'http' && request.method === 'POST' && receipt.generationCalls < 2, 'generation-call-cap');
    receipt.generationCalls++;
    const url = new URL(request.url);
    requireValue(url.origin === 'https://generativelanguage.googleapis.com'
      && /^\/v1beta\/models\/gemini-[a-z0-9.-]+:generateContent$/.test(url.pathname)
      && url.searchParams.get('key') === credential, 'foreign-provider-request');
    receipt.requestedModel = url.pathname.split('/').at(-1).split(':')[0];
    const body = { ...request.body, generationConfig: { maxOutputTokens: 1500, thinkingConfig: { thinkingBudget: 0 } } };
    receipt.requestSHA256 = sha(JSON.stringify(body));
    const signal = AbortSignal.timeout(45000);
    try {
      const response = await fetch(url, { method: 'POST', headers: request.headers,
        body: JSON.stringify(body), signal, redirect: 'error' });
      receipt.httpStatus = response.status;
      const chunks = []; let size = 0;
      for await (const chunk of response.body ?? []) {
        size += chunk.length; requireValue(size <= 1048576, 'provider-response-byte-cap'); chunks.push(chunk);
      }
      const parsed = JSON.parse(Buffer.concat(chunks).toString('utf8'));
      if (!response.ok) {
        const code = parsed?.error?.status;
        receipt.providerErrorCode = ['NOT_FOUND', 'INVALID_ARGUMENT', 'RESOURCE_EXHAUSTED', 'PERMISSION_DENIED',
          'UNAUTHENTICATED', 'UNAVAILABLE', 'INTERNAL'].includes(code) ? code : 'unknown';
        receipt.configuredModelUnsupported = /not found|not supported|unsupported/i.test(String(parsed?.error?.message ?? ''));
        throw new Error('provider-http-refusal');
      }
      receipt.responseBytes = size;
      receipt.finishReason = ['STOP', 'MAX_TOKENS', 'SAFETY', 'RECITATION'].includes(parsed?.candidates?.[0]?.finishReason)
        ? parsed.candidates[0].finishReason : 'unknown';
      requireValue(receipt.finishReason === 'STOP', 'incomplete-provider-output');
      const tokens = parsed?.usageMetadata?.candidatesTokenCount;
      requireValue(Number.isSafeInteger(tokens) && tokens >= 0 && tokens <= 1500, 'output-token-proof-unavailable');
      receipt.outputTokens = tokens;
      receipt.reportedModel = /^gemini-[a-z0-9.-]+$/.test(parsed?.modelVersion ?? '') ? parsed.modelVersion : null;
      return { status: response.status, body: parsed };
    } catch {
      receipt.failure = signal.aborted ? 'provider-call-timeout' : receipt.httpStatus && receipt.httpStatus >= 400
        ? 'provider-http-refusal' : 'transport-or-output-validation-failed';
      throw new Error(receipt.failure);
    }
  };
  let completion;
  const phases = [], completions = [];
  try {
    const provider = new GeminiProvider(transport, { apiKey: credential });
    const result = await extractClaims(sample.selected, async job => {
      requireValue(job.kind === 'claims', 'foreign-production-stage');
      const payload = JSON.parse(job.messages.find(message => message.role === 'user').content);
      requireValue(payload.phase === (phases.length === 0 ? 'extract-claims' : 'judge'), 'foreign-or-repeated-production-phase');
      phases.push(payload.phase);
      completion = await provider.complete(job); completions.push(completion); return completion;
    }, { strictWebinar: true });
    requireValue(receipt.generationCalls === 2 && !result.degraded && completion
      && phases.join(',') === 'extract-claims,judge', 'strict-extraction-or-semantic-judge-refused');
    const requireFromApi = createRequire(join(ROOT, 'apps/api/package.json'));
    const { Ajv2020 } = requireFromApi('ajv/dist/2020.js');
    const validator = new Ajv2020({ strict: true, allErrors: true }).compile(JSON.parse(read(join(ROOT, 'schema/claims.schema.json'))));
    const draftClaims = result.claims.map((claim, index) => {
      const evidence = runtimeEvidence(claim.evidence, sample.selected);
      runtimeExtractive(claim.text, evidence);
      requireValue(runtimeEvidenceOrigin(evidence, sample.selected) === claim.origin && claim.verification === 'unverified', 'citation-origin-or-verification-refused');
      const doc = { _id: `local-strict-draft-${sample.proof.sampleSHA256.slice(0, 16)}-${index}`, tenantId: 'toc',
        text: claim.text, status: 'needs-review', evidence: toEvidenceTuple(evidence), origin: claim.origin, verification: 'unverified' };
      requireValue(validator(doc), 'canonical-claim-schema-refused'); return doc;
    });
    verifyPins(); sourceSample();
    const privateResult = JSON.stringify({ completions, strictResult: result, draftClaims }, null, 2);
    requireValue(!privateResult.includes(credential), 'credential-in-output-refused');
    writeFileSync(join(privateDir, 'result.json'), privateResult, { flag: 'wx', mode: 0o600 });
    Object.assign(receipt, { status: 'strict-extraction-citations-schema-validated', productionPhases: phases,
      strictClaimCount: draftClaims.length, citationCount: draftClaims.reduce((count, doc) => count + doc.evidence.length, 0),
      canonicalSchemaValid: true, freshDraftsPersisted: false, actualDownstreamVisibility: 'pending-real-staging-source-and-storage-proof',
      privateOutputSHA256: sha(privateResult), inputTokens: completions.reduce((count, result) => count + result.usage.inputTokens, 0),
      generatedOutputTokens: completions.reduce((count, result) => count + result.usage.outputTokens, 0),
      model: completion.model, semanticAcceptance: false });
  } catch {
    receipt.status = 'failed'; receipt.failure ??= 'source-parser-or-downstream-refusal'; process.exitCode = 1;
    const partial = JSON.stringify({ phases, completions }, null, 2);
    if (!partial.includes(credential)) {
      writeFileSync(join(privateDir, 'partial-result.json'), partial, { flag: 'wx', mode: 0o600 });
      receipt.privatePartialOutputSHA256 = sha(partial);
    }
  } finally {
    receipt.completedAt = new Date().toISOString(); receipt.elapsedMs = Date.now() - started;
    const output = JSON.stringify(receipt, null, 2);
    requireValue(!output.includes(credential), 'credential-in-receipt-refused');
    writeFileSync(join(ROOT, 'qa/evidence/goal-live-toc/strict-claims-receipt.json'), output, { flag: 'wx' });
    console.log(JSON.stringify(receipt));
  }
}
main().catch(() => { console.error('Live sample preflight refused; no raw diagnostic disclosed.'); process.exitCode = 1; });
