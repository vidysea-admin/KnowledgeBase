/**
 * ISS-T036CAL-011 (security class): an outsider who sends the user an invite and cancels it before the next tick must not stop the user's own
 * meetings. The original hazard stays guarded: a meeting cancelled before its live Calendar event was ever stored must not be joined via its
 * UNLINKED Gmail copy. See tombstone/unknown-tombstone-reach.ts for the reach rule and the stated residual (ISS-TOMBSTONE-001).
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { MODES, REV, SCOPES, cal, mail, meet, outcomeOf, pick, recon, recordedTombstones, slot, type Row } from "./tombstone-fixtures.js";

const ids = (...x: string[]): ReadonlySet<string> => new Set(x);
const gmailIds = (r: ReturnType<typeof recon>) => r.candidates.map(c => c.id).sort();
const reasonOf = (r: ReturnType<typeof recon>, id: string) => r.inventory.find(i => i.snapshot.id === id)?.reason;
const scheduled = (r: ReturnType<typeof recon>, mode: boolean) => pick(r, mode).toSchedule.map(x => x.sourceId).sort();
const TRUSTED_PAIR = [cal(0), cal(1)], PAIR_MAIL = [mail(1)];            // c0 alone; c1 linked with g1
const LATER = "2026-10-11T10:05:00.000Z";

test("ISS-T036CAL-011 recorded reproduction (verbatim shapes: minimal, with details, free-text link) x both scopes x both modes: trusted rows and the linked pair are identical to the run without the tombstone", () => {
  let cells = 0, total = 0;
  for (const available of SCOPES) {
    const base = recon(TRUSTED_PAIR, PAIR_MAIL, available);
    for (const tomb of recordedTombstones()) {
      const r = recon([...TRUSTED_PAIR, tomb], PAIR_MAIL, available);
      assert.equal(r.newStartsBlocked, false, "nothing is blocked");
      for (const mode of MODES) {
        total++;
        const same = outcomeOf(r, mode, ids("c0", "c1", "g1")) === outcomeOf(base, mode, ids("c0", "c1", "g1"));
        assert.ok(same, `scope=${available} mode=${mode}: ${JSON.stringify(tomb)}`); if (same) cells++;
        assert.deepEqual(scheduled(r, mode), scheduled(base, mode));
      }
      assert.equal(reasonOf(r, "ghost"), "unknown-tombstone", "recorded and listed with a reason");
      assert.ok(!scheduled(r, true).includes("ghost")); assert.ok(r.calendarEvents.every(e => e.id !== "ghost"), "the tombstone itself is never a feed row");
    }
  }
  console.log(`ISS-T036CAL-011: ${cells}/${total} (scope x tombstone shape x mode) cells: calendar rows and the linked pair identical to the run without the tombstone`);
  assert.equal(cells, total);
});

test("legacy scope: an unknown tombstone no longer empties the feeds (also on later ticks); a real contradiction still blocks", () => {
  const first = recon(TRUSTED_PAIR, PAIR_MAIL, false);
  const r = recon([...TRUSTED_PAIR, ...recordedTombstones().slice(0, 1)], PAIR_MAIL, false, first.state, LATER);
  assert.equal(r.newStartsBlocked, false); assert.deepEqual(r.calendarEvents.map(e => e.id).sort(), ["c0", "c1"]);
  const replay = recon([...TRUSTED_PAIR], PAIR_MAIL, false, r.state, "2026-10-11T10:10:00.000Z");   // the tombstone row is persisted; a later tick stays unblocked
  assert.equal(replay.newStartsBlocked, false); assert.equal(replay.calendarEvents.length, 2);
  const contradiction = recon([cal(0, { meetingUrl: meet(7) })], [], false, first.state, "2026-10-11T10:15:00.000Z");
  assert.equal(contradiction.newStartsBlocked, true, "only the unknown-tombstone reason was narrowed");
});

test("original hazard 1: a KNOWN cancellation unschedules exactly that meeting and its linked Gmail copy, with or without unknown tombstones around", () => {
  for (const available of SCOPES) for (const mode of MODES) for (const noise of [0, 1, 500]) {
    const first = recon(TRUSTED_PAIR, PAIR_MAIL, available);
    assert.ok(scheduled(first, mode).includes("c0") && scheduled(first, mode).includes("c1"), "before the cancellation c1 is schedulable");
    const tombs: Row[] = [{ id: "c1", cancelled: true }, ...Array.from({ length: noise }, (_, k) => ({ id: `ghost${k}`, cancelled: true }))];
    const r = recon([cal(0), ...tombs], PAIR_MAIL, available, first.state, LATER);
    const got = scheduled(r, mode);
    assert.ok(!got.includes("c1") && !got.includes("g1"), `cancelled meeting and its Gmail copy are not scheduled (noise ${noise})`);
    assert.ok(got.includes("c0"), "the unrelated meeting is untouched");
    assert.equal(r.candidates.find(c => c.id === "g1")?.cancelled, true);
    assert.ok(r.transitions.some(x => x.reason === "cancelled"), "a cancelled transition is emitted");
    const quiet = recon([cal(0), { id: "c1", cancelled: true }], PAIR_MAIL, available, first.state, LATER);
    assert.equal(outcomeOf(r, mode, ids("c0", "c1", "g1")), outcomeOf(quiet, mode, ids("c0", "c1", "g1")), "identical to the run without the noise");
  }
});

test("original hazard 2: a meeting cancelled before its live event was ever stored is not joined through its UNLINKED Gmail copy (identity-carrying tombstone)", () => {
  const [s5, e5] = slot(5);
  for (const available of SCOPES) {
    const gm = [mail(5), mail(6)];                                                    // g5 is the cancelled meeting's copy; g6 is another, unrelated one
    const quiet = recon([cal(0)], gm, available);
    assert.deepEqual(gmailIds(quiet), ["g5", "g6"]);
    for (const mode of MODES) assert.ok(scheduled(quiet, mode).includes("g5"), "without the tombstone g5 would be joined");
    const ghost: Row = { id: "never-seen", cancelled: true, title: "Webinar 5", startTime: s5, endTime: e5, meetingUrl: meet(5), meetingUrlSource: "conference", providerUpdated: REV };
    const r = recon([cal(0), ghost], gm, available);
    assert.equal(reasonOf(r, "g5"), "unproven-calendar-history", `scope=${available}`);
    assert.deepEqual(gmailIds(r), ["g6"], "only the Gmail copy of THAT meeting is held");
    for (const mode of MODES) assert.ok(!scheduled(r, mode).includes("g5"), "the cancelled meeting is not joined");
    assert.equal(r.newStartsBlocked, false); assert.equal(r.calendarEvents.length, 1);
    const earlier = recon([cal(0)], gm, available);
    const held = recon([cal(0), ghost], gm, available, earlier.state, LATER);
    assert.ok(held.transitions.some(t => t.reason === "unresolved"), "a Gmail job already scheduled for it is unscheduled");
  }
});

test("reach by what the tombstone carries: start-only holds Gmail rows at that instant; a free-text link is never an identity", () => {
  const [s5, e5] = slot(5);
  for (const available of SCOPES) {
    const gm = [mail(5), mail(6)];
    const startOnly: Row = { id: "k1", cancelled: true, startTime: s5, endTime: e5, providerUpdated: REV };
    assert.deepEqual(gmailIds(recon([cal(0), startOnly], gm, available)), ["g6"], "same start only");
    const free: Row = { id: "k2", cancelled: true, startTime: slot(9)[0], endTime: slot(9)[1], meetingUrl: meet(5), meetingUrlSource: "description", providerUpdated: REV };
    assert.deepEqual(gmailIds(recon([cal(0), free], gm, available)), ["g5", "g6"], "a free-text link carries no identity: another start, nothing held");
    const freeOtherLink: Row = { id: "k6", cancelled: true, startTime: s5, endTime: e5, meetingUrl: meet(40), meetingUrlSource: "description", providerUpdated: REV };
    assert.deepEqual(gmailIds(recon([cal(0), freeOtherLink], gm, available)), ["g6"], "a free-text link is ignored for identity: the start alone attributes it, so a chosen link cannot steer the hold away");
    const urlOnly: Row = { id: "k3", cancelled: true, meetingUrl: meet(5), meetingUrlSource: "conference" };
    assert.ok(recon([cal(0), urlOnly], gm, available).inventory.some(i => i.reason === "unproven-calendar-history"), "no start: cannot be attributed, falls to the residual");
    const sameStartOtherLink: Row = { id: "k5", cancelled: true, startTime: slot(6)[0], endTime: slot(6)[1], meetingUrl: meet(40), meetingUrlSource: "conference", providerUpdated: REV };
    assert.deepEqual(gmailIds(recon([cal(0), sameStartOtherLink], gm, available)), ["g5", "g6"], "a tombstone with a trusted identity is matched by identity, not by its start alone");
    const elsewhere: Row = { id: "k4", cancelled: true, title: "x", startTime: slot(9)[0], endTime: slot(9)[1], meetingUrl: meet(9), meetingUrlSource: "conference", providerUpdated: REV };
    assert.deepEqual(gmailIds(recon([cal(0), elsewhere], gm, available)), ["g5", "g6"], "an identity matching no Gmail row holds none");
  }
});

test("RESIDUAL (ISS-TOMBSTONE-001), pinned as a limit: an id-only unknown tombstone still holds UNLINKED Gmail rows, and nothing else", () => {
  for (const available of SCOPES) {
    const gm = [mail(1), mail(5), mail(6)];
    const r = recon([cal(0), cal(1), { id: "ghost", cancelled: true }], gm, available);
    assert.deepEqual(gmailIds(r), ["g1"], "only the Gmail copy linked to calendar event c1 survives");
    assert.equal(reasonOf(r, "g5"), "unproven-calendar-history"); assert.equal(reasonOf(r, "g6"), "unproven-calendar-history");
    assert.deepEqual(r.calendarEvents.map(e => e.id).sort(), ["c0", "c1"], "calendar rows are never held");
    assert.equal(r.newStartsBlocked, false);
    const later = recon([cal(0), cal(1)], gm, available, r.state, LATER);
    assert.deepEqual(gmailIds(later), ["g1"], "the hold persists with the stored tombstone (ends only with a state reset)");
  }
});

test("fresh state / state reset: every tombstone is unknown on the first tick; calendar rows and linked pairs run, only attributable unlinked Gmail rows are held", () => {
  const [s5, e5] = slot(5);
  for (const available of SCOPES) {
    const tombs: Row[] = [{ id: "old1", cancelled: true, title: "Old", startTime: "2026-10-11T22:00:00.000Z", endTime: "2026-10-11T23:00:00.000Z", meetingUrl: "https://zoom.us/j/123123123", meetingUrlSource: "conference", providerUpdated: REV },
      { id: "old2", cancelled: true, startTime: s5, endTime: e5, providerUpdated: REV }];
    const r = recon([...TRUSTED_PAIR, ...tombs], [...PAIR_MAIL, mail(5), mail(6)], available);
    assert.equal(r.newStartsBlocked, false);
    assert.deepEqual(r.calendarEvents.map(e => e.id).sort(), ["c0", "c1"]);
    assert.deepEqual(gmailIds(r), ["g1", "g6"], "g5 shares the start of a cancelled unseen event and is held; g6 and the linked g1 run");
    // an event that was persisted, state file lost, then cancelled: the tombstone is unknown after the reset and cannot reach the linked pair or c0
    const lost = recon([cal(0), { id: "c1", cancelled: true }], PAIR_MAIL, available);
    assert.deepEqual(scheduled(lost, true), ["c0"], "only the live c0 is scheduled");
  }
});

test("1, 2 and 500 unknown tombstones change nothing for trusted rows and stay linear", () => {
  const kinds = recordedTombstones();
  const ghosts = (n: number): Row[] => Array.from({ length: n }, (_, k) => ({ ...kinds[k % 3]!, id: `ghost${k}` }));
  const unlinked = (n: number): Row[] => Array.from({ length: n }, (_, k) => mail(100 + k, { meetingUrl: `https://zoom.us/j/${200000000 + k}` }));
  const time = (n: number, available: boolean) => { const t0 = performance.now(); recon([...TRUSTED_PAIR, ...ghosts(n)], [...PAIR_MAIL, ...unlinked(n)], available); return performance.now() - t0; };
  for (const available of SCOPES) {
    const base = recon(TRUSTED_PAIR, PAIR_MAIL, available);
    for (const n of [1, 2, 500]) {
      const r = recon([...TRUSTED_PAIR, ...ghosts(n)], PAIR_MAIL, available);
      for (const mode of MODES) assert.equal(outcomeOf(r, mode, ids("c0", "c1", "g1")), outcomeOf(base, mode, ids("c0", "c1", "g1")), `n=${n}`);
      assert.equal(r.newStartsBlocked, false); assert.equal(r.inventory.filter(i => i.reason === "unknown-tombstone").length, n);
    }
    time(100, available);
    const small = Math.min(time(250, available), time(250, available)), large = Math.min(time(1000, available), time(1000, available));
    assert.ok(large < small * 9 + 50, `4x the rows must cost about 4x, not 16x (small ${small.toFixed(0)}ms, large ${large.toFixed(0)}ms)`);
  }
});
