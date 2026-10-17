/** Test double; production uses createMongoAnswerRecordStore. All return values are detached. */
import { isValidTenantId } from "../auth.js";
import type { AnswerRecordStore, AnswerRun, SourceConflict } from "./answer-records.js";

export function createInMemoryAnswerRecordStore(): AnswerRecordStore {
  const runs = new Map<string, AnswerRun>(), conflicts = new Map<string, SourceConflict>();
  const key = (tenant: string, id: string): string => {
    if (!isValidTenantId(tenant)) throw new Error("Invalid answer record tenant");
    return JSON.stringify([tenant, id]);
  };
  const copy = <T>(value: T): T => structuredClone(value);
  return {
    async create(t, run) { if (t !== run.tenantId || runs.has(key(t, run.id))) throw new Error("Answer record identity mismatch"); runs.set(key(t, run.id), copy(run)); },
    async get(t, id) { return copy(runs.get(key(t, id)) ?? null); },
    async list(t, limit) { key(t, ""); return copy([...runs.values()].filter((r) => r.tenantId === t).sort((a, b) => b.createdAt.localeCompare(a.createdAt)).slice(0, limit)); },
    async reviewItems(t, limit) { key(t, ""); return copy([...runs.values()].filter((r) => r.tenantId === t && ["review", "approved", "rejected"].includes(r.state))
      .sort((a, b) => (a.state === "review" ? 0 : 1) - (b.state === "review" ? 0 : 1) || a.createdAt.localeCompare(b.createdAt)).slice(0, limit)); },
    async review(t, id, digest, review) {
      if (review.candidateDigest !== digest || !["approved", "rejected"].includes(review.decision)) return false;
      const run = runs.get(key(t, id));
      if (!run || run.state !== "review" || run.candidateDigest !== digest || run.evidenceDigest !== review.evidenceDigest) return false;
      run.state = review.decision; run.review = copy(review); return true;
    },
    async feedback(t, id, item) { const run = runs.get(key(t, id)); if (!run || run.feedback.length >= 100) return false; run.feedback.push(copy(item)); return true; },
    async addConflict(t, conflict) {
      if (t !== conflict.tenantId) throw new Error("Answer conflict tenant mismatch");
      key(t, "");
      const old = [...conflicts.values()].find((c) => c.tenantId === t && c.runId === conflict.runId
        && JSON.stringify([c.a.id, c.b.id].sort()) === JSON.stringify([conflict.a.id, conflict.b.id].sort()));
      if (old) return copy(old);
      conflicts.set(key(t, conflict.id), copy(conflict)); return copy(conflict);
    },
    async conflicts(t, runId) { key(t, ""); return copy([...conflicts.values()].filter((c) => c.tenantId === t && (!runId || c.runId === runId))); },
    async getConflict(t, id) { return copy(conflicts.get(key(t, id)) ?? null); },
    async resolveConflict(t, id, resolution) { const c = conflicts.get(key(t, id)); if (!c || c.status !== "open") return false; c.status = "resolved"; c.resolution = copy(resolution); return true; },
  };
}
