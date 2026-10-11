/** packages/meeting-bot/src/calendar/join-rules-store.test.ts — T-037 `t037-join-rules-persistence`. Temp dirs only. */
import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, mkdirSync, rmSync, writeFileSync, readFileSync, readdirSync, existsSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import {
  loadJoinRules, saveJoinRules, recordTenantApproval, recordTenantOptOut, recordTenantUnOptOut, joinRulesFilePath, JoinRulesStoreError,
  JOIN_RULES_MAX_BYTES, type StoredJoinRules,
} from "./join-rules-store.js";
import { evaluateJoinRules, recordOptOut, validateJoinRuleState, type JoinRuleState } from "./join-rules.js";
import { removeOptOutEntries, type OptOutMeeting } from "./join-rules-optout.js";

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

// ---- t037-join-rules-un-opt: the un-opt operation (pure `removeOptOutEntries` + the store's locked save) ----
const ZOOM = (n: number | string) => `https://zoom.us/j/${n}`;
const ROOM = "https://zoom.us/my/room.name";
const OWN_RULES = { version: 1 as const, ownDomains: [], rules: [{ id: "r-allow", effect: "allow" as const, match: { domain: "x.com" } }] };
const ev = (id: string, meetingUrl: string) => ({ id, organizer: "a@x.com", meetingUrl });
const decide = (dir: string, tenant: string, id: string, url: string) => { const l = loadJoinRules(dir, tenant); return evaluateJoinRules(ev(id, url), l.ruleSet, l.state); };
/** What the production adapter does (scripts/webinar/join-rules-host.ts): the store's locked load -> pure removal -> write; a no-op writes nothing. */
function unOpt(dir: string, tenant: string, id: string, meeting?: OptOutMeeting) {
  const r = recordTenantUnOptOut(dir, tenant, id, {}, meeting);
  return { state: r.state, removedEventId: r.removedEventId, removedMeetings: r.removedMeetings };
}
const base = (over: Partial<JoinRuleState> = {}): JoinRuleState => ({ approvedSenders: ["s@x.com"], approvedDomains: ["d.com"], optedOutEventIds: ["cal1", "cal10", "Cal1"], ...over });

