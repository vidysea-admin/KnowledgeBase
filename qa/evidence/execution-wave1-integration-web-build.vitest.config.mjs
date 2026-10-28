import { defineConfig } from '../../apps/web/node_modules/vite/dist/node/index.js';
import { fileURLToPath } from 'node:url';
export default defineConfig({ root: fileURLToPath(new URL('../../', import.meta.url)), test: {
  environment: 'node', include: ['qa/evidence/execution-wave1-integration-web-build.test.mjs'],
  maxWorkers: 1, minWorkers: 1, testTimeout: 120000,
} });
