/** T-050 wiring: run the post-capture recovery ("finalize") of one webinar session through the pipeline graph instead of the single sequential child.
 *  OFF by default: only LKB_PIPELINE_GRAPH=1 selects it. Stage handlers re-use the same commands the sequential path runs, one per stage. */
import {createHash} from 'node:crypto';
import {createReadStream, existsSync, readFileSync, realpathSync, statSync} from 'node:fs';
import {join, relative} from 'node:path';
import {runNodeScript, classifyStageFailure} from './stage-process.mjs';
import {ownedDirectory,writeProofMarker} from './proof-marker.mjs';
import {acknowledgedCompletion} from './completed-session.mjs';
export {runNodeScript} from './stage-process.mjs';

export const graphEnabled = (env = process.env) => env.LKB_PIPELINE_GRAPH === '1';
const sha = (...parts) => createHash('sha256').update(parts.join('\0')).digest('hex');
const fileSha = (file) => createHash('sha256').update(readFileSync(file)).digest('hex');
const STAGE_FAILED = {kind: 'fail', code: 'stage-failed'};
const confinedFile = (root, file) => {
  const rel = relative(realpathSync(root), realpathSync(file));
  if (!rel || rel === '..' || rel.startsWith('../') || rel.startsWith('..\\') || /^[A-Za-z]:|^[/\\]/.test(rel)) throw new Error('Artifact outside graph root');
  return file;
};
async function mediaSha(root, file) {
  const hash = createHash('sha256');
  for await (const chunk of createReadStream(confinedFile(root, file))) hash.update(chunk);
  return hash.digest('hex');
}
async function launchWithSignal(launch, args, env, signal) {
  let control;
  const abort = () => { void Promise.resolve(control?.stop('cancelled')).catch(() => undefined); };
  signal?.addEventListener('abort', abort, {once: true});
  try {
    await launch(args, env, () => {}, handle => { control = handle; if (signal?.aborted) abort(); });
  } finally { signal?.removeEventListener('abort', abort); }
}

/** One handler per workflow stage. Stable transient codes reach the runner's existing retry policy. */
export function createSessionHandlers({root, id, title, artifact, capture, env, launch, runScript = runNodeScript, validateIndexProof}) {
  const dir = join(root, 'data/toc-migrated', id);
  let selectedArtifact = artifact;
  const assertTenant = ctx => {
    if(!ctx?.tenantId||ctx.runKey!==id)throw new Error('Graph stage identity missing');
    const source=JSON.parse(readFileSync(confinedFile(root,join(dir,'source.json')),'utf8'));
    if(source.tenantId!==ctx.tenantId)throw new Error('Graph source tenant mismatch');
  };
  const guard = (fn) => async (ctx) => { try { return await fn(ctx); } catch (error) { return {kind: 'fail', code: classifyStageFailure(error)}; } };
  return {
    capture: guard(async (ctx) => {
      if (capture) selectedArtifact = await capture(ctx);
      if (!selectedArtifact || !existsSync(selectedArtifact) || statSync(selectedArtifact).size === 0) return STAGE_FAILED;
      return {kind: 'ok', outputFingerprint: sha('capture', relative(root, selectedArtifact), await mediaSha(root, selectedArtifact))};
    }),
    media: guard(async (ctx) => {
      if(existsSync(join(dir,'source.json')))assertTenant(ctx);
      await launchWithSignal(launch, ['finalize', '--video', confinedFile(root, selectedArtifact), '--session-id', id, '--tenant', ctx.tenantId, '--title', title], env, ctx?.signal);
      assertTenant(ctx);
      return {kind: 'ok', outputFingerprint: sha('media', fileSha(join(dir, 'source.json')))};
    }),
    transcript: guard(async (ctx) => {
      assertTenant(ctx);
      await runScript(root, 'scripts/transcribe-long-session.mjs', [id], env, {signal: ctx?.signal});
      // Transcription deliberately invalidates its prior gate; only the sanctioned validator
      // may bind the newly published bytes to a passed transcript generation.
      await runScript(root, 'scripts/webinar/validate/validate-session.mjs', [id], env, {signal: ctx?.signal});
      const turns = join(dir, 'turns.json');
      if (!existsSync(turns) || statSync(turns).size === 0) return STAGE_FAILED;
      return {kind: 'ok', outputFingerprint: sha('transcript', fileSha(turns))};
    }),
    screen: guard(async (ctx) => {
      assertTenant(ctx);
      await runScript(root, 'scripts/webinar/process-video.mjs', [id, '--recording', relative(root, confinedFile(root, selectedArtifact))], env, {signal: ctx?.signal});
      return {kind: 'ok', outputFingerprint: sha('screen', fileSha(join(dir, 'turns.json')))};
    }),
    index: guard(async (ctx) => {
      assertTenant(ctx);
      await runScript(root, 'scripts/webinar/sync-session.mjs', [id, '--emit-files', '--index'], env, {signal: ctx?.signal});
      ctx?.signal?.throwIfAborted();
      const proof = validateIndexProof(dir, id);
      // Same marker the sequential path writes (processRecordingArtifacts report("done")); run-pipeline's complete() reads it.
      writeProofMarker(root,dir,id,proof,ctx);
      return {kind: 'ok', outputFingerprint: sha('index', String(proof.inputHash))};
    }),
  };
}

