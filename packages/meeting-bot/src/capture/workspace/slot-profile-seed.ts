import * as nodeFs from "node:fs";
import path from "node:path";
import { randomUUID } from "node:crypto";
import { DatabaseSync } from "node:sqlite";
import type { CaptureWorkspace } from "./capture-workspace-types.js";
import { installSeedCleanup } from "./slot-seed-signals.js";

/**
 * w24-signedslots: explicit, opt-in seeding of a capture slot's own user-data-dir from an already
 * signed-in Chrome profile. Only small session-state files are copied (never caches or media), the
 * copy is fresh before each launch, and the seeded files are removed after the run. The result is
 * verified fail-closed: a slot that does not carry a Google session exits with a clear reason.
 * Same Windows user and same Chrome install, so the DPAPI/app-bound cookie key in `Local State`
 * decrypts the copied cookies. Nothing here types credentials or clicks sign-in.
 */
export interface SeedFs {
  mkdirSync: typeof nodeFs.mkdirSync;
  copyFileSync: typeof nodeFs.copyFileSync;
  rmSync: typeof nodeFs.rmSync;
  readFileSync: typeof nodeFs.readFileSync;
  statSync: typeof nodeFs.statSync;
  lstatSync: typeof nodeFs.lstatSync;
  readdirSync: typeof nodeFs.readdirSync;
  writeFileSync: typeof nodeFs.writeFileSync;
}

export interface SlotSeed { seeded: string[]; nonce: string; dispose: () => string[] }

/** Root-level and profile-level session-state files. Order matters only for reporting. */
export const ROOT_SEED_FILES = ["Local State"] as const;
export const PROFILE_SEED_FILES = ["Network/Cookies", "Preferences", "Secure Preferences"] as const;
/** Small directories that hold site sessions (cloudonair keeps its sign-in state in Local Storage and IndexedDB). Only that origin, never all of IndexedDB. */
export const PROFILE_SEED_DIRS = ["Local Storage", "Session Storage",
  "IndexedDB/https_cloudonair.withgoogle.com_0.indexeddb.leveldb", "IndexedDB/https_cloudonair.withgoogle.com_0.indexeddb.blob"] as const;
/** Read by py/sb_join_seed.py: only a slot carrying this marker may hold seeded files without an ownership ledger. */
export const SEED_MARKER = ".lkb-seed.json";
export const SEED_DIR_MAX_BYTES = 32 * 1024 * 1024;
const SESSION_COOKIE_NAMES = ["__Secure-1PSID", "__Secure-3PSID", "SID"] as const;

export class SlotNotSignedInError extends Error {
  constructor(reason: string) { super(`capture slot is not signed in: ${reason}`); this.name = "SlotNotSignedInError"; }
}

export function seedProfileDirectory(profileDirectory: string | undefined): string {
  const name = profileDirectory ?? "Default";
  if (!/^[A-Za-z0-9][A-Za-z0-9 _.-]{0,99}$/.test(name) || name.includes("..") || name.trim() !== name || /[. ]$/.test(name))
    throw new Error("invalid browser profile-directory");
  return name;
}

export function seedSourceFromArgs(rest: string[], env: NodeJS.ProcessEnv = process.env): string | undefined {
  const indices = rest.flatMap((arg, index) => arg === "--seed-profile" ? [index] : []);
  if (indices.length > 1) throw new Error("duplicate --seed-profile");
  if (!indices.length) return env.LKB_SEED_PROFILE_DIR || undefined;
  const value = rest[indices[0]! + 1];
  if (!value || value.startsWith("--")) throw new Error("--seed-profile requires a directory");
  return value;
}

function files(root: string, profile: string): { rel: string; from: string; to: string }[] {
  return [
    ...ROOT_SEED_FILES.map((rel) => ({ rel, parts: [rel] })),
    ...PROFILE_SEED_FILES.map((rel) => ({ rel: `${profile}/${rel}`, parts: [profile, ...rel.split("/")] })),
  ].map((entry) => ({ rel: entry.rel, from: path.join(root, ...entry.parts), to: entry.parts.join("/") }));
}

function isLocked(error: unknown): boolean {
  const code = (error as NodeJS.ErrnoException).code;
  return code === "EBUSY" || code === "EPERM" || code === "EACCES";
}

