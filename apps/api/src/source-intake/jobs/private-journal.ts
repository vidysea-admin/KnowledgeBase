import { createHash } from "node:crypto";
import { existsSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { HostingJournal } from "../../hosting/journal.js";
import type { HostingJournalChange, HostingJournalRecord } from "../../hosting/types.js";
import { verifyPrivateDirectory, verifyPrivateArtifact } from "../../bot-privacy/private-acl.js";
import { SourceJobError } from "./types.js";

export interface SourceSpoolVerifier { directory(path: string): void; artifact(path: string): void }
const actualVerifier: SourceSpoolVerifier = { directory: verifyPrivateDirectory, artifact: verifyPrivateArtifact };
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
        if (!["audit.jsonl", "writer.lock", "recovery.required"].includes(name)) throw new SourceJobError("source_spool_unavailable");
        this.verify.artifact(join(directory, name));
      }
    } catch { throw new SourceJobError("source_spool_unavailable"); }
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
