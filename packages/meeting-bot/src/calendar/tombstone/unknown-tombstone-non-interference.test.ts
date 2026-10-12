/**
 * ISS-T036CAL-011 (security class): an outsider who sends the user an invite and cancels it before the next tick must not stop the user's own
 * meetings. The original hazard stays guarded: a meeting cancelled before its live Calendar event was ever stored must not be joined via its
 * UNLINKED Gmail copy. See tombstone/unknown-tombstone-reach.ts for the reach rule and the stated residual (ISS-TOMBSTONE-001).
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { CHECKED, MODES, NOW, REV, SCOPES, cal, mail, meet, outcomeOf, pick, recon, recordedTombstones, slot, type TombstoneRow } from "./tombstone-fixtures.js";

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
    const tombs: TombstoneRow[] = [{ id: "c1", cancelled: true }, ...Array.from({ length: noise }, (_, k) => ({ id: `ghost${k}`, cancelled: true }))];
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
    const gm = [mail(5), mailAt(6, 3 * DAY)];                                        // g5 is the cancelled meeting copy; g6 is another, unrelated one three days away
    const quiet = recon([cal(0)], gm, available);
    assert.deepEqual(gmailIds(quiet), ["g5", "g6"]);
    for (const mode of MODES) assert.ok(scheduled(quiet, mode).includes("g5"), "without the tombstone g5 would be joined");
    const ghost: TombstoneRow = { id: "never-seen", cancelled: true, title: "Webinar 5", startTime: s5, endTime: e5, meetingUrl: meet(5), meetingUrlSource: "conference", providerUpdated: REV };
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

const DAY = 86_400_000, iso = (ms: number): string => new Date(ms).toISOString();
/** A Gmail row (id gN) for meeting N moved by `ms` from its slot. */
const mailAt = (i: number, ms: number, extra: TombstoneRow = {}): TombstoneRow => mail(i, { startTime: iso(Date.parse(slot(i)[0]) + ms), endTime: iso(Date.parse(slot(i)[1]) + ms), ...extra });
const cells = (fn: (available: boolean, mode: boolean) => boolean): [number, number] => { let ok = 0, n = 0; for (const a of SCOPES) for (const m of MODES) { n++; if (fn(a, m)) ok++; } return [ok, n]; };

test("reach by what the tombstone carries: a start holds Gmail rows around that instant only; a free-text link is never an identity", () => {
  const [s5, e5] = slot(5);
  for (const available of SCOPES) {
    const gm = [mail(5), mailAt(6, 3 * DAY), mailAt(7, -3 * DAY)];                  // g5 at the start; g6 three days later; g7 three days earlier
    const startOnly: TombstoneRow = { id: "k1", cancelled: true, startTime: s5, endTime: e5, providerUpdated: REV };
    assert.deepEqual(gmailIds(recon([cal(0), startOnly], gm, available)), ["g6", "g7"], "g5 (same start) is held; rows days away are not");
    const free: TombstoneRow = { id: "k2", cancelled: true, startTime: iso(Date.parse(s5) + 10 * DAY), endTime: iso(Date.parse(e5) + 10 * DAY), meetingUrl: meet(5), meetingUrlSource: "description", providerUpdated: REV };
    assert.deepEqual(gmailIds(recon([cal(0), free], gm, available)), ["g5", "g6", "g7"], "a free-text link carries no identity: ten days off, nothing held");
    const elsewhere: TombstoneRow = { id: "k4", cancelled: true, title: "x", startTime: iso(Date.parse(s5) + 10 * DAY), endTime: iso(Date.parse(e5) + 10 * DAY), meetingUrl: meet(9), meetingUrlSource: "conference", providerUpdated: REV };
    assert.deepEqual(gmailIds(recon([cal(0), elsewhere], gm, available)), ["g5", "g6", "g7"], "a tombstone far from every Gmail row holds none");
    const urlOnly: TombstoneRow = { id: "k3", cancelled: true, meetingUrl: meet(5), meetingUrlSource: "conference", providerUpdated: REV };
    assert.deepEqual(gmailIds(recon([cal(0), urlOnly], gm, available)), ["g6", "g7"], "link only, no start: the trusted link names meeting 5, so only g5 is held (matched by link identity, not by a time window)");
  }
});

