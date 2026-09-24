/**
 * packages/index/src/tree/tree-real-data.test.ts — T-004b contract C4: real-data integration
 * test. Loads T-002's actual migrated output (data/toc-migrated/*), no fixtures, no network,
 * builds a real tree with buildTree's default heuristic extractor, and checks:
 *   1. one session leaf per data/toc-migrated/<slug>/ directory — the 23 T-002 TOC sessions
 *      plus any session added since (the 2026-09-24 bot-captured webinar, ISS-294), so the count
 *      is derived from the directory listing, with 23 as the floor,
 *   2. at least one topic node whose evidence.sessionRefs spans more than one session
 *      (proves cross-session topic grouping works on real content, not synthetic fixtures),
 *   3. every node in the tree validates against schema/tree_index.schema.json's shape.
 *
 * Runner: `node --test --import tsx` (same as tree.test.ts, no new framework).
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { readdirSync, readFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

import type { SessionPages, Sessions, TreeIndexNode } from "@lkb/core";
import { buildTree } from "./build.js";

const HERE = dirname(fileURLToPath(import.meta.url));
const DATA_DIR = join(HERE, "..", "..", "..", "..", "data", "toc-migrated");

function loadRealData(): { sessions: Sessions[]; pages: SessionPages[] } {
  const sessions: Sessions[] = [];
  const pages: SessionPages[] = [];
  for (const dirName of readdirSync(DATA_DIR, { withFileTypes: true })) {
    if (!dirName.isDirectory()) continue;
    const dir = join(DATA_DIR, dirName.name);
    sessions.push(JSON.parse(readFileSync(join(dir, "session.json"), "utf8")) as Sessions);
    pages.push(JSON.parse(readFileSync(join(dir, "session_page.json"), "utf8")) as SessionPages);
  }
  return { sessions, pages };
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

test("real T-002 data: 23 session leaves, cross-session topic, schema-valid shape", () => {
  const { sessions, pages } = loadRealData();
  const dirCount = readdirSync(DATA_DIR, { withFileTypes: true }).filter((d) => d.isDirectory()).length;
  assert.ok(dirCount >= 23, `expected at least the 23 real T-002 sessions, found ${dirCount} dirs`);
  assert.equal(sessions.length, dirCount, "expected one session.json per migrated session dir");
  assert.equal(pages.length, dirCount, "expected one session_page.json alongside each");

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

  assert.equal(allSessionLevelNodes.length, dirCount, "expected one session leaf per migrated session");

  const crossSessionTopics = allTopicLevelNodes.filter((t) => {
    const refs = (t.evidence as { sessionRefs?: string[] } | undefined)?.sessionRefs ?? [];
    return refs.length > 1;
  });
  assert.ok(crossSessionTopics.length > 0,
    "expected at least one topic node whose evidence.sessionRefs spans more than one session");
});
