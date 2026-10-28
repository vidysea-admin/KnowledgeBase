import { createHash } from "node:crypto";
import { constants, closeSync, existsSync, fstatSync, fsyncSync, lstatSync, openSync, readFileSync, readdirSync, unlinkSync, writeSync } from "node:fs";
import { join } from "node:path";
import { HostingJournal } from "../../hosting/journal.js";
import type { HostingJournalChange, HostingJournalRecord } from "../../hosting/types.js";
import { verifyPrivateDirectory, verifyPrivateArtifact } from "../../bot-privacy/private-acl.js";
import { SourceJobError } from "./types.js";

export interface SourceSpoolVerifier { directory(path: string): void; artifact(path: string): void }
const actualVerifier: SourceSpoolVerifier = { directory: verifyPrivateDirectory, artifact: verifyPrivateArtifact };
const SECRET_NAME = /^[a-f0-9]{64}\.secret$/;
/** Actual Windows owner/DACL or POSIX owner/modes, before any bearer URL can be read/written. */
export class PrivateSourceJournal {
  private readonly journal: HostingJournal;
  constructor(private readonly root: string, private readonly verify: SourceSpoolVerifier = actualVerifier) {
    try { this.verify.directory(root); } catch { throw new SourceJobError("source_spool_unavailable"); }
    this.journal = new HostingJournal(root);
  }
  private preflight(tenant: string): void {
    try {
      this.verify.directory(this.root);
      const directory = join(this.root, createHash("sha256").update(tenant).digest("hex"));
      if (!existsSync(directory)) return;
      this.verify.directory(directory);
      for (const name of readdirSync(directory)) {
        if (!["audit.jsonl", "writer.lock", "recovery.required"].includes(name) && !SECRET_NAME.test(name)) throw new SourceJobError("source_spool_unavailable");
        this.verify.artifact(join(directory, name));
      }
    } catch { throw new SourceJobError("source_spool_unavailable"); }
  }
  private secretPath(tenant: string, jobId: string): string {
    return join(this.root, createHash("sha256").update(tenant).digest("hex"), `${jobId}.secret`);
  }
  /** Per-job bearer URL, private-ACL verified. Only call inside a transaction (writer lock held). */
  writeSecret(tenant: string, jobId: string, value: string): void {
    const path = this.secretPath(tenant, jobId);
    try {
      const fd = openSync(path, constants.O_CREAT | constants.O_TRUNC | constants.O_WRONLY | (constants.O_NOFOLLOW ?? 0), 0o600);
      try {
        const stat = fstatSync(fd), named = lstatSync(path);
        if (!stat.isFile() || stat.nlink !== 1 || stat.ino !== named.ino || stat.dev !== named.dev) throw new Error("unsafe secret");
        const data = Buffer.from(value, "utf8");
        for (let offset = 0; offset < data.length;) offset += writeSync(fd, data, offset, data.length - offset);
        fsyncSync(fd);
      } finally { closeSync(fd); }
      this.verify.artifact(path);
    } catch { this.dropSecret(tenant, jobId); throw new SourceJobError("source_spool_unavailable"); }
  }
  /** Null when the secret is absent or unreadable (callers fail closed to uncertain). */
  readSecret(tenant: string, jobId: string): string | null {
    const path = this.secretPath(tenant, jobId);
    try { if (!existsSync(path)) return null; this.verify.artifact(path); return readFileSync(path, "utf8"); } catch { return null; }
  }
  dropSecret(tenant: string, jobId: string): void {
    const path = this.secretPath(tenant, jobId);
    try { unlinkSync(path); } catch (error) { if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw new SourceJobError("source_spool_unavailable"); }
  }
  async transaction<T>(tenant: string, actor: string, at: string, mutate: (rows: HostingJournalRecord[]) => Promise<HostingJournalChange<T> | { value: T }>): Promise<T> {
    this.preflight(tenant);
    return this.journal.transaction(tenant, actor, at, async rows => {
      // Includes newly created tenant directory/lock, before the callback can request a durable secret append.
      this.preflight(tenant);
      return mutate(rows);
    });
  }
}