/** Throws unless the graph run completed; the caller then applies its existing completion check. */
export async function loadCore() {
  const c = '../../../packages/core/src/';
  const [q, s, g, controls, ids, queueStore, workflow] = await Promise.all([import(c + 'job-queue/file-job-queue.ts'), import(c + 'run-state-store/run-state-store.ts'), import(c + 'pipeline-graph/session-run.ts'), import(c + 'pipeline-graph/session-control.ts'), import(c + 'job-queue/queue-types.ts'), import(c + 'job-queue/queue-store.ts'), import(c + 'domain/pipeline-workflow.ts')]);
  return {FileJobQueue: q.FileJobQueue, createRunStateStore: s.createRunStateStore, runSessionThroughGraph: g.runSessionThroughGraph, createSessionControl: controls.createSessionControl, validateQueueId: ids.validateQueueId,
    loadQueue:queueStore.loadQueue,realQueueFs:queueStore.realQueueFs,planNext:workflow.planNext,WEBINAR_PIPELINE:workflow.WEBINAR_PIPELINE};
}
export async function runSessionGraph({deps, tenantId, id, title, artifact, sourceFingerprint, capture, env, validateIndexProof, runScript, core}) {
  const loadedCore=core??await loadCore();
  const {FileJobQueue, createRunStateStore, runSessionThroughGraph, createSessionControl, validateQueueId}=loadedCore;
  if (validateQueueId(tenantId, 'tenant id') || validateQueueId(id, 'session id')) throw new Error('Invalid graph session identity');
  // Refuse a foreign or corrupt existing session before enqueuing, creating state,
  // or invoking fresh capture. The later stage checks also detect changes mid-run.
  const sourcePath=join(deps.root,'data/toc-migrated',id,'source.json');
  if(existsSync(sourcePath)) {
    const source=JSON.parse(readFileSync(confinedFile(deps.root,sourcePath),'utf8'));
    if(source.tenantId!==tenantId)throw new Error('Graph source tenant mismatch');
  }
  const fingerprint = sourceFingerprint ?? await mediaSha(deps.root, artifact);
  if (typeof fingerprint !== 'string' || !fingerprint) throw new Error('Graph requires a source fingerprint');
  const base = ownedDirectory(deps.root,join(deps.root, 'data/webinar-release/pipeline-graph', id));
  ownedDirectory(deps.root,join(base,'runs')); ownedDirectory(deps.root,join(base,'controls'));
  const now = deps.queueNow ?? Date.now;
  const store=createRunStateStore(join(base,'runs'));
  const result = await runSessionThroughGraph({
    tenantId, runKey: id, sourceFingerprint: fingerprint,
    handlers: createSessionHandlers({root: deps.root, id, title, artifact, capture, env, launch: deps.launch, runScript, validateIndexProof}),
    queue: new FileJobQueue({dir: join(base, 'queue'), now}), store, now,
    control: deps.sessionControl ?? createSessionControl(createRunStateStore(join(base, 'controls'))), signal: deps.signal,
  });
  if(!result.ok&&result.error.code==='nothing-to-claim'&&artifact) {
    const indexProof=validateIndexProof(join(deps.root,'data/toc-migrated',id),id);
    const captureFingerprint=sha('capture',relative(deps.root,artifact),await mediaSha(deps.root,artifact));
    const acknowledged=acknowledgedCompletion({core:loadedCore,queueDir:join(base,'queue'),store,tenantId,id,
      sourceFingerprint:fingerprint,captureFingerprint,indexProof,now:now()});
    if(acknowledged)return;
  }
  if (!result.ok) throw new Error(`Pipeline graph refused: ${result.error.code}`);
  if (result.run.outcome !== 'complete') {
    const why = result.run.failedTerminal ? `${result.run.failedTerminal.stage}:${result.run.failedTerminal.code}` : result.run.error?.code ?? '';
    throw new Error(`Pipeline graph ${result.run.outcome} ${why}`.trim());
  }
}

/** Fresh recording uses the same graph/checkpoint policy. Its capture callback owns real host cleanup. */
export async function runFreshSessionGraph(options) {
  if (typeof options.capture !== 'function' || typeof options.sourceFingerprint !== 'string' || !options.sourceFingerprint)
    throw new Error('Fresh graph requires a capture handler and source fingerprint');
  return runSessionGraph(options);
}
