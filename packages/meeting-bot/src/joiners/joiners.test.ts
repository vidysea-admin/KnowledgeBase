/**
 * packages/meeting-bot/src/joiners/joiners.test.ts — T-024 C6. Each stub joiner delegates
 * join/stop to its injected transport/launcher/capture-fn — no real network/browser/audio call.
 */
import { test } from "node:test";
import assert from "node:assert/strict";

import { createVexaJoiner } from "./vexa-joiner.js";
import { createBrowserJoiner, registerInBrowser, type RegistrationInput } from "./browser-joiner.js";
import { resolve, dirname, join } from "node:path";
import { tmpdir } from "node:os";
import { fileURLToPath } from "node:url";
import { mkdtempSync, rmSync, writeFileSync, readFileSync, existsSync } from "node:fs";
import { execFileSync, spawnSync } from "node:child_process";
import { createSystemAudioJoiner } from "./system-audio-joiner.js";

test("vexa-joiner: join posts to {baseUrl}/bots via the injected transport and returns sessionHandle", async () => {
  const calls: unknown[] = [];
  const joiner = createVexaJoiner({
    baseUrl: "https://vexa.example",
    transport: async (req) => {
      calls.push(req);
      return { status: 200, body: { sessionHandle: "sess-1" } };
    },
  });

  const result = await joiner.join("https://meet.google.com/abc", { tenantId: "t1" });
  assert.equal(result.sessionHandle, "sess-1");
  assert.equal((calls[0] as { url: string }).url, "https://vexa.example/bots");

  await joiner.stop("sess-1");
  assert.equal((calls[1] as { url: string }).url, "https://vexa.example/bots/sess-1/stop");
});

const registration: RegistrationInput = {
  url: "https://organizer.example/register", allowedHosts: ["organizer.example"],
  operator: {firstName: "Fixture", lastName: "Operator", email: "fixture@example.test"},
  form: {mode: "native-html", formSelector: "#registration", submitSelector: "button[type=submit]",
    fields: {firstName: "#first", lastName: "#last", email: "#email"}},
};
test("registration uses bounded explicit instructions on stdin, no operator or URL in argv", async () => {
  let calls = 0;
  const result = await registerInBrowser(registration, {
    python: resolve(".venv/Scripts/python.exe"), joinScript: resolve("packages/meeting-bot/py/sb_join.py"),
    profileDir: resolve("data/fixture-profile"), execute: async (args, payload, budget) => {
      calls++; assert.ok(args.includes("--registration-stdin"));
      assert.ok(!args.includes(registration.url)); assert.ok(!args.includes(registration.operator.email));
      assert.deepEqual(JSON.parse(payload), registration); assert.equal(budget, 120000);
      return {status: "submitted", reason: "awaiting_confirmation"};
    },
  });
  assert.equal(calls, 1); assert.equal(result.status, "submitted");
});
test("registration refuses invalid hosts/operator/selectors before execution", async () => {
  let calls = 0;
  const cfg = {python: resolve("python.exe"), joinScript: resolve("sb_join.py"), profileDir: resolve("profile"),
    execute: async () => {calls++; return {status: "submitted" as const, reason: "awaiting_confirmation"};}};
  for (const patch of [
    {url: "https://other.example/register"}, {url: "https://u:p@organizer.example/register"},
    {url: "http://organizer.example/register"}, {allowedHosts: ["*.example"]},
    {operator: {...registration.operator, firstName: ""}},
    {operator: {...registration.operator, organization: "Invented"}},
    {form: {...registration.form, fields: {...registration.form.fields, lastName: "#first"}}},
  ]) await assert.rejects(registerInBrowser({...registration, ...patch}, cfg));
  assert.equal(calls, 0);
});
test("registration child lifecycle requires clean unique result and verified cleanup on failure", async (t) => {
  const submitted = {event: "registration-result", status: "submitted", reason: "awaiting_confirmation"};
  const cases = [
    {name: "clean", events: [submitted], expected: {status: "submitted", reason: "awaiting_confirmation"}},
    {name: "pre-submit-clean", events: [{event: "registration-result", status: "action_required", reason: "field_mismatch", submissionDisposition: "not-attempted"}],
      expected: {status: "action_required", reason: "field_mismatch", submissionDisposition: "not-attempted"}},
    {name: "pre-submit-dirty", events: [{event: "registration-result", status: "action_required", reason: "field_mismatch", submissionDisposition: "not-attempted"}], exit: 7, reason: "browser_failure"},
    {name: "receipt-on-submitted", events: [{...submitted, submissionDisposition: "not-attempted"}], reason: "invalid_result"},
    {name: "malformed-receipt", events: [{event: "registration-result", status: "action_required", reason: "field_mismatch", submissionDisposition: "invented"}], reason: "invalid_result"},
    {name: "nonzero", events: [submitted], exit: 7, reason: "browser_failure"},
    {name: "signal", events: [submitted], signal: true, reason: "browser_failure"},
    {name: "fatal", events: [submitted, {event: "fatal", error: "private diagnostic"}], reason: "browser_failure"},
    {name: "duplicate", events: [submitted, submitted], reason: "invalid_result"},
    {name: "malformed", events: [submitted, {event: "registration-result", status: "invented"}], reason: "invalid_result"},
    {name: "missing", events: [{event: "driver-ready"}], reason: "missing_result"},
    {name: "cleanup-fails", events: [submitted], exit: 7, cleanupExit: 9, reason: "owned_cleanup_failed"},
  ];
  for (const fixture of cases) await t.test(fixture.name, async () => {
    const profileDir = mkdtempSync(join(tmpdir(), "registration-lifecycle-"));
    const script = join(profileDir, "fixture.mjs"), cleanup = join(profileDir, "cleanup.json");
    try {
      writeFileSync(script, `import {writeFileSync} from 'node:fs';
if (process.argv.includes('--cleanup-only')) {
  writeFileSync(${JSON.stringify(cleanup)}, JSON.stringify(process.argv.slice(2)));
  process.exit(${fixture.cleanupExit ?? 0});
}
process.stdin.resume();
process.stdin.on('end', () => {
  const output = ${JSON.stringify(fixture.events.map(event => JSON.stringify(event)).join("\n") + "\n")};
  process.stdout.write(output, () => ${fixture.signal ? "process.kill(process.pid, 'SIGTERM')" : `process.exit(${fixture.exit ?? 0})`});
});`);
      const result = await registerInBrowser(registration, {python: process.execPath, joinScript: script, profileDir, timeoutMs: 30000});
      assert.deepEqual(result, fixture.expected ?? {status: "uncertain", reason: fixture.reason});
      assert.equal(existsSync(cleanup), !fixture.expected);
      if (existsSync(cleanup)) {
        assert.deepEqual(JSON.parse(readFileSync(cleanup, "utf8")), ["about:blank", "--profile", profileDir,
          "--title", "LKB registration", "--stop-file", `${profileDir}/registration-stop`, "--cleanup-only"]);
      }
    } finally { rmSync(profileDir, {recursive: true, force: true}); }
  });
});