// D-015 replay: ISS-T037OPT-001 as recorded (an opt-out of the record id AND of its stored identities can never be removed).
test("ISS-T037OPT-001 replay: the record id, the url identity and the key identity are each removable (4 recorded checks)", () => withDir(dir => {
  let ok = 0;
  const optOut = () => { saveJoinRules(dir, "acme", { ruleSet: OWN_RULES, state: base() }); recordTenantOptOut(dir, "acme", "calX", {}, { meetingUrl: ZOOM(123456789), sessionKey: "webinar-abc" }); };
  optOut(); unOpt(dir, "acme", "calX");
  if (!loadJoinRules(dir, "acme").state.optedOutEventIds.includes("calX")) ok++; // 1: id removable
  optOut(); unOpt(dir, "acme", "calX", { meetingUrl: ZOOM(123456789) });
  if (!loadJoinRules(dir, "acme").state.optedOutMeetings!.includes("url:zoom:123456789")) ok++; // 2: url identity removable
  optOut(); unOpt(dir, "acme", "calX", { sessionKey: "webinar-abc" });
  if (!loadJoinRules(dir, "acme").state.optedOutMeetings!.includes("key:webinar-abc")) ok++; // 3: key identity removable
  const router = readFileSync(new URL("../../../../apps/api/src/join-rules/router.ts", import.meta.url), "utf8");
  if (/router\.post\("\/calendar\/join-rules\/opt-outs\/remove"/.test(router) && !/router\.(delete|patch)\(/.test(router)) ok++; // 4: the pin "no un-opt route" is replaced by the route
  console.log(`ISS-T037OPT-001: ${ok}/4`); assert.equal(ok, 4);
}));

// D-015 replay: ISS-T037OPT-003 as recorded (a recurring personal-room URL, once opted out, blocks every later meeting on it).
test("ISS-T037OPT-003 replay: opt out one occurrence on a personal room -> later meeting on the room vetoed -> un-opt with the same hint -> not vetoed (3 recorded checks)", () => withDir(dir => {
  let ok = 0;
  saveJoinRules(dir, "acme", { ruleSet: OWN_RULES, state: base({ optedOutEventIds: [] }) });
  if (decide(dir, "acme", "later", ROOM).action === "join") ok++; // 1: joins before any opt-out
  recordTenantOptOut(dir, "acme", "occ1", {}, { meetingUrl: ROOM });
  if (decide(dir, "acme", "later", ROOM).reason === "meeting-opt-out") ok++; // 2: the recorded block
  unOpt(dir, "acme", "occ1", { meetingUrl: ROOM });
  const after = decide(dir, "acme", "later", ROOM);
  if (after.action === "join" && decide(dir, "acme", "occ1", ROOM).action === "join") ok++; // 3: lifted, id opt-out gone too
  console.log(`ISS-T037OPT-003: ${ok}/3`); assert.equal(ok, 3);
}));

test("un-opt is exact: no prefix, case or substring matching; other ids, identities, approvals and rules survive", () => {
  const s = base({ optedOutMeetings: ["url:zoom:123456789", "url:zoom:1234567890", "key:webinar-abc", "key:webinar-abcd"] });
  const r = removeOptOutEntries(s, "cal1", { meetingUrl: ZOOM(123456789), sessionKey: "webinar-abc" });
  assert.deepEqual(r.state.optedOutEventIds, ["cal10", "Cal1"], "cal10 / Cal1 are other records");
  assert.deepEqual(r.state.optedOutMeetings, ["url:zoom:1234567890", "key:webinar-abcd"], "longer identities are other meetings");
  assert.deepEqual([r.removedEventId, r.removedMeetings], [true, ["url:zoom:123456789", "key:webinar-abc"]]);
  assert.deepEqual([r.state.approvedSenders, r.state.approvedDomains], [s.approvedSenders, s.approvedDomains]);
  assert.deepEqual(s, base({ optedOutMeetings: ["url:zoom:123456789", "url:zoom:1234567890", "key:webinar-abc", "key:webinar-abcd"] }), "input not mutated");
});

test("un-opt by id alone never guesses identities; hints alone leave other ids alone; absent = same reference, nothing reported", () => {
  const s = base({ optedOutMeetings: ["url:zoom:123456789", "key:k1"] });
  assert.deepEqual(removeOptOutEntries(s, "cal1").state.optedOutMeetings, ["url:zoom:123456789", "key:k1"]);
  assert.deepEqual(removeOptOutEntries(s, "nobody", { meetingUrl: ZOOM(123456789) }).state.optedOutEventIds, s.optedOutEventIds);
  for (const absent of [removeOptOutEntries(s, "nobody"), removeOptOutEntries(s, "nobody", { meetingUrl: ZOOM(999999999), sessionKey: "k2" }), removeOptOutEntries(base(), "cal1x", { meetingUrl: ZOOM(1) })]) {
    assert.deepEqual([absent.removedEventId, absent.removedMeetings], [false, []]);
  }
  assert.equal(removeOptOutEntries(s, "nobody").state, s);
});

test("old document (no optedOutMeetings): the key is never invented, by an id removal or by hints; an emptied list stays a list", () => withDir(dir => {
  const old = base(); assert.ok(!("optedOutMeetings" in old));
  assert.ok(!("optedOutMeetings" in removeOptOutEntries(old, "cal1", { meetingUrl: ZOOM(123456789), sessionKey: "k" }).state));
  saveJoinRules(dir, "acme", { ruleSet: OWN_RULES, state: old });
  const bytes = readFileSync(joinRulesFilePath(dir, "acme"), "utf8");
  unOpt(dir, "acme", "nobody", { meetingUrl: ZOOM(123456789) });
  assert.equal(readFileSync(joinRulesFilePath(dir, "acme"), "utf8"), bytes, "a no-op writes nothing (byte identical)");
  unOpt(dir, "acme", "cal1");
  assert.ok(!("optedOutMeetings" in loadJoinRules(dir, "acme").state), "no field written into a document that had none");
  recordTenantOptOut(dir, "acme", "e", {}, { sessionKey: "k" }); unOpt(dir, "acme", "e", { sessionKey: "k" });
  assert.deepEqual(loadJoinRules(dir, "acme").state.optedOutMeetings, []);
}));

test("hostile hints and ids: wrong types are ignored, tagged-string injection removes nothing it should not", () => {
  const s = base({ optedOutEventIds: ["url:zoom:123456789", "key:k1"], optedOutMeetings: ["url:zoom:123456789", "key:k1", "key:url:zoom:123456789"] });
  for (const bad of [{ meetingUrl: 5 }, { meetingUrl: {} }, { sessionKey: null }, { meetingUrl: ["https://zoom.us/j/123456789"] }, { sessionKey: "" }, { meetingUrl: "x".repeat(5000) }, null, "str", 7]) {
    const r = removeOptOutEntries(s, "zz", bad as never); assert.equal(r.state, s, JSON.stringify(bad)?.slice(0, 40));
  }
  // an id that looks like an identity removes only that exact id, never an identity; a sessionKey that looks like a url tag only matches `key:` + itself
  assert.deepEqual(removeOptOutEntries(s, "url:zoom:123456789").state.optedOutMeetings, s.optedOutMeetings);
  assert.deepEqual(removeOptOutEntries(s, "zz", { sessionKey: "url:zoom:123456789" }).state.optedOutMeetings, ["url:zoom:123456789", "key:k1"]);
  assert.doesNotThrow(() => validateJoinRuleState(removeOptOutEntries(s, "key:k1", { sessionKey: "k1" }).state));
});

test("two real tenants: un-opt in A leaves B's bytes identical; B's identical entries are B's own", () => withDir(dir => {
  for (const t of ["tenant-a", "tenant-b"]) { saveJoinRules(dir, t, { ruleSet: OWN_RULES, state: base({ optedOutEventIds: [] }) }); recordTenantOptOut(dir, t, "calX", {}, { meetingUrl: ROOM, sessionKey: "k" }); }
  const b = readFileSync(joinRulesFilePath(dir, "tenant-b"), "utf8");
  unOpt(dir, "tenant-a", "calX", { meetingUrl: ROOM, sessionKey: "k" });
  assert.equal(readFileSync(joinRulesFilePath(dir, "tenant-b"), "utf8"), b);
  assert.equal(decide(dir, "tenant-a", "n", ROOM).action, "join");
  assert.equal(decide(dir, "tenant-b", "n", ROOM).reason, "meeting-opt-out");
}));

test("a failed write leaves the document unchanged and a corrupt file blocks the un-opt", () => withDir(dir => {
  recordTenantOptOut(dir, "acme", "calX", {}, { sessionKey: "k" });
  const before = readFileSync(joinRulesFilePath(dir, "acme"), "utf8");
  const cur = loadJoinRules(dir, "acme");
  refused(() => saveJoinRules(dir, "acme", { ruleSet: cur.ruleSet, state: removeOptOutEntries(cur.state, "calX", { sessionKey: "k" }).state }, { rename: () => { throw new Error("disk full"); } }), "write-failed");
  assert.equal(readFileSync(joinRulesFilePath(dir, "acme"), "utf8"), before);
  raw(dir, "other", "{not json"); refused(() => unOpt(dir, "other", "x", { sessionKey: "k" }), "corrupt");
  assert.equal(readFileSync(joinRulesFilePath(dir, "other"), "utf8"), "{not json");
}));

// Seeded property test against an independent model (a Set of ids and a Set of tagged entries written by hand, not derived by the module).
test("property: for random opt-out / un-opt sequences the stored state equals the Set model and nothing else changes (400 seeded sequences)", () => {
  const URLS: [string, string][] = [[ZOOM(111111111), "url:zoom:111111111"], [ZOOM(1111111111), "url:zoom:1111111111"], [ROOM, "url:zoom:my:room.name"], ["https://meet.google.com/abc-defg-hij", "url:meet:abc-defg-hij"]];
  const KEYS = ["k1", "k10", "url:zoom:111111111", "K1"], IDS = ["e1", "e10", "E1", "url:zoom:111111111", "key:k1"];
  let seed = 20261011; const rnd = (n: number) => { seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0; return seed % n; };
  let steps = 0;
  for (let run = 0; run < 400; run++) {
    const fixed = { approvedSenders: ["s@x.com"], approvedDomains: ["d.com"] };
    let state: JoinRuleState = { ...fixed, optedOutEventIds: [] };
    const ids = new Set<string>(), ents = new Set<string>(); let usedMeetings = false;
    for (let i = 0; i < 30; i++, steps++) {
      const id = IDS[rnd(IDS.length)]!; const u = rnd(3) === 0 ? undefined : URLS[rnd(URLS.length)]; const k = rnd(3) === 0 ? undefined : KEYS[rnd(KEYS.length)]!;
      const hint: OptOutMeeting = { ...(u ? { meetingUrl: u[0] } : {}), ...(k !== undefined ? { sessionKey: k } : {}) };
      if (rnd(2) === 0) {
        state = recordOptOut(state, id, hint); ids.add(id); if (u) ents.add(u[1]); if (k !== undefined) ents.add(`key:${k}`);
        if (u || k !== undefined) usedMeetings = true;
      } else {
        const r = removeOptOutEntries(state, id, hint); state = r.state;
        assert.equal(r.removedEventId, ids.has(id)); ids.delete(id);
        const gone = [u?.[1], k === undefined ? undefined : `key:${k}`].filter((e): e is string => e !== undefined && ents.has(e));
        assert.deepEqual([...r.removedMeetings].sort(), [...new Set(gone)].sort()); for (const g of gone) ents.delete(g);
      }
      assert.deepEqual([...state.optedOutEventIds].sort(), [...ids].sort());
      assert.deepEqual([...(state.optedOutMeetings ?? [])].sort(), [...ents].sort());
      assert.equal("optedOutMeetings" in state, usedMeetings, "the field exists iff a hint was ever stored");
      assert.deepEqual([state.approvedSenders, state.approvedDomains], [fixed.approvedSenders, fixed.approvedDomains]);
      assert.doesNotThrow(() => validateJoinRuleState(state));
    }
  }
  console.log(`property: 400 sequences, ${steps} steps, 0 divergences`);
});
