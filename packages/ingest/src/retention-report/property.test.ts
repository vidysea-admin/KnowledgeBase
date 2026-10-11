import assert from "node:assert/strict";
import { existsSync, linkSync, mkdirSync, mkdtempSync, rmSync, statSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import test from "node:test";
import { gatherState } from "../retention-report-state.js";
import { planRetentionSweep } from "../retention-sweep.js";
import { DAY, NOW, baseArgs, iso, runCmd, tempRoot, writeSession, type SessionSpec } from "../retention-report.fixtures.js";

function rng(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const POOL = 260;
const spellings = (k: number): string[] => [`m/f${k}.webm`, `m/./f${k}.webm`, `M/F${k}.WEBM`, `m//f${k}.webm`];

/** One batch of 400 sessions over a shared pool of media files (so many files are referenced by several records). */
function batch(seed: number, corruptRate: number): { sessions: SessionSpec[]; linked: Array<[string, string]>; opsRows: Record<string, unknown> } {
  const r = rng(seed);
  const sessions: SessionSpec[] = [];
  const linked: Array<[string, string]> = [];
  const opsRows: Record<string, unknown> = {};
  for (let i = 0; i < 400; i++) {
    const k = Math.floor(r() * POOL);
    const roll = r();
    const name = `s${i}`;
    const mediaPath = roll < 0.1 ? `h/l${i}.webm` : spellings(k)[Math.floor(r() * 4)] as string;
    if (roll < 0.1) linked.push([`h/l${i}.webm`, `m/f${k}.webm`]);
    const processedAt = r() < 0.85 ? { processedAt: iso([40, 20, 9, 3, 0.5][Math.floor(r() * 5)] as number * DAY) } : r() < 0.5 ? {} : { processedAt: "tomorrow" };
    sessions.push({
      name, ...processedAt, mediaPath, createMedia: roll >= 0.1, mediaBytes: 1 + (k % 40),
      mediaMtimeMs: NOW - ([5000, 3 * DAY, 20 * DAY, 60 * DAY, -9 * DAY][Math.floor(r() * 5)] as number),
      ...(r() < 0.12 ? { claims: [{ _id: "c", tenantId: "toc", text: "x", status: "needs-review", evidence: [{ turnId: `${name}-t1`, sessionId: name }] }] } : {}),
      ...(r() < 0.06 ? { status: { transcribe: "pending", index: "done" } } : {}),
      ...(r() < corruptRate ? { raw: { "source.json": '{"_id":"x","tenantId":"toc","kind":"rec' } } : {}),
    });
    if (r() < 0.05) opsRows[`${name}-src`] = { status: ["recording", "processing", "failed", "mystery"][Math.floor(r() * 4)] };
    else if (r() < 0.1) opsRows[name] = { status: "ready" };
  }
  return { sessions, linked, opsRows };
}

test("downgrade-only at FILE level: 2,000 seeded sessions (2 batches carry unreadable records) (5 x 400) incl. shared files, hardlinks, case and ./ spellings and pipeline rows", (t) => {
  let dirtyChecked = 0, eligibleFiles = 0, vetoed = 0, mixedFiles = 0, inProgress = 0;
  for (const seed of [11, 22, 33, 44, 55]) {
    const root = tempRoot(), media = tempRoot(), scratch = mkdtempSync(join(tmpdir(), "t046dry-prop-"));
    try {
      const dirty = seed === 22 || seed === 44; // these two batches carry truncated (unreadable) records at about 1%
      const { sessions, linked, opsRows } = batch(seed, dirty ? 0.01 : 0);
      assert.ok(!dirty || sessions.some((s) => s.raw), "a dirty batch has at least one unreadable record");
      for (const s of sessions) writeSession(root, media, s);
      for (const [link, target] of linked) {
        if (!existsSync(join(media, target))) {
          const h: SessionSpec = { name: `t-${target}`.replace(/\W/g, ""), mediaPath: target, mediaMtimeMs: NOW - 60 * DAY, processedAt: iso(40 * DAY) };
          sessions.push(h);
          writeSession(root, media, h);
        }
        if (!existsSync(join(media, link))) { mkdirSync(dirname(join(media, link)), { recursive: true }); linkSync(join(media, target), join(media, link)); }
      }
      const ops = join(scratch, "operations.json");
      writeFileSync(ops, JSON.stringify({ operations: opsRows }));
      const res = runCmd(baseArgs(root, media, ["--operations-state", ops]));
      assert.equal(res.code, 0, res.err);
      // oracle, independent of the command's identity code: device:index of each record's file, straight from stat
      const physical = new Map<string, string>(); // session mediaId -> "dev:ino"
      const size = new Map<string, number>();
      for (const s of sessions) {
        const p = join(media, s.mediaPath as string);
        if (!existsSync(p)) continue;
        const st = statSync(p, { bigint: true });
        physical.set(`${s.name}-src`, `${st.dev}:${st.ino}`);
        size.set(`${st.dev}:${st.ino}`, Number(st.size));
      }
      const reported = new Map<string, boolean>();
      for (const m of res.out.matchAll(/^RECORDING (\S+) => (ELIGIBLE|KEEP)$/gm)) reported.set(m[1] as string, m[2] === "ELIGIBLE");
      if (dirty) {
        assert.equal([...reported.values()].filter(Boolean).length, 0, "an unreadable record is in scope: the eligible set must be EMPTY");
        assert.match(res.out, /^!! SCOPE INCOMPLETE/m);
        dirtyChecked++;
        continue;
      }
      const g = gatherState({ tenant: "toc", dataRoot: root, mediaRoot: media, minAgeDays: 7, clipPaddingSeconds: 15, operationsState: "x" });
      assert.ok(g.ok);
      if (!g.ok) return;
      const planned = planRetentionSweep({ tenantId: "toc", media: g.value.media, claims: g.value.claims, turns: g.value.turns, now: NOW, params: { minAgeAfterProcessedMs: 7 * DAY, clipPaddingSeconds: 15 } });
      assert.ok(planned.ok);
      if (!planned.ok) return;
      const alone = new Set(planned.plan.items.filter((it) => it.decision === "purge-eligible").map((it) => it.mediaId));
      for (const [id, el] of reported) if (el) assert.ok(alone.has(id), `${id} ELIGIBLE but the planner alone did not say so`);
      const byFile = new Map<string, string[]>();
      for (const [id, f] of physical) byFile.set(f, [...(byFile.get(f) ?? []), id]);
      let bytes = 0, files = 0;
      for (const [f, ids] of byFile) {
        const flags = ids.map((id) => reported.get(id) === true);
        if (flags.some(Boolean)) {
          assert.ok(flags.every(Boolean), `file ${f}: eligible although a record that references it is not`);
          eligibleFiles++; files++; bytes += size.get(f) ?? 0;
        } else if (ids.length > 1) mixedFiles++;
      }
      vetoed += (res.out.match(/guard: shared-media-not-all-eligible/g) ?? []).length;
      inProgress += (res.out.match(/guard: operation-in-progress/g) ?? []).length;
      const tot = /^TOTALS eligible: \d+ recording\(s\) = (\d+) file\(s\), (\d+) B/m.exec(res.out);
      assert.deepEqual([Number(tot?.[1]), Number(tot?.[2])], [files, bytes], "eligible totals count each physical file once");
    } finally { for (const d of [root, media, scratch]) rmSync(d, { recursive: true, force: true }); }
  }
  t.diagnostic(`dirty batches with an empty eligible set ${dirtyChecked}; eligible files ${eligibleFiles}, shared-media vetoes ${vetoed}, multi-record files with none eligible ${mixedFiles}, operation-in-progress ${inProgress}`);
  assert.ok(eligibleFiles > 20 && vetoed > 20 && mixedFiles > 20 && inProgress > 5, `not vacuous: eligible files ${eligibleFiles}, vetoed ${vetoed}, mixed files ${mixedFiles}, in-progress ${inProgress}`);
});
