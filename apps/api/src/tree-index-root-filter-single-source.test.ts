/**
 * apps/api/src/tree-index-root-filter-single-source.test.ts — ISS-063: the `tenant:<id>` node_id
 * convention that separates tenants in `tree_index` (the collection `scopedCollection` cannot
 * reach — see `treeIndexRootFilter`'s doc comment in `@lkb/index`) used to be hand-written in
 * THREE places: `indexing.ts`, and TWO call sites in `store.ts`. One of the `store.ts` copies had
 * already been caught wrong once, live, on 2026-09-04.
 *
 * `store.ts` calls `getDb()` directly with no injectable handle (unlike `indexSession`, which
 * gained one for ISS-056), so its two call sites cannot be pinned by exercising real behaviour
 * without a live Mongo. This is a source-text regression pin instead — deliberately narrow: it
 * proves the specific defect (a hand-rolled copy of the filter reappearing) can't reappear
 * silently, not that `tree_index` access is correct in general. `treeIndexRootFilter` itself is
 * exercised with real assertions in `packages/index/src/tree/tree.test.ts`.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

const HERE = fileURLToPath(new URL(".", import.meta.url));
const HAND_WRITTEN_FILTER = /node_id:\s*`tenant:\$\{/;

function read(relPath: string): string {
  return readFileSync(`${HERE}${relPath}`, "utf8");
}

test("indexing/session.ts imports treeIndexRootFilter and does not re-derive the tenant: prefix", () => {
  // Path updated when the indexing files were consolidated into apps/api/src/indexing/ (ISS-118).
  const src = read("indexing/session.ts");
  assert.match(src, /import\s*\{[^}]*\btreeIndexRootFilter\b[^}]*\}\s*from\s*"@lkb\/index"/, "must import the shared filter");
  assert.doesNotMatch(src, HAND_WRITTEN_FILTER, "must not hand-write the node_id shape again");
});

test("store.ts tree/graph loaders delegate to trusted readers, whose tree_index root reads use treeIndexRootFilter, not a hand-written copy", () => {
  // The build wave moved both loaders' tree_index reads out of store.ts into composition/integrations/trusted-readers.ts
  // (createMongoTreeStore -> trustedTreeReads, createMongoGraphReadDeps -> trustedGraphReads). The pin follows them.
  const store = read("store.ts");
  assert.doesNotMatch(store, HAND_WRITTEN_FILTER, "store.ts must not hand-write the node_id shape again");
  assert.match(store, /trustedTreeReads\(/, "createMongoTreeStore delegates to trustedTreeReads");
  assert.match(store, /trustedGraphReads\(/, "createMongoGraphReadDeps delegates to trustedGraphReads");
  const src = read("composition/integrations/trusted-readers.ts");
  assert.match(src, /import\s*\{[^}]*\btreeIndexRootFilter\b[^}]*\}\s*from\s*['"]@lkb\/index['"]/, "must import the shared filter");
  // This file also BUILDS a synthetic native-only root node ({ node_id: `tenant:${tenant}`, ... }); that is a node, not
  // a query, so the pin applies to every line that issues a find/findOne.
  for (const line of src.split("\n").filter(l => /\bfind(One)?\(/.test(l))) assert.doesNotMatch(line, HAND_WRITTEN_FILTER, "must not hand-write the node_id shape again");
  const usages = src.match(/treeIndexRootFilter\(/g) ?? [];
  assert.equal(usages.length, 2, "the tree loader's root read and currentTreeInput (shared by the tree and graph loaders) must both call it");
});
