/**
 * packages/index/src/tree/tree-real-data.test.ts — T-004b contract C4: real-data integration
 * test. Loads T-002's actual migrated output (data/toc-migrated/*), no fixtures, no network,
 * builds a real tree with buildTree's default heuristic extractor, and checks:
 *   1. one session leaf per completed migrated output, with the 23 T-002 sessions as the
 *      floor. Capture-only source/validation metadata is reported separately; incomplete
 *      migrated outputs (including the ISS-294 webinar) must still fail,
 *   2. at least one topic node whose evidence.sessionRefs spans more than one session
 *      (proves cross-session topic grouping works on real content, not synthetic fixtures),
 *   3. every node in the tree validates against schema/tree_index.schema.json's shape.
 *
 * Runner: `node --test --import tsx` (same as tree.test.ts, no new framework).
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { readdirSync, readFileSync, mkdtempSync, mkdirSync, writeFileSync, rmSync } from "node:fs";
import { join, dirname } from "node:path";
import { tmpdir } from "node:os";
import { fileURLToPath } from "node:url";

import type { SessionPages, Sessions, TreeIndexNode } from "@lkb/core";
import { buildTree } from "./build.js";
import { treeSearch } from "./search.js";

const HERE = dirname(fileURLToPath(import.meta.url));
const DATA_DIR = join(HERE, "..", "..", "..", "..", "data", "toc-migrated");

const CAPTURE_ONLY_REPRODUCTIONS = [
  "synthetic-controlled-1790797565149", "synthetic-controlled-1790798758779",
  "synthetic-controlled-1790799479728",
];

/** record-finalize.ts with transcribe=false emits these two files, not index inputs. */
function isCaptureOnly(dir: string, sessionId: string): boolean {
  const entries = readdirSync(dir, { withFileTypes: true });
  if (entries.length !== 2 || entries.some((entry) => !entry.isFile()) ||
    !["source.json", "validation.json"].every((name) => entries.some((entry) => entry.name === name))) return false;
  const source = JSON.parse(readFileSync(join(dir, "source.json"), "utf8"));
  const validation = JSON.parse(readFileSync(join(dir, "validation.json"), "utf8"));
  return source?.kind === "recording" && source.captureMode === "silent" &&
    source._id === `${sessionId}-src` && typeof source.tenantId === "string" && source.tenantId.trim().length > 0 &&
    typeof source.title === "string" && source.title.trim().length > 0 &&
    typeof source.hash === "string" && /^[a-f0-9]{64}$/.test(source.hash) &&
    typeof source.path === "string" && source.path.length > 0 &&
    typeof source.audioPath === "string" && source.audioPath.length > 0 &&
    typeof source.createdAt === "string" && Number.isFinite(Date.parse(source.createdAt)) &&
    new Date(source.createdAt).toISOString() === source.createdAt &&
    source.consent?.given === true && typeof source.consent.recordedBy === "string" && source.consent.recordedBy.trim().length > 0 &&
    source.audioLevel?.silent === false && Number.isFinite(source.audioLevel.maxDb) && Number.isFinite(source.audioLevel.meanDb) &&
    validation?.status === "passed" && validation.transcriptValidated === false &&
    Number.isFinite(validation.durationSec) && validation.durationSec > 0;
}

function loadRealData(dataDir = DATA_DIR): {
  sessions: Sessions[]; pages: SessionPages[]; missing: string[]; captureOnly: string[]; completed: string[];
} {
  const sessions: Sessions[] = [];
  const pages: SessionPages[] = [];
  const missing: string[] = [];
  const captureOnly: string[] = [];
  const completed: string[] = [];
  for (const dirName of readdirSync(dataDir, { withFileTypes: true })) {
    if (dirName.isSymbolicLink()) { missing.push(`${dirName.name}: redirected corpus entry`); continue; }
    if (!dirName.isDirectory()) continue;
    const dir = join(dataDir, dirName.name);
    try {
      if (isCaptureOnly(dir, dirName.name)) { captureOnly.push(dirName.name); continue; }
      const session = JSON.parse(readFileSync(join(dir, "session.json"), "utf8")) as Sessions;
      const page = JSON.parse(readFileSync(join(dir, "session_page.json"), "utf8")) as SessionPages;
      assert.ok(session && typeof session._id === "string" && session._id.length > 0, "session identity required");
      assert.ok(typeof session.tenantId === "string" && session.tenantId.trim().length > 0, "session tenant identity required");
      assert.ok(typeof page?.tenantId === "string" && page.tenantId.trim().length > 0, "session page tenant identity required");
      assert.equal(page?.sessionId, session._id, "session page must belong to its session");
      assert.equal(page?.tenantId, session.tenantId, "session page must belong to its tenant");
      sessions.push(session); pages.push(page); completed.push(dirName.name);
    } catch (e) {
      const err = e as NodeJS.ErrnoException;
      missing.push(`${dirName.name}: ${err.code ?? err.message}`);
    }
  }
  return { sessions, pages, missing, captureOnly, completed };
}

