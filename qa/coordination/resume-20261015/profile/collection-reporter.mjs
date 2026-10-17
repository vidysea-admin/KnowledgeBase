// Vitest 2.1.8 Reporter hooks; observation only, retaining the default reporter.
const emit = (phase, detail = {}) => process.stderr.write(`[profile-phase] ${JSON.stringify({ phase, pid: process.pid, time: Date.now(), ...detail })}\n`);
export default class CollectionReporter {
  onInit() { emit('reporter-init'); }
  onPathsCollected(paths) { emit('paths-collected', { paths }); }
  onSpecsCollected(specs) { emit('specs-collected', { count: specs?.length }); }
  onCollected(files) { emit('collected', { files: files?.map(f => ({ name: f.name, tasks: f.tasks?.length })) }); }
  onTaskUpdate(packs) { emit('task-update', { tasks: packs.map(([id, result]) => ({ id, state: result?.state })) }); }
  onFinished(files, errors) { emit('finished', { files: files.map(f => ({ name: f.name, state: f.result?.state })), errors: errors?.map(e => String(e)) }); }
}
