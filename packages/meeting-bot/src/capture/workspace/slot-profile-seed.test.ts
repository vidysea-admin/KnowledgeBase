import { test } from "node:test";
import assert from "node:assert/strict";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import * as nodeFs from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { EventEmitter } from "node:events";
import { DatabaseSync } from "node:sqlite";
import { SlotNotSignedInError, assertSlotSignedIn, removeSeeded, seedCaptureSlotProfile, seedProfileDirectory, seedSlotFromArgs, seedSourceFromArgs, sweepStaleSlots } from "./slot-profile-seed.js";
import { installSeedCleanup } from "./slot-seed-signals.js";
import { runRecord } from "../record-commands.js";

type Cookie = { host: string; name: string; value?: number; expires?: number };
const FUTURE = (Date.now() + 86_400_000 + 11644473600000) * 1000;
const PAST = (Date.now() - 86_400_000 + 11644473600000) * 1000;
const SIGNED: Cookie[] = [{ host: ".google.com", name: "__Secure-1PSID", expires: FUTURE }];
function writeCookies(file: string, cookies: Cookie[]) {
  const db = new DatabaseSync(file);
  db.exec("CREATE TABLE cookies (host_key TEXT, name TEXT, encrypted_value BLOB, expires_utc INTEGER)");
  const insert = db.prepare("INSERT INTO cookies VALUES (?, ?, ?, ?)");
  for (const c of cookies) insert.run(c.host, c.name, Buffer.alloc(c.value ?? 12, 1), c.expires ?? FUTURE);
  db.close();
}
function fixture(opts: { cookies?: Cookie[]; state?: string } = {}) {
  const root = mkdtempSync(path.join(tmpdir(), "lkb-seed-"));
  const source = path.join(root, "source"), slot = path.join(root, "slot");
  const p = path.join(source, "Profile 1");
  mkdirSync(path.join(p, "Network"), { recursive: true });
  mkdirSync(path.join(p, "Cache"), { recursive: true });
  mkdirSync(path.join(p, "Local Storage", "leveldb"), { recursive: true });
  writeFileSync(path.join(source, "Local State"), opts.state ?? '{"os_crypt":{"encrypted_key":"abc"}}');
  writeCookies(path.join(p, "Network", "Cookies"), opts.cookies ?? SIGNED);
  writeFileSync(path.join(p, "Preferences"), "{}");
  writeFileSync(path.join(p, "History"), "private history");
  writeFileSync(path.join(p, "Login Data"), "saved passwords");
  writeFileSync(path.join(p, "Cache", "big"), "x".repeat(1000));
  writeFileSync(path.join(p, "Local Storage", "leveldb", "000003.log"), "token");
  writeFileSync(path.join(p, "Local Storage", "leveldb", "LOCK"), "");
  return { root, source, slot, clean: () => rmSync(root, { recursive: true, force: true }) };
}

test("seeds only session-state files, skips caches/history/passwords, and cleans up", () => {
  const f = fixture();
  try {
    const seed = seedCaptureSlotProfile(f.source, f.slot, "Profile 1");
    assert.deepEqual(seed.seeded, ["Local State", "Profile 1/Network/Cookies", "Profile 1/Preferences", "Profile 1/Local Storage"]);
    const p = path.join(f.slot, "Profile 1");
    assert.deepEqual(readFileSync(path.join(p, "Network", "Cookies")), readFileSync(path.join(f.source, "Profile 1", "Network", "Cookies")));
    assert.ok(existsSync(path.join(p, "Local Storage", "leveldb", "000003.log")));
    const marker = JSON.parse(readFileSync(path.join(f.slot, ".lkb-seed.json"), "utf8"));
    assert.deepEqual([marker.version, marker.nonce, marker.pid, marker.slot, marker.profile], [1, seed.nonce, process.pid, path.resolve(f.slot), "Profile 1"], "per-run marker read by py/sb_join_seed.py");
    assert.ok(!existsSync(path.join(p, "Local Storage", "leveldb", "LOCK")), "leveldb LOCK stays with its owner");
    for (const skipped of ["History", "Login Data", "Cache"]) assert.ok(!existsSync(path.join(p, skipped)), skipped);
    seed.dispose();
    assert.ok(!existsSync(path.join(f.slot, "Local State")) && !existsSync(path.join(p, "Network", "Cookies")) && !existsSync(path.join(p, "Local Storage")) && !existsSync(path.join(f.slot, ".lkb-seed.json")));
    assert.ok(existsSync(path.join(f.source, "Profile 1", "Network", "Cookies")), "source is never modified");
  } finally { f.clean(); }
});

