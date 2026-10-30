// T-028 / WhatsApp compose env (gate answer: "main .env mai hi rakho"). The api service forwards the 8 names from the
// main .env by value-less pass-through, so a name ABSENT from .env stays UNDEFINED in the container (never "").
// Compose renders an unresolved value-less entry as null and omits it from the container environment; an empty
// string would be a DEFINED value, which the API treats as misconfiguration.
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync, mkdtempSync, writeFileSync, copyFileSync, rmSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { tmpdir } from "node:os";
import { join } from "node:path";

const COMPOSE = new URL("../../docker-compose.yml", import.meta.url);
const T028 = ["LKB_HOSTING_STATE_DIR", "LKB_COUNSELLOR_STATE_DIR", "LKB_HOSTING_ENCRYPTION_KEY", "LKB_HOSTING_BOOTSTRAP_ADMINS", "LKB_HOSTING_WEBHOOK_ORIGINS"];
const WA = ["WHATSAPP_MONGO_URL", "WHATSAPP_MONGO_DB", "WHATSAPP_TENANT_OWNER_MAP"];
const ALL = [...T028, ...WA];

function apiBlock() {
  const text = readFileSync(COMPOSE, "utf8").replace(/\r\n/g, "\n"), start = text.indexOf("\n  api:\n");
  assert.ok(start >= 0, "api service present");
  const end = text.indexOf("\n  web:", start);
  return text.slice(start, end > 0 ? end : undefined);
}
// api service lines without comment-only lines.
const lines = () => apiBlock().split("\n").filter(l => !/^\s*#/.test(l));

test("C1/C2 static: the 8 names are value-less pass-through entries in the api environment map", () => {
  const env = lines(), at = env.findIndex(l => /^    environment:\s*$/.test(l));
  assert.ok(at >= 0, "environment map present");
  const tail = env.slice(at + 1), stop = tail.findIndex(l => /^    \S/.test(l)), map = stop < 0 ? tail : tail.slice(0, stop);
  for (const name of ALL) assert.equal(map.filter(l => new RegExp(`^      ${name}:\\s*$`).test(l)).length, 1, `${name} is a value-less map entry`);
});

test("C1/C2 static: none of the 8 names carries a value or ${VAR:-} default (that would define an empty string)", () => {
  for (const l of lines()) for (const name of ALL) if (l.includes(name)) assert.doesNotMatch(l, new RegExp(`${name}\\s*:\\s*\\S`), `${name} has a value: ${l}`);
});

test("C1 static: the api service has no env_file (the whole .env must not leak; a null entry would shadow .env.t028 anyway)", () => {
  const code = lines().join("\n");
  assert.doesNotMatch(code, /^    env_file:/m);
  assert.doesNotMatch(code, /\.env\.t028/);
});

const docker = spawnSync("docker", ["compose", "version"], { encoding: "utf8" }).status === 0;
// Host env minus every name under test, so only the fake .env decides (value-less pass-through also reads the host env).
const cleanEnv = () => Object.fromEntries(Object.entries(process.env).filter(([k]) => !ALL.includes(k)));
function config(envLines) {
  const dir = mkdtempSync(join(tmpdir(), "t028-compose-"));
  try {
    copyFileSync(COMPOSE, join(dir, "docker-compose.yml"));
    // Fake placeholder values only; the repo's real .env is never read.
    writeFileSync(join(dir, ".env"), "MONGODB_URL=mongodb://fake\nMONGODB_DB=fakedb\nOLLAMA_API_KEY=fake\n" + envLines);
    const r = spawnSync("docker", ["compose", "--project-directory", dir, "-f", join(dir, "docker-compose.yml"), "config", "--format", "json"], { encoding: "utf8", env: cleanEnv() });
    assert.equal(r.status, 0, r.stderr);
    return JSON.parse(r.stdout).services.api.environment;
  } finally { rmSync(dir, { recursive: true, force: true }); }
}
const setLines = names => names.map(n => `${n}=fake-${n}\n`).join("");

test("C1/C2 behaviour: all 8 set in .env -> forwarded verbatim", { skip: !docker }, () => {
  const env = config(setLines(ALL));
  for (const n of ALL) assert.equal(env[n], `fake-${n}`);
});

test("C1/C2 behaviour: none set in .env -> all 8 stay UNDEFINED (null/absent, never a string)", { skip: !docker }, () => {
  const env = config("");
  for (const n of ALL) assert.equal(env[n] ?? null, null, `${n} must be unset`);
});

test("C1/C2 behaviour: only the 5 T-028 names set -> WhatsApp names stay unset, and vice versa", { skip: !docker }, () => {
  const t = config(setLines(T028));
  for (const n of T028) assert.equal(t[n], `fake-${n}`);
  for (const n of WA) assert.equal(t[n] ?? null, null);
  const w = config(setLines(WA));
  for (const n of WA) assert.equal(w[n], `fake-${n}`);
  for (const n of T028) assert.equal(w[n] ?? null, null);
});
