import test from "node:test";
import assert from "node:assert/strict";
import type { AutoRecordCandidateInput } from "../auto-join.js";
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { applyOnairWatchDefault, loadOnairConfig, onairMailEnabled, withOnairMailCandidates, withOnairMailFromEnv } from "./onair-mail-loader.js";
import { createOnairGmailLoader } from "./onair-gmail-fetch.js";
import * as f from "./onair-mail.fixtures.js";

const baseRow = (over: Partial<AutoRecordCandidateInput> = {}): AutoRecordCandidateInput =>
  ({ id: "g1", title: "Existing", senderEmail: "x@example.invalid", senderDomain: "example.invalid", status: "approved", ...over });
const mk = (env: NodeJS.ProcessEnv, base: AutoRecordCandidateInput[], extra: Partial<Parameters<typeof withOnairMailCandidates>[1]> = {}) => {
  const logs: string[] = [];
  const baseLoader = async () => base;
  const loader = withOnairMailCandidates(baseLoader, { env, log: m => logs.push(m), resolve: f.fakeResolver(),
    loadMails: async () => [f.registered, f.reminder, f.onDemand], ...extra });
  return { logs, baseLoader, loader };
};

test("flag: DEFAULT ON with no env; 0/false/off turns it off; 1 forces on; unknown values fall back to the default", async () => {
  assert.equal(onairMailEnabled({}), true);
  for (const env of [{ LKB_ONAIR_MAIL: "0" }, { LKB_ONAIR_MAIL: "false" }, { LKB_ONAIR_MAIL: "off" }, { LKB_ONAIR_MAIL: " 0 " }]) {
    const m = mk(env, [baseRow()]);
    assert.equal(m.loader, m.baseLoader);
    assert.equal(onairMailEnabled(env), false);
    assert.equal(withOnairMailFromEnv(m.baseLoader, env, "C:/nope", () => {}), m.baseLoader);
  }
  for (const env of [{ LKB_ONAIR_MAIL: "1" }, { LKB_ONAIR_MAIL: "true" }, {}, { LKB_ONAIR_MAIL: "" }, { LKB_ONAIR_MAIL: "maybe" }]) {
    const m = mk(env, [baseRow()]);
    assert.notEqual(m.loader, m.baseLoader, JSON.stringify(env));
    assert.equal(onairMailEnabled(env), true);
  }
  assert.equal(onairMailEnabled({ LKB_ONAIR_MAIL: "1" }, { mail: false }), true, "env 1 beats a config that says off");
  assert.equal(onairMailEnabled({ LKB_ONAIR_MAIL: "0" }, { mail: true }), false, "env 0 beats a config that says on");
  assert.equal(onairMailEnabled({}, { mail: false }), false, "config off with no env");
  assert.equal(onairMailEnabled({ LKB_ONAIR_MAIL: "maybe" }, { mail: false }), false, "garbage env falls back to the config");
});

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../../../..");
const withConfig = (json: string | undefined, run: (root: string) => void) => {
  const root = mkdtempSync(path.join(tmpdir(), "onair-default-on-"));
  try {
    if (json !== undefined) { mkdirSync(path.join(root, "config")); writeFileSync(path.join(root, "config", "autojoin.json"), json); }
    run(root);
  } finally { rmSync(root, { recursive: true, force: true }); }
};

test("config: the committed config/autojoin.json has onair.mail and onair.watch on", () => {
  assert.deepEqual(loadOnairConfig(repoRoot, {}), { mail: true, watch: true });
  assert.deepEqual(JSON.parse(readFileSync(path.join(repoRoot, "config", "autojoin.json"), "utf8")).onair, { mail: true, watch: true });
});

test("config: file keys are read, missing or unreadable files and keys default ON, env overrides each key", () => {
  withConfig(undefined, root => assert.deepEqual(loadOnairConfig(root, {}), { mail: true, watch: true }));
  withConfig("{not json", root => {
    const warns: string[] = [];
    assert.deepEqual(loadOnairConfig(root, {}, m => warns.push(m)), { mail: true, watch: true });
    assert.equal(warns.length, 1);
  });
  withConfig('{"onair":{"mail":false}}', root => {
    assert.deepEqual(loadOnairConfig(root, {}), { mail: false, watch: true });
    assert.deepEqual(loadOnairConfig(root, { LKB_ONAIR_MAIL: "1" }), { mail: true, watch: true });
  });
  withConfig('{"onair":{"mail":true,"watch":false}}', root => {
    assert.deepEqual(loadOnairConfig(root, {}), { mail: true, watch: false });
    assert.deepEqual(loadOnairConfig(root, { LKB_ONAIR_WATCH: "1", LKB_ONAIR_MAIL: "0" }), { mail: false, watch: true });
  });
  withConfig('{"onair":"nope"}', root => assert.deepEqual(loadOnairConfig(root, {}), { mail: true, watch: true }));
  withConfig(undefined, root => {
    const alt = path.join(root, "alt.json");
    writeFileSync(alt, '{"onair":{"mail":false,"watch":false}}');
    assert.deepEqual(loadOnairConfig(root, { LKB_AUTOJOIN_CONFIG: alt }), { mail: false, watch: false });
  });
});

