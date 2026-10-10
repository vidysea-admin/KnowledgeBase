/** packages/meeting-bot/src/calendar/join-rules-store.test.ts — T-037 `t037-join-rules-persistence`. Temp dirs only. */
import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, mkdirSync, rmSync, writeFileSync, readFileSync, readdirSync, existsSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import {
  loadJoinRules, saveJoinRules, recordTenantApproval, recordTenantOptOut, joinRulesFilePath, JoinRulesStoreError,
  JOIN_RULES_MAX_BYTES, type StoredJoinRules,
} from "./join-rules-store.js";
import { evaluateJoinRules } from "./join-rules.js";

function withDir(fn: (dir: string) => void): void {
  const dir = mkdtempSync(path.join(tmpdir(), "join-rules-store-"));
  try { fn(dir); } finally { rmSync(dir, { recursive: true, force: true }); }
}
const sample = (): StoredJoinRules => ({
  ruleSet: { version: 1, ownDomains: ["corp.com"], rules: [{ id: "r1", effect: "allow", match: { domain: "trusted.org", subdomains: false } }] },
  state: { approvedSenders: ["a@b.com"], approvedDomains: [], optedOutEventIds: ["ev1"] },
});
const refused = (fn: () => unknown, code: string) =>
  assert.throws(fn, (e: unknown) => e instanceof JoinRulesStoreError && e.code === code, `expected ${code}`);
const raw = (dir: string, tenant: string, text: string) => {
  const f = joinRulesFilePath(dir, tenant); mkdirSync(path.dirname(f), { recursive: true }); writeFileSync(f, text);
};

test("round-trip returns the saved rules and state", () => withDir(dir => {
  saveJoinRules(dir, "acme", sample());
  assert.deepEqual(loadJoinRules(dir, "acme"), sample());
}));

test("missing file loads as no rules: nothing auto-joins", () => withDir(dir => {
  const l = loadJoinRules(dir, "acme");
  assert.deepEqual(l.ruleSet.rules, []);
  const d = evaluateJoinRules({ id: "e", organizer: "x@trusted.org", meetingUrl: "https://meet.google.com/abc-defg-hij" }, l.ruleSet, l.state);
  assert.notEqual(d.action, "join");
}));

test("corrupt JSON is refused and the file is not overwritten by a mutate helper", () => withDir(dir => {
  raw(dir, "acme", "{not json");
  refused(() => loadJoinRules(dir, "acme"), "corrupt");
  refused(() => recordTenantApproval(dir, "acme", { kind: "sender", value: "a@b.com" }), "corrupt");
  refused(() => recordTenantOptOut(dir, "acme", "ev"), "corrupt");
  assert.equal(readFileSync(joinRulesFilePath(dir, "acme"), "utf8"), "{not json");
}));

test("schema-invalid content is refused", () => withDir(dir => {
  const good = { version: 1, tenantId: "acme", ...sample() };
  const bads: unknown[] = [
    [], null, "x", { ...good, version: 2 }, { ...good, extra: 1 },
    { ...good, ruleSet: { ...good.ruleSet, rules: [{ id: "r", effect: "allow", match: { scope: "Internal" } }] } },
    { ...good, ruleSet: { ...good.ruleSet, rules: [{ id: "r", effect: "ALLOW", match: { domain: "x.com" } }] } },
    { ...good, state: { approvedSenders: "a@b.com", approvedDomains: [], optedOutEventIds: [] } },
    { ...good, state: undefined }, { ...good, ruleSet: undefined },
  ];
  for (const b of bads) { raw(dir, "acme", JSON.stringify(b)); refused(() => loadJoinRules(dir, "acme"), "invalid"); }
}));

test("oversized file is refused before parsing", () => withDir(dir => {
  raw(dir, "acme", " ".repeat(JOIN_RULES_MAX_BYTES + 1));
  refused(() => loadJoinRules(dir, "acme"), "too-large");
  const big = sample(); big.state = { ...big.state, optedOutEventIds: Array.from({ length: 40000 }, (_, i) => "event-id-padding-" + i) };
  refused(() => saveJoinRules(dir, "other", big), "too-large");
  assert.equal(existsSync(joinRulesFilePath(dir, "other")), false);
}));

test("embedded tenant mismatch is refused", () => withDir(dir => {
  saveJoinRules(dir, "acme", sample());
  raw(dir, "beta", readFileSync(joinRulesFilePath(dir, "acme"), "utf8"));
  refused(() => loadJoinRules(dir, "beta"), "tenant-mismatch");
  refused(() => recordTenantOptOut(dir, "beta", "ev"), "tenant-mismatch");
}));

