/**
 * scripts/lib/id-divergence.test.mjs — ISS-132.
 *
 * The point of these is that the derivation is driven by INJECTED git output, so they prove the
 * logic rather than re-asserting today's repository. The last check is the exception and is
 * deliberate: it runs against the real repo and asserts the twelve rows the hand-written table got
 * wrong, so a regression in either the module or the ledger is visible.
 */
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { canonicalTitle, deriveDivergence, checkerCommits, unionRows, deriveAllDivergence, parseGateMapping } from "./id-divergence.mjs";

const row = (id, title) => JSON.stringify({ id, title });
/** A fake `git show` driven by a {ref: [rows]} map. */
function fakeExec(refs) {
  return (_cmd, args) => {
    const ref = args[args.length - 1].split(":")[0];
    if (!(ref in refs)) throw new Error(`fatal: no such ref ${ref}`);
    return refs[ref].join("\n") + "\n";
  };
}

test("the [RENUMBERED ...] provenance suffix is not part of the finding", () => {
  assert.equal(canonicalTitle("A finding [RENUMBERED from ISS-100 on merge: ...]"), "A finding");
  assert.equal(canonicalTitle("A finding"), "A finding");
});

test("an id that still carries its own finding is NOT reported as divergent", () => {
  const union = new Map([["ISS-1", { id: "ISS-1", title: "same finding" }]]);
  const d = deriveDivergence(".", ["sha"], {
    union,
    exec: fakeExec({ sha: [row("ISS-1", "same finding")], "sha^": [] }),
  });
  assert.deepEqual(d, []);
});

test("a finding carried on master by a DIFFERENT id is reported as displaced", () => {
  const union = new Map([["ISS-9", { id: "ISS-9", title: "the finding" }]]);
  const d = deriveDivergence(".", ["sha"], {
    union,
    exec: fakeExec({ sha: [row("ISS-1", "the finding")], "sha^": [] }),
  });
  assert.deepEqual(d.map((r) => [r.filed, r.carriedBy, r.state]), [["ISS-1", ["ISS-9"], "displaced"]]);
});

test("a row already present in the parent was not allocated by that commit", () => {
  const union = new Map([["ISS-9", { id: "ISS-9", title: "the finding" }]]);
  const d = deriveDivergence(".", ["sha"], {
    union,
    exec: fakeExec({ sha: [row("ISS-1", "the finding")], "sha^": [row("ISS-1", "the finding")] }),
  });
  assert.deepEqual(d, [], "an inherited row is not this commit's allocation");
});

test("TWO master ids carrying one finding is `duplicated`, not `displaced`", () => {
  // This is the ISS-100 case: the collision remedy filed ISS-101, and the other loop later
  // re-filed the same finding as ISS-111. Both survive; the record must say so.
  const union = new Map([
    ["ISS-101", { id: "ISS-101", title: "the finding [RENUMBERED from ISS-100 on merge: ...]" }],
    ["ISS-111", { id: "ISS-111", title: "the finding" }],
  ]);
  const d = deriveDivergence(".", ["sha"], {
    union,
    exec: fakeExec({ sha: [row("ISS-100", "the finding")], "sha^": [] }),
  });
  assert.equal(d[0]?.state, "duplicated");
  assert.deepEqual(d[0]?.carriedBy, ["ISS-101", "ISS-111"]);
});

test("a finding that reached no master row at all is `absent`, never silently dropped", () => {
  const d = deriveDivergence(".", ["sha"], {
    union: new Map(),
    exec: fakeExec({ sha: [row("ISS-1", "vanished")], "sha^": [] }),
  });
  assert.equal(d[0]?.state, "absent");
});

test("a ref git cannot read yields nothing rather than throwing", () => {
  const d = deriveDivergence(".", ["missing"], { union: new Map(), exec: fakeExec({}) });
  assert.deepEqual(d, []);
});

test("the union spans the canonical ledger AND every lane shard (D-019)", () => {
  const ids = [...unionRows(".").values()];
  assert.ok(ids.length > 100, "the real ledger is non-trivial");
  assert.ok(
    ids.some((r) => r.ledger !== "issues.jsonl"),
    "at least one lane shard must be in the union -- if this fails, D-019's shards stopped being read",
  );
});

