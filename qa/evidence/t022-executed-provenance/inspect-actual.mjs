/** Read-only actual collector check. No provider import/call or private corpus acquisition. */
import { createHash } from 'node:crypto';
import { readFileSync, readdirSync, realpathSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
const root = resolve(dirname(fileURLToPath(import.meta.url)), '../../..');
const hash = value => createHash('sha256').update(value).digest('hex');
const stable = value => JSON.stringify(value);
const fail = value => { if (!value) throw new Error('inspection-refused'); };
const normalize = path => path.split(String.fromCharCode(92)).join('/');
const fixed = ['scripts/eval/human-calibration.mjs', 'scripts/eval/calibration-review.mjs', 'scripts/eval/llm-eval.mjs',
  'apps/api/src/score.ts', 'packages/ask/src/eval/calibration.ts', 'package.json', 'pnpm-lock.yaml', 'pnpm-workspace.yaml',
  'tsconfig.base.json', 'apps/api/package.json', 'apps/api/tsconfig.json', 'packages/ai/package.json', 'packages/ai/tsconfig.json'];
const ownedPins = {
  'scripts/eval/human-calibration.mjs': 'bb91820014da89802e0641a4a232551c32d0fce498fee7f37f45c0798df6aa6c',
  'scripts/eval/human-calibration.test.mjs': '6d9766ea7f67fdcf8530423f108d45ec2b9299c379e3064461df4dcf5045df63',
};
const localMeta = ['qa/evidence/t022-executed-provenance/inspect-actual.mjs', 'qa/evidence/t022-executed-provenance/broker-spec.json'];
function inventory() {
  const result = [];
  function visit(path) {
    for (const entry of readdirSync(resolve(root, path), { withFileTypes: true })) {
      fail(!entry.isSymbolicLink());
      const next = `${path}/${entry.name}`;
      if (entry.isDirectory()) visit(next);
      else if (entry.isFile() && entry.name.endsWith('.ts') && !entry.name.endsWith('.test.ts')) result.push(next);
    }
  }
  visit('packages/ai/src');
  return [...new Set([...fixed, ...result])].sort();
}
function pins(paths) {
  return paths.map(path => {
    const bytes = readFileSync(resolve(root, path));
    return { path, bytes: bytes.length, sha256: hash(bytes) };
  });
}
function resolvedEntries() {
  const aiEntry = realpathSync(createRequire(resolve(root, 'apps/api/src/score.ts')).resolve('@lkb/ai'));
  fail(aiEntry === realpathSync(resolve(root, 'packages/ai/src/index.ts')));
  const tsxEntry = realpathSync(fileURLToPath(import.meta.resolve('tsx/esm/api')));
  fail(normalize(tsxEntry).endsWith('/dist/esm/api/index.mjs'));
  return { aiEntry, tsxEntry, executable: realpathSync(process.execPath) };
}
try {
  const beforeMembership = inventory(), beforeSources = pins(beforeMembership), beforeEntries = resolvedEntries();
  const directPaths = [...new Set([...beforeMembership, ...Object.keys(ownedPins), ...localMeta,
    beforeEntries.aiEntry, beforeEntries.tsxEntry, beforeEntries.executable])].sort();
  const before = pins(directPaths);
  for (const [path, expected] of Object.entries(ownedPins)) fail(before.find(item => item.path === path)?.sha256 === expected);
  const { implementationBindings } = await import('../../../scripts/eval/human-calibration.mjs');
  const collected = implementationBindings();
  fail(stable(collected.files) === stable(beforeSources));
  fail(collected.runtime.aiEntry === beforeEntries.aiEntry && collected.runtime.tsxEntry.path === beforeEntries.tsxEntry);
  fail(collected.runtime.executable === beforeEntries.executable);
  const afterMembership = inventory(), afterEntries = resolvedEntries(), after = pins(directPaths);
  fail(stable(beforeMembership) === stable(afterMembership));
  fail(stable(beforeEntries) === stable(afterEntries) && stable(before) === stable(after));
  console.log(stable({ kind: 't022-actual-local-provenance-inspection-v1', status: 'current-local-inventory-verified',
    sourceCount: beforeMembership.length, aiSourceCount: beforeMembership.filter(path => path.startsWith('packages/ai/src/')).length,
    directPinCount: before.length, inventorySha256: hash(stable(beforeSources)), directScopeSha256: hash(stable(before)),
    collectorSha256: hash(stable(collected)), membershipBeforeAfter: 'identical', directPinsBeforeAfter: 'identical',
    aiResolutionStatus: 'canonical-expected-entry', tsxResolutionStatus: 'actual-esm-api-entry',
    runtimeStatus: 'actual-executable-bound', privateCorpus: 'not-acquired', providerCalls: 0,
    externalTransitiveClosure: 'not-certified' }));
} catch {
  console.log(stable({ kind: 't022-actual-local-provenance-inspection-v1', status: 'inspection-refused' }));
  process.exitCode = 2;
}
