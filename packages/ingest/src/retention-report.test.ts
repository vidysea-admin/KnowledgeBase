import assert from "node:assert/strict";
import { mkdirSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import test from "node:test";
import { CAPS, tenantSegment } from "./retention-report-state.js";
import { DAY, NOW, baseArgs, iso, runCmd, tempRoot, writeSession } from "./retention-report.fixtures.js";

function withRoots(fn: (root: string, media: string) => void): void {
  const root = tempRoot();
  const media = tempRoot();
  try { fn(root, media); } finally { rmSync(root, { recursive: true, force: true }); rmSync(media, { recursive: true, force: true }); }
}
const old = { processedAt: iso(10 * DAY) };

test("eligible and kept recordings are reported with reasons, sizes and byte totals", () => withRoots((root, media) => {
  writeSession(root, media, { name: "s-ok", mediaPath: "a/ok.webm", mediaBytes: 100, ...old });
  writeSession(root, media, { name: "s-unver", mediaPath: "a/unver.webm", mediaBytes: 50, ...old,
    claims: [{ _id: "c", tenantId: "toc", text: "x", status: "needs-review", evidence: [{ turnId: "s-unver-t1", sessionId: "s-unver" }] }] });
  const r = runCmd(baseArgs(root, media));
  assert.equal(r.code, 0, r.err);
  assert.match(r.out, /RECORDING s-ok-src => ELIGIBLE/);
  assert.match(r.out, /RECORDING s-unver-src => KEEP/);
  assert.match(r.out, /file: a\/ok\.webm {2}size: 100 B {2}age: 10\.0 d since processedAt/);
  assert.match(r.out, /claims-verified=FAIL\(0\/1 verified\)/);
  assert.match(r.out, /reason: 1 claim\(s\) citing this media are not yet verified/);
  assert.match(r.out, /would retain 1 evidence-clip window/);
  assert.match(r.out, /TOTALS eligible: 1 recording\(s\), 100 B \| kept: 1 recording\(s\), 50 B/);
  assert.match(r.out, /min-age-days=7 \(604800000 ms\) {2}clip-padding-seconds=15/);
}));

test("thresholds are required: no default, usage error, no report", () => withRoots((root, media) => {
  const base = ["--tenant", "toc", "--data-root", root];
  for (const args of [base, [...base, "--min-age-days", "7"], [...base, "--clip-padding-seconds", "15"]]) {
    const r = runCmd(args);
    assert.equal(r.code, 2);
    assert.equal(r.out, "");
    assert.match(r.err, /owner decision/);
    assert.match(r.err, /ARCHITECTURE Q6/);
    assert.match(r.err, /example: retention-report --tenant toc/);
  }
  for (const bad of ["0", "-1", "abc", "1e3", "NaN", "Infinity", "", "99999999999"]) {
    const r = runCmd([...base, "--min-age-days", bad, "--clip-padding-seconds", "15"]);
    assert.equal(r.code, 2, `min-age-days=${bad}`);
    assert.equal(r.out, "");
  }
  assert.equal(runCmd([...base, "--min-age-days", "7", "--clip-padding-seconds", "0"]).code, 2);
  assert.equal(media.length > 0, true);
}));

test("--apply and every unknown option or stray argument is rejected, nothing is reported", () => withRoots((root, media) => {
  for (const extra of [["--apply"], ["--apply=true"], ["--force"], ["--yes"], ["--delete"], ["--dry-run=false"], ["stray"], ["--tenant", "other"], ["--min-age-days", "9"]]) {
    const r = runCmd(baseArgs(root, media, extra));
    assert.equal(r.code, 2, extra.join(" "));
    assert.equal(r.out, "");
    assert.match(r.err, /usage: retention-report/);
  }
  assert.match(runCmd(baseArgs(root, media, ["--apply"])).err, /unknown option or argument: --apply/);
}));

test("every precondition at its boundary: age, processing status, claims", () => withRoots((root, media) => {
  const min = 7 * DAY;
  writeSession(root, media, { name: "b-exact", processedAt: iso(min) });
  writeSession(root, media, { name: "b-short", processedAt: iso(min - 1) });
  writeSession(root, media, { name: "b-future", processedAt: iso(-1) });
  writeSession(root, media, { name: "b-notdone", status: { transcribe: "pending", index: "done" }, processedAt: iso(30 * DAY) });
  writeSession(root, media, { name: "b-noindex", status: { transcribe: "done", index: "pending" }, processedAt: iso(30 * DAY) });
  writeSession(root, media, { name: "b-nopa" });
  writeSession(root, media, { name: "b-noclaim", processedAt: iso(30 * DAY), claims: [] });
  writeSession(root, media, { name: "b-purged", processedAt: iso(30 * DAY), purgedAt: iso(DAY) });
  const out = runCmd(baseArgs(root, media)).out;
  const block = (id: string): string => out.split("RECORDING ").find((b) => b.startsWith(`${id}-src`)) ?? "";
  assert.match(block("b-exact"), /=> ELIGIBLE/);
  assert.match(block("b-short"), /=> KEEP[\s\S]*age=FAIL[\s\S]*under the 604800000 ms minimum/);
  assert.match(block("b-future"), /=> KEEP[\s\S]*in the future/);
  assert.match(block("b-notdone"), /=> KEEP[\s\S]*transcribed=FAIL[\s\S]*processedAt=FAIL\(missing\)[\s\S]*not processed/);
  assert.match(block("b-noindex"), /=> KEEP[\s\S]*indexed=FAIL[\s\S]*not processed/);
  assert.match(block("b-nopa"), /=> KEEP[\s\S]*processedAt=FAIL\(missing\)/);
  assert.match(block("b-noclaim"), /=> KEEP[\s\S]*claims-verified=FAIL\(no claim cites it\)[\s\S]*no claim has cited/);
  assert.match(block("b-purged"), /=> KEEP[\s\S]*already purged/);
  assert.match(out, /TOTALS eligible: 1 recording\(s\)/);
}));

test("checker input 1 (ISS-T046-001): tenantId only on a prototype key stays KEEP through the command", () => withRoots((root, media) => {
  writeSession(root, media, { name: "proto", ...old, raw: {
    "source.json": '{"_id":"m1","kind":"recording","__proto__":{"tenantId":"toc"}}',
  } });
  const r = runCmd(baseArgs(root, media));
  assert.equal(r.code, 0);
  assert.match(r.out, /RECORDING m1 => KEEP/);
  assert.match(r.out, /missing or invalid own tenantId/);
  assert.match(r.out, /TOTALS eligible: 0 recording\(s\)/);
}));

test("checker input 2 (ISS-T046-002/004): lenient or truncated processedAt values stay KEEP, naming the failed precondition", () => withRoots((root, media) => {
  const values = ["1", "0", "12", "2020", "2020-01-01T00:00:00Z\u0000", "2026-09-26x", "tomorrow", 1, null];
  values.forEach((v, i) => writeSession(root, media, { name: `pa${i}`, processedAt: v }));
  const out = runCmd(baseArgs(root, media)).out;
  assert.match(out, /TOTALS eligible: 0 recording\(s\)/);
  assert.equal(out.match(/processedAt=FAIL\(malformed\)/g)?.length, values.length);
  assert.equal(out.match(/reason: malformed processedAt/g)?.length, values.length);
}));

test("two tenants: only the requested tenant's directory is read and no other tenant's recording is printed", () => withRoots((root, media) => {
  writeSession(root, media, { tenant: "toc", name: "toc-1", ...old });
  writeSession(root, media, { tenant: "acme", name: "acme-secret-1", mediaId: "ACME-REC-9", title: "Acme private", ...old });
  const toc = runCmd(baseArgs(root, media, [], "toc"));
  assert.match(toc.out, /toc-1/);
  assert.doesNotMatch(toc.out, /acme|ACME/i);
  const acme = runCmd(baseArgs(root, media, [], "acme"));
  assert.match(acme.out, /ACME-REC-9/);
  assert.doesNotMatch(acme.out, /toc-1/);
  // a record tagged for another tenant planted inside toc's directory is excluded and counted, never listed
  writeSession(root, media, { tenant: "toc", name: "planted", srcTenant: "acme", mediaId: "PLANTED-ACME-REC", ...old });
  const again = runCmd(baseArgs(root, media, [], "toc"));
  assert.doesNotMatch(again.out, /PLANTED-ACME-REC/);
  assert.match(again.out, /other-tenant records excluded: 1/);
  assert.match(again.out, /TOTALS eligible: 1 recording\(s\)/);
  assert.equal(runCmd(baseArgs(root, media, [], "nobody")).code, 3);
}));

test("missing or unreadable state exits non-zero with a message, no report", () => withRoots((root, media) => {
  const noRoot = runCmd(baseArgs(join(root, "does-not-exist"), media));
  assert.equal(noRoot.code, 3);
  assert.equal(noRoot.out, "");
  assert.match(noRoot.err, /cannot read this tenant's state/);
  mkdirSync(join(root, "x"));
  assert.equal(runCmd(baseArgs(root, media)).code, 3); // data root exists, tenant directory does not
  writeFileSync(join(root, tenantSegment("toc")), "a file, not a directory");
  assert.equal(runCmd(baseArgs(root, media)).code, 3);
}));

test("corrupt and oversized per-session state is reported as kept, never eligible", () => withRoots((root, media) => {
  writeSession(root, media, { name: "good", ...old });
  writeSession(root, media, { name: "bad-src", ...old, raw: { "source.json": "{not json" } });
  writeSession(root, media, { name: "bad-ses", ...old, raw: { "session.json": "[]" } });
  const r = runCmd(baseArgs(root, media));
  assert.equal(r.code, 0);
  assert.match(r.out, /RECORDING bad-src => KEEP[\s\S]*unreadable state, kept: source\.json: not valid JSON/);
  assert.match(r.out, /RECORDING bad-ses => KEEP[\s\S]*session\.json: not an object/);
  assert.match(r.out, /RECORDING good-src => ELIGIBLE/);
  // corrupt claims.json could hide a citation: every recording is kept
  writeSession(root, media, { name: "bad-claims", ...old, raw: { "claims.json": "{{" } });
  const blocked = runCmd(baseArgs(root, media));
  assert.match(blocked.out, /TOTALS eligible: 0 recording\(s\)/);
  assert.match(blocked.out, /warning: session bad-claims: claims\.json not valid JSON; all recordings are kept/);
  assert.match(blocked.out, /unreadable claim record exists/);
}));

test("oversized state files are refused by size before parsing", () => withRoots((root, media) => {
  const big = `[${"0,".repeat(CAPS.maxFileBytes / 2)}0]`;
  writeSession(root, media, { name: "huge-turns", ...old, raw: { "turns.json": big } });
  const r = runCmd(baseArgs(root, media));
  assert.equal(r.code, 0);
  assert.match(r.out, /warning: session huge-turns: turns\.json larger than the per-file cap/);
  assert.match(r.out, /TOTALS eligible: 0 recording\(s\)/);
  writeSession(root, media, { name: "huge-src", raw: { "source.json": big } });
  assert.match(runCmd(baseArgs(root, media)).out, /RECORDING huge-src => KEEP[\s\S]*source\.json: larger than the per-file cap/);
}));

test("too many session directories refuses to guess", () => withRoots((root, media) => {
  const dir = join(root, tenantSegment("toc"));
  for (let i = 0; i <= CAPS.maxSessions; i++) mkdirSync(join(dir, `s${i}`), { recursive: true });
  const r = runCmd(baseArgs(root, media));
  assert.equal(r.code, 3);
  assert.match(r.err, /too many session directories/);
}));

test("non-recording sessions are skipped", () => withRoots((root, media) => {
  writeSession(root, media, { name: "doc", kind: "document" });
  writeSession(root, media, { name: "fine", ...old });
  const out = runCmd(baseArgs(root, media)).out;
  assert.match(out, /non-recording sessions skipped: 1/);
  assert.match(out, /file=PASS\(present\)/);
  assert.match(out, /TOTALS eligible: 1 recording\(s\)/);
}));
