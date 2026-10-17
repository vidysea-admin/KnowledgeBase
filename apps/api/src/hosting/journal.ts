import { constants, closeSync, existsSync, fstatSync, fsyncSync, lstatSync, mkdirSync, openSync, readFileSync, realpathSync, unlinkSync, writeSync } from "node:fs";
import { createHash } from "node:crypto";
import { dirname, isAbsolute, join, parse, resolve } from "node:path";
import { HostingError, hostingId, type HostingJournalChange, type HostingJournalRecord } from "./types.js";

const sha = (text: string) => createHash("sha256").update(text).digest("hex");
const ZERO = "0".repeat(64);
function unsafePath(): never { throw new HostingError("unsafe_state_directory", 503); }
function assertAncestry(path: string): void {
  const resolved = resolve(path), root = parse(resolved).root;
  let current = resolved;
  for (;;) {
    const stat = lstatSync(current);
    if (stat.isSymbolicLink() || !stat.isDirectory()) unsafePath();
    if (current === root) break;
    current = dirname(current);
  }
  if (realpathSync.native(resolved).toLowerCase() !== resolved.toLowerCase()) unsafePath();
}
function directory(path: string): void {
  assertAncestry(dirname(path));
  if (!existsSync(path)) mkdirSync(path, { mode: 0o700 });
  assertAncestry(path);
  const stat = lstatSync(path);
  if (process.platform !== "win32" && ((stat.mode & 0o077) !== 0 || (process.getuid && stat.uid !== process.getuid()))) unsafePath();
}
function regularFile(path: string): void {
  if (!existsSync(path)) return;
  const stat = lstatSync(path);
  if (!stat.isFile() || stat.isSymbolicLink() || stat.nlink !== 1) unsafePath();
  if (process.platform !== "win32" && (stat.mode & 0o077) !== 0) unsafePath();
}
function digest(record: Omit<HostingJournalRecord, "hash">): string { return sha(JSON.stringify(record)); }

