/**
 * Contract suite, part 2 of 2: session and QR, groups and selection, unlink, idempotency, limits, no-content.
 * Same targets and flag as contract.test.ts. Tests that need an owner in a given status use the fake's control handle
 * and are skipped against a real archiver; "archiver-only" items are listed as skipped.
 */
import { after, describe, test } from "node:test";
import assert from "node:assert/strict";
import { createArchiverClient, type ArchiverClient } from "./client.js";
import { loadArchiverConfig } from "./config.js";
import { ArchiverError } from "./errors.js";
import { realTargetFromEnv, startFakeArchiver, type FakeControl } from "./fake-archiver.js";

interface Target { name: string; url: string; token: string; control: FakeControl | null }
const fake = await startFakeArchiver();
const real = realTargetFromEnv();
const targets: Target[] = [{ name: "fake", url: fake.url, token: fake.token, control: fake.control }];
if (real) targets.push({ name: "real", url: real.baseUrl, token: real.token, control: null });
after(async () => { await fake.stop(); });
for (const id of ["AC-G6", "AC-G8", "AC-U3", "AC-U4", "AC-U5", "AC-U6", "AC-U7", "AC-Q3", "AC-R2", "AC-N2", "AC-L1"])
  test(`${id} (archiver-only)`, { skip: "archiver-only: needs the archiver's process, logs, database or sockets; proven in W2b" }, () => {});
test("AC-B1 (KB side, W6) the KB holds no write credential", { skip: "owned by W6; not an archiver or client test" }, () => {});

const rnd = (): string => Array.from({ length: 24 }, () => "0123456789abcdef"[Math.floor(Math.random() * 16)]).join("");
const sleep = (ms: number): Promise<void> => new Promise(r => setTimeout(r, ms));
const JID = "120363000000000001@g.us", JID2 = "120363000000000002@g.us";
const CANARY_QR = `CANARY-QR-${rnd()}`;
const codeOf = async (p: Promise<unknown>): Promise<string> => { try { await p; return "no-error"; } catch (e) { return (e as ArchiverError).code; } };