function directoryBytes(fs: SeedFs, dir: string): number {
  let total = 0;
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const target = path.join(dir, entry.name);
    if (entry.isSymbolicLink()) throw new Error("seed source contains a redirect");
    total += entry.isDirectory() ? directoryBytes(fs, target) : fs.statSync(target).size;
    if (total > SEED_DIR_MAX_BYTES) throw new Error("seed directory is too large to copy as session state");
  }
  return total;
}

function copyDirectory(fs: SeedFs, from: string, to: string): void {
  fs.mkdirSync(to, { recursive: true });
  for (const entry of fs.readdirSync(from, { withFileTypes: true })) {
    if (entry.name === "LOCK") continue; // leveldb lock files must stay with the owner
    const source = path.join(from, entry.name), target = path.join(to, entry.name);
    if (entry.isDirectory()) copyDirectory(fs, source, target); else fs.copyFileSync(source, target);
  }
}

/** Fail-closed signed-in check on the copied files the slot will launch with: real cookie rows, not raw bytes. */
export function assertSlotSignedIn(slotRoot: string, profile: string, fs: Pick<SeedFs, "readFileSync"> = nodeFs, now = Date.now()): void {
  let state: string;
  try { state = String(fs.readFileSync(path.join(slotRoot, "Local State"), "utf8")); }
  catch { throw new SlotNotSignedInError("Local State missing in the slot"); }
  if (!/"(?:encrypted_key|app_bound_encrypted_key)"/.test(state)) throw new SlotNotSignedInError("Local State has no cookie encryption key");
  let rows: { host_key: string; name: string; len: number | bigint | null; expires_utc: number | bigint | null }[];
  let db: DatabaseSync | undefined;
  try {
    db = new DatabaseSync(path.join(slotRoot, profile, "Network", "Cookies"), { readOnly: true });
    const query = db.prepare("SELECT host_key, name, length(encrypted_value) AS len, expires_utc FROM cookies WHERE name IN (?, ?, ?)");
    query.setReadBigInts(true); // Chrome expiry (microseconds since 1601) exceeds 2^53
    rows = query.all(...SESSION_COOKIE_NAMES) as typeof rows;
  } catch { throw new SlotNotSignedInError("Cookies database missing or unreadable in the slot"); }
  finally { try { db?.close(); } catch { /* already closed */ } }
  const chromeNow = BigInt(now + 11644473600000) * 1000n; // Chrome stores microseconds since 1601
  const live = rows.some((row) => (SESSION_COOKIE_NAMES as readonly string[]).includes(row.name) && /^(?:.*\.)?google\.com$/.test(row.host_key) &&
    row.len != null && BigInt(row.len) > 0n && row.expires_utc != null && (BigInt(row.expires_utc) === 0n || BigInt(row.expires_utc) > chromeNow));
  if (!live) throw new SlotNotSignedInError("no live Google session cookie in the copied profile; sign the source profile in first");
}

const sleep = (ms: number) => { Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, ms); };

/** Removes every seeded file, retrying while a browser is still exiting. Returns what could NOT be removed. */
export function removeSeeded(fs: SeedFs, to: string, profile: string, attempts = 5, wait: (ms: number) => void = sleep): string[] {
  const targets = [...files("", profile).map((e) => path.join(to, ...e.to.split("/"))),
    ...PROFILE_SEED_DIRS.map((dir) => path.join(to, profile, ...dir.split("/"))), path.join(to, SEED_MARKER)];
  let left: string[] = [];
  for (let attempt = 0; attempt < attempts; attempt++) {
    left = [];
    for (const target of targets) { try { fs.rmSync(target, { recursive: true, force: true }); } catch { left.push(target); } }
    if (!left.length) return [];
    if (attempt < attempts - 1) wait(500);
  }
  return left;
}

/** Removes seeded files left by killed runs: sibling slot dirs whose marker pid is no longer alive (so not in use). */
export function sweepStaleSlots(parent: string, ownSlot: string, fs: SeedFs = nodeFs,
  alive: (pid: number) => boolean = (pid) => { try { process.kill(pid, 0); return true; } catch (e) { return (e as NodeJS.ErrnoException).code === "EPERM"; } }): string[] {
  const swept: string[] = [];
  let names: string[];
  try { names = fs.readdirSync(parent) as unknown as string[]; } catch { return swept; }
  for (const name of names) {
    const dir = path.join(parent, name);
    if (path.resolve(dir) === path.resolve(ownSlot)) continue;
    try {
      const marker = JSON.parse(String(fs.readFileSync(path.join(dir, SEED_MARKER), "utf8")));
      if (marker?.version !== 1 || !Number.isInteger(marker.pid) || alive(marker.pid)) continue;
      if (removeSeeded(fs, dir, seedProfileDirectory(marker.profile), 1).length === 0) swept.push(dir);
    } catch { /* not a seeded slot */ }
  }
  return swept;
}

