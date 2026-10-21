import { test } from "node:test";
import assert from "node:assert/strict";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { DEFAULT_SCOPES, ALL_SCOPES, ADMIN_KEY_WARNING, wantsAllScopes, scopesFromArgv } from "./mint-scopes.mjs";

const PRE = ["ask", "compete", "sources", "sessions", "search", "citations", "webhooks", "gaps", "graph", "calendar", "gmail", "whatsapp", "keys", "ingest"];

test("default list is byte-identical and holds no write scope", () => {
  assert.deepEqual(DEFAULT_SCOPES, PRE);
  assert.deepEqual(scopesFromArgv([]), PRE);
  assert.deepEqual(scopesFromArgv(["--tenant", "toc", "--label", "x"]), PRE);
});
test("each opt-in", () => {
  assert.deepEqual(scopesFromArgv(["--with-scope", "join-rules"]), [...PRE, "join-rules"]);
  assert.deepEqual(scopesFromArgv(["--with-scope", "send-now"]), [...PRE, "send-now"]);
});
test("both together: repeated flag, comma list, either order", () => {
  assert.deepEqual(scopesFromArgv(["--with-scope", "send-now", "--with-scope", "join-rules"]), [...PRE, "send-now", "join-rules"]);
  assert.deepEqual(scopesFromArgv(["--with-scope", "join-rules,send-now"]), [...PRE, "join-rules", "send-now"]);
});
test("duplicates collapse", () => {
  assert.deepEqual(scopesFromArgv(["--with-scope", "join-rules", "--with-scope", "join-rules,join-rules"]), [...PRE, "join-rules"]);
});
test("unknown / typo / non-write / missing value throw", () => {
  for (const bad of [["--with-scope"], ["--with-scope", "--tenant"], ["--with-scope", "join-rule"], ["--with-scope", "Join-Rules"], ["--with-scope", "keys"], ["--with-scope", "admin"], ["--with-scope", "join-rules,admin"], ["--with-scope", ""]]) {
    assert.throws(() => scopesFromArgv(bad), /with-scope/, bad.join(" "));
  }
});

test("--scopes adds known scopes on top of the defaults; dedupes; mixes with --with-scope", () => {
  assert.deepEqual(scopesFromArgv(["--scopes", "answer-policy:read,jobs"]), [...PRE, "answer-policy:read", "jobs"]);
  assert.deepEqual(scopesFromArgv(["--scopes", "hosting", "--scopes", "hosting,ask", "--with-scope", "join-rules"]), [...PRE, "join-rules", "hosting"]);
  assert.deepEqual(scopesFromArgv(["--scopes", "automation:read,automation:write,automation:operate,registration:approve,send-now"]).slice(PRE.length), ["automation:read", "automation:write", "automation:operate", "registration:approve", "send-now"]);
});
test("--scopes rejects unknown / typo / empty / missing values", () => {
  for (const bad of [["--scopes"], ["--scopes", "--tenant"], ["--scopes", ""], ["--scopes", "answer-policy"], ["--scopes", "Hosting"], ["--scopes", "jobs,admin"], ["--scopes", "automation:*"]]) {
    assert.throws(() => scopesFromArgv(bad), /--scopes/, bad.join(" "));
  }
});
test("--all-scopes mints every canonical scope once, and flags the warning", () => {
  const got = scopesFromArgv(["--all-scopes"]);
  assert.deepEqual(got, ALL_SCOPES);
  assert.equal(new Set(got).size, got.length);
  for (const s of [...PRE, "send-now", "join-rules", "answer-policy:read", "answer-policy:write", "automation:read", "automation:write", "automation:operate", "hosting", "jobs"]) assert.ok(got.includes(s), s);
  assert.equal(wantsAllScopes(["--all-scopes"]), true);
  assert.equal(wantsAllScopes([]), false);
  assert.equal(wantsAllScopes(["--scopes", "jobs"]), false);
  assert.match(ADMIN_KEY_WARNING, /WARNING.*ADMIN/);
});
test("--all-scopes still validates other flags", () => {
  assert.throws(() => scopesFromArgv(["--all-scopes", "--scopes", "nope"]), /--scopes/);
});
test("canonical list covers every requireScope literal in apps/api/src (drift guard)", () => {
  const root = fileURLToPath(new URL("../../apps/api/src", import.meta.url));
  const found = new Set();
  (function walk(d) {
    for (const n of readdirSync(d)) {
      const p = join(d, n);
      if (statSync(p).isDirectory()) walk(p);
      else if (/\.ts$/.test(n) && !/\.test\.ts$/.test(n)) for (const m of readFileSync(p, "utf8").matchAll(/requireScope\(\s*["']([^"']+)["']\s*\)/g)) found.add(m[1]);
    }
  })(root);
  assert.ok(found.size >= 20, `scanned ${found.size}`);
  for (const s of found) assert.ok(ALL_SCOPES.includes(s), `route scope '${s}' is not issuable by mint-key`);
});
