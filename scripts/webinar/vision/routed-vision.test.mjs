import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { routedVision, visionOrderFromYaml } from '../process-video.mjs';
import { buildVisionBackends, newVisionTally, runVisionChain } from '../../../packages/ai/src/vision/chain.ts';

const OK = '{"readable":true,"ocrText":"Slide text","visualDescription":""}';
const env = { OLLAMA_API_KEY: 'k', GEMINI_API_KEY: 'g', WEBINAR_VISION_MODEL: 'gemini-2.5-flash' };

test('routedVision: ollama serves, schema-validated, tally records provider', async (t) => {
  const dir = mkdtempSync(join(tmpdir(), 'lkb-rv-')); t.after(() => rmSync(dir, { recursive: true, force: true }));
  writeFileSync(join(dir, 'f.jpg'), 'pixels');
  const transport = async () => ({ status: 200, body: { message: { content: OK } } });
  const tally = newVisionTally();
  const vision = routedVision({ runVisionChain }, buildVisionBackends(env, transport), { tally });
  assert.deepEqual(await vision({ path: join(dir, 'f.jpg') }), JSON.parse(OK));
  assert.deepEqual(tally.byProvider, { ollama: 1 }); assert.equal(tally.fallbacks, 0);
});

test('routedVision: ollama schema-invalid reply falls back to gemini and is counted', async (t) => {
  const dir = mkdtempSync(join(tmpdir(), 'lkb-rv-')); t.after(() => rmSync(dir, { recursive: true, force: true }));
  writeFileSync(join(dir, 'f.jpg'), 'pixels');
  const transport = async (r) => r.url.includes('ollama.com')
    ? { status: 200, body: { message: { content: '{"readable":true,"extra":1}' } } }
    : { status: 200, body: { candidates: [{ content: { parts: [{ text: OK }] } }] } };
  const tally = newVisionTally();
  const vision = routedVision({ runVisionChain }, buildVisionBackends(env, transport), { tally });
  assert.deepEqual(await vision({ path: join(dir, 'f.jpg') }), JSON.parse(OK));
  assert.deepEqual(tally.byProvider, { gemini: 1 }); assert.equal(tally.fallbacks, 1);
});

test('visionOrderFromYaml reads the vision chain, defaults to ollama then gemini', () => {
  assert.deepEqual(visionOrderFromYaml('a: [x]\nvision: [gemini, ollama]\n'), ['gemini', 'ollama']);
  assert.deepEqual(visionOrderFromYaml('a: [x]\n'), ['ollama', 'gemini']);
});
