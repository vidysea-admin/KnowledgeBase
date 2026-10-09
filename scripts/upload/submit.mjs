#!/usr/bin/env node
/** Configured local file -> queued isolated Python STT -> validated immutable transcript. */
import 'dotenv/config';
import { register } from 'tsx/esm/api';
import { createHash, randomUUID } from 'node:crypto';
import { readFile, writeFile, rename, rm, lstat, mkdir } from 'node:fs/promises';
import { join, resolve, extname, isAbsolute } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { spawn } from 'node:child_process';
import { connectQueue, createQueueTransport } from './queue.mjs';
import { hash, confined, identity, ownedDirectory, pinnedBytes, tenantSegment, validateJob } from './security.mjs';
import { immutableTranscriptTurns, writeTranscriptGeneration } from '../lib/transcript-provenance.mjs';
import { validateTurns } from '../webinar/process-video.mjs';
import { loadWebinarSession } from '../webinar/session-rows.mjs';

const ROOT = fileURLToPath(new URL('../../', import.meta.url));
const MIME = { '.m4a': 'audio/mp4', '.mp4': 'video/mp4', '.mp3': 'audio/mpeg', '.wav': 'audio/wav', '.ogg': 'audio/ogg', '.opus': 'audio/ogg', '.webm': 'audio/webm' };
export function command(binary, args, { stdin, timeoutMs = 30000, env = process.env } = {}) {
  return new Promise((done, fail) => {
    const child = spawn(binary, args, { shell: false, windowsHide: true, env, stdio: ['pipe', 'pipe', 'pipe'] });
    let stdout = '', overflow = false;
    const timer = setTimeout(() => { child.kill(); fail(new Error('upload subprocess timeout')); }, timeoutMs);
    child.stdout.on('data', chunk => { stdout += chunk; if (stdout.length > 2 * 1024 * 1024) { overflow = true; child.kill(); } });
    child.stderr.on('data', () => {}); // Provider/key-bearing diagnostics must not enter a log.
    child.on('error', () => { clearTimeout(timer); fail(new Error('upload subprocess launch failed')); });
    child.on('close', code => { clearTimeout(timer); code === 0 && !overflow ? done(stdout) : fail(new Error('upload subprocess failed')); });
    child.stdin.end(stdin);
  });
}
export async function schemaValidate(documents, env = process.env) {
  const python = env.UPLOAD_PYTHON ?? join(ROOT, '.venv', 'Scripts', 'python.exe');
  await command(python, [join(ROOT, 'workers', 'transcribe', 'src', 'schema_check.py')], { stdin: JSON.stringify(documents), env });
}
export async function publishTranscript({ outputRoot, tenantId, sessionId, source, duration, turns, env = process.env }) {
  const rows = immutableTranscriptTurns(tenantId, sessionId, turns);
  validateTurns(rows, duration, { tenantId, sessionId });
  const parent = await ownedDirectory(outputRoot, tenantSegment(tenantId));
  const destination = join(parent, sessionId), pending = join(parent, `${sessionId}.${randomUUID()}.pending`);
  try {
    await lstat(destination);
    await confined(outputRoot, destination, { directory: true });
    const previous = loadWebinarSession(destination, sessionId);
    if (JSON.stringify(previous.rawTurns) !== JSON.stringify(rows) || previous.source.hash !== source.hash || previous.source.tenantId !== tenantId) throw new Error('existing transcript differs; replacement refused');
    return { path: join(destination, 'turns.json'), rows, reused: true };
  } catch (error) { if (error.code !== 'ENOENT') throw error; }
  await mkdir(pending);
  try {
    await confined(outputRoot, pending, { directory: true });
    const session = { _id: sessionId, tenantId, sourceId: source._id, title: source.title, date: source.createdAt.slice(0, 10),
      status: { transcribe: 'done', index: 'pending' } };
    await schemaValidate({ sources: [source], sessions: [session], turns: rows }, env);
    await writeFile(join(pending, 'source.json'), `${JSON.stringify(source, null, 2)}\n`, { flag: 'wx' });
    await writeFile(join(pending, 'session.json'), `${JSON.stringify(session, null, 2)}\n`, { flag: 'wx' });
    await writeFile(join(pending, 'validation.json'), `${JSON.stringify({ status: 'passed', transcriptValidated: true, durationSec: duration })}\n`, { flag: 'wx' });
    writeTranscriptGeneration(pending, tenantId, sessionId, turns);
    const consumed = loadWebinarSession(pending, sessionId);
    validateTurns(consumed.rawTurns, duration, { tenantId, sessionId });
    await confined(outputRoot, parent, { directory: true });
    try { await rename(pending, destination); }
    catch (error) {
      if (!['EEXIST', 'ENOTEMPTY', 'EPERM'].includes(error.code)) throw error;
      await confined(outputRoot, destination, { directory: true });
      const concurrent = loadWebinarSession(destination, sessionId);
      if (JSON.stringify(concurrent.rawTurns) !== JSON.stringify(rows) || concurrent.source.hash !== source.hash || concurrent.source.tenantId !== tenantId) throw error;
    }
    const committed = loadWebinarSession(destination, sessionId);
    validateTurns(committed.rawTurns, duration, { tenantId, sessionId });
    return { path: join(destination, 'turns.json'), rows, reused: false };
  } finally {
    try { await confined(outputRoot, pending, { directory: true }); await rm(pending, { recursive: true, force: true }); }
    catch (error) { if (error.code !== 'ENOENT') throw error; }
  }
}
export async function submitRecording(media, sessionId, { env = process.env, signal } = {}) {
  if (!/^[a-zA-Z0-9][a-zA-Z0-9._-]{0,100}$/.test(sessionId ?? '') || !media || isAbsolute(media)) throw new Error('relative media path and safe session id required');
  const { tenantId, actor } = identity(env), { UPLOAD_INPUT_ROOT: inputRoot, UPLOAD_OUTPUT_ROOT: outputRoot, UPLOAD_SPOOL_ROOT: spoolRoot } = env;
  if (!inputRoot || !outputRoot || !spoolRoot) throw new Error('configured input, output and spool roots required');
  const path = await confined(inputRoot, resolve(inputRoot, media)), bytes = await pinnedBytes(inputRoot, path);
  const mime = MIME[extname(path).toLowerCase()];
  if (!mime || !bytes.length) throw new Error('supported nonempty audio/video file required');
  // Probe a staged immutable snapshot; provider and probe consume the same pinned bytes.
  const blobDir = await ownedDirectory(spoolRoot, tenantSegment(tenantId), 'blobs'), digest = hash(bytes), snapshot = join(blobDir, `${digest}.bin`);
  await writeFile(snapshot, bytes, { flag: 'wx', mode: 0o600 }).catch(error => { if (error.code !== 'EEXIST') throw error; });
  if (hash(await pinnedBytes(spoolRoot, snapshot)) !== digest) throw new Error('staged recording hash conflict');
  const ffprobe = env.UPLOAD_FFPROBE ?? join(ROOT, '.cache', 'tools', 'ffmpeg-9.0.2', 'bin', 'ffprobe.exe');
  const duration = Number((await command(ffprobe, ['-v', 'error', '-show_entries', 'format=duration', '-of', 'default=noprint_wrappers=1:nokey=1', snapshot], { env })).trim());
  if (!Number.isFinite(duration) || duration <= 0) throw new Error('recording duration unavailable');
  register();
  const { uploadFile, pollFileState, transcribeUploadedAudio } = await import('../../packages/ai/src/stt/gemini-file-upload.ts');
  const { createRecordingSource } = await import('../../packages/ingest/src/sources/recording.ts');
  const queue = await connectQueue(env);
  const runId = hash(`${tenantId}|${sessionId}|${digest}|${env.GEMINI_STT_MODEL ?? 'default'}|${env.UPLOAD_RUN_NONCE ?? ''}`), started = Date.now();
  const pipeline = validateJob({ _id: `pipeline-${runId}`, tenantId, kind: 'transcribe.pipeline', status: 'processing', createdAt: new Date().toISOString(), sourceHash: digest, sessionId, durationSec: duration });
  await queue.jobs.updateOne(queue.scope({ _id: pipeline._id }), { $setOnInsert: pipeline }, { upsert: true });
  try {
    const transport = await createQueueTransport(queue, { spoolRoot, runId, signal, timeoutMs: Number(env.UPLOAD_TIMEOUT_MS ?? 1800000), maxAttempts: Number(env.UPLOAD_MAX_ATTEMPTS ?? 2) });
    let usage;
    const adapter = createRecordingSource({ reader: async () => pinnedBytes(spoolRoot, snapshot), hasher: value => createHash('sha256').update(value).digest('hex'),
      transcribe: async audio => {
        const { fileUri, name } = await uploadFile(audio, mime, transport, 'queue-worker-credential', sessionId);
        let state = 'PROCESSING';
        for (let i = 0; i < 20 && state === 'PROCESSING'; i++) {
          if (signal?.aborted) throw new Error('upload cancelled');
          if (i) await new Promise(r => setTimeout(r, 5000));
          state = await pollFileState(name, transport, 'queue-worker-credential');
        }
        if (state !== 'ACTIVE') throw new Error('provider file never became ACTIVE');
        const result = await transcribeUploadedAudio(fileUri, transport, 'queue-worker-credential', env.GEMINI_STT_MODEL || undefined, duration);
        usage = result.usage; return result.turns;
      } });
    const { source } = await adapter.fetch({ kind: 'recording', path, tenantId }, { captureMode: 'provided', given: true, recordedBy: actor });
    source.title = sessionId;
    const turns = await adapter.toTurns(source);
    if (signal?.aborted) throw new Error('upload cancelled');
    const published = await publishTranscript({ outputRoot, tenantId, sessionId, source, duration, turns, env });
    await queue.jobs.updateOne(queue.scope({ _id: pipeline._id }), { $set: { status: 'done', updatedAt: new Date().toISOString(), duration, turnCount: published.rows.length, usage } });
    return { ...published, duration, usage, runId, elapsedMs: Date.now() - started };
  } catch (error) {
    await queue.jobs.updateOne(queue.scope({ _id: pipeline._id, status: { $ne: 'done' } }), { $set: { status: 'failed', updatedAt: new Date().toISOString(), error: 'transcription-or-downstream-validation-failed' } });
    throw error;
  } finally { await queue.close(); }
}
if (process.argv[1] && pathToFileURL(resolve(process.argv[1])).href === import.meta.url) {
  const controller = new AbortController();
  process.on('SIGINT', () => controller.abort()); process.on('SIGTERM', () => controller.abort());
  submitRecording(process.argv[2], process.argv[3], { signal: controller.signal }).then(result => {
    console.log(JSON.stringify({ path: result.path, duration: result.duration, turns: result.rows.length, usage: result.usage, elapsedMs: result.elapsedMs }));
  }).catch(() => { console.error('recording submission failed; inspect scoped job status, configuration and validation'); process.exitCode = 1; });
}