test("ISS-TOMBSTONE-002 recorded reproductions verbatim: a start-carrying tombstone whose start does not equal the Gmail copy's start (+1 min, 10:30Z, EST misread, same instant written +05:30) is still not joined", () => {
  const probes: [string, TombstoneRow, TombstoneRow][] = [
    ["+1 min", { id: "ghost", cancelled: true, startTime: "2026-10-11T11:01:00.000Z" }, mail(0)],
    ["10:30Z", { id: "ghost", cancelled: true, startTime: "2026-10-11T10:30:00.000Z" }, mail(0)],
    ["same instant +05:30", { id: "ghost", cancelled: true, startTime: "2026-10-11T16:30:00+05:30" }, mail(0)],
    ["EST read as IST (true 16:00Z, Gmail says 05:30Z)", { id: "ghost", cancelled: true, startTime: "2026-10-11T16:00:00.000Z" }, mail(0, { startTime: "2026-10-11T05:30:00.000Z", endTime: "2026-10-11T06:30:00.000Z" })],
  ];
  let ok = 0, n = 0;
  for (const [label, tomb, gm] of probes) {
    const [good, total] = cells((available, mode) => {
      if (Date.parse(String(gm.startTime)) > Date.parse(NOW)) assert.ok(scheduled(recon([cal(1)], [gm], available), mode).includes(String(gm.id)), "without the tombstone it is joined");
      const r = recon([cal(1), tomb], [gm], available);
      const held = !scheduled(r, mode).includes(String(gm.id)) && reasonOf(r, String(gm.id)) === "unproven-calendar-history";
      assert.ok(held, `${label} scope=${available} mode=${mode}`); return held;
    });
    ok += good; n += total;
  }
  console.log(`ISS-TOMBSTONE-002: ${ok}/${n} refused`); assert.equal(ok, n);
});

test("ISS-TOMBSTONE-003 recorded reproductions verbatim: a trusted-link tombstone holds the Gmail copy whatever the link form or small start difference", () => {
  const [s0, e0] = slot(0);
  const t = (url: string, start = s0): TombstoneRow => ({ id: "ghost", cancelled: true, startTime: start, endTime: e0, meetingUrl: url, meetingUrlSource: "conference", providerUpdated: REV });
  const probes: [string, TombstoneRow, TombstoneRow][] = [
    ["zoom /j/ vs /w/?tk=", t("https://zoom.us/j/123456789"), mail(0, { meetingUrl: "https://zoom.us/w/123456789?tk=abc" })],
    ["meet(1) vs meet(0), same start", t(meet(1)), mail(0, { meetingUrl: meet(0) })],
    ["same url, Gmail +1 min", t(meet(0)), mail(0, { startTime: "2026-10-11T11:01:00.000Z" })],
    ["same url and start", t(meet(0)), mail(0)],
    ["same url, ?pwd variant", t(meet(0) + "?pwd=x"), mail(0)],
  ];
  let ok = 0, n = 0;
  for (const [label, tomb, gm] of probes) {
    const [good, total] = cells((available, mode) => {
      const r = recon([cal(1), tomb], [gm], available), held = !scheduled(r, mode).includes("g0") && reasonOf(r, "g0") === "unproven-calendar-history";
      assert.ok(held, `${label} scope=${available} mode=${mode}`); return held;
    });
    ok += good; n += total;
  }
  console.log(`ISS-TOMBSTONE-003: ${ok}/${n} refused`); assert.equal(ok, n);
});

