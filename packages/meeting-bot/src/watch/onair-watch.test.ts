import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, rmSync, readdirSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { canonicalWatchUrl, onairWatchConfig, scheduleOnairWatch, watchDurationSec, WATCH_MAX_SEC, type OnairWatchDeps } from "./onair-watch.js";
import { planSendNow } from "../send-now.js";

const NOW = new Date("2026-10-19T10:00:00.000Z");
const URL1 = "https://cloudonair.withgoogle.com/events/Cloud-Next-Recap?utm_source=mail#x";
const A1 = "https://cloudonair.withgoogle.com/events/a-1";
const reasonOf = (r: { ok: boolean }) => (r as { reason?: string }).reason;
function rig(over: Partial<OnairWatchDeps> = {}) {
  const dir = mkdtempSync(path.join(os.tmpdir(), "onair-watch-")), launches: { args: string[]; env: NodeJS.ProcessEnv }[] = [];
  const deps: OnairWatchDeps = { now: () => NOW, claimDir: dir, tenantId: "vidysea", config: onairWatchConfig({ LKB_ONAIR_WATCH: "1" }),
    launch: async (args, env) => { launches.push({ args, env }); }, ...over };
  return { dir, deps, launches, done: () => rmSync(dir, { recursive: true, force: true }) };
}

test("flag is off by default and only the exact string 1 enables it", () => {
  assert.equal(onairWatchConfig({}).enabled, false);
  for (const v of ["0", "true", "", " 1", "01", "yes"]) assert.equal(onairWatchConfig({ LKB_ONAIR_WATCH: v }).enabled, false);
  assert.equal(onairWatchConfig({ LKB_ONAIR_WATCH: "1" }).enabled, true);
});

test("flag off: refuses, writes no claim, launches nothing", () => {
  const r = rig({ config: onairWatchConfig({}) });
  try {
    assert.deepEqual(scheduleOnairWatch({ slug: "cloud-next-recap", url: URL1 }, r.deps), { ok: false, reason: "disabled" });
    assert.equal(r.launches.length, 0); assert.deepEqual(readdirSync(r.dir), []);
  } finally { r.done(); }
});

test("schedules ASAP once: canonical url, record args, no-lobby admission env, claim persisted", async () => {
  const r = rig();
  try {
    const res = scheduleOnairWatch({ slug: "Cloud-Next-Recap", url: URL1, mediaDurationSec: 1800 }, r.deps);
    assert.ok(res.ok); await res.done;
    assert.equal(res.startAt, NOW.toISOString()); assert.equal(res.durationSec, 1920);
    assert.equal(res.until, new Date(NOW.getTime() + 1920_000).toISOString());
    assert.equal(r.launches.length, 1);
    assert.deepEqual(r.launches[0]!.args, ["record", "https://cloudonair.withgoogle.com/events/cloud-next-recap", "--until", res.until,
      "--tenant", "vidysea", "--session-id", "onair-watch-cloud-next-recap", "--title", "onair watch cloud-next-recap"]);
    assert.equal(r.launches[0]!.env.LKB_ADMISSION_TIMEOUT_S, "1");
    assert.deepEqual(readdirSync(path.join(r.dir, "vidysea")), ["onair-watch-cloud-next-recap.json"]);
  } finally { r.done(); }
});

test("dedup per slug: repeat (any casing or query) is refused and never launches; other slug and tenant are independent", async () => {
  const r = rig();
  try {
    assert.ok(scheduleOnairWatch({ slug: "a-1", url: A1 }, r.deps).ok);
    assert.deepEqual(scheduleOnairWatch({ slug: "a-1", url: A1 }, r.deps), { ok: false, reason: "duplicate-slug" });
    assert.deepEqual(scheduleOnairWatch({ slug: "A-1", url: A1.replace("a-1", "A-1") + "/?x=1" }, r.deps), { ok: false, reason: "duplicate-slug" });
    await Promise.resolve();
    assert.equal(r.launches.length, 1);
    assert.ok(scheduleOnairWatch({ slug: "b-2", url: A1.replace("a-1", "b-2") }, r.deps).ok);
    assert.ok(scheduleOnairWatch({ slug: "a-1", url: A1 }, { ...r.deps, tenantId: "other" }).ok);
  } finally { r.done(); }
});

test("a failed run keeps its claim: the slug is not re-run", async () => {
  const r = rig({ launch: async () => { throw new Error("browser died"); } });
  try {
    const res = scheduleOnairWatch({ slug: "a-1", url: A1 }, r.deps);
    assert.ok(res.ok); await assert.rejects(res.done, /browser died/);
    assert.deepEqual(scheduleOnairWatch({ slug: "a-1", url: A1 }, r.deps), { ok: false, reason: "duplicate-slug" });
  } finally { r.done(); }
});

