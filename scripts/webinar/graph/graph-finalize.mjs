/** T-050 wiring: run the post-capture recovery ("finalize") of one webinar session through the pipeline graph instead of the single sequential child.
 *  OFF by default: only LKB_PIPELINE_GRAPH=1 selects it. Stage handlers re-use the same commands the sequential path runs, one per stage. */
import {createHash} from 'node:crypto';
import {existsSync, mkdirSync, readFileSync, statSync, writeFileSync} from 'node:fs';
import {join, relative} from 'node:path';
import {spawn} from 'node:child_process';

export const graphEnabled = (env = process.env) => env.LKB_PIPELINE_GRAPH === '1';
const sha = (...parts) => createHash('sha256').update(parts.join('\0')).digest('hex');
const fileSha = (file) => createHash('sha256').update(readFileSync(file)).digest('hex');
const STAGE_FAILED = {kind: 'fail', code: 'stage-failed'};

export function runNodeScript(root, script, args, env) {
  return new Promise((done, fail) => {
    const child = spawn(process.execPath, [join(root, script), ...args], {cwd: root, env, shell: false, windowsHide: true, stdio: 'ignore'});
    child.once('error', () => fail(new Error('stage script could not start')));
    child.once('close', code => code === 0 ? done() : fail(new Error(`stage script exited ${code}`)));
  });
}

/** One handler per workflow stage. Handlers are idempotent (the graph is at-least-once). Any failure maps to the non-retryable code `stage-failed`. */
export function createSessionHandlers({root, id, title, artifact, env, launch, runScript = runNodeScript, validateIndexProof}) {
  const dir = join(root, 'data/toc-migrated', id);
  const guard = (fn) => async () => { try { return await fn(); } catch { return STAGE_FAILED; } };
  return {
    capture: guard(() => {
      if (!existsSync(artifact) || statSync(artifact).size === 0) return STAGE_FAILED;
      return {kind: 'ok', outputFingerprint: sha('capture', relative(root, artifact), statSync(artifact).size)};
    }),
    media: guard(async () => {
      await launch(['finalize', '--video', artifact, '--session-id', id, '--title', title], env, () => {});
      return {kind: 'ok', outputFingerprint: sha('media', fileSha(join(dir, 'source.json')))};
    }),
    transcript: guard(async () => {
      await runScript(root, 'scripts/transcribe-long-session.mjs', [id], env);
      const turns = join(dir, 'turns.json');
      if (!existsSync(turns) || statSync(turns).size === 0) return STAGE_FAILED;
      return {kind: 'ok', outputFingerprint: sha('transcript', fileSha(turns))};
    }),
    screen: guard(async () => {
      await runScript(root, 'scripts/webinar/process-video.mjs', [id, '--recording', relative(root, artifact)], env);
      return {kind: 'ok', outputFingerprint: sha('screen', fileSha(join(dir, 'turns.json')))};
    }),
    index: guard(async () => {
      await runScript(root, 'scripts/webinar/sync-session.mjs', [id, '--emit-files', '--index'], env);
      const proof = validateIndexProof(dir, id);
      // Same marker the sequential path writes (processRecordingArtifacts report("done")); run-pipeline's complete() reads it.
      writeFileSync(join(dir, 'pipeline-state.json'), JSON.stringify({...proof, sessionId: id, stage: 'index', status: 'done', updatedAt: new Date().toISOString()}) + '\n');
      return {kind: 'ok', outputFingerprint: sha('index', String(proof.inputHash))};
    }),
  };
}

/** Throws unless the graph run completed; the caller then applies its existing completion check. */
export async function loadCore() {
  const c = '../../../packages/core/src/';
  const [q, s, g] = await Promise.all([import(c + 'job-queue/file-job-queue.ts'), import(c + 'run-state-store/run-state-store.ts'), import(c + 'pipeline-graph/session-run.ts')]);
  return {FileJobQueue: q.FileJobQueue, createRunStateStore: s.createRunStateStore, runSessionThroughGraph: g.runSessionThroughGraph};
}
export async function runSessionGraph({deps, tenantId, id, title, artifact, env, validateIndexProof, runScript, core}) {
  const {FileJobQueue, createRunStateStore, runSessionThroughGraph} = core ?? await loadCore();
  const base = join(deps.root, 'data/webinar-release/pipeline-graph', id);
  mkdirSync(join(base, 'runs'), {recursive: true});
  const now = deps.queueNow ?? Date.now;
  const result = await runSessionThroughGraph({
    tenantId, runKey: id, sourceFingerprint: sha(relative(deps.root, artifact), statSync(artifact).size),
    handlers: createSessionHandlers({root: deps.root, id, title, artifact, env, launch: deps.launch, runScript, validateIndexProof}),
    queue: new FileJobQueue({dir: join(base, 'queue'), now}), store: createRunStateStore(join(base, 'runs')), now,
  });
  if (!result.ok) throw new Error(`Pipeline graph refused: ${result.error.code}`);
  if (result.run.outcome !== 'complete') {
    const why = result.run.failedTerminal ? `${result.run.failedTerminal.stage}:${result.run.failedTerminal.code}` : result.run.error?.code ?? '';
    throw new Error(`Pipeline graph ${result.run.outcome} ${why}`.trim());
  }
}