/**
 * Copies the session-state files from `source` into the slot's user-data-dir, then verifies the slot.
 * A locked source (Chrome running on it) is refused with a clear reason; partial copies are removed.
 */
export function seedCaptureSlotProfile(source: string, slotRoot: string, profileDirectory?: string, fs: SeedFs = nodeFs): SlotSeed {
  const profile = seedProfileDirectory(profileDirectory);
  const from = path.resolve(source), to = path.resolve(slotRoot);
  const canonical = (value: string) => process.platform === "win32" ? value.toLowerCase() : value;
  if (canonical(from) === canonical(to) || canonical(to).startsWith(canonical(from) + path.sep) || canonical(from).startsWith(canonical(to) + path.sep))
    throw new Error("seed source and capture slot must be separate directories");
  try {
    if (!fs.lstatSync(path.join(from, profile)).isDirectory()) throw new Error("not a directory");
  } catch { throw new Error(`seed source has no browser profile '${profile}': ${from}`); }
  const nonce = randomUUID();
  const dispose = () => removeSeeded(fs, to, profile);
  dispose(); // every launch starts from a fresh copy; stale session state from a crashed run is dropped
  const seeded: string[] = [];
  try {
    for (const entry of files(from, profile)) {
      const target = path.join(to, ...entry.to.split("/"));
      fs.mkdirSync(path.dirname(target), { recursive: true });
      try { fs.copyFileSync(entry.from, target); }
      catch (error) {
        if ((error as NodeJS.ErrnoException).code === "ENOENT" && entry.rel.endsWith("Secure Preferences")) continue;
        if (isLocked(error)) throw new Error(`seed source profile or capture slot is locked (a Chrome is running on ${from} or the slot); close it and retry: ${entry.rel}`);
        throw error;
      }
      seeded.push(entry.rel);
    }
    for (const dir of PROFILE_SEED_DIRS) {
      const sourceDir = path.join(from, profile, ...dir.split("/"));
      let present = true;
      try { directoryBytes(fs, sourceDir); } catch (error) {
        if ((error as NodeJS.ErrnoException).code === "ENOENT") present = false; else throw error;
      }
      if (!present) continue;
      try { copyDirectory(fs, sourceDir, path.join(to, profile, ...dir.split("/"))); }
      catch (error) { if (isLocked(error)) throw new Error(`seed source profile or capture slot is locked (a Chrome is running on ${from} or the slot); close it and retry: ${dir}`); throw error; }
      seeded.push(`${profile}/${dir}`);
    }
    assertSlotSignedIn(to, profile, fs);
    fs.writeFileSync(path.join(to, SEED_MARKER), JSON.stringify({ version: 1, nonce, pid: process.pid, slot: to, profile, seededAt: new Date().toISOString() }));
  } catch (error) { dispose(); throw error; }
  return { seeded, nonce, dispose };
}

/** CLI entry used by `record`: undefined when no seed source is configured; refuses a seed without a slot. */
export function seedSlotFromArgs(rest: string[], workspace: CaptureWorkspace, env: NodeJS.ProcessEnv = process.env, fs: SeedFs = nodeFs): SlotSeed | undefined {
  const source = seedSourceFromArgs(rest, env);
  if (!source) return undefined;
  if (!workspace.slot) throw new Error("--seed-profile requires --capture-slot");
  const index = rest.indexOf("--profile-directory");
  sweepStaleSlots(path.dirname(workspace.profileDir), workspace.profileDir, fs);
  const seed = seedCaptureSlotProfile(source, workspace.profileDir, index >= 0 ? rest[index + 1] : env.LKB_BROWSER_PROFILE_DIRECTORY, fs);
  env.LKB_SEED_NONCE = seed.nonce; // py/sb_join_seed.py accepts the marker only with this launch's nonce
  const uninstall = installSeedCleanup(() => { seed.dispose(); });
  return { ...seed, dispose: () => {
    uninstall(); delete env.LKB_SEED_NONCE;
    const left = seed.dispose();
    if (left.length) console.error(`[bot] SEEDED SESSION FILES REMAIN, delete manually: ${left.join(", ")}`);
    return left;
  } };
}
