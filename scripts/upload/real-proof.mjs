#!/usr/bin/env node
/** Explicitly invoked paid proof: one generate attempt, isolated queue, no knowledge writes. */
import 'dotenv/config';
import { randomUUID } from 'node:crypto';
import { mkdir, writeFile, readFile, access } from 'node:fs/promises';
import { dirname, join, resolve, basename } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawn } from 'node:child_process';
import { submitRecording } from './submit.mjs';
import { connectQueue } from './queue.mjs';
import { hash, tenantSegment } from './security.mjs';

const ROOT = fileURLToPath(new URL('../../', import.meta.url));
const input = resolve(process.argv[2] ?? '');
if (!process.argv[2] || !process.env.GEMINI_API_KEY) throw new Error('authorized real media and configured worker key required');
const id = randomUUID().replaceAll('-', ''), runRoot = join(ROOT, '.cache', 'upload-real-proof', id);
const spool = join(runRoot, 'spool'), output = join(runRoot, 'output');
await mkdir(spool, { recursive: true }); await mkdir(output);
const env = { ...process.env, UPLOAD_INPUT_ROOT: dirname(input), UPLOAD_OUTPUT_ROOT: output, UPLOAD_SPOOL_ROOT: spool,
  UPLOAD_QUEUE_DB: `upload_queue_${id}`, UPLOAD_TENANT_ID: `proof-${id}`, UPLOAD_ACTOR: 'operator:Umesh',
  UPLOAD_MAX_ATTEMPTS: '1', UPLOAD_TIMEOUT_MS: '120000', GEMINI_STT_MODEL: '' };
const sessionId = `short-proof-${id}`;
const started = Date.now();
const controller = new AbortController(), timer = setTimeout(() => controller.abort(), 150000);
const worker = spawn(join(ROOT, '.venv', 'Scripts', 'python.exe'), [join(ROOT, 'workers', 'transcribe', 'src', 'worker.py')],
  { env, windowsHide: true, stdio: ['ignore', 'pipe', 'pipe'] });
let counters = '', failure, result, queue;
worker.stdout.on('data', chunk => { if (counters.length < 4096) counters += chunk; });
worker.stderr.on('data', () => {});
try {
  try { result = await submitRecording(basename(input), sessionId, { env, signal: controller.signal }); }
  catch (error) { failure = error; }
  queue = await connectQueue(env);
  const rows = await queue.jobs.find(queue.scope({})).sort({ createdAt: 1 }).toArray();
  const generation = rows.find(row => row.request?.op === 'generate');
  const text = generation?.response?.body?.candidates?.[0]?.content?.parts?.map(part => part.text ?? '').join('') ?? '';
  if (text) await writeFile(join(runRoot, 'provider-transcript.txt'), text, { flag: 'wx', mode: 0o600 });
  const { parseDiarizedTranscript } = await import('../../packages/ai/src/stt/gemini-file-upload.ts');
  const duration = rows.find(row => row.kind === 'transcribe.pipeline')?.durationSec;
  const parsed = parseDiarizedTranscript(text, duration);
  let published = true;
  const turnsPath = join(output, tenantSegment(env.UPLOAD_TENANT_ID), sessionId, 'turns.json');
  await access(turnsPath).catch(() => { published = false; });
  const evidence = { runRoot, input, inputSha256: hash(await readFile(input)), database: env.UPLOAD_QUEUE_DB,
    durationSec: duration, elapsedMs: Date.now() - started,
    model: 'gemini-3.5-flash (unchanged production default)', maxAttempts: 1,
    operations: rows.map(row => ({ kind: row.kind, operation: row.request?.op, status: row.status, attempts: row.attempts,
      responseStatus: row.response?.status, error: row.error,
      elapsedMs: row.updatedAt ? Date.parse(row.updatedAt) - Date.parse(row.createdAt) : undefined })),
    workerCounters: counters.trim().split(/\r?\n/).filter(Boolean), transcriptBytes: Buffer.byteLength(text), parsedTurnCount: parsed.length,
    firstInterval: parsed[0] ? [parsed[0].tStart, parsed[0].tEnd] : null,
    lastInterval: parsed.length ? [parsed.at(-1).tStart, parsed.at(-1).tEnd] : null,
    usage: generation?.response?.body?.usageMetadata ?? null, published,
    outcome: result ? 'complete' : failure?.message === 'invalid transcript turn or timestamp outside recording' ? 'timing-validator-rejected' : 'submission-failed' };
  await writeFile(join(runRoot, 'evidence.json'), `${JSON.stringify(evidence, null, 2)}\n`, { flag: 'wx' });
  console.log(JSON.stringify(evidence));
  // Evidence of rejection is successful execution of this proof, not full unit acceptance.
  process.exitCode = generation?.status === 'done' && generation.response?.status === 200 ? 0 : 1;
} finally {
  clearTimeout(timer);
  if (worker.exitCode === null) { const ended = new Promise(r => worker.once('exit', r)); worker.kill(); await ended; }
  await queue?.close();
}
