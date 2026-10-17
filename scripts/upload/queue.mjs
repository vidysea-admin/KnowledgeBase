/** Durable UploadTransport; keys never enter queue documents or staged metadata. */
import { MongoClient } from '../../packages/db/node_modules/mongodb/lib/index.js';
import { open } from 'node:fs/promises';
import { join } from 'node:path';
import { hash, identity, ownedDirectory, pinnedBytes, tenantSegment, validateJob } from './security.mjs';
const HOST = 'generativelanguage.googleapis.com';
const delay = ms => new Promise(r => setTimeout(r, ms));
function noCredentials(value) {
  if (value && typeof value === 'object') for (const [key, child] of Object.entries(value)) {
    if (/^(api[-_]?key|authorization|x-goog-api-key|access[-_]?token|refresh[-_]?token)$/i.test(key)) throw new Error('queued credential field refused');
    noCredentials(child);
  }
}
export function operation(req) {
  const url = new URL(req.url), method = req.method;
  const headers = Object.fromEntries(Object.entries(req.headers ?? {}).map(([k, v]) => [k.toLowerCase(), v]));
  if ('authorization' in headers || 'x-goog-api-key' in headers) throw new Error('queued credentials refused');
  let op;
  if (url.protocol === 'queue-upload:' && /^[a-f0-9]{64}$/.test(url.hostname) && !url.pathname && !url.search && method === 'PUT') op = 'upload-finalize';
  else {
    if (url.protocol !== 'https:' || url.hostname !== HOST || url.port || url.username || url.password || url.hash || [...url.searchParams.keys()].some(k => k !== 'key')) throw new Error('unsupported provider boundary');
    url.search = '';
    if (url.pathname === '/upload/v1beta/files' && method === 'POST') op = 'upload-start';
    else if (/^\/v1beta\/files\/[a-zA-Z0-9_-]+$/.test(url.pathname) && method === 'GET') op = 'poll';
    else if (/^\/v1beta\/models\/[a-zA-Z0-9._-]+:generateContent$/.test(url.pathname) && method === 'POST') op = 'generate';
    else throw new Error('unsupported provider operation');
  }
  const allowed = op === 'upload-start' ? ['content-type', 'x-goog-upload-protocol', 'x-goog-upload-command', 'x-goog-upload-header-content-length', 'x-goog-upload-header-content-type'] :
    op === 'upload-finalize' ? ['x-goog-upload-offset', 'x-goog-upload-command'] : op === 'generate' ? ['content-type'] : [];
  if (Object.keys(headers).some(k => !allowed.includes(k))) throw new Error('unsupported provider header');
  return { op, url: url.toString(), method, headers };
}
export async function connectQueue(env = process.env) {
  const { tenantId, actor } = identity(env), dbName = env.UPLOAD_QUEUE_DB;
  if (!/^upload_queue_[a-zA-Z0-9_]{8,55}$/.test(dbName ?? '') || !env.MONGODB_URL) throw new Error('dedicated UPLOAD_QUEUE_DB and MONGODB_URL required');
  const client = new MongoClient(env.MONGODB_URL, { serverSelectionTimeoutMS: 5000 }); await client.connect();
  const jobs = client.db(dbName).collection('jobs');
  const scope = filter => ({ ...filter, tenantId });
  return { tenantId, actor, client, jobs, scope, close: () => client.close() };
}
export async function createQueueTransport(queue, { spoolRoot, runId, timeoutMs = 1800000, pollMs = 100, signal, maxAttempts = 2 } = {}) {
  if (!/^[a-f0-9]{64}$/.test(runId ?? '') || !Number.isFinite(timeoutMs) || timeoutMs < 20 || timeoutMs > 1800000 || ![1, 2].includes(maxAttempts)) throw new Error('invalid queue transport configuration');
  const blobDir = await ownedDirectory(spoolRoot, tenantSegment(queue.tenantId), 'blobs');
  let ordinal = 0;
  return async req => {
    if (signal?.aborted) throw new Error('upload cancelled');
    const request = operation(req); let body = req.body;
    if (!(body instanceof Uint8Array)) noCredentials(body);
    if (body instanceof Uint8Array) {
      const digest = hash(body), path = join(blobDir, `${digest}.bin`);
      let fd;
      try { fd = await open(path, 'wx', 0o600); await fd.writeFile(body); }
      catch (e) { if (e.code !== 'EEXIST') throw e; }
      finally { await fd?.close(); }
      if (hash(await pinnedBytes(spoolRoot, path)) !== digest) throw new Error('staged blob hash conflict');
      body = { blob: `${tenantSegment(queue.tenantId)}/blobs/${digest}.bin`, sha256: digest, size: body.byteLength };
    }
    request.body = body;
    const serialized = JSON.stringify(request);
    if (Buffer.byteLength(serialized) > 128 * 1024) throw new Error('queue request exceeds limit');
    const id = hash(`${queue.tenantId}|${runId}|${ordinal++}|${serialized}`), now = new Date().toISOString();
    const row = validateJob({ _id: id, tenantId: queue.tenantId, kind: 'transcribe.rpc', provider: 'gemini', status: 'pending', createdAt: now,
      request, runId, attempts: 0, maxAttempts, deadlineMs: Date.now() + timeoutMs });
    await queue.jobs.updateOne(queue.scope({ _id: id }), { $setOnInsert: row }, { upsert: true });
    const deadline = Date.now() + timeoutMs;
    try {
      while (true) {
        if (signal?.aborted) throw new Error('upload cancelled');
        const result = await queue.jobs.findOne(queue.scope({ _id: id }));
        if (!result) throw new Error('queue operation missing');
        validateJob(result);
        if (result.status === 'failed') throw new Error(`queued ${request.op} failed: ${String(result.error ?? 'worker failed').slice(0, 120)}`);
        if (result.status === 'done') {
          if (!result.response || !Number.isInteger(result.response.status) || typeof result.response.headers !== 'object' || Buffer.byteLength(JSON.stringify(result.response)) > 2 * 1024 * 1024) throw new Error('invalid queued response');
          return result.response;
        }
        if (Date.now() >= deadline) throw new Error('upload queue operation timeout');
        await delay(pollMs);
      }
    } catch (e) {
      await queue.jobs.updateOne(queue.scope({ _id: id, status: { $in: ['pending', 'processing'] } }),
        { $set: { status: 'failed', cancelledAt: new Date().toISOString(), error: signal?.aborted ? 'producer-cancelled' : 'producer-timeout-or-failure' } });
      throw e;
    }
  };
}
