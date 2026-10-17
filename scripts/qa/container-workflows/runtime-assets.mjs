import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { createRequire, isBuiltin } from "node:module";
import { pathToFileURL } from "node:url";
import { createHash } from "node:crypto";

for (const path of ["/app/apps/api/dist/server.js", "/app/apps/api/dist/source-worker.js", "/app/schema/index.json", "/app/config/ai-routing.yaml", "/app/apps/api/dist/runtime-externals.json"])
  assert.ok(existsSync(path), `missing runtime asset: ${path}`);
for (const path of ["/app/.env", "/app/config/client_secret.json", "/app/data", "/app/raw", "/app/recordings", "/app/apps/api/src", "/app/apps/api/node_modules/tsx", "/app/apps/api/node_modules/typescript"])
  assert.equal(existsSync(path), false, `unexpected runtime content: ${path}`);
const external = JSON.parse(readFileSync("/app/apps/api/dist/runtime-externals.json", "utf8"));
const aclAsset = `/app/apps/api/dist/runtime-assets/${createHash("sha256").update("apps/api/src/bot-privacy/private-acl.ps1").digest("hex").slice(0, 12)}-private-acl.ps1`;
assert.equal(createHash("sha256").update(readFileSync(aclAsset)).digest("hex"), "47047e4d914122a3ada2313c457d13ae60f283333122b162e9e092f9be4894dd");
assert.ok(Array.isArray(external) && external.length > 0 && external.every((name) => typeof name === "string"));
const require = createRequire("/app/apps/api/dist/server.js");
const packages = external.filter(name => !isBuiltin(name));
for (const name of packages) await import(pathToFileURL(require.resolve(name)).href);
console.log(JSON.stringify({ scope: "final API runtime assets/exclusions and actual imports of every esbuild npm external", externals: external, imported: packages.length,
  aclScriptAsset: "current pinned bytes present; native Windows execution not established by Linux CI" }));