test("IndexedDB: only the cloudonair origin is copied, never other sites", () => {
  const f = fixture();
  try {
    const idb = path.join(f.source, "Profile 1", "IndexedDB");
    for (const origin of ["https_cloudonair.withgoogle.com_0.indexeddb.leveldb", "https_mail.google.com_0.indexeddb.leveldb"]) {
      mkdirSync(path.join(idb, origin), { recursive: true }); writeFileSync(path.join(idb, origin, "000003.log"), origin);
    }
    const seed = seedCaptureSlotProfile(f.source, f.slot, "Profile 1");
    assert.ok(seed.seeded.includes("Profile 1/IndexedDB/https_cloudonair.withgoogle.com_0.indexeddb.leveldb"));
    assert.ok(existsSync(path.join(f.slot, "Profile 1", "IndexedDB", "https_cloudonair.withgoogle.com_0.indexeddb.leveldb", "000003.log")));
    assert.ok(!existsSync(path.join(f.slot, "Profile 1", "IndexedDB", "https_mail.google.com_0.indexeddb.leveldb")));
    seed.dispose();
    assert.ok(!existsSync(path.join(f.slot, "Profile 1", "IndexedDB", "https_cloudonair.withgoogle.com_0.indexeddb.leveldb")));
  } finally { f.clean(); }
});

test("every launch re-copies fresh: stale slot state is replaced", () => {
  const f = fixture();
  try {
    seedCaptureSlotProfile(f.source, f.slot, "Profile 1");
    writeFileSync(path.join(f.slot, "Profile 1", "Network", "Cookies"), "stale");
    mkdirSync(path.join(f.slot, "Profile 1", "Local Storage", "leveldb"), { recursive: true });
    writeFileSync(path.join(f.slot, "Profile 1", "Local Storage", "leveldb", "old.log"), "old");
    seedCaptureSlotProfile(f.source, f.slot, "Profile 1");
    assert.deepEqual(readFileSync(path.join(f.slot, "Profile 1", "Network", "Cookies")), readFileSync(path.join(f.source, "Profile 1", "Network", "Cookies")));
    assert.ok(!existsSync(path.join(f.slot, "Profile 1", "Local Storage", "leveldb", "old.log")));
  } finally { f.clean(); }
});

test("FAIL CLOSED: a source without a Google session cookie is refused and leaves nothing in the slot", () => {
  const f = fixture({ cookies: [{ host: ".example.com", name: "NID" }] });
  try {
    assert.throws(() => seedCaptureSlotProfile(f.source, f.slot, "Profile 1"), (e: Error) => e instanceof SlotNotSignedInError && /not signed in.*no live Google session cookie/.test(e.message));
    assert.ok(!existsSync(path.join(f.slot, "Local State")) && !existsSync(path.join(f.slot, "Profile 1", "Network", "Cookies")));
  } finally { f.clean(); }
});