test("allowlist is exact: only https://cloudonair.withgoogle.com/events/<slug>", () => {
  const bad: [string, string][] = [
    ["http://cloudonair.withgoogle.com/events/a-1", "origin-not-allowed"],
    ["https://vidysea.cloudonair.com/events/a-1", "origin-not-allowed"],
    ["https://sub.cloudonair.withgoogle.com/events/a-1", "origin-not-allowed"],
    ["https://cloudonair.withgoogle.com.evil.example/events/a-1", "origin-not-allowed"],
    ["https://evilcloudonair.withgoogle.com/events/a-1", "origin-not-allowed"],
    ["https://withgoogle.com/events/a-1", "origin-not-allowed"],
    ["https://meet.google.com/abc-defg-hij", "origin-not-allowed"],
    ["https://cloudonair.withgoogle.com:8443/events/a-1", "invalid-url"],
    ["https://user:pw@cloudonair.withgoogle.com/events/a-1", "invalid-url"],
    ["https://cloudonair.withgoogle.com/events/a-2", "slug-mismatch"],
    ["https://cloudonair.withgoogle.com/events/a-1/extra", "slug-mismatch"],
    ["https://cloudonair.withgoogle.com/landing", "slug-mismatch"],
    ["not a url", "invalid-url"],
  ];
  for (const [url, reason] of bad) assert.deepEqual(canonicalWatchUrl(url, "a-1"), { ok: false, reason }, url);
  assert.deepEqual(canonicalWatchUrl("HTTPS://CLOUDONAIR.WITHGOOGLE.COM/events/A-1/#f", "a-1"), { ok: true, url: A1 });
});

test("refusals write no claim and launch nothing; bad slug, tenant, clock and origin", () => {
  const r = rig();
  try {
    assert.equal(reasonOf(scheduleOnairWatch({ slug: "../x", url: A1 }, r.deps)), "invalid-slug");
    assert.equal(reasonOf(scheduleOnairWatch({ slug: "", url: A1 }, r.deps)), "invalid-slug");
    assert.equal(reasonOf(scheduleOnairWatch({ slug: "a-1", url: A1 }, { ...r.deps, tenantId: "../t" })), "invalid-tenant");
    assert.equal(reasonOf(scheduleOnairWatch({ slug: "a-1", url: A1 }, { ...r.deps, now: () => new Date(NaN) })), "invalid-clock");
    assert.equal(reasonOf(scheduleOnairWatch({ slug: "a-1", url: "https://evil.example/events/a-1" }, r.deps)), "origin-not-allowed");
    assert.equal(r.launches.length, 0); assert.deepEqual(readdirSync(r.dir), []);
  } finally { r.done(); }
});

test("duration cap: media+padding when short, cap when long, unknown or invalid, env cap bounded", () => {
  const cfg = { maxSec: 600, paddingSec: 120 };
  assert.equal(watchDurationSec(300, cfg), 420);
  assert.equal(watchDurationSec(480, cfg), 600);
  assert.equal(watchDurationSec(99999, cfg), 600);
  for (const bad of [undefined, 0, -5, NaN, Infinity, "300", null]) assert.equal(watchDurationSec(bad, cfg), 600, String(bad));
  assert.equal(onairWatchConfig({ LKB_ONAIR_WATCH_MAX_SEC: "900" }).maxSec, 900);
  for (const bad of ["0", "-1", "abc", "1e9", String(WATCH_MAX_SEC + 1), "1.5"]) assert.equal(onairWatchConfig({ LKB_ONAIR_WATCH_MAX_SEC: bad }).maxSec, WATCH_MAX_SEC, bad);
  const r = rig({ config: { enabled: true, maxSec: 600, paddingSec: 120 } });
  try {
    const res = scheduleOnairWatch({ slug: "long", url: A1.replace("a-1", "long"), mediaDurationSec: 86400 }, r.deps);
    assert.ok(res.ok); assert.equal(Date.parse(res.until) - Date.parse(res.startAt), 600_000);
  } finally { r.done(); }
});

test("live planning is unchanged: planSendNow output is identical with the flag on or off", () => {
  const plans = () => JSON.stringify(["https://meet.google.com/abc-defg-hij", A1, "https://vidysea.cloudonair.com/event/1"].map(u => planSendNow(u, NOW)));
  const off = plans(), saved = process.env.LKB_ONAIR_WATCH;
  try { process.env.LKB_ONAIR_WATCH = "1"; assert.equal(plans(), off); }
  finally { if (saved === undefined) delete process.env.LKB_ONAIR_WATCH; else process.env.LKB_ONAIR_WATCH = saved; }
  assert.equal((JSON.parse(off)[0] as { ok: boolean }).ok, true);
});
