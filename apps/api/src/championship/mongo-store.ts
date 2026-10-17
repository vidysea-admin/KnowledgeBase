import type { Db } from "mongodb";
import type { EvalRuns } from "@lkb/core";
import type { ChampionshipStore } from "../routes/championship/championship.js";
import { createMongoEvidenceVerifier } from "../answer-policy/answer-evidence.js";
import { assertChampionshipBank, ChampionshipError, type ChampionshipEvent } from "./model.js";
import { championshipReport } from "./runtime.js";

/** Central migration installs schema validator and unique trial index. This adapter never mutates schema/indexes. */
export function createMongoChampionshipStore(db: Db): ChampionshipStore {
  const events = db.collection<ChampionshipEvent>("championship_events");
  async function writable() {
    const [options, indexes] = await Promise.all([events.options(), events.listIndexes().toArray()]).catch(() => {
      throw new ChampionshipError("storage_unavailable", "Championship schema and unique-trial migration are unavailable");
    });
    const index = indexes.find(i => i.name === "championship_eval_once");
    const validator = (options.validator as { $jsonSchema?: { required?: string[] } } | undefined)?.$jsonSchema;
    const required = validator?.required;
    if (!Array.isArray(required) || !required.includes("tenantId") || !required.includes("bankDigest") || !index?.unique ||
      index.key?.tenantId !== 1 || index.key?.["trials.evalRunId"] !== 1 || Object.keys(index.key ?? {}).length !== 2 ||
      JSON.stringify(index.partialFilterExpression) !== JSON.stringify({ "trials.0": { $exists: true } }) ||
      options.validationAction === "warn" || options.validationLevel === "off") {
      throw new ChampionshipError("storage_unavailable", "Championship schema and unique-trial migration must be installed before writes");
    }
  }
  function valid(tenantId: string, e: ChampionshipEvent) {
    if (e.tenantId !== tenantId) throw new ChampionshipError("invalid_tenant", "Tenant-scoped event required");
    assertChampionshipBank(e); championshipReport(e);
  }
  function fixed(e: ChampionshipEvent) {
    return JSON.stringify({ _id: e._id, tenantId: e.tenantId, title: e.title, questions: e.questions, counsellors: e.counsellors,
      judges: e.judges, rubric: e.rubric, reviewReference: e.reviewReference, bankDigest: e.bankDigest, createdAt: e.createdAt, evidenceStatus: e.evidenceStatus });
  }
  return {
    verifyEvidence: createMongoEvidenceVerifier(db),
    async create(tenantId, event) {
      valid(tenantId, event);
      if (event.revision !== 0 || event.frozenAt !== undefined || event.trials.length) throw new ChampionshipError("invalid_transition", "New events must be unfrozen revision-zero plans");
      await writable(); await events.insertOne(structuredClone(event));
    },
    async get(tenantId, id) {
      const event = await events.findOne({ tenantId, _id: id }); if (!event) return null;
      valid(tenantId, event); return structuredClone(event);
    },
    async replace(tenantId, id, expectedRevision, event) {
      valid(tenantId, event); const old = await events.findOne({ tenantId, _id: id, revision: expectedRevision });
      if (!old) return false;
      valid(tenantId, old);
      const freezing = !old.frozenAt && !!event.frozenAt && old.trials.length === 0 && event.trials.length === 0;
      const adding = !!old.frozenAt && event.frozenAt === old.frozenAt && event.trials.length === old.trials.length + 1 &&
        JSON.stringify(event.trials.slice(0, old.trials.length)) === JSON.stringify(old.trials);
      if (event._id !== id || event.revision !== expectedRevision + 1 || fixed(event) !== fixed(old) || !freezing && !adding) {
        throw new ChampionshipError("invalid_transition", "Frozen plan and existing trial snapshots are immutable");
      }
      await writable();
      try { const result = await events.replaceOne({ tenantId, _id: id, revision: expectedRevision }, structuredClone(event)); return result.modifiedCount === 1; }
      catch (error) { if ((error as {code?: number})?.code === 11000) return false; throw error; }
    },
    async getEvalRun(tenantId, id) { return db.collection<EvalRuns>("eval_runs").findOne({ tenantId, _id: id }); },
  };
}