function assertReadyCorpus(data: ReturnType<typeof loadRealData>, minimum = 23): void {
  assert.deepEqual(data.missing, [], `every migrated output must have session.json + session_page.json; missing: ${data.missing.join(", ")}`);
  assert.ok(data.completed.length >= minimum, `expected at least ${minimum} completed real sessions, found ${data.completed.length}`);
  assert.equal(data.sessions.length, data.completed.length);
  assert.equal(data.pages.length, data.completed.length);
}

/**
 * Small, dependency-free structural check against schema/tree_index.schema.json's shape
 * (level enum, required fields, recursive children) — mirrors schema/validate.py's intent
 * without adding a JS JSON-Schema validator dependency (none is present in the workspace; see
 * contract C4). Not a general-purpose validator, just this one recursive node shape.
 */
const LEVELS = new Set(["tenant", "year", "month", "session", "topic", "org"]);

function assertValidNode(n: TreeIndexNode, path: string): void {
  assert.equal(typeof n.node_id, "string", `${path}: node_id must be a string`);
  assert.ok(n.node_id.length > 0, `${path}: node_id must be non-empty`);
  assert.equal(typeof n.title, "string", `${path}: title must be a string`);
  assert.ok(n.title.length > 0, `${path}: title must be non-empty`);
  assert.ok(LEVELS.has(n.level), `${path}: level "${n.level}" not in schema enum`);
  assert.equal(typeof n.summary, "string", `${path}: summary must be a string`);
  assert.ok(Array.isArray(n.children), `${path}: children must be an array`);
  if (n.evidence !== undefined) {
    assert.equal(typeof n.evidence, "object", `${path}: evidence must be an object`);
  }
  n.children.forEach((child, i) => assertValidNode(child, `${path}/children[${i}]`));
}

test("real data: completed migrated sessions, cross-session topic, schema-valid shape and search consumption", () => {
  const data = loadRealData();
  assertReadyCorpus(data);
  const { sessions, pages, completed } = data;

  const roots = buildTree(sessions, pages);
  assert.ok("toc" in roots, "expected a single tenant root for 'toc'");
  const root = roots["toc"]!;

  assertValidNode(root, "root");

  const allSessionLevelNodes: TreeIndexNode[] = [];
  const allTopicLevelNodes: TreeIndexNode[] = [];
  const walk = (n: TreeIndexNode): void => {
    if (n.level === "session") allSessionLevelNodes.push(n);
    if (n.level === "topic") allTopicLevelNodes.push(n);
    for (const c of n.children) walk(c);
  };
  walk(root);

  assert.equal(allSessionLevelNodes.length, completed.length, "expected one session leaf per migrated session");
  const retrieved = treeSearch(root, allSessionLevelNodes.map((n) => n.node_id));
  assert.deepEqual(retrieved, allSessionLevelNodes, "tree search must consume every real session leaf");

  const crossSessionTopics = allTopicLevelNodes.filter((t) => {
    const refs = (t.evidence as { sessionRefs?: string[] } | undefined)?.sessionRefs ?? [];
    return refs.length > 1;
  });
  assert.ok(crossSessionTopics.length > 0,
    "expected at least one topic node whose evidence.sessionRefs spans more than one session");
});

test("recorded intake-only reproductions have no derived files and are classified without fabricated outputs", () => {
  const data = loadRealData();
  for (const id of CAPTURE_ONLY_REPRODUCTIONS) {
    for (const file of ["session.json", "session_page.json"]) {
      assert.throws(() => readFileSync(join(DATA_DIR, id, file)), { code: "ENOENT" }, `${id}/${file}`);
    }
    assert.ok(data.captureOnly.includes(id), `${id} must be identified as capture-only`);
    assert.ok(!data.completed.includes(id), `${id} must not count as completed`);
  }
});

function withCorpus(run: (root: string, put: (id: string, files: Record<string, string>) => void) => void): void {
  const root = mkdtempSync(join(tmpdir(), "lkb-tree-corpus-"));
  try {
    run(root, (id, files) => {
      const dir = join(root, id); mkdirSync(dir);
      for (const [name, bytes] of Object.entries(files)) writeFileSync(join(dir, name), bytes);
    });
  } finally { rmSync(root, { recursive: true, force: true }); }
}

const REAL_COMPLETED_ID = "2026-09-24-zoho-next-european-study-destinations";
function realFiles(id: string, names: string[]): Record<string, string> {
  return Object.fromEntries(names.map((name) => [name, readFileSync(join(DATA_DIR, id, name), "utf8")]));
}

test("complete output is included even in a synthetic-controlled named folder", () => withCorpus((root, put) => {
  put("synthetic-controlled-complete", realFiles(REAL_COMPLETED_ID,
    ["source.json", "session.json", "session_page.json", "turns.json", "claims.json"]));
  const data = loadRealData(root); assertReadyCorpus(data, 1);
  assert.deepEqual(data.captureOnly, []); assert.deepEqual(data.completed, ["synthetic-controlled-complete"]);
  assert.equal(data.sessions[0]!._id, REAL_COMPLETED_ID);
  assert.equal(treeSearch(buildTree(data.sessions, data.pages)["toc"]!,
    [`toc/year:2026/month:09/session:${REAL_COMPLETED_ID}`]).length, 1);
}));