test("ISS-TOMBSTONE-004/001 recorded reproductions: an id-only tombstone holds imminent unlinked Gmail rows (D-060 pin) but expires, on every later tick and after 40 days", () => {
  let ok = 0, n = 0;
  for (const available of SCOPES) {
    // ISS-TOMBSTONE-001 recorded case: calendar [c0, c1 (linked to g1)] + Gmail [g1, g5, g6] + {id:'ghost',cancelled:true}
    const gm = [mail(1), mail(5), mail(6)];
    const r = recon([cal(0), cal(1), { id: "ghost", cancelled: true }], gm, available);
    n++; if (JSON.stringify(gmailIds(r)) === JSON.stringify(["g1"]) && reasonOf(r, "g5") === "unproven-calendar-history" && reasonOf(r, "g6") === "unproven-calendar-history") ok++;
    assert.deepEqual(gmailIds(r), ["g1"], "near-term unlinked rows are held (the original hazard)"); assert.deepEqual(r.calendarEvents.map(e => e.id).sort(), ["c0", "c1"]); assert.equal(r.newStartsBlocked, false);
    assert.equal(Object.values(r.state.occurrences).find(o => o.snapshot.id === "ghost")!.snapshot.providerUpdated, CHECKED, "first sight is stamped when Google sent no updated");
    // ISS-TOMBSTONE-004 recorded 5-tick probe: the tombstone is no longer fetched on ticks 1-4
    let state = r.state;
    for (let tick = 1; tick <= 4; tick++) state = recon([cal(0), cal(1)], gm, available, state, iso(Date.parse(CHECKED) + tick * 300_000)).state;
    const week = recon([cal(0), cal(1)], [...gm, mailAt(8, 6 * DAY), mailAt(9, 20 * DAY)], available, state, iso(Date.parse(CHECKED) + 5 * DAY));
    n++; if (week.candidates.some(c => c.id === "g9") && week.candidates.some(c => c.id === "g8")) ok++;
    assert.ok(week.candidates.some(c => c.id === "g8"), "ISS-TOMBSTONE-008: an id-only tombstone matches nothing, so a row six days out is not held (only the imminent [T-24h, T+48h] rows are)"); assert.ok(week.candidates.some(c => c.id === "g9"), "beyond the horizon it is not held");
    const late = recon([cal(0), cal(1)], [...gm, mailAt(10, 41 * DAY)], available, state, iso(Date.parse(CHECKED) + 40 * DAY));
    n++; if (late.candidates.some(c => c.id === "g10") && !late.inventory.some(i => i.reason === "unproven-calendar-history" && i.snapshot.id === "g10")) ok++;
    assert.ok(late.candidates.some(c => c.id === "g10"), "40 days later a new email-only meeting runs");
  }
  console.log(`ISS-TOMBSTONE-004/001: ${ok}/${n} refused-or-expired as specified`); assert.equal(ok, n);
});

test("ISS-TOMBSTONE-004: a tombstone Google dated long ago (the unfiltered baseline of old deleted events) holds nothing now; a stub keeps its first-seen stamp on refetch", () => {
  for (const available of SCOPES) {
    const old = recon([cal(0), { id: "old", cancelled: true, providerUpdated: "2026-08-01T00:00:00.000Z" }], [mail(5), mailAt(6, 3 * DAY)], available);
    assert.deepEqual(gmailIds(old), ["g5", "g6"], "cancelled in August: nothing held today");
    const again = recon([cal(0), { id: "ghost", cancelled: true }], [mailAt(7, 2 * DAY)], available);
    const later = recon([cal(0), { id: "ghost", cancelled: true }], [mailAt(7, 2 * DAY)], available, again.state, iso(Date.parse(CHECKED) + 20 * DAY));
    const row = Object.values(later.state.occurrences).find(o => o.snapshot.id === "ghost")!;
    assert.equal(row.snapshot.providerUpdated, CHECKED, "the stored first-seen is not moved by a refetch"); assert.equal(row.revision, CHECKED);
  }
});

test("fresh state / state reset: every tombstone is unknown on the first tick; calendar rows and linked pairs run, only Gmail rows near a tombstone are held", () => {
  const [s5, e5] = slot(5);
  for (const available of SCOPES) {
    const tombs: TombstoneRow[] = [{ id: "old1", cancelled: true, title: "Old", startTime: "2026-10-11T22:00:00.000Z", endTime: "2026-10-11T23:00:00.000Z", meetingUrl: "https://zoom.us/j/123123123", meetingUrlSource: "conference", providerUpdated: REV },
      { id: "old2", cancelled: true, startTime: s5, endTime: e5, providerUpdated: REV }];
    const r = recon([...TRUSTED_PAIR, ...tombs], [...PAIR_MAIL, mail(5), mailAt(6, 3 * DAY)], available);
    assert.equal(r.newStartsBlocked, false);
    assert.deepEqual(r.calendarEvents.map(e => e.id).sort(), ["c0", "c1"]);
    assert.deepEqual(gmailIds(r), ["g1", "g6"], "g5 is within a day of the cancelled unseen events and is held; g6 (3 days away) and the linked g1 run");
    // an event that was persisted, state file lost, then cancelled: the tombstone is unknown after the reset and cannot reach the linked pair or c0
    const lost = recon([cal(0), { id: "c1", cancelled: true }], PAIR_MAIL, available);
    assert.deepEqual(scheduled(lost, true), ["c0"], "only the live c0 is scheduled");
  }
});

test("1, 2 and 500 unknown tombstones change nothing for trusted rows and stay linear", () => {
  const kinds = recordedTombstones();
  const ghosts = (n: number): TombstoneRow[] => Array.from({ length: n }, (_, k) => ({ ...kinds[k % 3]!, id: `ghost${k}` }));
  const unlinked = (n: number): TombstoneRow[] => Array.from({ length: n }, (_, k) => mail(100 + k, { meetingUrl: `https://zoom.us/j/${200000000 + k}` }));
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
