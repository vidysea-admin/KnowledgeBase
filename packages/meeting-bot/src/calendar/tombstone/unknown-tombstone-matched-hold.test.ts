/**
 * ISS-TOMBSTONE-008 (security class, both directions) against the live shape of Google's cancelled events
 * (qa/evidence/tombstone-live-shape-2026-10-12/summary.md: start, end, iCalUID, updated always; organizer, title, conference data in 4 of 15).
 *   Direction 1 (no outsider suppression): a cancelled invite holds only the unlinked Gmail rows it can be MATCHED to; renewing it with fresh ids holds nothing else.
 *   Direction 2 (no fail-open): a tombstone that carries a trusted link, or its host and title, holds the Gmail copy of ITS meeting at any start in the horizon.
 * Shapes that carry nothing to match on are named and pinned as NOT held (the residual of 008), never silently.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { CHECKED, MODES, REV, SCOPES, mail, meet, recon, slot, type TombstoneRow } from "./tombstone-fixtures.js";

const DAY = 86_400_000, HOUR = 3_600_000, iso = (ms: number): string => new Date(ms).toISOString();
const [S0, E0] = slot(0), HOST = "host@example.org";
const copyAt = (offsetMs: number, extra: TombstoneRow = {}): TombstoneRow => mail(0, { id: "copy", startTime: iso(Date.parse(S0) + offsetMs), endTime: iso(Date.parse(E0) + offsetMs), ...extra });
const held = (r: ReturnType<typeof recon>, id: string): boolean => r.inventory.some(i => i.snapshot.id === id && i.reason === "unproven-calendar-history") && !r.candidates.some(c => c.id === id);
const free = (r: ReturnType<typeof recon>, id: string): boolean => !held(r, id) && r.candidates.some(c => c.id === id);
const everyCell = (fn: (available: boolean, mode: boolean) => boolean): [number, number] => { let ok = 0, n = 0; for (const a of SCOPES) for (const m of MODES) { n++; if (fn(a, m)) ok++; } return [ok, n]; };
const cellsHold = (tomb: TombstoneRow, gm: TombstoneRow, want: "held" | "free"): [number, number] =>
  everyCell(available => { const r = recon([tomb], [gm], available); const ok = want === "held" ? held(r, String(gm.id)) : free(r, String(gm.id)); assert.ok(ok, `${want} ${JSON.stringify(tomb)} vs start ${String(gm.startTime)} scope=${available}`); return ok; });

const minimal = (id = "t1", at = REV): TombstoneRow => ({ id, cancelled: true, startTime: S0, endTime: E0, providerUpdated: at });            // live shape: start, end, updated
const detailed = (id = "t1", at = REV): TombstoneRow => ({ ...minimal(id, at), title: "Webinar 0", organizer: HOST, meetingUrl: meet(0), meetingUrlSource: "conference" });
const instance = (id: string, full: boolean): TombstoneRow => ({ ...(full ? detailed(id) : minimal(id)), recurringEventId: "master", originalStartTime: { dateTime: S0 } });
const master = (full: boolean): TombstoneRow => (full ? detailed("master") : minimal("master"));                                                // series first start = S0

test("ISS-TOMBSTONE-008 direction 1, recorded shapes: an unrelated start-less cancelled invite from an outsider holds nothing, however often it is renewed", () => {
  let ok = 0, n = 0;
  const outsider = (id: string, at: string): TombstoneRow => ({ id, cancelled: true, title: "spam", organizer: "evil@attacker.example", providerUpdated: at });   // recorded: start-less, unrelated title/organiser
  for (const off of [3 * DAY, 13 * DAY, 14 * DAY, 20 * DAY]) { const [a, b] = cellsHold(outsider("o1", REV), copyAt(off), "free"); ok += a; n += b; }
  for (const off of [3 * DAY, 13 * DAY]) { const [a, b] = cellsHold({ id: "o2", cancelled: true, providerUpdated: REV }, copyAt(off), "free"); ok += a; n += b; }   // id only, a few days away
  // renewal: one fresh cancelled id every 13 days; a day-20 row is held by none of them
  for (const available of SCOPES) {
    let state = recon([], [], available).state;
    for (let d = 0; d <= 13; d += 13) state = recon([outsider(`renew${d}`, iso(Date.parse(CHECKED) + d * DAY))], [], available, state, iso(Date.parse(CHECKED) + d * DAY + 60_000)).state;
    const start = iso(Date.parse(CHECKED) + 20 * DAY), r = recon([], [copyAt(0, { startTime: start, endTime: iso(Date.parse(start) + HOUR) })], available, state, iso(Date.parse(CHECKED) + 19 * DAY));
    n++; if (free(r, "copy")) ok++; assert.ok(free(r, "copy"), `renewed outsider invites do not hold an unrelated row (scope ${available})`);
  }
  // detail-bearing outsider copying a victim's start: its own organiser, title and link are not the row's, so it is a different party's meeting
  const copied: TombstoneRow = { id: "o3", cancelled: true, title: "spam", organizer: "evil@attacker.example", startTime: S0, endTime: E0, meetingUrl: "https://zoom.us/j/99999999999", meetingUrlSource: "conference", providerUpdated: REV };
  { const [a, b] = cellsHold(copied, copyAt(0), "free"); ok += a; n += b; }
  console.log(`ISS-TOMBSTONE-008 (outsider suppression): ${ok}/${n} unrelated rows run`); assert.equal(ok, n);
});

test("ISS-TOMBSTONE-008 direction 1, named residual: a bare-start tombstone (the common live shape) still holds an unlinked row within 24h of that start, and only that", () => {
  const [a, b] = cellsHold(minimal("bare"), copyAt(HOUR), "held"), [c, d] = cellsHold(minimal("bare"), copyAt(-23 * HOUR), "held"), [e, f] = cellsHold(minimal("bare"), copyAt(26 * HOUR), "free");
  console.log(`ISS-TOMBSTONE-005/008 residual: held within 24h ${a + c}/${b + d}; outside ${e}/${f} free`); assert.equal(a + c + e, b + d + f);
});

test("ISS-TOMBSTONE-008 direction 2, recorded fail-open gaps: a tombstone that names its meeting holds the Gmail copy at the recorded offsets; bare shapes are named, not silent", () => {
  const probes: [string, TombstoneRow, TombstoneRow, "held" | "free"][] = [];
  for (const off of [25 * HOUR, -25 * HOUR, 30 * HOUR]) {                                      // start-carrying tombstone, copy more than 24h off
    probes.push([`start>24h detailed ${off / HOUR}h`, detailed(), copyAt(off), "held"], [`start>24h bare ${off / HOUR}h`, minimal(), copyAt(off), "free"]);
  }
  for (const off of [13 * DAY, 15 * DAY, 16 * DAY]) {                                          // id-only / link-only tombstone, copy 13/15/16 days later
    probes.push([`link-only ${off / DAY}d`, { id: "t1", cancelled: true, meetingUrl: meet(0), meetingUrlSource: "conference", providerUpdated: CHECKED }, copyAt(off), "held"],
      [`id-only ${off / DAY}d`, { id: "t1", cancelled: true, providerUpdated: CHECKED }, copyAt(off), "free"]);
  }
  probes.push(["recurring instance +30d detailed", instance("t_i", true), copyAt(30 * DAY), "held"], ["recurring instance +30d bare", instance("t_i", false), copyAt(30 * DAY), "free"]);
  probes.push(["recurring instance (originalStartTime only) +30d detailed", { ...instance("t_o", true), startTime: undefined, endTime: undefined }, copyAt(30 * DAY), "held"]);
  probes.push(["cancelled master, later instance +21d detailed", master(true), copyAt(21 * DAY), "held"], ["cancelled master, later instance +21d bare", master(false), copyAt(21 * DAY), "free"]);
  probes.push(["rescheduled copy +3d detailed", detailed(), copyAt(3 * DAY), "held"], ["rescheduled copy +3d link only", { ...minimal(), meetingUrl: meet(0), meetingUrlSource: "conference" }, copyAt(3 * DAY), "held"],
    ["rescheduled copy +3d bare", minimal(), copyAt(3 * DAY), "free"]);
  let matchedOk = 0, matchedN = 0, bareOk = 0, bareN = 0;
  for (const [, tomb, gm, want] of probes) {
    const [ok, n] = cellsHold(tomb, gm, want); if (want === "held") { matchedOk += ok; matchedN += n; } else { bareOk += ok; bareN += n; }
  }
  console.log(`ISS-TOMBSTONE-008 (fail-open): matched shapes held ${matchedOk}/${matchedN}; bare shapes (nothing to match, named residual) not held ${bareOk}/${bareN}`);
  assert.equal(matchedOk, matchedN); assert.equal(bareOk, bareN);
});

test("matched holds are bounded: a link/host match ends 30 days after the tombstone's start or cancellation", () => {
  const [a, b] = cellsHold(detailed(), copyAt(29 * DAY), "held"), [c, d] = cellsHold(detailed(), copyAt(32 * DAY), "free");
  assert.equal(a + c, b + d);
});

test("host match needs the row's sender: another organiser's tombstone with the same title holds only within 24h of its start", () => {
  const other: TombstoneRow = { ...detailed(), organizer: "someone@else.example", meetingUrl: "https://zoom.us/j/55555555555" };
  const [a, b] = cellsHold(other, copyAt(3 * DAY), "free"), [c, d] = cellsHold(other, copyAt(0), "held");
  assert.equal(a + c, b + d);
});

test("a link match needs a TRUSTED link: a free-text link on the tombstone never matches a row, at any start", () => {
  const text: TombstoneRow = { id: "t9", cancelled: true, meetingUrl: meet(0), meetingUrlSource: "description", providerUpdated: CHECKED };
  const [a, b] = cellsHold(text, copyAt(5 * DAY), "free"); assert.equal(a, b);
});

test("link forms: zoom /j/ vs /w/?tk=, a ?pwd variant and a different start all name one meeting; another meeting number does not", () => {
  const z = (url: string): TombstoneRow => ({ id: "tz", cancelled: true, meetingUrl: url, meetingUrlSource: "conference", providerUpdated: CHECKED });
  const [a, b] = cellsHold(z("https://zoom.us/j/123456789?pwd=x"), copyAt(4 * DAY, { meetingUrl: "https://zoom.us/w/123456789?tk=abc" }), "held");
  const [c, d] = cellsHold(z("https://zoom.us/j/123456789"), copyAt(4 * DAY, { meetingUrl: "https://zoom.us/j/123456780" }), "free");
  assert.equal(a + c, b + d);
});

test("a stored tombstone with no clock and no start but a trusted link still holds its meeting (fail closed, matched); with nothing to match it holds nothing", () => {
  for (const available of SCOPES) {
    const first = recon([{ id: "ghost", cancelled: true, meetingUrl: meet(0), meetingUrlSource: "conference" }, { id: "ghost2", cancelled: true }], [], available), state = JSON.parse(JSON.stringify(first.state));
    for (const o of Object.values(state.occurrences) as { snapshot: { providerUpdated?: string }; revision?: string }[]) { delete o.snapshot.providerUpdated; delete o.revision; }
    const r = recon([], [copyAt(60 * DAY, { id: "far" }), copyAt(60 * DAY, { id: "other", meetingUrl: meet(3) })], available, state, iso(Date.parse(CHECKED) + 50 * DAY));
    assert.ok(held(r, "far") && free(r, "other"), `scope ${available}`);
  }
});

test("host match does not hold the host's unrelated meeting: same organiser, other title, days away from the tombstone's start", () => {
  const sameHostOtherTitle: TombstoneRow = { id: "th", cancelled: true, title: "Quarterly review", organizer: HOST, startTime: S0, endTime: E0, providerUpdated: REV };
  const [a, b] = cellsHold(sameHostOtherTitle, copyAt(3 * DAY), "free"), [c, d] = cellsHold(sameHostOtherTitle, copyAt(2 * HOUR), "held");
  assert.equal(a + c, b + d);
});

test("host and title without any link (a cancelled series master) hold the host's later instance of the same title, and not another title", () => {
  const seriesMaster: TombstoneRow = { id: "tm", cancelled: true, title: "Webinar 0", organizer: HOST, startTime: S0, endTime: E0, providerUpdated: REV };
  const [a, b] = cellsHold(seriesMaster, copyAt(21 * DAY, { meetingUrl: meet(4) }), "held"), [c, d] = cellsHold(seriesMaster, copyAt(21 * DAY, { meetingUrl: meet(4), title: "Other" }), "free");
  assert.equal(a + c, b + d);
});