test("the REAL speaker-lane divergence is the twelve rows the gate's table got wrong", () => {
  const d = deriveDivergence(".", checkerCommits(".", "speaker"));
  const got = d.map((r) => `${r.filed}->${r.carriedBy.join("/")}`).sort();
  assert.deepEqual(got, [
    "ISS-091->ISS-102", "ISS-092->ISS-103", "ISS-093->ISS-104", "ISS-094->ISS-105",
    "ISS-095->ISS-106", "ISS-096->ISS-107", "ISS-097->ISS-108", "ISS-098->ISS-109",
    "ISS-099->ISS-110", "ISS-100->ISS-101/ISS-111", "ISS-102->ISS-114", "ISS-103->ISS-115",
  ]);
});

// ---- ISS-145: the gate file's hand-pasted table cannot drift from the derivation -------------------
let speakerOnce; // the git walk is the slow part; derive the speaker lane once for both tests below
const speakerDerived = () => (speakerOnce ??= deriveDivergence(".", checkerCommits(".", "speaker")));
const shape = (rows) => rows.map((r) => `${r.filed}->${[...r.carriedBy].sort().join("/")}:${r.state}`).sort();

test("ISS-145: the mapping table in qa/gates/ledger-id-divergence.md equals deriveDivergence('speaker')", () => {
  const gate = parseGateMapping(readFileSync("qa/gates/ledger-id-divergence.md", "utf8"));
  assert.equal(gate.length, 12, "the gate file must carry the twelve-row table");
  assert.deepEqual(shape(gate), shape(speakerDerived()));
});

test("ISS-145: a corrupted copy of the gate table IS caught by the comparison", () => {
  const good = readFileSync("qa/gates/ledger-id-divergence.md", "utf8");
  const corrupted = good.replace("| ISS-093 | **ISS-104** | displaced |", "| ISS-093 | **ISS-111** | displaced |");
  assert.notEqual(corrupted, good, "the corruption must actually change the text");
  const derived = shape(speakerDerived());
  assert.notDeepEqual(shape(parseGateMapping(corrupted)), derived);
  assert.deepEqual(parseGateMapping("no table here"), [], "a missing table parses to nothing, which the comparison rejects");
});

// ---- ISS-146: a lane-agnostic sweep, so divergence outside the speaker lane is not invisible ------
test("ISS-146: deriveAllDivergence reports divergence from every lane's checker commits, not one pattern's", () => {
  const union = new Map([
    ["ISS-9", { id: "ISS-9", title: "golden finding" }],
    ["ISS-8", { id: "ISS-8", title: "writers finding" }],
  ]);
  const refs = {
    aaa: [row("ISS-1", "golden finding")], "aaa^": [],
    bbb: [row("ISS-2", "writers finding")], "bbb^": [],
  };
  const patterns = [];
  const exec = (cmd, args) => {
    if (args.includes("log")) {
      patterns.push(args.find((a) => a.startsWith("--grep=")));
      return "aaa checker: b-golden-set - PASS\nbbb checker: c-unrun-writers - PASS\nccc maker: not a checker commit\n";
    }
    return fakeExec(refs)(cmd, args);
  };
  const all = deriveAllDivergence(".", { union, exec });
  assert.deepEqual(patterns, ["--grep="], "no lane pattern is applied");
  assert.deepEqual(all.map((r) => `${r.filed}->${r.carriedBy}`).sort(), ["ISS-1->ISS-9", "ISS-2->ISS-8"]);
});

test("ISS-146: on the REAL repo the all-lane sweep contains the twelve speaker rows plus rows from other lanes", () => {
  const speaker = shape(speakerDerived());
  const all = deriveAllDivergence(".");
  const allShape = shape(all);
  for (const s of speaker) assert.ok(allShape.includes(s), `all-lane sweep lost speaker row ${s}`);
  assert.ok(all.length > speaker.length, "divergence exists outside the speaker lane (e.g. ISS-308->ISS-311); the sweep must surface it");
});
