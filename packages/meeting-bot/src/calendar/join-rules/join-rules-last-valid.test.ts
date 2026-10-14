import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, readFileSync, writeFileSync, rmSync, mkdirSync, unlinkSync } from "node:fs";
import path from "node:path";
import { tmpdir } from "node:os";
import { lastValidJoinRulesPath, loadLastValidJoinRules, saveLastValidJoinRules, loadPrimaryJoinRules, JOIN_RULES_SNAPSHOT_TTL_MS } from "./join-rules-last-valid.js";
import { emptyStoredJoinRules, saveJoinRules } from "./join-rules-store.js";

const NOW = 1_800_000_000_000, TENANT = "tenant-a";
function root(fn: (dir: string) => void) {
  const dir = mkdtempSync(path.join(tmpdir(), "lkb-rule-snapshot-"));
  saveJoinRules(dir, TENANT, full());
  try { fn(dir); } finally { rmSync(dir, { recursive: true, force: true }); }
}
const full = () => ({ ...emptyStoredJoinRules(), state: { approvedSenders: ["a@example.com"], approvedDomains: ["example.com"],
  optedOutEventIds: ["blocked"], optedOutMeetings: ["url:zoom:123456789"] } });

test("snapshot preserves complete validated rules/state and expires exactly at one hour without renewal", () => root(dir => {
  saveLastValidJoinRules(dir, TENANT, full(), NOW);
  const file = lastValidJoinRulesPath(dir, TENANT), before = readFileSync(file);
  assert.deepEqual(loadLastValidJoinRules(dir, TENANT, NOW).stored, full());
  assert.equal(loadLastValidJoinRules(dir, TENANT, NOW + JOIN_RULES_SNAPSHOT_TTL_MS - 1).expiresAt, NOW + JOIN_RULES_SNAPSHOT_TTL_MS);
  assert.deepEqual(readFileSync(file), before);
  assert.throws(() => loadLastValidJoinRules(dir, TENANT, NOW + JOIN_RULES_SNAPSHOT_TTL_MS), /expired/);
  assert.throws(() => loadLastValidJoinRules(dir, TENANT, NOW - 1), /invalid-age/);
}));
test("missing primary never becomes empty rules; actual stored empty rules remain valid", () => root(dir => {
  unlinkSync(path.join(dir, "join-rules", `${TENANT}.json`));
  assert.throws(() => loadPrimaryJoinRules(dir, TENANT), /primary-missing/);
  saveJoinRules(dir, TENANT, emptyStoredJoinRules());
  assert.deepEqual(loadPrimaryJoinRules(dir, TENANT), emptyStoredJoinRules());
}));
test("older validated state cannot replace a newer opt-out snapshot with renewed expiry", () => root(dir => {
  const old = loadPrimaryJoinRules(dir, TENANT);
  saveLastValidJoinRules(dir, TENANT, old, NOW);
  const newer = full(); newer.state.optedOutEventIds.push("new-veto"); saveJoinRules(dir, TENANT, newer);
  saveLastValidJoinRules(dir, TENANT, newer, NOW + 10);
  const file = lastValidJoinRulesPath(dir, TENANT), before = readFileSync(file);
  assert.throws(() => saveLastValidJoinRules(dir, TENANT, old, NOW + 20), /primary-changed/);
  assert.deepEqual(readFileSync(file), before);
  assert.deepEqual(loadLastValidJoinRules(dir, TENANT, NOW + 30).stored, newer);
}));
test("snapshot rejects tenant swaps, content and timestamp tampering, unknown envelope fields and invalid state", () => root(dir => {
  const file = lastValidJoinRulesPath(dir, TENANT);
  for (const edit of [
    (p: any) => { p.tenantId = "tenant-b"; },
    (p: any) => { p.validatedAt++; },
    (p: any) => { p.stored.state.optedOutEventIds = []; },
    (p: any) => { p.stored.state.approvedSenders = ["not an email"]; },
    (p: any) => { p.extra = true; },
    (p: any) => { p.stored.extra = true; },
  ]) {
    saveLastValidJoinRules(dir, TENANT, full(), NOW);
    const p = JSON.parse(readFileSync(file, "utf8")); edit(p); writeFileSync(file, JSON.stringify(p));
    assert.throws(() => loadLastValidJoinRules(dir, TENANT, NOW + 5));
  }
}));
test("missing, oversized and directory snapshots refuse; tenant path and invalid clocks refuse", () => root(dir => {
  assert.throws(() => loadLastValidJoinRules(dir, TENANT, NOW));
  saveLastValidJoinRules(dir, TENANT, full(), NOW);
  const file = lastValidJoinRulesPath(dir, TENANT);
  writeFileSync(file, " ".repeat(1024 * 1024 + 1));
  assert.throws(() => loadLastValidJoinRules(dir, TENANT, NOW), /too-large/);
  assert.throws(() => saveLastValidJoinRules(dir, TENANT, full(), NOW), /too-large/);
  unlinkSync(file); mkdirSync(file);
  assert.throws(() => loadLastValidJoinRules(dir, TENANT, NOW), /not-a-file/);
  assert.throws(() => saveLastValidJoinRules(dir, TENANT, full(), NOW), /not-a-file/);
  for (const clock of [NaN, Infinity, -1, 1.5]) assert.throws(() => saveLastValidJoinRules(dir, "other", full(), clock), /invalid-clock/);
  for (const tenant of ["../a", "TENANT", "nul", "a/b"]) assert.throws(() => lastValidJoinRulesPath(dir, tenant));
}));