test("registration actual child timeout performs exact owned-profile cleanup", async (t) => {
  const pkgDir = resolve(dirname(fileURLToPath(import.meta.url)), "../.."), repoRoot = resolve(pkgDir, "../..");
  const configured = process.env.D2_FIXTURE_PYTHON || resolve(repoRoot, process.platform === "win32" ? ".venv/Scripts/python.exe" : ".venv/bin/python");
  const deps = spawnSync(configured, ["-c", "import psutil, seleniumbase, sys; print(sys.executable)"], {timeout: 30000, encoding: "utf8"});
  if (deps.status !== 0) { t.skip(`python ${configured} cannot import psutil+seleniumbase (the real bot browser needs the py/requirements.txt venv)`); return; }
  const python = String(deps.stdout).trim(); // registerInBrowser requires an absolute interpreter path
  const profileDir = mkdtempSync(join(tmpdir(), "registration-timeout-"));
  try {
    const result = await registerInBrowser({...registration, url: "http://127.0.0.1:1/register",
      allowedHosts: ["127.0.0.1"], localFixture: true}, {
      python, joinScript: resolve(pkgDir, "py/sb_join.py"), profileDir,
      browserExecutable: "cft", timeoutMs: 1000,
    });
    assert.deepEqual(result, {status: "uncertain", reason: "browser_timeout"});
    const probe = "import psutil,sys; target='--user-data-dir='+sys.argv[1]; "
      + "print(any(target in p.info.get('cmdline',[]) for p in psutil.process_iter(['cmdline']) if p.info.get('cmdline')))";
    assert.equal(execFileSync(python, ["-c", probe, profileDir], {timeout: 15000, encoding: "utf8"}).trim(), "False");
  } finally { rmSync(profileDir, {recursive: true, force: true}); }
});

test("vexa-joiner: throws when the transport reports a non-2xx status", async () => {
  const joiner = createVexaJoiner({
    baseUrl: "https://vexa.example",
    transport: async () => ({ status: 500, body: {} }),
  });
  await assert.rejects(() => joiner.join("https://meet.google.com/abc", { tenantId: "t1" }));
});

test("browser-joiner: join delegates to the injected launcher", async () => {
  let calledWith: unknown;
  const joiner = createBrowserJoiner({
    launch: async (url, opts) => {
      calledWith = { url, opts };
      return { sessionHandle: "browser-sess", mediaStream: undefined };
    },
  });
  const result = await joiner.join("https://acme.webex.com/j/1", { tenantId: "t1" });
  assert.equal(result.sessionHandle, "browser-sess");
  assert.deepEqual(calledWith, { url: "https://acme.webex.com/j/1", opts: { tenantId: "t1" } });
});

test("system-audio-joiner: join/stop delegate to the injected capture functions", async () => {
  const calls = { started: 0, stopped: [] as string[] };
  const joiner = createSystemAudioJoiner({
    startCapture: async () => {
      calls.started++;
      return { sessionHandle: "sys-sess", mediaStream: undefined };
    },
    stopCapture: async (handle) => {
      calls.stopped.push(handle);
    },
  });
  const result = await joiner.join("https://example.com/other", { tenantId: "t1" });
  assert.equal(result.sessionHandle, "sys-sess");
  assert.equal(calls.started, 1);

  await joiner.stop("sys-sess");
  assert.deepEqual(calls.stopped, ["sys-sess"]);
});
