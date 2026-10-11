/**
 * ISS-T036CAL-011 seeded properties, in the style of the link-source non-interference property (ISS-T036CAL-010):
 *   P1 (non-interference): for random trusted sets T and arbitrary added UNKNOWN tombstones K (ids not in T's history, copying starts, titles,
 *      organisers and links from T wherever a tombstone can carry them), every row of T that is a calendar row or a linked Gmail pair has the
 *      identical outcome as on T alone, under both scopes, both modes, any fetch order, and on a later tick that still holds the tombstones.
 *   P2 (no known cancellation is ignored): a cancellation of a KNOWN id always cancels exactly that meeting and its linked Gmail copy, whatever K is.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { MODES, REV, SCOPES, cal, mail, meet, outcomeOf, pick, recon, slot, type Row } from "./tombstone-fixtures.js";

function rng(seed: number) { let a = seed >>> 0; return () => { a = (a + 0x6d2b79f5) >>> 0; let t = a; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }
const LATER = "2026-10-11T10:05:00.000Z";

interface Case { calendar: Row[]; gmail: Row[]; protectedIds: Set<string>; tombstones: Row[] }
function makeCase(seed: number): Case {
  const r = rng(seed), int = (n: number) => Math.floor(r() * n), chance = (p: number) => r() < p;
  const calendar: Row[] = [], gmail: Row[] = [], protectedIds = new Set<string>();
  const n = 1 + int(5);
  for (let i = 0; i < n; i++) {
    const idx = int(8);                                                    // small pools: starts and urls collide across rows
    const extra: Row = chance(0.3) ? { recurringEventId: `rec${i}`, originalStartTime: { dateTime: slot(idx)[0] }, id: `c${i}_inst` } : { id: `c${i}` };
    const c = cal(idx, { ...extra, ...(chance(0.2) ? { meetingUrlSource: undefined } : {}), ...(chance(0.15) ? { organizer: "other@example.org" } : {}) });
    if (chance(0.15)) c.cancelled = true;
    calendar.push(c); protectedIds.add(String(c.id));
    if (chance(0.5) && !c.cancelled) { const g = mail(idx, { id: `g${i}`, ...(chance(0.3) ? { senderAuthenticated: false, status: "pending" } : {}) }); gmail.push(g); protectedIds.add(`g${i}`); }
  }
  for (let j = 0; j < int(3); j++) gmail.push(mail(8 + j, { id: `u${j}`, meetingUrl: `https://zoom.us/j/${700000000 + j}` }));   // unlinked Gmail rows (not protected: see residual)
  const tombstones: Row[] = [];
  for (let k = 0; k < int(9); k++) {
    const src = calendar[int(calendar.length)]!, id = `ghost${seed}_${k}`;
    const copy: Row = { id, cancelled: true, title: src.title, organizer: src.organizer, startTime: src.startTime, endTime: src.endTime, providerUpdated: chance(0.5) ? REV : "2026-10-02T00:00:00.000Z" };
    switch (int(8)) {
      case 0: tombstones.push({ id, cancelled: true }); break;
      case 1: tombstones.push(copy); break;                                                                      // start/title/organiser copied, no link
      case 2: tombstones.push({ ...copy, meetingUrl: src.meetingUrl, meetingUrlSource: "conference" }); break;     // full copy of a trusted meeting identity
      case 3: tombstones.push({ ...copy, meetingUrl: src.meetingUrl, meetingUrlSource: "description" }); break;    // free-text link
      case 4: tombstones.push({ id, cancelled: true, meetingUrl: src.meetingUrl }); break;                         // link only, no start
      case 5: tombstones.push({ id, cancelled: true, recurringEventId: `unknown-parent${k}`, originalStartTime: { dateTime: src.startTime } }); break;
      case 6: tombstones.push({ ...copy, meetingUrl: src.meetingUrl, meetingUrlSource: "location" }); break;
      default: tombstones.push({ ...copy, title: "(untitled)", startTime: "", endTime: "" });
    }
  }
  return { calendar, gmail, protectedIds, tombstones };
}
const shuffle = <T>(xs: T[], seed: number): T[] => { const r = rng(seed ^ 0x9e3779b9), a = [...xs]; for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(r() * (i + 1)); [a[i], a[j]] = [a[j]!, a[i]!]; } return a; };

test("P1 non-interference: unknown tombstones never change a trusted calendar row or a linked Gmail pair (seeded, both scopes, both modes, shuffled order, second tick)", () => {
  let runs = 0, violations = 0, withTombstones = 0, unlinkedHeld = 0, tombstonesTotal = 0;
  for (let seed = 1; seed <= 400; seed++) {
    const c = makeCase(seed); if (c.tombstones.length) withTombstones++; tombstonesTotal += c.tombstones.length;
    for (const available of SCOPES) {
      let base1, base2, with1, with2;
      try {
        base1 = recon(c.calendar, c.gmail, available); base2 = recon(c.calendar, c.gmail, available, base1.state, LATER);
        with1 = recon(shuffle([...c.calendar, ...c.tombstones], seed), c.gmail, available); with2 = recon(shuffle([...c.calendar, ...c.tombstones], seed + 1), c.gmail, available, with1.state, LATER);
      } catch (e) { assert.fail(`seed ${seed} threw ${(e as Error).message}`); }
      // protected = calendar rows + Gmail rows LINKED to a calendar row in the baseline; same set must hold in the tombstone run
      const linked = new Set(Object.values(base1.state.occurrences).filter(o => o.source === "gmail" && o.linkedCalendar).map(o => o.snapshot.id));
      const ids = new Set([...c.calendar.map(x => String(x.id)), ...linked]);
      for (const mode of MODES) for (const [a, b] of [[base1, with1], [base2, with2]] as const) {
        runs++;
        if (outcomeOf(a, mode, ids) !== outcomeOf(b, mode, ids) || b.newStartsBlocked !== a.newStartsBlocked) {
          violations++; if (violations < 2) console.log("VIOLATION", seed, available, mode, JSON.stringify(c), "A", outcomeOf(a, mode, ids), "B", outcomeOf(b, mode, ids));
        }
      }
      unlinkedHeld += with1.inventory.filter(i => i.reason === "unproven-calendar-history").length;
    }
  }
  console.log(`P1: 400 seeds x 2 scopes x 2 modes x 2 ticks = ${runs} runs (${withTombstones} seeds with tombstones, ${tombstonesTotal} tombstones); violations: ${violations}; unlinked Gmail rows held (documented reach): ${unlinkedHeld}`);
  assert.equal(violations, 0); assert.ok(withTombstones > 300);
});

test("P2 a KNOWN cancellation is never ignored, whatever unknown tombstones surround it (seeded)", () => {
  let checked = 0, violations = 0, cancelledRuns = 0;
  for (let seed = 1; seed <= 300; seed++) {
    const c = makeCase(seed), r = rng(seed * 7919), live = c.calendar.filter(x => !x.cancelled && !x.recurringEventId); if (!live.length) continue;
    const victim = live[Math.floor(r() * live.length)]!, victimGmail = c.gmail.find(g => g.meetingUrl === victim.meetingUrl && g.startTime === victim.startTime);
    for (const available of SCOPES) for (const mode of MODES) {
      const first = recon(c.calendar, c.gmail, available);
      const others = c.calendar.filter(x => x !== victim), cancel = { id: victim.id, cancelled: true };
      const quiet = recon([...others, cancel], c.gmail, available, first.state, LATER);
      const noisy = recon(shuffle([...others, cancel, ...c.tombstones], seed), c.gmail, available, first.state, LATER);
      checked++;
      const got = pick(noisy, mode).toSchedule.map(s => s.sourceId), mine = new Set([String(victim.id), ...(victimGmail ? [String(victimGmail.id)] : [])]);
      // ambiguous seeds (two calendar rows sharing one identity) are unresolved with or without tombstones; the property is equality with the quiet run
      // and, whenever the quiet run cancels the victim, that the noisy run cancels it too and never schedules it.
      const cancelledQuiet = quiet.calendarEvents.find(e => e.id === victim.id)?.cancelled === true;
      let ok = outcomeOf(noisy, mode, mine) === outcomeOf(quiet, mode, mine);
      if (cancelledQuiet) { cancelledRuns++; ok &&= noisy.calendarEvents.find(e => e.id === victim.id)?.cancelled === true && noisy.transitions.some(t => t.reason === "cancelled") && !got.includes(String(victim.id)); }
      if (!ok) { violations++; if (violations < 4) console.log("P2 VIOLATION", seed, available, mode); }
      if (victimGmail) { const g = noisy.candidates.find(x => x.id === victimGmail.id); if (g && g.cancelled !== true) { violations++; console.log("P2 gmail copy survived", seed); } }
    }
  }
  console.log(`P2: ${checked} known-cancellation runs (${cancelledRuns} with the victim cleanly cancelled); violations: ${violations}`);
  assert.equal(violations, 0); assert.ok(checked > 600 && cancelledRuns > 400);
});
