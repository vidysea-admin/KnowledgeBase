/**
 * ISS-ALERTID-008 (D-015 against qa/issues.alertid.jsonl): the printed-field allowlist of `lkb alert-who` is pinned.
 * Every probe from the ledger row is replayed: a tokened registrationUrl, organizer / sender e-mail and a meetingUrl-with-pwd must never reach the
 * output, whatever the loader puts into a candidate. Prints "ISS-ALERTID-008: n/m".
 */
import assert from "node:assert/strict";
import { mkdirSync, mkdtempSync, readFileSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import test, { after } from "node:test";
import { alertIdFor } from "./attention-alerts.js";
import { readWebinarOperationState } from "../state/schedule-state.js";
import { LIMITS, PRINTED_FIELDS, PRINTED_PLATFORMS, loadCandidates, runAlertWho, type AlertWhoDeps } from "../../alert-who-command.js";

const NOW = new Date("2026-10-10T10:00:00.000Z");
const ROW = readFileSync(new URL("../../../../../qa/issues.alertid.jsonl", import.meta.url), "utf8").trim().split("\n")
  .map((l) => JSON.parse(l) as Record<string, string>).find((r) => r.id === "ISS-ALERTID-008")!;
let pass = 0, total = 0;
const ok = (cond: unknown, msg: string) => { total++; assert.ok(cond, msg); pass++; };
after(() => console.log(`ISS-ALERTID-008: ${pass}/${total} recorded probes and mutants refused`));

// The ledger's own probe values (verbatim substrings of the row), plus the fix_direction's meetingUrl-with-pwd.
const REG = "https://events.example.com/register?token=REGTOKEN123", SENDER = "boss@corp.example", ORG = "organizer.person@corp.example";
const MEETING_PWD = "https://zoom.us/j/12345678901?pwd=MEETPWD456";
const FORBIDDEN = ["REGTOKEN123", "events.example.com", "register", "boss@", "corp.example", "organizer.person", "MEETPWD456", "pwd", "https://", "@"];

function world() {
  const root = mkdtempSync(path.join(tmpdir(), "alertwho-pf-"));
  const stateDir = path.join(root, "webinars"), opsFile = path.join(root, "operations.json");
  mkdirSync(path.join(stateDir, "scheduled"), { recursive: true });
  const out: string[] = [];
  const deps: AlertWhoDeps = { resolveTenant: () => "A", sources: { dataRoot: root, stateDir, operationsFile: opsFile, tenantId: "" },
    readOperations: readWebinarOperationState as never, now: () => NOW, write: (l) => out.push(l) };
  return { root, stateDir, opsFile, out, deps, done: () => rmSync(root, { recursive: true, force: true }) };
}
type W = ReturnType<typeof world>;
const ask = (w: W, key: string) => { w.out.length = 0; const code = runAlertWho([alertIdFor(key)], w.deps); return { code, text: w.out.join("\n") }; };
const never = (text: string, label: string) => { for (const f of FORBIDDEN) ok(!text.includes(f), `${label}: output must not contain ${JSON.stringify(f)}\n${text}`); };

/** The operations file only has to exist; the injected reader returns the (hostile) state, so the fixture is not limited by the writer's validation. */
function withOperations(w: W, operations: Record<string, unknown>, occurrences: Record<string, unknown>) {
  writeFileSync(w.opsFile, "{}");
  w.deps.readOperations = (() => ({ operations, source: { reconciliation: { occurrences } } })) as never;
}
function inventory(w: W, snapshot: Record<string, unknown>, source = "calendar", operations: Record<string, unknown> = {}) {
  withOperations(w, operations, { o1: { source, snapshot } });
}

test("the probe values are verbatim in the ledger row", () => {
  ok(ROW.evidence!.includes("https://events.example.com/register?token=REGTOKEN123"), "registrationUrl probe");
  ok(ROW.evidence!.includes("boss@corp.example"), "senderEmail probe");
  ok(ROW.evidence!.includes("platform: str(snap.registrationUrl)") && ROW.evidence!.includes("snap.organizer"), "the two surviving mutants");
});

test("inventory candidate: registrationUrl, organizer, senderEmail, meetingUrl-with-pwd in the snapshot are never printed", () => {
  const w = world();
  inventory(w, { id: "e1", title: "Quarterly Webinar", startTime: "2026-10-12T10:00:00Z", registrationUrl: REG, organizer: ORG, senderEmail: SENDER, meetingUrl: MEETING_PWD,
    platform: REG, host: SENDER, status: SENDER });
  const r = ask(w, "cal:e1");
  ok(r.code === 0 && /title:    Quarterly Webinar/.test(r.text), r.text);
  never(r.text, "inventory");
  const names = r.text.split("\n").slice(1).map((l) => l.trim().split(":")[0]!);
  ok(names.every((n) => (PRINTED_FIELDS as readonly string[]).includes(n)), `only allowlisted field names are printed: ${names}`);
  w.done();
});

test("print-time allowlist: a hostile status, and a job url, reach the output only as allowlisted shapes", () => {
  const w = world();
  inventory(w, { id: "e2", title: "T2" }, "calendar", { "webinar-aaaaaaaaaaaaaaaaaaaaaaaa": { tenantId: "A", status: SENDER, title: "Row", startTime: "2026-10-12T10:00:00Z" } });
  let r = ask(w, "webinar-aaaaaaaaaaaaaaaaaaaaaaaa");
  ok(r.code === 0, r.text);
  never(r.text, "status");
  ok(!/; status/.test(r.text), `a non-word status is dropped: ${r.text}`);
  writeFileSync(path.join(w.stateDir, "scheduled", "j.json"), JSON.stringify({ tenantId: "A", sessionId: "cal:j", title: "J", url: MEETING_PWD, until: "2026-10-12T11:00:00Z" }));
  r = ask(w, "cal:j");
  ok(r.code === 0 && /platform: zoom \(zoom\.us\)/.test(r.text), r.text);
  never(r.text, "job url");
  w.done();
});

test("the allowlists are pinned: fields, platform names", () => {
  ok([...PRINTED_PLATFORMS].sort().join() === "cloudonair,meet,teams,unknown,webex,zoho,zoom", "platform allowlist pinned");
  ok(PRINTED_FIELDS.join() === "record,title,time,platform,host,source,status", "field list pinned");
});

test("schedule-state.json behind a junction out of the data root is not followed (realpath check, recorded survivor 3)", (t) => {
  const w = world(), outside = mkdtempSync(path.join(tmpdir(), "alertwho-pf-out-"));
  writeFileSync(path.join(outside, "schedule-state.json"), JSON.stringify({ version: 2, tenantId: "A", entries: { x: { sessionKey: "cal:esc", title: "OUTSIDE STATE TITLE" } } }));
  rmSync(w.stateDir, { recursive: true });
  try { symlinkSync(outside, w.stateDir, "junction"); } catch { t.skip("cannot create a junction here"); rmSync(outside, { recursive: true, force: true }); w.done(); return; }
  const r = ask(w, "cal:esc");
  ok(r.code === 1 && !r.text.includes("OUTSIDE STATE TITLE"), r.text);
  w.done(); rmSync(outside, { recursive: true, force: true });
});

test("schedule-state.json is a symlinked file inside the root pointing outside: not followed (realpath check for the FILE)", (t) => {
  const w = world(), outside = mkdtempSync(path.join(tmpdir(), "alertwho-pf-out2-"));
  const real = path.join(outside, "s.json");
  writeFileSync(real, JSON.stringify({ version: 2, tenantId: "A", entries: { x: { sessionKey: "cal:esc2", title: "OUTSIDE FILE TITLE" } } }));
  try { symlinkSync(real, path.join(w.stateDir, "schedule-state.json"), "file"); } catch { t.skip("cannot create a file symlink here"); rmSync(outside, { recursive: true, force: true }); w.done(); return; }
  const r = ask(w, "cal:esc2");
  ok(r.code === 1 && !r.text.includes("OUTSIDE FILE TITLE") && /schedule-state\.json resolves outside the data root/.test(r.text), r.text);
  w.done(); rmSync(outside, { recursive: true, force: true });
});

test("schedule-state.json larger than the 5 MiB cap is refused, valid JSON on both sides of it (recorded survivor 5)", () => {
  const w = world();
  const state = (pad: number) => JSON.stringify({ version: 2, tenantId: "A", entries: { x: { sessionKey: "cal:size", title: "SIZED" } }, pad: "x".repeat(pad) });
  writeFileSync(path.join(w.stateDir, "schedule-state.json"), state(LIMITS.fileBytes + 1024));
  let r = ask(w, "cal:size");
  ok(r.code === 1 && !r.text.includes("SIZED") && /schedule-state\.json is unreadable or corrupt/.test(r.text), r.text);
  writeFileSync(path.join(w.stateDir, "schedule-state.json"), state(LIMITS.fileBytes - 4096));
  r = ask(w, "cal:size");
  ok(r.code === 0 && /title:    SIZED/.test(r.text), r.text);
  w.done();
});

test("inventory rows beyond the 20000 cap are not read (recorded survivor 4)", () => {
  const w = world();
  const occ: Record<string, unknown> = {};
  for (let i = 0; i < LIMITS.rows + 5; i++) occ[`o${i}`] = { source: "calendar", snapshot: { id: `n${i}`, title: "t" } };
  withOperations(w, {}, occ);
  const { tagged } = loadCandidates({ ...w.deps.sources, tenantId: "A" }, w.deps);
  ok(tagged.length === LIMITS.rows, `read ${tagged.length}`);
  ok(!tagged.some((c) => c.sessionKey === `cal:n${LIMITS.rows + 1}`), "row past the cap not read");
  w.done();
});

test("occurrences whose source is neither calendar nor gmail are ignored (recorded survivor 6)", () => {
  const w = world();
  inventory(w, { id: "e9", title: "Not a source", startTime: "2026-10-12T10:00:00Z" }, "manual");
  ok(loadCandidates({ ...w.deps.sources, tenantId: "A" }, w.deps).tagged.length === 0, "manual source ignored");
  inventory(w, { id: "e9", title: "Gmail one", startTime: "2026-10-12T10:00:00Z" }, "gmail");
  ok(loadCandidates({ ...w.deps.sources, tenantId: "A" }, w.deps).tagged.map((c) => c.sessionKey).join() === "gmail:e9", "gmail key");
  w.done();
});
