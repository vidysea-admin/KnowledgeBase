import assert from "node:assert/strict";
import test from "node:test";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { readFileSync } from "node:fs";
import path from "node:path";
import { ingestSamplerClock, type SamplerClockBinding } from "./sampler-clock.js";
import { makeTileRegistryFixture } from "../../../../../qa/evidence/t042-trusted-registry/fixture.js";

const expected: SamplerClockBinding = { captureGeneration: "11111111-1111-4111-8111-111111111111", hostId: "fixture-host",
  samplerInstance: "fixture-sampler", samplerZeroEpochSec: { earliest: 1000, latest: 1000 }, driftBoundSec: 0, uncertaintySec: 0 };
const witness = (t: number) => ({ epochBeforeSec: 1000 + t, epochAfterSec: 1000 + t, monotonicSec: 100 + t });
function sample() {
  return [{ kind: "meta", source: "meet-dom", startedAtEpoch: 1000,
    samplerClock: { version: 1, ...expected, ...witness(0) } },
  ...[0, 4, 8].map(t => ({ source: "meet-dom", tSec: t, displayName: "Synthetic Person", samplerClock: witness(t) }))];
}
const jsonl = (rows: unknown[]) => rows.map(r => JSON.stringify(r)).join("\n") + "\n";

test("complete measured sampler stream strips private clock witnesses from derived rows", () => {
  const rows = ingestSamplerClock(jsonl(sample()), expected);
  assert.ok(rows); assert.equal(rows.length, 4);
  assert.ok(rows.every(r => r.samplerClock === undefined));
  assert.deepEqual(rows[2], { source: "meet-dom", tSec: 4, displayName: "Synthetic Person" });
});

test("old streams, substituted identity, missing witnesses and late invalidations fail closed", () => {
  for (const key of ["captureGeneration", "hostId", "samplerInstance"] as const) {
    assert.equal(ingestSamplerClock(jsonl(sample()), { ...expected, [key]: "foreign" }), null);
  }
  const missing = sample() as Record<string, unknown>[];
  delete missing[0]!.samplerClock;
  assert.equal(ingestSamplerClock(jsonl(missing), expected), null);
  assert.equal(ingestSamplerClock(jsonl([...sample(), { kind: "sampler-clock-invalid", source: "meet-dom" }]), expected), null);
  const noWitness = sample() as Record<string, unknown>[];
  delete noWitness[2]!.samplerClock;
  assert.equal(ingestSamplerClock(jsonl(noWitness), expected), null);
});

test("wall jumps, backwards monotonic, forged elapsed time and excessive uncertainty refuse", () => {
  for (const edit of [
    { epochBeforeSec: 900, epochAfterSec: 900 }, { epochBeforeSec: 1104, epochAfterSec: 1104 },
    { monotonicSec: 99 }, { monotonicSec: 104.01 }, { epochAfterSec: 1005 },
  ]) {
    const rows = sample(); rows[2]!.samplerClock = { ...rows[2]!.samplerClock, ...edit };
    assert.equal(ingestSamplerClock(jsonl(rows), expected), null);
  }
  const bounded = sample(); bounded[2]!.samplerClock = { ...bounded[2]!.samplerClock, epochBeforeSec: 1004.1, epochAfterSec: 1004.1 };
  assert.ok(ingestSamplerClock(jsonl(bounded), { ...expected, driftBoundSec: 0.11 }));
});

test("actual Python producer bytes enter strict ingestion, without a browser or asserted decoded authority", () => {
  const python = process.env.LKB_SAMPLER_TEST_PYTHON;
  assert.ok(python && path.isAbsolute(python), "broker must preflight and supply absolute LKB_SAMPLER_TEST_PYTHON");
  const pyRoot = fileURLToPath(new URL("../../../py/", import.meta.url));
  const script = [
    "import sys,tempfile,pathlib,json", "sys.path.insert(0,sys.argv[1])", "from sb_join_tiles import TileSampler",
    "with tempfile.TemporaryDirectory() as d:", " p=pathlib.Path(d)/'tiles.jsonl'", " now=[1000.,100.]",
    " s=TileSampler(str(p),lambda:now[0],lambda:'',lambda:now[1],sys.argv[2])", " s.tick()",
    " now[:]=[1004.,104.]", " s.tick()", " print(p.read_text(encoding='utf-8'),end='')",
  ].join("\n");
  const child = spawnSync(python, ["-B", "-c", script, pyRoot, expected.captureGeneration],
    { encoding: "utf8", timeout: 5000, maxBuffer: 65536, windowsHide: true });
  assert.equal(child.error, undefined); assert.equal(child.status, 0, child.stderr);
  const meta = JSON.parse(child.stdout.split("\n")[0]!);
  assert.match(meta.samplerClock.hostId, /^[a-f0-9]{64}$/u);
  assert.match(meta.samplerClock.samplerInstance, /^[a-f0-9-]{36}$/u);
  const accepted = ingestSamplerClock(child.stdout, { ...expected, hostId: meta.samplerClock.hostId,
    samplerInstance: meta.samplerClock.samplerInstance });
  assert.ok(accepted); assert.equal(accepted[2]!.tSec, 4);
});

test("registry consumes witnesses before privacy output; missing witness cannot reach suggestion input", async () => {
  const f = makeTileRegistryFixture([{ tStart: 70, tEnd: 90 }]);
  try {
    const result = await f.registry().resolve(f.tenant, f.session, { enabled: true });
    assert.equal(result.status, "ready");
    if (result.status !== "ready") return;
    const derived = await result.readCapture(f.tenant, f.session, result.context);
    assert.ok(!derived.jsonl.includes("samplerClock") && !derived.jsonl.includes("Private Voice"));
    const raw = readFileSync(path.join(f.root, f.binding.sidecarPath), "utf8").trim().split("\n").map(l => JSON.parse(l));
    delete raw[0].samplerClock; f.sidecar(jsonl(raw));
    assert.equal((await f.registry().resolve(f.tenant, f.session, { enabled: true })).status, "unavailable");
  } finally { f.cleanup(); }
});
