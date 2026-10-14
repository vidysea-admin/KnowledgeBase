import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { runInNewContext } from 'node:vm';
import assert from 'node:assert/strict';

const paths = [
  'apps/api/src/ask/source-context.test.ts',
  'packages/index/src/tree/tree-real-data.test.ts',
];
const validationShapes = ['{}', '{"status":"passed"}', '{"status":"failed"}', 'null', '[]', '["passed"]', '5', 'true', '"x"', '{', ''];
let count = 0;
for (const [index, path] of paths.entries()) {
  const source = readFileSync(path, 'utf8');
  const begin = source.indexOf('function inProgressLabel(');
  const end = source.indexOf('\n}', begin) + 2;
  assert.ok(begin >= 0 && end > begin);
  const helper = source.slice(begin, end).replace('(dir: string): string | null', '(dir)');
  for (const bytes of validationShapes) for (let sessionMask = 0; sessionMask < 4; sessionMask++) {
    const files = { 'validation.json': bytes };
    if (sessionMask & 1) files['session.json'] = '{}';
    if (sessionMask & 2) files['session_page.json'] = '{}';
    const actual = runInNewContext(helper + '\ninProgressLabel("fixture")', {
      readdirSync: () => Object.keys(files),
      readFileSync: (path) => files[path],
      join: (_dir, name) => name,
    }, { timeout: 1000 });
    let expected = null;
    try {
      const value = JSON.parse(bytes);
      if (sessionMask === 0 && value !== null && typeof value === 'object' && (index === 0 || !Array.isArray(value))) {
        expected = value.status === 'passed' ? 'validated, awaiting finalize' : 'validation ' + String(value.status);
      }
    } catch {}
    assert.equal(actual, expected, `${path}: validation=${JSON.stringify(bytes)}, sessionMask=${sessionMask}`);
    count++;
  }
  const missingValidation = runInNewContext(helper + '\ninProgressLabel("fixture")', {
    readdirSync: () => [], readFileSync: () => { throw new Error('unexpected read'); }, join: (_dir, name) => name,
  }, { timeout: 1000 });
  assert.equal(missingValidation, null);
  count++;
  console.log(`${path}: 45/45 classifier boundaries, SHA256 ${createHash('sha256').update(source).digest('hex')}`);
}
console.log(`independent boundaries: ${count}/${count} PASS; retained API/index array divergence confirmed; no production/corpus mutations`);