test("tenant ids that could escape or alias are refused", () => withDir(dir => {
  const shapes = ["..", ".", "../x", "..\\x", "a/b", "a\\b", "/etc/passwd", "C:\\x", "C:x", "\\\\?\\C:\\x", "\\\\.\\pipe\\x", "//server/share",
    "", " ", "a b", "a.", "a:b", "x\0y", "CON", "con", "nul", "aux", "prn", "com1", "lpt9", "Acme", "ACME", "acme.json", "a..b", "-x",
    "x".repeat(65), "%2e%2e", "caf\u00e9", 5 as any, null as any];
  for (const t of shapes) {
    refused(() => joinRulesFilePath(dir, t), "bad-tenant");
    refused(() => loadJoinRules(dir, t), "bad-tenant");
    refused(() => saveJoinRules(dir, t, sample()), "bad-tenant");
  }
  assert.deepEqual(readdirSync(dir), []);
  assert.equal(path.dirname(joinRulesFilePath(dir, "ok-1_x")), path.resolve(dir, "join-rules"));
}));

test("two tenants are isolated", () => withDir(dir => {
  const b = sample(); b.state = { approvedSenders: [], approvedDomains: ["other.org"], optedOutEventIds: [] };
  saveJoinRules(dir, "acme", sample()); saveJoinRules(dir, "beta", b);
  recordTenantApproval(dir, "acme", { kind: "sender", value: "NEW@x.com" });
  assert.deepEqual(loadJoinRules(dir, "acme").state.approvedSenders, ["a@b.com", "new@x.com"]);
  assert.deepEqual(loadJoinRules(dir, "beta"), b);
  assert.deepEqual(loadJoinRules(dir, "gamma").ruleSet.rules, []);
}));

test("approval and opt-out persist, are idempotent, and invalid input leaves the file untouched", () => withDir(dir => {
  saveJoinRules(dir, "acme", sample());
  recordTenantApproval(dir, "acme", { kind: "domain", value: "Partner.com" });
  recordTenantApproval(dir, "acme", { kind: "domain", value: "partner.com" });
  recordTenantOptOut(dir, "acme", "ev2"); recordTenantOptOut(dir, "acme", "ev2");
  const s = loadJoinRules(dir, "acme").state;
  assert.deepEqual(s.approvedDomains, ["partner.com"]); assert.deepEqual(s.optedOutEventIds, ["ev1", "ev2"]);
  const before = readFileSync(joinRulesFilePath(dir, "acme"), "utf8");
  refused(() => recordTenantApproval(dir, "acme", { kind: "sender", value: "not-an-email" }), "invalid");
  refused(() => recordTenantOptOut(dir, "acme", ""), "invalid");
  assert.equal(readFileSync(joinRulesFilePath(dir, "acme"), "utf8"), before);
}));

test("invalid save is refused and leaves the previous file intact", () => withDir(dir => {
  saveJoinRules(dir, "acme", sample());
  const before = readFileSync(joinRulesFilePath(dir, "acme"), "utf8");
  const bad = sample(); (bad.ruleSet.rules[0] as any).effect = "maybe";
  refused(() => saveJoinRules(dir, "acme", bad), "invalid");
  refused(() => saveJoinRules(dir, "acme", null as any), "invalid");
  assert.equal(readFileSync(joinRulesFilePath(dir, "acme"), "utf8"), before);
}));

test("a failed rename leaves the previous file intact and no temp file behind", () => withDir(dir => {
  saveJoinRules(dir, "acme", sample());
  const before = readFileSync(joinRulesFilePath(dir, "acme"), "utf8");
  const next = sample(); next.state = { approvedSenders: ["z@z.com"], approvedDomains: [], optedOutEventIds: [] };
  refused(() => saveJoinRules(dir, "acme", next, { rename: () => { throw new Error("disk full"); } }), "write-failed");
  assert.equal(readFileSync(joinRulesFilePath(dir, "acme"), "utf8"), before);
  assert.deepEqual(readdirSync(path.dirname(joinRulesFilePath(dir, "acme"))), ["acme.json"]);
}));

test("a directory where the file should be is refused, not treated as empty", () => withDir(dir => {
  mkdirSync(joinRulesFilePath(dir, "acme"), { recursive: true });
  refused(() => loadJoinRules(dir, "acme"), "not-a-file");
  refused(() => saveJoinRules(dir, "acme", sample()), "not-a-file");
}));
