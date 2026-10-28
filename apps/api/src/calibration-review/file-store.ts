import { mkdir, readFile, rm, lstat } from "node:fs/promises";
import { resolve, join, isAbsolute } from "node:path";
import { isValidTenantId } from "../auth.js";
import { hash, loadCalibrationSeed } from "./seed.js";
import { publishCalibrationReviewState } from "./persistence.js";
import { CalibrationReviewError, type CalibrationPacket, type CalibrationReviewStore, type ReviewState, type ReviewView, type ReviewSubmission, type ReviewAudit } from "./types.js";

const identityBasis = "tenant-api-key; Umesh identity is asserted, not verified" as const;
const remainingGate = "Actual individual Umesh confirmation of all 30 labels, then current real-judge calibration and independent verification; API assertions alone are not human gold.";
function requireValid(ok: unknown, status = 409, code = "calibration_state_invalid"): asserts ok {
  if (!ok) throw new CalibrationReviewError(status, code);
}
function validateState(state: ReviewState, packet: CalibrationPacket, digest: string): void {
  requireValid(state.format === "calibration-review-state-v1" && state.tenantId === packet.tenantId && state.packetSha256 === digest, 409, "calibration_sources_changed");
  requireValid(state.reviews && typeof state.reviews === "object" && !Array.isArray(state.reviews));
  for (const [id, review] of Object.entries(state.reviews)) {
    const item = packet.items.find(i => i.id === id);
    requireValid(item && Number.isInteger(review.revision) && review.revision > 0 && Array.isArray(review.audit) && review.audit.length === review.revision);
    for (let i = 0; i < review.audit.length; i++) {
      const a = review.audit[i]!;
      requireValid(a.revision === i + 1 && a.tenantId === packet.tenantId && a.itemId === id && a.inputSha256 === item.inputSha256 && a.identityBasis === identityBasis);
      requireValid(/^api-key-sha256:[a-f0-9]{64}$/.test(a.authenticatedActor) && a.after.approvedBy === "Umesh" && a.at === a.after.approvedAt);
      requireValid(typeof a.after.score === "number" && Number.isFinite(a.after.score) && a.after.score >= 0 && a.after.score <= 1 && typeof a.after.rationale === "string" && !!a.after.rationale.trim());
      requireValid(new Date(a.at).toISOString() === a.at && JSON.stringify(a.before) === JSON.stringify(i === 0 ? null : review.audit[i - 1]!.after));
    }
    requireValid(JSON.stringify(review.assertion) === JSON.stringify(review.audit.at(-1)!.after));
  }
}
function view(packet: CalibrationPacket, state: ReviewState): ReviewView {
  return { packet, packetSha256: state.packetSha256, total: 30, approvedCount: Object.keys(state.reviews).length,
    items: packet.items.map(item => ({ ...item, humanReview: state.reviews[item.id]?.assertion ?? item.humanReview,
      revision: state.reviews[item.id]?.revision ?? 0, audit: state.reviews[item.id]?.audit ?? [] })), humanGoldVerified: false, remainingGate };
}
export interface FileCalibrationReviewOptions { root: string; projectRoot: string; packetPath: string; now?: () => string }

