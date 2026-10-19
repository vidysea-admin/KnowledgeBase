import test from "node:test";
import assert from "node:assert/strict";
import type { AutoRecordCandidateInput } from "../auto-join.js";
import { onairMailEnabled, withOnairMailCandidates, withOnairMailFromEnv } from "./onair-mail-loader.js";
import { createOnairGmailLoader, headerAuthenticated } from "./onair-gmail-fetch.js";
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

test("flag: only the exact value 1 enables the hook; otherwise the base loader is returned untouched", async () => {
  for (const env of [{}, { LKB_ONAIR_MAIL: "0" }, { LKB_ONAIR_MAIL: "true" }, { LKB_ONAIR_MAIL: "" }, { LKB_ONAIR_MAIL: " 1" }]) {
    const m = mk(env, [baseRow()]);
    assert.equal(m.loader, m.baseLoader);
    assert.equal(onairMailEnabled(env), false);
    assert.equal(withOnairMailFromEnv(m.baseLoader, env, "C:/nope", () => {}), m.baseLoader);
  }
  assert.equal(onairMailEnabled({ LKB_ONAIR_MAIL: "1" }), true);
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
const fakeGws = (calls: string[][], authResults: string) => async (args: string[]) => {
  calls.push(args);
  if (args[3] === "list") return JSON.stringify({ messages: [{ id: "m1", threadId: "t1" }, { id: "../bad" }] });
  return JSON.stringify({ id: "m1", threadId: "t1", internalDate: String(Date.parse("2026-10-14T08:00:00Z")), payload: { mimeType: "multipart/alternative",
    headers: [{ name: "Subject", value: "You're registered: X" }, { name: "From", value: "Google <a@google.com>" }, { name: "Authentication-Results", value: authResults }],
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
  assert.equal(headerAuthenticated("dmarc=pass header.from=google.com"), true);
});