test("capture-only corpus cannot satisfy the completed real-session floor", () => withCorpus((root, put) => {
  for (const id of CAPTURE_ONLY_REPRODUCTIONS) put(id, realFiles(id, ["source.json", "validation.json"]));
  const data = loadRealData(root);
  assert.deepEqual(data.missing, []); assert.equal(data.captureOnly.length, 3);
  assert.throws(() => assertReadyCorpus(data), /found 0/);
}));

test("partial and corrupt migrated outputs remain failures, including ISS-294's missing-output seam", () => {
  const complete = realFiles(REAL_COMPLETED_ID, ["source.json", "session.json", "session_page.json", "turns.json", "claims.json"]);
  const cases: Record<string, string>[] = [
    { "source.json": complete["source.json"]! },
    { "session.json": complete["session.json"]! },
    { "session_page.json": complete["session_page.json"]! },
    { "session.json": complete["session.json"]!, "session_page.json": "{" },
    { "session.json": "{", "session_page.json": complete["session_page.json"]! },
    { "session.json": complete["session.json"]!, "session_page.json": "null" },
    { "session.json": complete["session.json"]!, "session_page.json": JSON.stringify({ sessionId: "wrong", tenantId: "toc" }) },
    { "session.json": complete["session.json"]!, "session_page.json": JSON.stringify({ sessionId: REAL_COMPLETED_ID, tenantId: "wrong" }) },
  ];
  for (const files of cases) withCorpus((root, put) => {
    put(REAL_COMPLETED_ID, files); const data = loadRealData(root);
    assert.equal(data.missing.length, 1); assert.deepEqual(data.captureOnly, []);
    assert.deepEqual(data.sessions, []); assert.deepEqual(data.pages, []);
    assert.throws(() => assertReadyCorpus(data, 1), /every migrated output/);
  });
});

test("recorded checker reproduction: both processed tenant identities missing remains malformed", () => {
  const actual = realFiles(REAL_COMPLETED_ID, ["session.json", "session_page.json"]);
  for (const value of [undefined, null, "", " "]) withCorpus((root, put) => {
    const session = JSON.parse(actual["session.json"]!), page = JSON.parse(actual["session_page.json"]!);
    if (value === undefined) { delete session.tenantId; delete page.tenantId; }
    else { session.tenantId = value; page.tenantId = value; }
    put("candidate", { "session.json": JSON.stringify(session), "session_page.json": JSON.stringify(page) });
    const data = loadRealData(root);
    assert.equal(data.missing.length, 1); assert.deepEqual(data.completed, []);
    assert.deepEqual(data.sessions, []); assert.deepEqual(data.pages, []);
    assert.throws(() => assertReadyCorpus(data, 1), /every migrated output/);
  });
});

test("malformed or partly processed capture metadata never receives the intake-only exemption", () => {
  const id = CAPTURE_ONLY_REPRODUCTIONS[0]!;
  const intake = realFiles(id, ["source.json", "validation.json"]);
  const validation = JSON.parse(intake["validation.json"]!);
  const source = JSON.parse(intake["source.json"]!);
  const cases = [
    { ...intake, "turns.json": "[]" }, { ...intake, "session.json": "{}" },
    { ...intake, "claims.json": "[]" }, { ...intake, "session_page.json": "{}" },
    { ...intake, "validation.json": "{" }, { ...intake, "source.json": "{" },
    { ...intake, "validation.json": "null" }, { ...intake, "source.json": "{}" },
    ...[{ transcriptValidated: true }, { transcriptValidated: 0 }, { status: "failed" }, { durationSec: 0 }]
      .map((change) => ({ ...intake, "validation.json": JSON.stringify({ ...validation, ...change }) })),
    ...[{ captureMode: "provided" }, { hash: "" }, { consent: null }, { createdAt: "invalid" },
      { kind: "document" }, { tenantId: " " }, { _id: "wrong-src" }, { title: "" }, { audioLevel: { silent: true } }]
      .map((change) => ({ ...intake, "source.json": JSON.stringify({ ...source, ...change }) })),
  ];
  for (const files of cases) withCorpus((root, put) => {
    put(id, files); const data = loadRealData(root);
    assert.equal(data.missing.length, 1); assert.deepEqual(data.captureOnly, []);
    assert.throws(() => assertReadyCorpus(data, 1), /every migrated output/);
  });
  withCorpus((root, put) => {
    put(id, intake); mkdirSync(join(root, id, "unfinished-stage"));
    const data = loadRealData(root);
    assert.equal(data.missing.length, 1); assert.deepEqual(data.captureOnly, []);
    assert.throws(() => assertReadyCorpus(data, 1), /every migrated output/);
  });
});
