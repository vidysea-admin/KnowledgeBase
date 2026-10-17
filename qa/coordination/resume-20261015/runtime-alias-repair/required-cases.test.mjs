import test from 'node:test';
import assert from 'node:assert/strict';
import { resolveWorkspaceAlias } from './register.mjs';

const context = { parentURL: new URL('../../../../packages/meeting-bot/src/capture/native/native-capture-runtime.ts', import.meta.url).href };
const missing = Object.assign(new Error('original missing'), { code: 'ERR_MODULE_NOT_FOUND' });

test('actual deep workspace alias resolves and TS source loads', async () => {
  const resolved = resolveWorkspaceAlias('@lkb/core/src/domain/lean-video.js', context, specifier => {
    if (!specifier.startsWith('file:')) throw missing;
    return { url: specifier };
  });
  assert.match(resolved.url, /\/packages\/core\/src\/domain\/lean-video\.ts$/u);
  const module = await import(resolved.url);
  assert.ok(Object.keys(module).length > 0);
});

test('normal resolution and package export denial retain original semantics', () => {
  const sentinel = { url: 'node:fs' };
  assert.equal(resolveWorkspaceAlias('@lkb/core', context, () => sentinel), sentinel);
  const denied = Object.assign(new Error('export denied'), { code: 'ERR_PACKAGE_PATH_NOT_EXPORTED' });
  assert.throws(() => resolveWorkspaceAlias('@lkb/core/src/domain/lean-video.js', context, () => { throw denied; }), error => error === denied);
});

test('traversal, foreign packages and outside-workspace importers refuse fallback', () => {
  for (const specifier of ['@lkb/core/src/../package.js', '@lkb/core/src/%2e%2e/secret.js', '@lkb/foreign/src/domain/lean-video.js', '@lkb/core/src/domain\\lean-video.js']) {
    assert.throws(() => resolveWorkspaceAlias(specifier, context, () => { throw missing; }), error => error === missing);
  }
  assert.throws(() => resolveWorkspaceAlias('@lkb/core/src/domain/lean-video.js', { parentURL: new URL('file:///C:/Windows/not-a-workspace.ts').href }, () => { throw missing; }), error => error === missing);
});