/** One snapshot atomically commits both state and audit. Cross-process exclusive lock never steals stale ownership. */
export function createFileCalibrationReviewStore(options: FileCalibrationReviewOptions): CalibrationReviewStore {
  requireValid([options.root, options.projectRoot, options.packetPath].every(isAbsolute), 503, "calibration_paths_require_absolute_configuration");
  const root = resolve(options.root), now = options.now ?? (() => new Date().toISOString());
  const paths = (tenant: string) => {
    requireValid(isValidTenantId(tenant), 403, "calibration_tenant_invalid");
    const filename = hash(tenant);
    return { file: join(root, `${filename}.json`), lock: join(root, `${filename}.lock`) };
  };
  async function current(tenant: string): Promise<CalibrationPacket | null> {
    const packet = await loadCalibrationSeed(options.projectRoot, options.packetPath);
    return packet.tenantId === tenant ? packet : null;
  }
  async function load(tenant: string, packet: CalibrationPacket): Promise<ReviewState> {
    const digest = hash(JSON.stringify(packet)), file = paths(tenant).file;
    let state: ReviewState;
    try {
      requireValid(!(await lstat(root)).isSymbolicLink(), 503, "calibration_store_unsafe");
      requireValid(!(await lstat(file)).isSymbolicLink(), 503, "calibration_store_unsafe");
      state = JSON.parse(await readFile(file, "utf8")) as ReviewState;
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
      state = { format: "calibration-review-state-v1", tenantId: tenant, packetSha256: digest, reviews: {} };
    }
    validateState(state, packet, digest); return state;
  }
  async function locked<T>(tenant: string, work: () => Promise<T>): Promise<T> {
    await mkdir(root, { recursive: true });
    requireValid(!(await lstat(root)).isSymbolicLink(), 503, "calibration_store_unsafe");
    const lock = paths(tenant).lock;
    try { await mkdir(lock); } catch (error) {
      if ((error as NodeJS.ErrnoException).code === "EEXIST") throw new CalibrationReviewError(409, "calibration_store_busy");
      throw error;
    }
    // Cleanup must not turn an already committed approval into a falsely reported failed save.
    // An unreleased lock remains fail-closed on the next write and requires owned operator recovery.
    try { return await work(); } finally { await rm(lock, { recursive: true }).catch(() => undefined); }
  }
  return {
    async read(tenant) { const packet = await current(tenant); return packet ? view(packet, await load(tenant, packet)) : null; },
    async approve(tenant, id, input: ReviewSubmission, actor) {
      return locked(tenant, async () => {
        const packet = await current(tenant); requireValid(packet, 404, "calibration_not_found");
        const item = packet.items.find(i => i.id === id); requireValid(item, 404, "calibration_item_not_found");
        requireValid(input && Object.keys(input).sort().join(",") === "affirmIndividualReview,expectedRevision,inputSha256,rationale,score", 400, "calibration_invalid_submission");
        requireValid(input.affirmIndividualReview === true && typeof input.score === "number" && Number.isFinite(input.score) && input.score >= 0 && input.score <= 1 && typeof input.rationale === "string" && !!input.rationale.trim() && input.rationale.length <= 20000, 400, "calibration_invalid_submission");
        requireValid(Number.isInteger(input.expectedRevision) && input.expectedRevision >= 0 && input.inputSha256 === item.inputSha256 && /^api-key-sha256:[a-f0-9]{64}$/.test(actor), 409, "calibration_revision_conflict");
        const state = await load(tenant, packet), previous = state.reviews[id];
        requireValid((previous?.revision ?? 0) === input.expectedRevision, 409, "calibration_revision_conflict");
        const at = now(); requireValid(new Date(at).toISOString() === at, 503, "calibration_clock_invalid");
        const assertion = { score: input.score, rationale: input.rationale.trim(), approvedBy: "Umesh" as const, approvedAt: at };
        const audit: ReviewAudit = { revision: input.expectedRevision + 1, tenantId: tenant, itemId: id, authenticatedActor: actor, identityBasis,
          inputSha256: item.inputSha256, before: previous?.assertion ?? null, after: assertion, at };
        state.reviews[id] = { revision: audit.revision, assertion, audit: [...(previous?.audit ?? []), audit] };
        validateState(state, packet, state.packetSha256);
        // Recheck after the in-memory update; a changed source cannot be committed or exported as effective approval.
        requireValid(hash(JSON.stringify(await current(tenant))) === state.packetSha256, 409, "calibration_sources_changed");
        await publishCalibrationReviewState(paths(tenant).file, state);
        return view(packet, state);
      });
    },
    async export(tenant) {
      const packet = await current(tenant); requireValid(packet, 404, "calibration_not_found");
      const state = await load(tenant, packet);
      requireValid(packet.items.every(i => !!state.reviews[i.id]), 409, "calibration_individual_reviews_pending");
      return { format: "calibration-reviewed-export-v1", tenantId: tenant, packetSha256: state.packetSha256,
        packet: { ...packet, items: packet.items.map(i => ({ ...i, humanReview: state.reviews[i.id]!.assertion })) },
        audit: packet.items.flatMap(i => state.reviews[i.id]!.audit), humanGoldVerified: false, remainingGate };
    },
  };
}
