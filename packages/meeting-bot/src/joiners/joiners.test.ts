/**
 * packages/meeting-bot/src/joiners/joiners.test.ts — T-024 C6. Each stub joiner delegates
 * join/stop to its injected transport/launcher/capture-fn — no real network/browser/audio call.
 */
import { test } from "node:test";
import assert from "node:assert/strict";

import { createVexaJoiner } from "./vexa-joiner.js";
import { createBrowserJoiner, registerInBrowser, type RegistrationInput } from "./browser-joiner.js";
import { resolve } from "node:path";
import { mkdtempSync } from "node:fs";
import { execFileSync } from "node:child_process";
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
test("registration actual child timeout performs exact owned-profile cleanup", async () => {
  const profileDir = mkdtempSync(resolve("data/registration-timeout-"));
  const python = resolve(".venv/Scripts/python.exe");
  const result = await registerInBrowser({...registration, url: "http://127.0.0.1:1/register",
    allowedHosts: ["127.0.0.1"], localFixture: true}, {
    python, joinScript: resolve("packages/meeting-bot/py/sb_join.py"), profileDir,
    browserExecutable: "cft", timeoutMs: 1000,
  });
  assert.deepEqual(result, {status: "uncertain", reason: "browser_timeout"});
  const probe = "import psutil,sys; target='--user-data-dir='+sys.argv[1]; "
    + "print(any(target in p.info.get('cmdline',[]) for p in psutil.process_iter(['cmdline']) if p.info.get('cmdline')))";
  assert.equal(execFileSync(python, ["-c", probe, profileDir], {timeout: 15000, encoding: "utf8"}).trim(), "False");
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