test("config drives the production wiring: file off returns the base loader, file on or no file does not", () => {
  const base = async () => [] as AutoRecordCandidateInput[];
  withConfig('{"onair":{"mail":false}}', root => assert.equal(withOnairMailFromEnv(base, {}, root, () => {}), base));
  withConfig('{"onair":{"mail":false}}', root => assert.notEqual(withOnairMailFromEnv(base, { LKB_ONAIR_MAIL: "1" }, root, () => {}), base));
  withConfig(undefined, root => assert.notEqual(withOnairMailFromEnv(base, {}, root, () => {}), base));
});

test("watch default: unset env takes the config value ('1' when on), an explicit env wins", () => {
  withConfig('{"onair":{"watch":true}}', root => {
    const env: NodeJS.ProcessEnv = {};
    applyOnairWatchDefault(env, root);
    assert.deepEqual(env, { LKB_ONAIR_WATCH: "1" });
    const off: NodeJS.ProcessEnv = { LKB_ONAIR_WATCH: "0" };
    applyOnairWatchDefault(off, root);
    assert.deepEqual(off, { LKB_ONAIR_WATCH: "0" });
    const on: NodeJS.ProcessEnv = { LKB_ONAIR_WATCH: "true" };
    applyOnairWatchDefault(on, root);
    assert.deepEqual(on, { LKB_ONAIR_WATCH: "1" }, "sb_join_onair.py and onair-watch.ts accept only the exact 1");
  });
  withConfig('{"onair":{"watch":false}}', root => {
    const env: NodeJS.ProcessEnv = {};
    applyOnairWatchDefault(env, root);
    assert.deepEqual(env, {});
    const on: NodeJS.ProcessEnv = { LKB_ONAIR_WATCH: "1" };
    applyOnairWatchDefault(on, root);
    assert.deepEqual(on, { LKB_ONAIR_WATCH: "1" });
  });
  withConfig(undefined, root => {
    const env: NodeJS.ProcessEnv = {};
    applyOnairWatchDefault(env, root);
    assert.deepEqual(env, { LKB_ONAIR_WATCH: "1" });
  });
});

test("production wiring applies the watch default to the env it was given", () => {
  withConfig('{"onair":{"mail":false,"watch":true}}', root => {
    const env: NodeJS.ProcessEnv = {};
    withOnairMailFromEnv(async () => [], env, root, () => {});
    assert.equal(env.LKB_ONAIR_WATCH, "1");
  });
});

test("enabled: base candidates stay and one OnAir candidate per event is appended", async () => {
  const m = mk({ LKB_ONAIR_MAIL: "1" }, [baseRow()]);
  const rows = await m.loader();
  assert.deepEqual(rows.map(r => r.id), ["g1", `onair:${f.SLUG_A}`, `onair:${f.SLUG_B}`]);
  assert.match(m.logs[0]!, /3 mails, 2 candidates added/);
});

test("enabled: an event the base list already carries is not added twice", async () => {
  const m = mk({ LKB_ONAIR_MAIL: "1" }, [baseRow({ id: "g2", meetingUrl: `${f.URL_A}?mkt_tok=FAKE` })]);
  assert.deepEqual((await m.loader()).map(r => r.id), ["g2", `onair:${f.SLUG_B}`]);
});

test("enabled: a failing mail source never loses the base candidates", async () => {
  const m = mk({ LKB_ONAIR_MAIL: "1" }, [baseRow()], { loadMails: async () => { throw new Error("gws down"); } });
  assert.deepEqual((await m.loader()).map(r => r.id), ["g1"]);
  assert.match(m.logs[0]!, /skipped this tick \(gws down\)/);
});

test("enabled: a failing calendar loader only costs the calendar window", async () => {
  const m = mk({ LKB_ONAIR_MAIL: "1" }, [], { loadCalendarEvents: async () => { throw new Error("cal"); } });
  assert.equal((await m.loader()).length, 2);
});

