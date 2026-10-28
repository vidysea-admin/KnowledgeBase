import { fileURLToPath } from "node:url";
import base from "../../../apps/web/vitest.config.ts";

export default {
  ...base,
  root: fileURLToPath(new URL("../../../apps/web/", import.meta.url)),
  test: {
    ...base.test,
    include: [fileURLToPath(new URL("./independent-boundaries.test.tsx", import.meta.url))],
    maxWorkers: 1,
    minWorkers: 1,
    fileParallelism: false,
  },
};