test("F1 probes: the checker's weak-check cases and other near misses are all refused; the real cookie is accepted", () => {
  const refused: [string, Cookie[]][] = [
    ["non-Google SID", [{ host: "example.com", name: "SID" }, { host: ".google.com", name: "NID" }]],
    ["name merely contains SID", [{ host: ".google.com", name: "xxSIDxx" }]],
    ["SIDCC", [{ host: ".google.com", name: "SIDCC" }]],
    ["HSID is not a session cookie", [{ host: ".google.com", name: "HSID" }]],
    ["lookalike host", [{ host: ".notgoogle.com", name: "SID" }, { host: "google.com.evil.io", name: "SID" }]],
    ["empty value", [{ host: ".google.com", name: "SID", value: 0 }]],
    ["expired", [{ host: ".google.com", name: "SID", expires: PAST }]],
  ];
  for (const [label, cookies] of refused) {
    const f = fixture({ cookies });
    try { assert.throws(() => seedCaptureSlotProfile(f.source, f.slot, "Profile 1"), SlotNotSignedInError, label); } finally { f.clean(); }
  }
  for (const cookies of [[{ host: "google.com", name: "SID" }], [{ host: ".google.com", name: "__Secure-3PSID" }], [{ host: "accounts.google.com", name: "SID", expires: 0 }]] as Cookie[][]) {
    const f = fixture({ cookies });
    try { seedCaptureSlotProfile(f.source, f.slot, "Profile 1").dispose(); } finally { f.clean(); }
  }
  const raw = fixture();
  try { writeFileSync(path.join(raw.source, "Profile 1", "Network", "Cookies"), "google.com SID example.com SID"); // raw bytes, not a database
    assert.throws(() => seedCaptureSlotProfile(raw.source, raw.slot, "Profile 1"), /unreadable/); } finally { raw.clean(); }
});

test("F2: SIGINT/SIGTERM/SIGBREAK and exit remove seeded files, then re-raise when nothing else listens", () => {
  for (const signal of ["SIGINT", "SIGTERM", "SIGBREAK"]) {
    const proc = new EventEmitter() as EventEmitter & { pid: number }; proc.pid = 7;
    const raised: string[] = []; let cleaned = 0;
    installSeedCleanup(() => { cleaned++; }, proc, (_pid, s) => { raised.push(s); });
    proc.emit(signal);
    assert.equal(cleaned, 1, signal); assert.deepEqual(raised, [signal]);
    assert.equal(proc.listenerCount(signal), 0, "handlers uninstalled");
  }
  const proc = new EventEmitter() as EventEmitter & { pid: number }; proc.pid = 7;
  let cleaned = 0; const raised: string[] = [];
  proc.on("SIGTERM", () => {}); // another owner handles the signal
  installSeedCleanup(() => { cleaned++; }, proc, (_p, s) => { raised.push(s); });
  proc.emit("SIGTERM"); assert.equal(cleaned, 1); assert.deepEqual(raised, []);
  const quiet = new EventEmitter() as EventEmitter & { pid: number }; let n = 0;
  const off = installSeedCleanup(() => { n++; }, quiet); // real process: only verify exit hook and uninstall
  off(); assert.equal(n, 0);
  const exiting = new EventEmitter() as EventEmitter & { pid: number }; let m = 0;
  installSeedCleanup(() => { m++; }, exiting); exiting.emit("exit"); assert.equal(m, 1);
});

test("F2: stale slot dirs of dead runs are swept at the next launch; live or foreign ones are left alone", () => {
  const f = fixture();
  try {
    const parent = path.join(f.root, "slots");
    const make = (name: string, pid: number) => {
      const dir = path.join(parent, name); mkdirSync(path.join(dir, "Profile 1", "Network"), { recursive: true });
      writeFileSync(path.join(dir, "Local State"), "{}"); writeFileSync(path.join(dir, "Profile 1", "Network", "Cookies"), "c");
      writeFileSync(path.join(dir, ".lkb-seed.json"), JSON.stringify({ version: 1, nonce: "n", pid, slot: dir, profile: "Profile 1" })); return dir;
    };
    const dead = make("dead", 111), live = make("live", 222), own = make("own", 333);
    mkdirSync(path.join(parent, "plain"), { recursive: true }); writeFileSync(path.join(parent, "plain", "Local State"), "{}");
    const swept = sweepStaleSlots(parent, own, nodeFs as never, (pid) => pid === 222);
    assert.deepEqual(swept, [dead]);
    assert.ok(!existsSync(path.join(dead, "Local State")) && !existsSync(path.join(dead, ".lkb-seed.json")) && !existsSync(path.join(dead, "Profile 1", "Network", "Cookies")));
    for (const kept of [path.join(live, "Local State"), path.join(own, "Local State"), path.join(parent, "plain", "Local State")]) assert.ok(existsSync(kept), kept);
    // seedSlotFromArgs sweeps siblings: a dead sibling is cleaned when a new slot is seeded
    const dead2 = make("dead2", 2_147_483_000);
    const env: NodeJS.ProcessEnv = {};
    const seed = seedSlotFromArgs(["--seed-profile", f.source, "--profile-directory", "Profile 1"], { profileDir: path.join(parent, "fresh"), recordDir: f.root, tenantId: "t", slot: "fresh" }, env)!;
    assert.ok(!existsSync(path.join(dead2, "Local State")), "swept by the new launch");
    assert.equal(env.LKB_SEED_NONCE, seed.nonce);
    assert.deepEqual(seed.dispose(), []); assert.equal(env.LKB_SEED_NONCE, undefined);
    assert.ok(!existsSync(path.join(parent, "fresh", "Local State")));
  } finally { f.clean(); }
});

