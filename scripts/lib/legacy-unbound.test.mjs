import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, writeFileSync, rmSync } from "node:fs";
import { join, resolve, dirname } from "node:path";
import { tmpdir } from "node:os";
import { fileURLToPath } from "node:url";
import { spawnSync } from "node:child_process";
import { loadSessionArtifacts, assertDerivedArtifactsCurrent, bindDerivedArtifacts, requireLegacyUnboundDatabase, LEGACY_UNBOUND } from "./transcript-provenance.mjs";
const put = (dir, name, value) => writeFileSync(join(dir, name), JSON.stringify(value));
function fixture() {
  const dir = mkdtempSync(join(tmpdir(), "lkb-legacy-"));
  const turns = [{_id: "s1-t1", tenantId: "t", sessionId: "s1", speakerRef: "spk:0", tStart: 1, tEnd: 2, text: "A fact"}];
  const evidence = [{sessionId: "s1", turnId: "s1-t1"}];
  put(dir, "source.json", {_id: "src", tenantId: "t"}); put(dir, "session.json", {_id: "s1", tenantId: "t"});
  put(dir, "turns.json", turns); put(dir, "claims.json", [{_id: "c1", tenantId: "t", text: "A fact", evidence}]);
  put(dir, "session_page.json", {_id: "p1", sessionId: "s1", tenantId: "t", evidence});
  return dir;
}
const ok = {MONGODB_URL: "mongodb://remote.example:27017", MONGO_WORK_DB: "lkb_staging", LKB_ALLOW_STAGING: "lkb_staging"};
test("flag is required: without it a provenance-less session is refused (unchanged)", () => {
  const dir = fixture();
  try {
    assert.throws(() => loadSessionArtifacts(dir), /provenance absent/);
    assert.throws(() => loadSessionArtifacts(dir, {legacyUnbound: false}), /provenance absent/);
    assert.throws(() => assertDerivedArtifactsCurrent(dir), /provenance absent/);
  } finally { rmSync(dir, {recursive: true, force: true}); }
});
test("with the flag every doc (source, session, turn, claim, page) carries the legacy-unbound stamp", () => {
  const dir = fixture();
  try {
    const d = loadSessionArtifacts(dir, {legacyUnbound: true}).documents;
    for (const doc of [d.source, d.session, ...d.turns, ...d.claims, d.page]) assert.deepEqual(doc.provenance, {status: "legacy-unbound", reason: "D-149"});
    assert.deepEqual(LEGACY_UNBOUND, {status: "legacy-unbound", reason: "D-149"});
    assert.equal(d.turns[0]._id, "s1-t1");
  } finally { rmSync(dir, {recursive: true, force: true}); }
});
test("flag does not bypass a present proof: stale/bound sessions go through the normal check, unstamped", () => {
  const dir = fixture();
  try {
    bindDerivedArtifacts(dir);
    const d = loadSessionArtifacts(dir, {legacyUnbound: true}).documents;
    assert.equal(d.turns[0].provenance, undefined);
    put(dir, "claims.json", []); // proof now stale
    assert.throws(() => loadSessionArtifacts(dir, {legacyUnbound: true}), /stale or mismatched/);
  } finally { rmSync(dir, {recursive: true, force: true}); }
});
test("DB guard: accepts only lkb_staging with both opt-ins; refuses lkb, empty and other names", () => {
  assert.deepEqual(requireLegacyUnboundDatabase(ok), {url: ok.MONGODB_URL, dbName: "lkb_staging"});
  assert.deepEqual(requireLegacyUnboundDatabase({...ok, MONGODB_DB: "lkb_staging"}).dbName, "lkb_staging");
  for (const name of ["lkb", "", "  ", "LKB", "lkb_staging2", "lkb_work_x", "global_university_db"]) {
    assert.throws(() => requireLegacyUnboundDatabase({...ok, MONGO_WORK_DB: name}), /refused|required/, `work=${name}`);
    assert.throws(() => requireLegacyUnboundDatabase({...ok, MONGO_WORK_DB: name, LKB_ALLOW_STAGING: name}), /refused|required/, `both=${name}`);
  }
  assert.throws(() => requireLegacyUnboundDatabase({...ok, MONGODB_DB: "lkb"}), /refused/);
  assert.throws(() => requireLegacyUnboundDatabase({...ok, LKB_ALLOW_STAGING: ""}), /refused/);
  assert.throws(() => requireLegacyUnboundDatabase({...ok, LKB_ALLOW_STAGING: "lkb"}), /refused/);
  assert.throws(() => requireLegacyUnboundDatabase({...ok, MONGODB_URL: ""}), /refused/);
  // staging NOT enabled (env absent) => existing rules: lkb / empty still refused, other work dbs unchanged
  const { LKB_ALLOW_STAGING: _x, ...noOpt } = ok;
  assert.throws(() => requireLegacyUnboundDatabase({...noOpt, MONGO_WORK_DB: "lkb"}), /production writes refused/);
  assert.throws(() => requireLegacyUnboundDatabase({...noOpt, MONGO_WORK_DB: ""}), /production writes refused/);
});
test("seed-toc --dry-run: refuses without --legacy-unbound, succeeds with it (no Mongo)", () => {
  const root = resolve(dirname(fileURLToPath(import.meta.url)), "..", "..");
  const run = (...a) => spawnSync(process.execPath, ["--import", "tsx", "scripts/seed-toc.mjs", "--dry-run", ...a], {cwd: root, encoding: "utf8", env: {...process.env, MONGODB_URL: ""}});
  const a = run(); assert.notEqual(a.status, 0); assert.match(a.stderr, /provenance absent/);
  const one = ["--sessions", "2026-04-21-visa-blueprint-part2-italy-france-nz"];
  const a2 = spawnSync(process.execPath, ["--import", "tsx", "scripts/seed-toc.mjs", "--dry-run", ...one], {cwd: root, encoding: "utf8"}); assert.notEqual(a2.status, 0);
  const b = run("--legacy-unbound", ...one); assert.equal(b.status, 0, b.stderr); assert.match(b.stdout, /No Mongo connection attempted/);
});