for (const t of targets) describe(`contract[${t.name}] session, groups, unlink, idempotency, limits`, () => {
  const c = t.control; let clock = Date.now();
  const advance = async (ms: number): Promise<void> => { if (c) { clock += ms; c.setNow(clock); } else await sleep(ms); };
  const client = (): ArchiverClient =>
    createArchiverClient(loadArchiverConfig({ WHATSAPP_ARCHIVER_API_URL: t.url, WHATSAPP_ARCHIVER_API_TOKEN: t.token, WHATSAPP_ARCHIVER_API_ALLOW_PRIVATE_HTTP: "1" })!, { maxRetries: 0 });
  const owner = async (): Promise<{ id: string; k: ArchiverClient }> => { await advance(c ? 61_000 : 2500); const k = client(); return { id: (await k.ensureOwner(rnd())).ownerId, k }; };
  async function raw(path: string, o: { method?: string; body?: unknown; headers?: Record<string, string> } = {}) {
    const res = await fetch(`${t.url}${path}`, { method: o.method ?? "GET", redirect: "manual",
      headers: { authorization: `Bearer ${t.token}`, ...(o.body !== undefined ? { "content-type": "application/json" } : {}), ...o.headers }, body: o.body === undefined ? undefined : JSON.stringify(o.body) });
    const text = await res.text(); let json: Record<string, unknown> & { error?: { code?: string } } = {}; try { json = JSON.parse(text); } catch { /* keep {} */ }
    return { status: res.status, headers: res.headers, text, json };
  }
  const needs = c ? false : "needs scripted session fixtures (fake control)";

  test("AC-S1/S2/S3 start is a no-op the second time; the status enum, detail, updatedAt and accountHint follow section 5.3 and never carry a QR", async () => {
    const { id, k } = await owner();
    const nothing = await k.getSession(id);
    assert.deepEqual([nothing.status, nothing.updatedAt, nothing.accountHint], ["not_started", null, null]);
    const first = await k.startSession(id), second = await k.startSession(id);
    assert.equal(first.status, "connecting"); assert.deepEqual(second, first);
    const r = await raw(`/svc/v1/owners/${id}/session`);
    assert.deepEqual(Object.keys(r.json).sort(), ["accountHint", "detail", "status", "updatedAt"]);
    assert.ok(!/qr/i.test(r.text));
    if (!c) return;
    c.setStatus(id, "connected", { hint: "47" });
    const up = await k.getSession(id);
    assert.deepEqual([up.status, up.accountHint, up.detail], ["connected", "47", null]);
    c.setStatus(id, "logged_out", { detail: "logged_out" });
    const out = await k.getSession(id);
    assert.deepEqual([out.status, out.detail, out.accountHint], ["logged_out", "logged_out", null]);
    assert.equal((await k.startSession(id)).status, "connecting"); // a logged_out owner is restarted for re-link
  });

  test("AC-Q1/Q6 awaiting_qr returns the canary string, a png data URL, expiry within 20 s and no-store; a rotation replaces it", { skip: needs }, async () => {
    const { id, k } = await owner(); await k.startSession(id);
    c!.emitQr(id, CANARY_QR);
    const q = await k.getQr(id);
    assert.equal(q.qr, CANARY_QR); assert.match(q.qrDataUrl!, /^data:image\/png;base64,/);
    assert.ok(Date.parse(q.expiresAt!) - clock <= 20_000 && Date.parse(q.expiresAt!) - clock > 0);
    const r = await raw(`/svc/v1/owners/${id}/session/qr`);
    assert.match(r.headers.get("cache-control") ?? "", /no-store/);
    c!.emitQr(id, `${CANARY_QR}-2`);
    assert.equal((await k.getQr(id)).qr, `${CANARY_QR}-2`);
  });

  test("AC-Q2 the QR is null after expiry, after connected, after unlink; with no session in memory it is 409 session_not_started", { skip: needs }, async () => {
    const { id, k } = await owner();
    assert.equal(await codeOf(k.getQr(id)), "session_not_started");
    await k.startSession(id); c!.emitQr(id, CANARY_QR);
    await advance(21_000);
    assert.deepEqual(await k.getQr(id), { status: "awaiting_qr", qr: null, qrDataUrl: null, expiresAt: null });
    c!.emitQr(id, CANARY_QR); c!.setStatus(id, "connected", { hint: "47" });
    assert.equal((await k.getQr(id)).qr, null);
    c!.emitQr(id, CANARY_QR); await k.unlinkSession(id);
    assert.deepEqual(await k.getQr(id), { status: "closed", qr: null, qrDataUrl: null, expiresAt: null });
  });

  test("AC-Q4 31 QR calls inside a minute for one owner: the 31st is 429; another owner is unaffected", { skip: needs }, async () => {
    const a = await owner(); const b = await owner(); await a.k.startSession(a.id); await b.k.startSession(b.id);
    c!.emitQr(a.id, CANARY_QR); const statuses: number[] = [];
    for (let i = 0; i < 31; i++) statuses.push((await raw(`/svc/v1/owners/${a.id}/session/qr`)).status);
    assert.deepEqual([statuses.slice(0, 30).every(s => s === 200), statuses[30]], [true, 429]);
    assert.equal((await raw(`/svc/v1/owners/${b.id}/session/qr`)).status, 200);
  });

  test("AC-Q5 a QR GET with an Idempotency-Key is never stored or replayed", { skip: needs }, async () => {
    const { id, k } = await owner(); await k.startSession(id);
    c!.emitQr(id, `${CANARY_QR}-a`);
    const h = { "idempotency-key": "qr-key-1" };
    const one = await raw(`/svc/v1/owners/${id}/session/qr`, { headers: h });
    c!.emitQr(id, `${CANARY_QR}-b`);
    const two = await raw(`/svc/v1/owners/${id}/session/qr`, { headers: h });
    assert.equal(two.headers.get("idempotency-replayed"), null);
    assert.notEqual(one.json.qr, two.json.qr);
  });

  test("AC-G1/G2/G3/G9 listGroups: only this owner's groups, the contract fields, cache when not connected, one live refresh per 30 s", { skip: needs }, async () => {
    const a = await owner(); const b = await owner();
    c!.seedGroups(a.id, [{ jid: JID, subject: "Admissions desk‮", participantCount: 4 }]); c!.seedGroups(b.id, [{ jid: JID2, subject: "Other" }]);
    const cached = await a.k.listGroups(a.id);
    assert.deepEqual([cached.source, cached.refreshedAt, cached.truncated, cached.groups.map(g => g.jid)], ["cache", null, false, [JID]]);
    assert.equal(cached.groups[0]!.subject, "Admissions desk");
    const r = await raw(`/svc/v1/owners/${a.id}/groups`);
    assert.ok(!r.text.includes("isPinned") && !r.text.includes("memberPersonIds") && !r.text.includes(JID2));
    c!.setStatus(a.id, "connected", { hint: "47" }); c!.setLive(a.id, [{ jid: JID, subject: "Admissions desk" }, { jid: JID2.replace("2@", "3@"), subject: "New" }]);
    const live = await a.k.listGroups(a.id);
    assert.deepEqual([live.source, live.groups.length, c!.counters.liveRefreshes > 0], ["live", 2, true]);
    const before = c!.counters.liveRefreshes;
    await advance(5000);
    assert.equal((await a.k.listGroups(a.id)).source, "cache"); assert.equal(c!.counters.liveRefreshes, before);
    await advance(31_000);
    assert.equal((await a.k.listGroups(a.id)).source, "live");
  });

  test("AC-G4/G5/G11 setGroupTracking: change then changed:false, 404 on a never-listed jid (no row created), capture rules, 409 once unlinked", { skip: needs }, async () => {
    const { id, k } = await owner(); c!.seedGroups(id, [{ jid: JID, subject: "G" }]);
    const first = await k.setGroupTracking(id, JID, { isTracked: true });
    assert.deepEqual([first.isTracked, first.trackAllSenders, first.capture, first.changed], [true, true, "all", true]);
    assert.equal((await k.setGroupTracking(id, JID, { isTracked: true })).changed, false);
    assert.equal(await codeOf(k.setGroupTracking(id, JID2, { isTracked: true })), "group_not_found");
    assert.equal((await k.listGroups(id)).groups.length, 1);
    const none = await k.setGroupTracking(id, JID, { isTracked: true, trackAllSenders: false });
    assert.deepEqual([none.capture, none.changed], ["none", true]);
    assert.equal((await k.setGroupTracking(id, JID, { isTracked: false })).capture, "none");
    await k.unlinkSession(id);
    assert.equal(await codeOf(k.setGroupTracking(id, JID, { isTracked: true })), "owner_unlinked");
    assert.equal(await codeOf(k.setPeople(id, JID, [])), "owner_unlinked");
  });

  test("AC-G7/G9/G10 people: exact replace, clear, foreign or unknown id is person_not_found with the set unchanged, labels masked, no lid/pn", { skip: needs }, async () => {
    const a = await owner(); const b = await owner();
    c!.seedGroups(a.id, [{ jid: JID, subject: "G" }]); c!.seedGroups(b.id, [{ jid: JID, subject: "G" }]);
    const [p1, p2, p3] = c!.seedPeople(a.id, JID, [{ displayName: "A. Sharma" }, { pushName: "+91 98765 43210", number: "919876543210" }, { number: "" }]) as [string, string, string];
    const [foreign] = c!.seedPeople(b.id, JID, [{ displayName: "B" }]) as [string];
    const list = await a.k.listPeople(a.id, JID);
    assert.deepEqual(list.people.map(p => p.label).sort(), ["A. Sharma", "Member", "Member ..10"]);
    assert.deepEqual(Object.keys(list.people[0]!).sort(), ["hasName", "isSelected", "label", "personId"]);
    assert.ok(!JSON.stringify(list).includes("9876543210"));
    const set = await a.k.setPeople(a.id, JID, [p1, p2]);
    assert.deepEqual([set.count, set.changed], [2, true]);
    assert.deepEqual((await a.k.listPeople(a.id, JID)).people.filter(p => p.isSelected).map(p => p.personId).sort(), [p1, p2].sort());
    assert.equal(await codeOf(a.k.setPeople(a.id, JID, [p3, foreign])), "person_not_found");
    assert.equal(await codeOf(a.k.setPeople(a.id, JID, [p3, rnd()])), "person_not_found");
    assert.equal((await a.k.listPeople(a.id, JID)).people.filter(p => p.isSelected).length, 2);
    assert.equal(await codeOf(a.k.setPeople(a.id, JID, [])), "no-error");
    assert.equal((await a.k.listPeople(a.id, JID)).people.filter(p => p.isSelected).length, 0);
    const dup = await raw(`/svc/v1/owners/${a.id}/groups/${encodeURIComponent(JID)}/people`, { method: "PUT", body: { personIds: [p1, p1] } });
    assert.equal(dup.json.error?.code, "invalid_request");
  });

  test("AC-U1 unlink without confirm, with a wrong-case or non-string confirm: 400 confirm_required and nothing changes", async () => {
    const { id, k } = await owner(); await k.startSession(id);
    for (const body of [{}, { confirm: "unlink" }, { confirm: true }]) {
      const r = await raw(`/svc/v1/owners/${id}/unlink`, { method: "POST", body });
      assert.deepEqual([r.status, r.json.error?.code], [400, "confirm_required"], JSON.stringify(body));
    }
    assert.equal((await k.getSession(id)).status, "connecting");
    assert.equal((await k.ensureOwner(rnd())).state, "active");
  });

  test("AC-U2 unlink: owner unlinked, status closed, capture disabled; a repeat returns the original unlinkedAt", async () => {
    const { id, k } = await owner(); await k.startSession(id);
    const one = await k.unlinkSession(id); await advance(c ? 5000 : 1100);
    const two = await k.unlinkSession(id);
    assert.deepEqual([one.state, one.status, one.captureDisabled, two.unlinkedAt], ["unlinked", "closed", true, one.unlinkedAt]);
    assert.equal(await codeOf(k.startSession(id)), "owner_unlinked");
    if (c) { c.seedGroups(id, []); assert.equal(c.owner(id)!.state, "unlinked"); }
  });

  test("unlink turns every tracked group off and leaves other owners alone (fake state check)", { skip: needs }, async () => {
    const a = await owner(); const b = await owner();
    c!.seedGroups(a.id, [{ jid: JID, subject: "A", isTracked: true }]); c!.seedGroups(b.id, [{ jid: JID, subject: "B", isTracked: true }]);
    await a.k.unlinkSession(a.id);
    assert.deepEqual([c!.owner(a.id)!.tracked, c!.owner(b.id)!.tracked], [[], [JID]]);
  });

  test("AC-I1 same key and request replays with Idempotency-Replayed; same key, different request is 409; same key while running is 409 request_in_progress", async () => {
    const { id } = await owner(); const path = `/svc/v1/owners/${id}/session`; const h = { "idempotency-key": `key-${rnd().slice(0, 8)}` };
    const one = await raw(path, { method: "POST", headers: h }), two = await raw(path, { method: "POST", headers: h });
    assert.deepEqual([one.status, two.status, two.headers.get("idempotency-replayed"), two.text], [200, 200, "true", one.text]);
    const other = await raw(`/svc/v1/owners/${id}/unlink`, { method: "POST", headers: h, body: { confirm: "UNLINK" } });
    assert.deepEqual([other.status, other.json.error?.code], [409, "idempotency_key_reused"]);
    assert.equal((await raw("/svc/v1/owners", { method: "POST", headers: { "idempotency-key": "bad key!" }, body: { ownerRef: rnd() } })).status, 400);
    if (!c) return;
    const release = c.hold(); const hk = { "idempotency-key": `key-${rnd().slice(0, 8)}` }; const ref = rnd();
    const first = raw("/svc/v1/owners", { method: "POST", headers: hk, body: { ownerRef: ref } });
    await sleep(60);
    const second = await raw("/svc/v1/owners", { method: "POST", headers: hk, body: { ownerRef: ref } });
    assert.deepEqual([second.status, second.json.error?.code, second.headers.get("retry-after")], [409, "request_in_progress", "1"]);
    release(); assert.equal((await first).status, 200);
  });

  test("AC-R1 limits: status 60/min, list 12/min, unlink 6/min per owner, each 429 with Retry-After at the stated count and not before", { skip: needs }, async () => {
    const hit = async (path: string, method: string, body: unknown, n: number): Promise<number[]> => {
      const out: number[] = []; for (let i = 0; i < n; i++) out.push((await raw(path, { method, body })).status); return out;
    };
    const a = await owner(); const b = await owner();
    const s = await hit(`/svc/v1/owners/${a.id}/session`, "GET", undefined, 61);
    assert.deepEqual([s.slice(0, 60).every(x => x === 200), s[60]], [true, 429]);
    const l = await hit(`/svc/v1/owners/${a.id}/groups`, "GET", undefined, 13);
    assert.deepEqual([l.slice(0, 12).every(x => x === 200), l[12]], [true, 429]);
    const u = await hit(`/svc/v1/owners/${b.id}/unlink`, "POST", { confirm: "UNLINK" }, 7);
    assert.deepEqual([u.slice(0, 6).every(x => x === 200), u[6]], [true, 429]);
    const over = await raw(`/svc/v1/owners/${b.id}/unlink`, { method: "POST", body: { confirm: "UNLINK" } });
    assert.ok(over.headers.get("retry-after") && typeof over.json.error === "object");
    assert.equal((await raw(`/svc/v1/owners/${b.id}/session`)).status, 200, "counters of one scope do not limit another");
  });

  test("AC-N1 no response over any operation carries message text, a full phone number, a hash, a cookie or the token", { skip: needs }, async () => {
    const { id, k } = await owner(); const msg = `CANARY-MSG-${rnd()}`;
    c!.seedGroups(id, [{ jid: JID, subject: "G" }]); c!.seedPeople(id, JID, [{ pushName: "+91 98765 43210", number: "919812345678" }]);
    await k.startSession(id); c!.emitQr(id, CANARY_QR);
    const bodies: string[] = [];
    for (const [m, p, b] of [["GET", "session"], ["GET", "session/qr"], ["GET", "groups"], ["GET", `groups/${encodeURIComponent(JID)}/people`], ["PUT", `groups/${encodeURIComponent(JID)}/tracking`, { isTracked: true }], ["POST", "unlink", { confirm: "UNLINK" }]] as const) {
      const r = await raw(`/svc/v1/owners/${id}/${p}`, { method: m, body: b });
      assert.equal(r.status, 200, `${m} ${p}`); bodies.push(r.text);
      assert.ok(!r.headers.has("set-cookie") && !r.text.includes(t.token) && !r.text.includes(msg));
    }
    for (const text of bodies) {
      const stripped = text.replace(/data:image\/png;base64,[A-Za-z0-9+/=]+/g, "").replace(/[0-9a-f]{24}/g, "").replace(/\d{4}-\d{2}-\d{2}T[\d:.]+Z/g, "").replace(/\d{5,40}(-\d+)?@g\.us/g, "");
      assert.ok(!/\d{7,}/.test(stripped), stripped.slice(0, 120));
    }
  });
});
