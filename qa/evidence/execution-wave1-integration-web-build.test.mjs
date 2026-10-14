import { test, expect } from '../../apps/web/node_modules/vitest/dist/index.js';
import { build } from '../../apps/web/node_modules/vite/dist/node/index.js';
import { readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { randomUUID } from 'node:crypto';

const repo = fileURLToPath(new URL('../../', import.meta.url));
test('actual production Vite build emits the App entry and integration consumer assets', async () => {
  const outDir = path.join(repo, '.cache', 'coordination', `execution-wave1-integration-web-build-${randomUUID()}`);
  const startedUtc = new Date().toISOString();
  const result = await build({ root: path.join(repo, 'apps', 'web'),
    configFile: path.join(repo, 'apps', 'web', 'vite.config.ts'), mode: 'production',
    build: { outDir, emptyOutDir: false, write: true }, logLevel: 'warn' });
  expect(result).toBeTruthy();
  const html = readFileSync(path.join(outDir, 'index.html'), 'utf8');
  expect(html).toMatch(/<div id="root"><\/div>/);
  const scripts = [...html.matchAll(/src="(\/assets\/[^"\s]+\.js)"/g)].map(match => match[1]);
  expect(scripts.length).toBeGreaterThan(0);
  const scriptContent = scripts.map(asset => readFileSync(path.join(outDir, asset.slice(1)), 'utf8')).join('\n');
  for (const consumer of ['Knowledge directory', 'Answer policy', 'Search semantic matches', 'Join rules degraded', 'Grounded notes and Q&A']) {
    expect(scriptContent).toContain(consumer);
  }
  expect(readdirSync(path.join(outDir, 'assets')).some(name => name.endsWith('.css'))).toBe(true);
  writeFileSync(path.join(repo, 'qa', 'evidence', 'execution-wave1-integration-expanded-web-build-artifact.json'),
    JSON.stringify({ startedUtc, endedUtc: new Date().toISOString(), outDir, scripts, checkedConsumers: 5 }, null, 2));
}, 120000);