const b64 = (s: string) => Buffer.from(s, "utf8").toString("base64url");
const fakeGws = (calls: string[][], authResults: string | string[], fromHeaders: string[] = ["Google <a@google.com>"]) => async (args: string[]) => {
  calls.push(args);
  if (args[3] === "list") return JSON.stringify({ messages: [{ id: "m1", threadId: "t1" }, { id: "../bad" }] });
  return JSON.stringify({ id: "m1", threadId: "t1", internalDate: String(Date.parse("2026-10-14T08:00:00Z")), payload: { mimeType: "multipart/alternative",
    headers: [{ name: "Subject", value: "You're registered: X" }, ...fromHeaders.map(value => ({ name: "From", value })), ...[authResults].flat().map(value => ({ name: "Authentication-Results", value }))],
    parts: [{ mimeType: "text/plain", body: { data: b64("plain body") } }, { mimeType: "text/html", body: { data: b64("<b>html body</b>") } }] } });
};

test("gmail fetch: read-only list/get, parses headers, bodies and authentication", async () => {
  const calls: string[][] = [];
  const mails = await createOnairGmailLoader(fakeGws(calls, "mx.google.com; dkim=pass header.i=@google.com; dmarc=pass (p=REJECT) header.from=google.com"))();
  assert.equal(mails.length, 1);
  assert.deepEqual([mails[0]!.messageId, mails[0]!.subject, mails[0]!.from, mails[0]!.date, mails[0]!.text, mails[0]!.html, mails[0]!.senderAuthenticated],
    ["m1", "You're registered: X", "Google <a@google.com>", "2026-10-14T08:00:00.000Z", "plain body", "<b>html body</b>", true]);
  assert.deepEqual(calls.map(c => c.slice(0, 4).join(" ")), ["gmail users messages list", "gmail users messages get"]);
  assert.ok(calls.every(c => !["send", "modify", "delete", "trash"].includes(c[3]!)));
});

test("gmail fetch: missing or failing authentication results are not authenticated", async () => {
  for (const ar of ["", "mx.google.com; dmarc=fail header.from=google.com", "mx.google.com; dmarc=pass header.from=evil.example"]) {
    assert.equal((await createOnairGmailLoader(fakeGws([], ar))())[0]!.senderAuthenticated, false, ar);
  }
});

const GOOD = "mx.google.com; dkim=pass header.i=@google.com; dmarc=pass (p=REJECT) header.from=google.com";
test("gmail fetch: sender-gate bypass attempts are not authenticated", async () => {
  const auth = async (ar: string | string[], from?: string[]) => (await createOnairGmailLoader(fakeGws([], ar, from))())[0]!.senderAuthenticated;
  assert.equal(await auth(GOOD), true);
  assert.equal(await auth("mx.google.com; dmarc=pass header.from=google.com.evil.com"), false, "checker bypass: look-alike header.from");
  assert.equal(await auth("mx.google.com; dmarc=pass header.from=evil.com; dkim=pass header.from=google.com"), false, "different clauses");
  assert.equal(await auth("mx.google.com; dmarc=fail header.from=google.com; spf=pass header.from=google.com"), false);
  assert.equal(await auth("mx.evil.example; dmarc=pass header.from=google.com"), false, "foreign authserv-id");
  assert.equal(await auth(["mx.evil.example; dmarc=pass header.from=google.com"]), false);
  assert.equal(await auth(GOOD, ['"x <a@google.com>" <a@evil.com>']), false, "quoted display name");
  assert.equal(await auth(GOOD, ["A <a@google.com>", "B <b@evil.com>"]), false, "multiple From headers");
  assert.equal(await auth(GOOD, ["A <a@mail.google.com>"]), false, "From domain differs from dmarc header.from");
  const FAIL = "mx.google.com; dmarc=fail (p=REJECT) header.from=google.com";
  const FORGED = "mx.google.com; dmarc=pass header.from=google.com";
  assert.equal(await auth([FORGED, FAIL]), false, "forged pass above Google's fail");
  assert.equal(await auth([FAIL, FORGED]), false, "forged pass below Google's fail");
  assert.equal(await auth([GOOD, FORGED]), false, "two mx.google.com headers that both pass");
  assert.equal(await auth(["mx.evil.example; dmarc=pass header.from=google.com", GOOD]), false, "topmost header has a foreign authserv-id");
  assert.equal(await auth([GOOD, "mx.evil.example; dmarc=fail header.from=google.com"]), true, "topmost Google header passes");
  const mails = await createOnairGmailLoader(fakeGws([], GOOD, ["A <a@google.com>", "B <b@evil.com>"]))();
  assert.equal(mails[0]!.from, "");
});