/** Durable event+audit is one fsynced append. Corruption and abandoned locks fail closed. */
export class HostingJournal {
  readonly root: string;
  private blocked = new Set<string>();
  constructor(root: string, private readonly sync = fsyncSync) {
    if (!isAbsolute(root)) unsafePath();
    this.root = resolve(root);
    // Construction validates configuration but creates no filesystem state.
    assertAncestry(dirname(this.root));
    if (existsSync(this.root)) directory(this.root);
  }
  private tenantDirectory(tenantId: string): string {
    hostingId(tenantId, "tenant"); directory(this.root);
    const path = join(this.root, sha(tenantId)); directory(path); return path;
  }
  quarantine(tenantId: string): void {
    const dir = this.tenantDirectory(tenantId); this.blocked.add(dir);
    try {
      const fd = openSync(join(dir, "recovery.required"), "wx", 0o600);
      try { fsyncSync(fd); } finally { closeSync(fd); }
    } catch { /* Existing marker/in-memory refusal remains; no automatic recovery. */ }
  }
  private load(path: string, tenantId: string): HostingJournalRecord[] {
    regularFile(path);
    if (!existsSync(path)) return [];
    if (lstatSync(path).size > 32 * 1024 * 1024) throw new HostingError("audit_capacity_reached", 503);
    const text = readFileSync(path, "utf8");
    if (text && !text.endsWith("\n")) throw new HostingError("audit_recovery_required", 503);
    let previous = ZERO;
    return text.split("\n").filter(Boolean).map((line, index) => {
      let row: HostingJournalRecord; try { row = JSON.parse(line) as HostingJournalRecord; } catch { throw new HostingError("audit_recovery_required", 503); }
      if (!row || typeof row !== "object" || Array.isArray(row)) throw new HostingError("audit_recovery_required", 503);
      const { hash, ...record } = row;
      if (record.version !== 1 || record.tenantId !== tenantId || record.sequence !== index + 1 || record.previous !== previous ||
        typeof record.at !== "string" || !Number.isFinite(Date.parse(record.at)) || typeof record.actorId !== "string" ||
        typeof record.operation !== "string" || typeof record.target !== "string" || typeof record.outcome !== "string" || digest(record) !== hash) throw new HostingError("audit_recovery_required", 503);
      previous = hash; return row;
    });
  }
  async transaction<T>(tenantId: string, actorId: string, at: string, mutate: (rows: HostingJournalRecord[]) => Promise<HostingJournalChange<T> | { value: T }>): Promise<T> {
    hostingId(actorId, "actor");
    const dir = this.tenantDirectory(tenantId), path = join(dir, "audit.jsonl"), lock = join(dir, "writer.lock");
    if (this.blocked.has(dir) || existsSync(join(dir, "recovery.required"))) throw new HostingError("audit_recovery_required", 503);
    regularFile(lock);
    let lockFd: number;
    try { lockFd = openSync(lock, constants.O_CREAT | constants.O_EXCL | constants.O_WRONLY, 0o600); }
    catch (error) { if ((error as NodeJS.ErrnoException).code === "EEXIST") throw new HostingError("hosting_busy", 503); throw new HostingError("audit_unavailable", 503); }
    try {
      const rows = this.load(path, tenantId), change = await mutate(rows);
      if (!("operation" in change)) return change.value;
      const record: Omit<HostingJournalRecord, "hash"> = { version: 1, tenantId, sequence: rows.length + 1,
        previous: rows.at(-1)?.hash ?? ZERO, at, actorId, operation: change.operation,
        target: change.target, outcome: change.outcome, data: change.data };
      const firstHash = digest(record);
      const line = Buffer.from(JSON.stringify({ ...record, hash: firstHash }) + "\n");
      if (line.length > 128 * 1024) throw new HostingError("event_too_large");
      if ((existsSync(path) ? lstatSync(path).size : 0) + line.length > 32 * 1024 * 1024) throw new HostingError("audit_capacity_reached", 503);
      assertAncestry(dir); regularFile(path);
      let fd: number | undefined;
      try {
        fd = openSync(path, constants.O_CREAT | constants.O_APPEND | constants.O_WRONLY | (constants.O_NOFOLLOW ?? 0), 0o600);
        const stat = fstatSync(fd), named = lstatSync(path);
        if (!stat.isFile() || stat.nlink !== 1 || stat.ino !== named.ino || stat.dev !== named.dev) unsafePath();
        for (let offset = 0; offset < line.length;) {
          const wrote = writeSync(fd, line, offset, line.length - offset);
          if (wrote <= 0) throw new Error("short append");
          offset += wrote;
        }
        this.sync(fd);
      } catch {
        this.blocked.add(dir);
        try { const marker = openSync(join(dir, "recovery.required"), "wx", 0o600); closeSync(marker); } catch { /* in-memory refusal remains */ }
        throw new HostingError("audit_recovery_required", 503);
      } finally { if (fd !== undefined) closeSync(fd); }
      if (!change.afterCommit) return change.value;
      let value: T;
      try { value = await change.afterCommit(); }
      catch { this.quarantine(tenantId); throw new HostingError(change.operation === "key.change.intent" ? "key_recovery_required" : "account_recovery_required", 503); }
      if (change.completion) {
        const complete = { ...record, sequence: record.sequence + 1, previous: firstHash,
          operation: change.completion.operation, target: change.completion.target,
          outcome: change.completion.outcome, data: change.completion.data };
        let completeFd: number | undefined;
        try {
          assertAncestry(dir); regularFile(path);
          completeFd = openSync(path, constants.O_APPEND | constants.O_WRONLY | (constants.O_NOFOLLOW ?? 0));
          const stat = fstatSync(completeFd), named = lstatSync(path);
          if (!stat.isFile() || stat.nlink !== 1 || stat.ino !== named.ino || stat.dev !== named.dev) unsafePath();
          const completeLine = Buffer.from(JSON.stringify({ ...complete, hash: digest(complete) }) + "\n");
          if (stat.size + completeLine.length > 32 * 1024 * 1024) throw new Error("audit capacity");
          for (let offset = 0; offset < completeLine.length;) {
            const wrote = writeSync(completeFd, completeLine, offset, completeLine.length - offset);
            if (wrote <= 0) throw new Error("short append");
            offset += wrote;
          }
          this.sync(completeFd);
        } catch { this.quarantine(tenantId); throw new HostingError(change.operation === "key.change.intent" ? "key_recovery_required" : "account_recovery_required", 503); }
        finally { if (completeFd !== undefined) closeSync(completeFd); }
      }
      return value;
    } finally {
      closeSync(lockFd);
      // Never remove a substituted path; owner must recover after a process crash.
      assertAncestry(dir); regularFile(lock); unlinkSync(lock);
    }
  }
}
