/**
 * packages/ingest/src/intake.ts — T-045 adapter-to-intake path. Takes any registered `Source` adapter's output
 * (YouTube / OnAir / Zoom, via `detectSource`) and plans the `sources` + `sessions` + `turns` doc set the same way
 * `apps/api/src/ingest-store.ts` `ingestUrl` builds it. Pure apart from the injected `IntakeSink`: no database,
 * no network. API wiring is a separate unit.
 *
 * Re-ingest policy (D-135, pending append): the source `_id` is derived from (tenantId, content hash) so identical media is idempotent within a tenant and never shared across tenants, so the same media ingested again
 * is idempotent. The existing session id is returned with `status: "already-ingested"` and NOTHING is created or
 * deleted: no `toTurns` call (no second transcription), no `save`.
 *
 * Assumptions (manifest): session title = `sourceMeta.title` when a non-empty string, else the source url;
 * `status.index` starts "pending" (as ingestUrl); an adapter that yields no turns is refused, not stored.
 */
import type { Sessions, Turns } from "@lkb/core";
import { detectSource } from "./registry.js";
import { tenantSourceId, type ConsentContext, type MediaDoc, type Source, type SourceDoc, type Turn } from "./source.js";

export type IntakeErrorCode = "invalid-input" | "tenant-mismatch" | "unscoped-source" | "no-turns" | "sink-failed";

export class IntakeError extends Error {
  readonly code: IntakeErrorCode;
  constructor(code: IntakeErrorCode, message: string) {
    super(`intake [${code}]: ${message}`);
    this.name = "IntakeError";
    this.code = code;
  }
}

export interface IntakePlan {
  source: SourceDoc;
  media: MediaDoc[];
  session: Sessions;
  turns: Turns[];
}

/** Injected persistence. `save` must be all-or-nothing; the planner never calls it twice for one input. */
export interface IntakeSink {
  /** The session already created for this source, if any. `sourceId` embeds the tenant, so even a tenant-ignoring sink cannot return another tenant's session; still keep it confined. */
  findSessionBySource(tenantId: string, sourceId: string): Promise<{ sessionId: string } | undefined>;
  save(plan: IntakePlan): Promise<void>;
}

export interface IntakeDeps {
  adapters: Source[];
  sink: IntakeSink;
  newId(): string;
  now(): string;
}

export type IntakeResult =
  | { status: "created"; sessionId: string; sourceId: string; turnCount: number }
  | { status: "already-ingested"; sessionId: string; sourceId: string };

function titleFor(source: SourceDoc): string {
  const t = (source as { sourceMeta?: { title?: unknown } }).sourceMeta?.title;
  if (typeof t === "string" && t.trim().length > 0) return t.trim();
  return source.url ?? source._id;
}

export async function intakeFromSource(
  input: unknown,
  consent: ConsentContext,
  deps: IntakeDeps,
): Promise<IntakeResult> {
  const tenantId = typeof input === "object" && input !== null ? (input as { tenantId?: unknown }).tenantId : undefined;
  if (typeof tenantId !== "string" || tenantId.length === 0) {
    throw new IntakeError("invalid-input", "input must be an object carrying a non-empty tenantId");
  }
  const adapter = detectSource(input, deps.adapters);
  const { source, media } = await adapter.fetch(input, consent);
  if (source.tenantId !== tenantId) {
    throw new IntakeError("tenant-mismatch", "adapter returned a source for a different tenant");
  }

  // ISS-T045INTAKE-001: the dedupe key is tenant-scoped by construction. It must equal tenantSourceId(tenant, hash), so
  // it embeds the tenant: even a sink that ignores `tenantId` cannot match another tenant's source. A source whose
  // _id is not so scoped (bare content hash) is refused rather than stored under a globally colliding id.
  if (typeof source.hash !== "string" || source._id !== tenantSourceId(tenantId, source.hash)) {
    throw new IntakeError("unscoped-source", "adapter source _id is not tenant-scoped; refusing to plan");
  }
  const existing = await deps.sink.findSessionBySource(tenantId, source._id);
  if (existing) return { status: "already-ingested", sessionId: existing.sessionId, sourceId: source._id };

  const turns = await adapter.toTurns(source);
  if (turns.length === 0) throw new IntakeError("no-turns", "adapter produced no turns; nothing stored");

  const sessionId = deps.newId();
  const session: Sessions = {
    _id: sessionId,
    tenantId,
    sourceId: source._id,
    title: titleFor(source),
    date: deps.now().slice(0, 10),
    status: { transcribe: "done", index: "pending" },
  };
  const turnDocs: Turns[] = turns.map((t: Turn, i: number) => ({
    _id: `${sessionId}-t${String(i + 1).padStart(3, "0")}`,
    tenantId,
    sessionId,
    speakerRef: t.speakerRef,
    tStart: t.tStart,
    tEnd: t.tEnd,
    text: t.text,
  }));
  try {
    await deps.sink.save({ source, media, session, turns: turnDocs });
  } catch {
    throw new IntakeError("sink-failed", "persistence failed; no result returned");
  }
  return { status: "created", sessionId, sourceId: source._id, turnCount: turnDocs.length };
}