test("removeSeeded retries a briefly locked file and reports what stays", () => {
  const f = fixture();
  try {
    seedCaptureSlotProfile(f.source, f.slot, "Profile 1");
    let calls = 0;
    const fs = { ...nodeFs, rmSync: (p: string, o: nodeFs.RmOptions) => { if (p.endsWith("Cookies") && calls++ < 2) throw Object.assign(new Error("busy"), { code: "EBUSY" }); nodeFs.rmSync(p, o); } } as never;
    assert.deepEqual(removeSeeded(fs, f.slot, "Profile 1", 5, () => {}), []);
    seedCaptureSlotProfile(f.source, f.slot, "Profile 1");
    const stuck = { ...nodeFs, rmSync: (p: string, o: nodeFs.RmOptions) => { if (p.endsWith("Cookies")) throw Object.assign(new Error("busy"), { code: "EBUSY" }); nodeFs.rmSync(p, o); } } as never;
    assert.equal(removeSeeded(stuck, f.slot, "Profile 1", 2, () => {}).length, 1);
  } finally { f.clean(); }
});

test("FAIL CLOSED: missing cookie encryption key, missing cookies and missing Local State are refused", () => {
  const noKey = fixture({ state: "{}" });
  try { assert.throws(() => seedCaptureSlotProfile(noKey.source, noKey.slot, "Profile 1"), /no cookie encryption key/); } finally { noKey.clean(); }
  const noCookies = fixture();
  try {
    rmSync(path.join(noCookies.source, "Profile 1", "Network", "Cookies"));
    assert.throws(() => seedCaptureSlotProfile(noCookies.source, noCookies.slot, "Profile 1"), /ENOENT/);
    assert.throws(() => assertSlotSignedIn(noCookies.slot, "Profile 1"), /Local State missing|Cookies database missing/);
  } finally { noCookies.clean(); }
});

test("a source locked by a running Chrome is refused with the reason, not copied partially", () => {
  const f = fixture();
  try {
    const fs = { ...nodeFs, copyFileSync: (from: string, to: string) => {
      if (from.endsWith("Cookies")) throw Object.assign(new Error("busy"), { code: "EBUSY" });
      nodeFs.copyFileSync(from, to);
    } } as unknown as Parameters<typeof seedCaptureSlotProfile>[3];
    assert.throws(() => seedCaptureSlotProfile(f.source, f.slot, "Profile 1", fs), /locked.*close it/);
    assert.ok(!existsSync(path.join(f.slot, "Local State")));
  } finally { f.clean(); }
});

test("source and slot must be separate; profile directory must be a safe existing name", () => {
  const f = fixture();
  try {
    assert.throws(() => seedCaptureSlotProfile(f.source, f.source, "Profile 1"), /separate directories/);
    assert.throws(() => seedCaptureSlotProfile(f.source, path.join(f.source, ".capture-slots", "a"), "Profile 1"), /separate directories/);
    assert.throws(() => seedCaptureSlotProfile(f.source, f.slot, "Missing"), /no browser profile/);
    for (const bad of ["..", "a/../b", " x", "x.", "a\\b".replace("\\", "/")]) assert.throws(() => seedProfileDirectory(bad), /invalid browser profile-directory/);
    assert.equal(seedProfileDirectory(undefined), "Default");
  } finally { f.clean(); }
});

