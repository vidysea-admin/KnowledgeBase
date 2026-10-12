import { test } from "node:test";
import assert from "node:assert/strict";
import { DEFAULT_SCOPES, scopesFromArgv } from "./mint-scopes.mjs";

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
