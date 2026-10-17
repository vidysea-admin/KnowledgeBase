import { defineConfig } from "../../../apps/web/node_modules/vite/dist/node/index.js";
import { fileURLToPath } from "node:url";
const web = fileURLToPath(new URL("../../../apps/web/", import.meta.url));
const modules = `${web}node_modules/`;
export default defineConfig({
  root: web,
  esbuild: { jsx: "automatic" },
  resolve: { alias: Object.fromEntries(["react", "react-router-dom", "@testing-library/react", "@testing-library/user-event", "vitest"].map(name => [name, `${modules}${name}`])) },
  test: { environment: "jsdom", globals: true, setupFiles: [`${web}src/setupTests.ts`],
    include: ["src/pages/WhatsAppPage.test.tsx", "src/pages/whatsapp/ReviewQueue.test.tsx", "../../qa/evidence/goal-t007/checker.test.tsx"],
    maxWorkers: 1, minWorkers: 1, fileParallelism: false, testTimeout: 10000 },
});
