/**
 * apps/api/src/search-prefilter-single-source.test.ts — ISS-074.
 *
 * `search-prefilter-coverage` closed the DERIVATION class: change how `buildTurnPrefilter`
 * derives tokens and `search-prefilter.test.ts` reddens. It did not close the BYPASS class — a
 * checker deleted the delegation in `search-store.ts`, hand-rolled a defective filter inline, and
 * typecheck plus 96/96 plus 59/59 all stayed green. The extraction had MOVED the untested
 * boundary rather than removed it.
 *
 * `createMongoSearchDeps` calls `turnsColl()` with no injectable handle, so its query cannot be
 * pinned by exercising real behaviour without a live Mongo. This is the same source-text
 * regression pin `tree-index-root-filter-single-source.test.ts` already uses for the same reason,
 * and it carries the same deliberate narrowness: it proves the specific defect (the shipping file
 * building its own filter again) cannot reappear silently. It does not prove the query is correct
 * in general — `buildTurnPrefilter` itself is exercised with real assertions in
 * `search-prefilter.test.ts`, and end-to-end parity is verified live against real Mongo per unit.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

const HERE = fileURLToPath(new URL(".", import.meta.url));
const src = readFileSync(`${HERE}search-store.ts`, "utf8");

test("search-store.ts delegates to buildTurnPrefilter instead of building a filter itself", () => {
  assert.match(
    src, /import\s*\{[^}]*\bbuildTurnPrefilter\b[^}]*\}\s*from\s*"\.\/search-prefilter\.js"/,
    "must import the shared pre-filter builder",
  );
  const calls = src.match(/buildTurnPrefilter\(/g) ?? [];
  assert.equal(calls.length, 1, "createMongoSearchDeps must call it exactly once — 0 means the delegation was bypassed");
});

test("search-store.ts contains no hand-rolled Mongo filter — the exact bypass ISS-074 recorded", () => {
  // The checker's demonstration was to delete the delegation and inline `$or`/`$regex` here.
  // Either token appearing in this file means the filter is being constructed outside the one
  // place its superset invariant is enforced.
  assert.doesNotMatch(src, /\$regex/, "must not hand-roll a regex filter — build it in search-prefilter.ts");
  assert.doesNotMatch(src, /\$or\s*:/, "must not hand-roll an $or filter — build it in search-prefilter.ts");
});

test("search-store.ts does not re-derive query tokens for the Mongo turn search", () => {
  // Importing the tokenizer directly is the subtler bypass: it looks correct (it IS the scorer's
  // tokenizer) while stepping around the one function whose tests pin the superset property.
  // Scoped to createMongoSearchDeps: the native-passage search (createNativeSearch) builds no Mongo filter and
  // scores resolver-authorized passages in memory, so its tokenizer use cannot bypass the turn pre-filter.
  const at = src.indexOf("export function createMongoSearchDeps");
  assert.ok(at >= 0, "createMongoSearchDeps is still in search-store.ts");
  assert.doesNotMatch(
    src.slice(at), /\blexicalQueryTokens\b\s*\(/,
    "token derivation belongs to buildTurnPrefilter, where search-prefilter.test.ts can fail on it",
  );
});