test("--seed-profile / LKB_SEED_PROFILE_DIR parsing", () => {
  assert.equal(seedSourceFromArgs(["u", "--seed-profile", "D:\\p q"], {}), "D:\\p q");
  assert.equal(seedSourceFromArgs(["u"], { LKB_SEED_PROFILE_DIR: "E:\\env" }), "E:\\env");
  assert.equal(seedSourceFromArgs(["u", "--seed-profile", "arg"], { LKB_SEED_PROFILE_DIR: "E:\\env" }), "arg");
  assert.equal(seedSourceFromArgs(["u"], {}), undefined);
  assert.throws(() => seedSourceFromArgs(["--seed-profile", "a", "--seed-profile", "b"], {}), /duplicate/);
  assert.throws(() => seedSourceFromArgs(["--seed-profile"], {}), /requires a directory/);
  assert.throws(() => seedSourceFromArgs(["--seed-profile", "--capture-slot", "a"], {}), /requires a directory/);
});

const BASE = ["https://cloudonair.withgoogle.com/events/x", "--until", "", "--backend", "tab", "--session-id", "seedrun", "--tenant", "fixture",
  "--title", "fixture", "--capture-approved-by", "fixture", "--capture-approval-ref", "fixture", "--recorded-by", "fixture"];
function args(extra: string[]) { const a = [...BASE]; a[2] = new Date(Date.now() + 600_000).toISOString(); return [...a, ...extra]; }

test("runRecord: --seed-profile without --capture-slot is refused before any launch", async () => {
  const f = fixture();
  try {
    await assert.rejects(runRecord(args(["--seed-profile", f.source]), { profileDir: f.slot, recordDir: path.join(f.root, "rec"),
      tab: () => { throw new Error("must not launch"); } }), /--seed-profile requires --capture-slot/);
  } finally { f.clean(); }
});

test("runRecord: seeds the slot before launch, selects its sub-profile, and removes the copy afterwards", async () => {
  const f = fixture();
  let seenAtLaunch: string[] = [];
  try {
    await assert.rejects(runRecord(args(["--capture-slot", "one", "--seed-profile", f.source, "--profile-directory", "Profile 1"]),
      { profileDir: f.slot, recordDir: path.join(f.root, "rec"), tab: (_e, cfg) => {
        assert.equal(cfg.profileDirectory, "Profile 1");
        seenAtLaunch = readdirSync(cfg.profileDir);
        assert.ok(existsSync(path.join(cfg.profileDir, "Profile 1", "Network", "Cookies")));
        throw new Error("stop-after-launch");
      } }), /stop-after-launch/);
    assert.ok(seenAtLaunch.includes("Local State"));
    const slotDirs = path.join(f.slot, ".capture-slots");
    const leftovers: string[] = [];
    const walk = (d: string) => { for (const e of readdirSync(d, { withFileTypes: true })) { const t = path.join(d, e.name); if (e.isDirectory()) walk(t); else leftovers.push(t); } };
    if (existsSync(slotDirs)) walk(slotDirs);
    assert.deepEqual(leftovers.filter((x) => /Cookies|Local State|Preferences/.test(x)), [], "seeded session files are removed after the run");
  } finally { f.clean(); }
});

test("runRecord: an unsigned source exits with a clear reason and never launches Chrome", async () => {
  const f = fixture({ cookies: [{ host: ".example.com", name: "SID" }] });
  let launched = false;
  try {
    await assert.rejects(runRecord(args(["--capture-slot", "one", "--seed-profile", f.source, "--profile-directory", "Profile 1"]),
      { profileDir: f.slot, recordDir: path.join(f.root, "rec"), tab: () => { launched = true; throw new Error("launched"); } }),
      /capture slot is not signed in/);
    assert.equal(launched, false);
  } finally { f.clean(); }
});
