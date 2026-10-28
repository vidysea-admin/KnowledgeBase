import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { HostingJournal } from "./journal.js";
import { HostingService } from "./service.js";
import type { HostingPrincipal } from "./types.js";

export function hostingFixture() {
  const root = mkdtempSync(join(tmpdir(), "lkb-hosting-"));
  let time = Date.parse("2026-10-14T12:00:00Z");
  const revoked = new Set<string>();
  const keys = new Map([ ["A", new Set(["ownerA", "memberA", "editorA"])], ["B", new Set(["ownerB", "memberB"])] ]);
  const status = new Map<string, "active" | "inactive" | "deleted" | "unbound" | "recovery">();
  const options = {
    bootstrap: new Map([ ["A", new Set(["ownerA"])], ["B", new Set(["ownerB"])] ]),
    origins: new Set(["https://hooks.example.test"]), encryptionKey: Buffer.alloc(32, 17),
    keyExists: async (tenant: string, keyId: string) => Boolean(keys.get(tenant)?.has(keyId) && !revoked.has(`${tenant}:${keyId}`)),
    accountStatus: async (tenant: string, keyId: string) => status.get(`${tenant}:${keyId}`) ?? "unbound" as const,
    validateDestination: async (_url: URL) => {},
    now: () => time,
  };
  const make = (journal = new HostingJournal(root)) => new HostingService({ ...options, journal });
  const p = (tenantId: string, keyId: string): HostingPrincipal => ({ tenantId, keyId, scopes: ["hosting", "webhooks"] });
  return { root, service: make(), make, revoked, status, options, ownerA: p("A", "ownerA"), ownerB: p("B", "ownerB"),
    memberA: p("A", "memberA"), memberB: p("B", "memberB"), editorA: p("A", "editorA"),
    tick: (milliseconds: number) => { time += milliseconds; }, close: () => {
      if (!root.startsWith(join(tmpdir(), "lkb-hosting-"))) throw new Error("unsafe fixture cleanup");
      rmSync(root, { recursive: true, force: true });
    } };
}
