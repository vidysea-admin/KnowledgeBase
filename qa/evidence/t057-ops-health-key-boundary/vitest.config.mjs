import { defineConfig } from "../../../apps/web/node_modules/vite/dist/node/index.js";
import react from "../../../apps/web/node_modules/@vitejs/plugin-react/dist/index.mjs";
export default defineConfig({
  root: new URL("../../../apps/web/", import.meta.url).pathname.replace(/^\/([A-Za-z]:\/)/, "$1"),
  plugins: [react()],
  test: { environment: "jsdom", setupFiles: ["./src/setupTests.ts"], globals: true,
    include: ["../../qa/evidence/t057-ops-health-key-boundary/checker.test.tsx"] },
});
