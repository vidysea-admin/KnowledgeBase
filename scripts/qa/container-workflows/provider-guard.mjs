// Explicit readonly-mounted CI transport boundary, never installed in the normal application startup.
import { writeFileSync } from "node:fs";
import { createRequire, syncBuiltinESMExports } from "node:module";

const receipt = "/tmp/lkb-ci-provider-calls.json";
const counts = { boundary: "CI blocked HTTP/CLI provider transports", httpCalls: 0, processCalls: 0 };
const save = () => writeFileSync(receipt, JSON.stringify(counts) + "\n", { mode: 0o600 });
save();
const originalFetch = globalThis.fetch;
globalThis.fetch = (input, options) => {
  const target = new URL(typeof input === "string" ? input : input instanceof URL ? input.href : input.url);
  if (target.protocol === "http:" && ["127.0.0.1", "localhost", "[::1]"].includes(target.hostname)) return originalFetch(input, options);
  counts.httpCalls++; save();
  return Promise.reject(new Error("CI external provider transport blocked"));
};
const processApi = createRequire(import.meta.url)("node:child_process");
for (const name of ["spawn", "spawnSync", "exec", "execSync", "execFile", "execFileSync", "fork"]) {
  processApi[name] = () => { counts.processCalls++; save(); throw new Error("CI external process transport blocked"); };
}
for (const protocol of ["http", "https"]) {
  const api = createRequire(import.meta.url)(`node:${protocol}`);
  for (const name of ["request", "get"]) {
    const original = api[name];
    api[name] = function (...args) {
      const target = typeof args[0] === "string" || args[0] instanceof URL ? new URL(args[0]) : args[0];
      const host = target?.hostname ?? target?.host ?? "localhost";
      if (protocol === "http" && ["127.0.0.1", "localhost", "::1", "[::1]"].includes(host)) return original.apply(this, args);
      counts.httpCalls++; save(); throw new Error("CI external provider transport blocked");
    };
  }
}
syncBuiltinESMExports();
