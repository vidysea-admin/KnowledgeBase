import assert from "node:assert/strict";
import { mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, statSync, symlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";
import { alertIdFor } from "./calendar/alerts/attention-alerts.js";
import { readWebinarOperationState, writeWebinarOperationState } from "./calendar/schedule-state.js";
import { alertWhoHostOnly, loadCandidates, runAlertWho, type AlertWhoDeps } from "./alert-who-command.js";

const NOW = new Date("2026-10-10T10:00:00.000Z");
function snapshot(dir: string): string[] {
  const out: string[] = [];
  const walk = (d: string) => {
    for (const e of readdirSync(d, { withFileTypes: true })) {
      const p = path.join(d, e.name);
      out.push(`${path.relative(dir, p)}|${e.isDirectory() ? "d" : `${statSync(p).size}|${readFileSync(p, "utf8")}`}`);
      if (e.isDirectory()) walk(p);
    }
  };
  walk(dir);
  return out.sort();
}
function world(tenant = "A") {
  const root = mkdtempSync(path.join(tmpdir(), "alertwho-"));
  const stateDir = path.join(root, "webinars"), opsFile = path.join(root, "operations.json");
  mkdirSync(path.join(stateDir, "scheduled"), { recursive: true });
  const out: string[] = [];
  const deps: AlertWhoDeps = {
    resolveTenant: (rest) => (rest[0] === "--tenant" ? rest[1]! : tenant),
    sources: { dataRoot: root, stateDir, operationsFile: opsFile, tenantId: "" }, readOperations: readWebinarOperationState as never,
    now: () => NOW, write: (l) => out.push(l),
  };
  return { root, stateDir, opsFile, out, deps, done: () => rmSync(root, { recursive: true, force: true }) };
}
type W = ReturnType<typeof world>;
function putOps(w: W, tenant: string, rows: Record<string, Record<string, unknown>>) {
  const operations: Record<string, Record<string, unknown>> = {};
  for (const [k, v] of Object.entries(rows)) operations[k] = { tenantId: tenant, status: "queued", ...v };
  writeWebinarOperationState(w.opsFile, { version: 1, tenantId: tenant, operations } as never);
}
// ISS-ALERTID-006: the scheduler's files are tenant-tagged. putJob/putState write the CURRENT format for `tenant`; the *Legacy helpers write the
// old untagged shapes exactly as recorded in the ledger (bare map / bare job).
const putJob = (w: W, name: string, job: unknown, tenant = "A") =>
  writeFileSync(path.join(w.stateDir, "scheduled", name), JSON.stringify(Array.isArray(job) ? job : { tenantId: tenant, ...(job as object) }));
const putState = (w: W, entries: Record<string, unknown>, tenant = "A") =>
  writeFileSync(path.join(w.stateDir, "schedule-state.json"), JSON.stringify({ version: 2, tenantId: tenant, entries }));
const putJobLegacy = (w: W, name: string, job: unknown) => writeFileSync(path.join(w.stateDir, "scheduled", name), JSON.stringify(job));
const putStateLegacy = (w: W, entries: Record<string, unknown>) => writeFileSync(path.join(w.stateDir, "schedule-state.json"), JSON.stringify(entries));

test("resolves a scheduled meeting from all three sources and merges them; prints title, time, platform, host, record", () => {
  const w = world();
  putState(w, { "cal:e1": { sessionKey: "cal:e1", title: "Team Sync", scheduledAt: "2026-10-10T09:00:00.000Z" } });
  putJob(w, "j1.json", { sessionId: "cal:e1", url: "https://zoom.us/j/12345678901?pwd=SECRETPASS", until: "2026-10-12T10:30:00Z", title: "Team Sync" });
  putOps(w, "A", { "webinar-0123456789abcdef01234567": { title: "Quarterly Webinar", startTime: "2026-10-12T10:00:00.000Z", status: "queued" } });
  assert.equal(runAlertWho([`[${alertIdFor("cal:e1")}]`, "--tz", "Asia/Kolkata"], w.deps), 0);
  const text = w.out.join("\n");
  assert.match(text, /record:   cal:e1/);
  assert.match(text, /title:    Team Sync/);
  assert.match(text, /time:     ends 2026-10-12 16:00 \(Asia\/Kolkata\)/);
  assert.match(text, /platform: zoom \(zoom\.us\)/);
  assert.match(text, /source:   schedule-state, scheduled-job/);
  w.out.length = 0;
  assert.equal(runAlertWho([alertIdFor("webinar-0123456789abcdef01234567")], w.deps), 0);
  assert.match(w.out.join("\n"), /Quarterly Webinar[\s\S]*status queued/);
  w.done();
});

test("no match: exit 1, says skipped sessions are not saved; unreadable state is flagged, not hidden", () => {
  const w = world();
  assert.equal(runAlertWho([alertIdFor("cal:nothing")], w.deps), 1);
  assert.match(w.out.join("\n"), /no record matches alert id/);
  assert.match(w.out.join("\n"), /source inventory in operations\.json/);
  assert.ok(!/for tenant/i.test(w.out.join("\n")));
  writeFileSync(path.join(w.stateDir, "schedule-state.json"), "{not json");
  w.out.length = 0;
  assert.equal(runAlertWho([alertIdFor("cal:nothing")], w.deps), 1);
  assert.match(w.out.join("\n"), /schedule-state\.json is unreadable or corrupt/);
  assert.match(w.out.join("\n"), /not proof/);
  w.done();
});

test("malformed ids: refused with one line, exit 1, nothing else printed", () => {
  const w = world();
  for (const bad of ["abc", "z".repeat(20), `id:${alertIdFor("cal:e1")}`, `${alertIdFor("cal:e1")}ff`]) {
    w.out.length = 0;
    assert.equal(runAlertWho([bad], w.deps), 1, bad);
    assert.equal(w.out.length, 1);
    assert.match(w.out[0]!, /^alert-who refused: the id is /);
  }
  assert.throws(() => runAlertWho([], w.deps), /usage: lkb alert-who/);
  assert.throws(() => runAlertWho(["a", "b"], w.deps), /usage/);
  assert.throws(() => runAlertWho([alertIdFor("x"), "--bogus"], w.deps), /usage/);
  w.done();
});

test("duplicate rows for one session merge into one candidate; distinct sessions stay distinct", () => {
  const w = world();
  putState(w, { a: { sessionKey: "cal:one", title: "One" }, b: { sessionKey: "cal:two", title: "Two" } });
  putJob(w, "j.json", { sessionId: "cal:one", url: "https://zoom.us/j/1", until: "2026-10-12T10:00:00Z", title: "One" });
  const { tagged } = loadCandidates({ ...w.deps.sources, tenantId: "A" }, w.deps);
  assert.equal(tagged.length, 2);
  w.done();
});

const HOSTILE = [
  "Evil \u001b[2J\u001b[31mred\u001b[0m title", "line1\r\nFAKE: title:    forged line\nmore", "rtl \u202eevil\u202c text \u2066x\u2069", "A".repeat(10000),
  "\u009b31m csi", "\u001b]0;pwned\u0007 osc", "tab\tnull\u0000end", "normal\u2028sep\u2029para",
];
test("hostile titles come out inert: one output line per field, no control/escape/bidi chars, bounded", () => {
  for (const t of HOSTILE) {
    const w = world();
    putState(w, { k: { sessionKey: "cal:h", title: t } });
    assert.equal(runAlertWho([alertIdFor("cal:h")], w.deps), 0);
    assert.equal(w.out.length, 6, JSON.stringify(t).slice(0, 30)); // header + 5 fields, nothing injected
    for (const line of w.out) {
      assert.ok(!/[\u0000-\u001f\u007f-\u009f\u2028\u2029\u200e\u200f\u202a-\u202e\u2066-\u2069]/.test(line), JSON.stringify(line).slice(0, 60));
      assert.ok(line.length < 260);
    }
    assert.ok(w.out[2]!.startsWith("  title:    "));
    assert.equal(w.out.filter((l) => l.startsWith("  title:")).length, 1);
    w.done();
  }
});

test("hostile session key and host values are reduced to a plain charset on one line", () => {
  const w = world();
  const key = "cal:\u001b[31mX\r\nrecord: forged";
  putJob(w, "x.json", { sessionId: key, url: "https://exa\u202emple.com/a", until: "2026-10-12T10:00:00Z", title: "t" });
  assert.equal(runAlertWho([alertIdFor(key)], w.deps), 0);
  assert.equal(w.out.length, 6);
  assert.ok(!/[\u0000-\u001f\u007f\u202e]/.test(w.out.join("")));
  w.done();
});

test("join URL: platform and bare host only; no query, path, fragment or userinfo ever printed", () => {
  const w = world();
  const urls = ["https://zoom.us/j/99999999999?pwd=PWDVALUE123", "https://teams.microsoft.com/l/meetup-join/19%3ameeting_SECRETTHREAD@thread.v2/0?context=CTXVAL&token=TOKVAL",
    "https://meet.google.com/abc-defg-hij?authuser=0&odd_param_name=ODDVALUE#frag=FRAGVAL", "https://user:USERPASS@webex.com/meet/room?passcode=PC9&p=ZZ"];
  const secrets = ["PWDVALUE123", "SECRETTHREAD", "CTXVAL", "TOKVAL", "ODDVALUE", "FRAGVAL", "USERPASS", "PC9", "j/9999", "abc-defg", "meetup-join", "?", "authuser", "meet/room"];
  urls.forEach((u, i) => putJob(w, `j${i}.json`, { sessionId: `cal:u${i}`, url: u, until: "2026-10-12T10:00:00Z", title: "t" }));
  urls.forEach((_u, i) => {
    w.out.length = 0;
    assert.equal(runAlertWho([alertIdFor(`cal:u${i}`)], w.deps), 0);
    const text = w.out.join("\n");
    for (const s of secrets) assert.ok(!text.includes(s), `${s} leaked for ${i}`);
    assert.match(text, /platform: (zoom|teams|meet|webex) \([a-z.]+\)/);
  });
  assert.equal(alertWhoHostOnly("http://zoom.us/j/1"), undefined);
  assert.equal(alertWhoHostOnly("javascript:alert(1)"), undefined);
  assert.equal(alertWhoHostOnly(5), undefined);
  assert.equal(alertWhoHostOnly("https://user:p@Zoom.us:443/x?pwd=1"), "zoom.us");
  w.done();
});

test("two tenants: tenant A never reads tenant B's tenant-tagged state", () => {
  const w = world();
  putOps(w, "B", { "webinar-bbbbbbbbbbbbbbbbbbbbbbbb": { title: "Tenant B Board Review", startTime: "2026-10-12T10:00:00.000Z" } });
  const idB = alertIdFor("webinar-bbbbbbbbbbbbbbbbbbbbbbbb");
  assert.equal(runAlertWho([idB, "--tenant", "A"], w.deps), 1);
  const text = w.out.join("\n");
  assert.ok(!text.includes("Tenant B"));
  assert.match(text, /belongs to a different tenant/);
  w.out.length = 0;
  assert.equal(runAlertWho([idB, "--tenant", "B"], w.deps), 0);
  assert.match(w.out.join("\n"), /Tenant B Board Review/);
  w.done();
});

test("tenant comes from the host's rule only: the id never reaches tenant selection", () => {
  const w = world();
  const seen: string[][] = [];
  w.deps.resolveTenant = (rest) => { seen.push(rest); return "A"; };
  putOps(w, "A", { "webinar-aaaaaaaaaaaaaaaaaaaaaaaa": { title: "A session" } });
  runAlertWho([alertIdFor("webinar-aaaaaaaaaaaaaaaaaaaaaaaa")], w.deps);
  assert.deepEqual(seen, [[]]);
  runAlertWho([alertIdFor("x"), "--tenant", "A"], w.deps);
  assert.deepEqual(seen[1], ["--tenant", "A"]);
  // and a state file tagged with the tenant that looks like the id is not consulted for another tenant
  const w2 = world("ZZZ");
  putOps(w2, "A", { "webinar-aaaaaaaaaaaaaaaaaaaaaaaa": { title: "A session" } });
  assert.equal(runAlertWho([alertIdFor("webinar-aaaaaaaaaaaaaaaaaaaaaaaa")], w2.deps), 1);
  w.done(); w2.done();
});

test("missing, corrupt, oversize and wrong-shape state: clear message, no throw", () => {
  const w = world();
  assert.equal(runAlertWho([alertIdFor("k")], w.deps), 1); // all absent
  assert.deepEqual(w.out.filter((l) => l.startsWith("warning")), []);
  w.out.length = 0;
  writeFileSync(w.opsFile, "garbage");
  putJob(w, "bad.json", [1, 2]);
  putJob(w, "bad2.json", { sessionId: 5 });
  writeFileSync(path.join(w.stateDir, "scheduled", "big.json"), " ".repeat(70 * 1024));
  writeFileSync(path.join(w.stateDir, "schedule-state.json"), "[1]");
  assert.equal(runAlertWho([alertIdFor("k")], w.deps), 1);
  const warn = w.out.filter((l) => l.startsWith("warning"));
  assert.ok(warn.some((l) => /operations\.json/.test(l)));
  assert.ok(warn.some((l) => /scheduled job file/.test(l)));
  assert.ok(warn.some((l) => /schedule-state\.json/.test(l)));
  try { symlinkSync(w.opsFile, path.join(w.stateDir, "scheduled", "link.json")); } catch { /* no symlink privilege: skip */ }
  assert.equal(runAlertWho([alertIdFor("k")], w.deps), 1);
  w.done();
});

test("row cap: only the first 20000 state rows are read", () => {
  const w = world();
  const e: Record<string, unknown> = {};
  for (let i = 0; i < 20005; i++) e[`k${i}`] = { sessionKey: `cal:${i}`, title: "t" };
  putState(w, e);
  const { tagged } = loadCandidates({ ...w.deps.sources, tenantId: "A" }, w.deps);
  assert.equal(tagged.length, 20000);
  w.done();
});

test("the command writes nothing anywhere: temp tree is byte-identical before and after, on hit, miss and refusal", () => {
  const w = world();
  putState(w, { k: { sessionKey: "cal:e1", title: "T" } });
  putJob(w, "j.json", { sessionId: "cal:e1", url: "https://zoom.us/j/1", until: "2026-10-12T10:00:00Z", title: "T" });
  putOps(w, "A", { "webinar-cccccccccccccccccccccccc": { title: "C" } });
  const before = snapshot(w.root);
  runAlertWho([alertIdFor("cal:e1")], w.deps);
  runAlertWho([alertIdFor("nope")], w.deps);
  runAlertWho(["bad"], w.deps);
  assert.deepEqual(snapshot(w.root), before);
  w.done();
});

test("ISS-ALERTID-003 recorded reproduction, verbatim: tenant B's job id under --tenant A discloses nothing (untagged job file as recorded)", () => {
  const w = world();
  putJobLegacy(w, "b.json", { sessionId: "cal:tenantB", title: "TENANT-B Board Review" });
  putOps(w, "B", { "webinar-bbbbbbbbbbbbbbbbbbbbbbbb": { title: "B ops row" } });
  const id = alertIdFor("cal:tenantB");
  assert.equal(runAlertWho([id, "--tenant", "A"], w.deps), 1);
  const text = w.out.join("\n");
  assert.ok(!/TENANT-B|Board Review/.test(text), text);
  assert.ok(!/for tenant/i.test(text), "no tenant claim the data cannot back");
  assert.match(text, /1 file\(s\) in scheduled\/ have no tenant tag/);
  assert.match(text, /no record matches alert id/);
  // the same untagged file is refused for tenant B as well: it cannot be shown to belong to anyone
  w.out.length = 0;
  assert.equal(runAlertWho([id, "--tenant", "B"], w.deps), 1);
  assert.ok(!w.out.join("\n").includes("Board Review"));
  w.done();
});

test("ISS-ALERTID-006: tagged state is found by its own tenant only (jobs and schedule-state); the old --include-untagged flag is now a usage error", () => {
  const w = world();
  putJob(w, "b.json", { sessionId: "cal:tenantB", title: "TENANT-B Board Review" }, "B");
  putState(w, { k: { sessionKey: "cal:stateB", title: "STATE-B Offsite" } }, "B");
  assert.equal(runAlertWho([alertIdFor("cal:tenantB"), "--tenant", "B"], w.deps), 0);
  assert.match(w.out.join("\n"), /title:    TENANT-B Board Review/);
  assert.ok(!w.out.join("\n").includes("tenant unknown"));
  w.out.length = 0;
  assert.equal(runAlertWho([alertIdFor("cal:stateB"), "--tenant", "B"], w.deps), 0);
  for (const id of ["cal:tenantB", "cal:stateB"]) {
    w.out.length = 0;
    assert.equal(runAlertWho([alertIdFor(id), "--tenant", "A"], w.deps), 1);
    const text = w.out.join("\n");
    assert.ok(!/TENANT-B|STATE-B|Board Review|Offsite/.test(text), text);
    assert.match(text, /different tenant/);
  }
  assert.throws(() => runAlertWho([alertIdFor("cal:tenantB"), "--include-untagged"], w.deps), /usage/);
  w.done();
});

test("legacy untagged schedule-state.json is refused with an operator message and is left on disk byte-for-byte", () => {
  const w = world();
  putStateLegacy(w, { "cal:old": { sessionKey: "cal:old", title: "OLD UNTAGGED TITLE", scheduledAt: "2026-10-10T09:00:00.000Z" } });
  const before = snapshot(w.root);
  assert.equal(runAlertWho([alertIdFor("cal:old")], w.deps), 1);
  const text = w.out.join("\n");
  assert.ok(!text.includes("OLD UNTAGGED TITLE"));
  assert.match(text, /warning: refusing schedule-state\.json: it has no tenant tag/);
  assert.match(text, /not read, changed or deleted/);
  assert.deepEqual(snapshot(w.root), before);
  w.done();
});

test("two tenants' operations plus tagged schedule files: A and B each see only their own rows", () => {
  const w = world();
  putOps(w, "B", { "webinar-bbbbbbbbbbbbbbbbbbbbbbbb": { title: "Tenant B Board Review" } });
  putJob(w, "a.json", { sessionId: "cal:ownerA", title: "OWNER-A Offsite" }, "A");
  putJob(w, "b.json", { sessionId: "cal:ownerB", title: "OWNER-B Offsite" }, "B");
  for (const [t, own, other] of [["A", "cal:ownerA", "cal:ownerB"], ["B", "cal:ownerB", "cal:ownerA"]] as const) {
    w.out.length = 0;
    assert.equal(runAlertWho([alertIdFor(own), "--tenant", t], w.deps), 0);
    assert.match(w.out.join("\n"), new RegExp(`OWNER-${t} Offsite`));
    w.out.length = 0;
    assert.equal(runAlertWho([alertIdFor(other), "--tenant", t], w.deps), 1);
    assert.ok(!/OWNER-/.test(w.out.join("\n")), `${t}: ${w.out.join("\n")}`);
  }
  w.out.length = 0;
  assert.equal(runAlertWho([alertIdFor("webinar-bbbbbbbbbbbbbbbbbbbbbbbb"), "--tenant", "B"], w.deps), 0);
  assert.match(w.out.join("\n"), /Tenant B Board Review/);
  w.done();
});

test("a miss never claims a tenant scope it cannot back: no 'for tenant' in any output", () => {
  const w = world();
  for (const flags of [[], ["--tenant", "ZED"]]) {
    w.out.length = 0;
    assert.equal(runAlertWho([alertIdFor("cal:nothing"), ...flags], w.deps), 1);
    assert.ok(!/for tenant/i.test(w.out.join("\n")), flags.join(" "));
  }
  w.done();
});

function junction(target: string, link: string): boolean {
  try { symlinkSync(target, link, "junction"); return true; } catch { return false; }
}

test("ISS-ALERTID-005: a junction at scheduled/ or in front of operations.json is not followed out of the data root", (t) => {
  const w = world(), outside = mkdtempSync(path.join(tmpdir(), "alertwho-outside-"));
  writeFileSync(path.join(outside, "j.json"), JSON.stringify({ sessionId: "cal:escape", title: "OUTSIDE TITLE" }));
  rmSync(path.join(w.stateDir, "scheduled"), { recursive: true });
  if (!junction(outside, path.join(w.stateDir, "scheduled"))) { t.skip("cannot create a junction here"); rmSync(outside, { recursive: true, force: true }); w.done(); return; }
  assert.equal(runAlertWho([alertIdFor("cal:escape")], w.deps), 1);
  assert.ok(!w.out.join("\n").includes("OUTSIDE TITLE"));
  assert.match(w.out.join("\n"), /warning: scheduled\/ resolves outside the data root \(link not followed; skipped\)/);
  // operations.json behind a junctioned directory
  const opsOut = mkdtempSync(path.join(tmpdir(), "alertwho-opsout-"));
  writeWebinarOperationState(path.join(opsOut, "operations.json"), { version: 1, tenantId: "A", operations: { "webinar-eeeeeeeeeeeeeeeeeeeeeeee": { tenantId: "A", status: "queued", title: "OPS OUTSIDE" } } } as never);
  assert.ok(junction(opsOut, path.join(w.root, "ops-link")));
  w.deps.sources.operationsFile = path.join(w.root, "ops-link", "operations.json");
  w.out.length = 0;
  assert.equal(runAlertWho([alertIdFor("webinar-eeeeeeeeeeeeeeeeeeeeeeee")], w.deps), 1);
  assert.ok(!w.out.join("\n").includes("OPS OUTSIDE"));
  assert.match(w.out.join("\n"), /warning: operations\.json resolves outside the data root/);
  w.done(); rmSync(outside, { recursive: true, force: true }); rmSync(opsOut, { recursive: true, force: true });
});

test("ISS-ALERTID-005: the per-job size cap is pinned at 64 KiB with valid JSON on both sides of it", () => {
  const w = world();
  putJob(w, "big.json", { sessionId: "cal:big", title: "BIG", pad: "x".repeat(70 * 1024) });
  putJob(w, "ok.json", { sessionId: "cal:ok", title: "OK", pad: "x".repeat(60 * 1024) });
  assert.equal(runAlertWho([alertIdFor("cal:big")], w.deps), 1);
  assert.match(w.out.join("\n"), /warning: a scheduled job file is unreadable or corrupt/);
  assert.ok(!w.out.join("\n").includes("BIG"));
  w.out.length = 0;
  assert.equal(runAlertWho([alertIdFor("cal:ok")], w.deps), 0);
  assert.match(w.out.join("\n"), /title:    OK/);
  w.done();
});
