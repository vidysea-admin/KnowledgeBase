# goal-t059 — cycle 0 frozen maker packet

Repository: C:/Users/product/Desktop/KnowledgeBase. Maker /root/roadmap_status/maker_t059; independent checker /root/roadmap_status/checker_t059. Manifest qa/manifests/goal-t059.md, verdict target qa/verdicts/goal-t059.md. Source frozen after the broker's successful execution; formal READY cycle 0 now includes root coherent typecheck evidence. Parent/live acceptance remains HOLD.

## Scope and acceptance boundary

Authorize the complete source coordinator/API foundation under D-170; tier 3 roadmap, data-write/tenancy/security class uncapped. No earlier PASS on this new seam. Contract qa/contracts/goal-t059.md SHA256 aa2cbf36698158f5a92dad3386ad9a8c41e0b31420f38f27968c5e11c17ae1bd. Existing evaluator-calibration, t022-calibration-human-review, t043 cited-answer/tenant-scope and t057-d3-knowledge-gaps contracts remain governing context; none was edited by the maker. No issue-fix corpus, mutation run, human approval or parent completion is claimed.

S1–S10/S12/S13/S14: implemented source behavior with offline runtime evidence below; independent review and schema-row/current-mount probes remain required. S11: new answers are initially unscored/internal/needs-review; later explicit finite internal scores are retained without closure. Calibrated new scoring and semantic quality remain pending. S15: frozen pins, broker runtime and coherent root typecheck available, awaiting independent verdict. L1–L5 and whole T-059 remain HOLD; T-021 done under D-156, T-022 and T-043 parents unfinished.

## Ownership and base

All eleven evaluation-flywheel files and docs/t059-evaluation-flywheel.md are new maker-owned files; no base file existed for them. The maker never touched qa/contracts, protected architecture/decisions/enforcement, trackers, dependencies/lock, schema/generated/migrations or Git. Root integration owns the existing schema/generated/brain/server/production files and new composition/integrations/evaluation.ts; its shared integration packet/diff is authoritative for those base changes. The following full new-source blocks provide every changed production line without requiring a repository survey.

## Caller and consumer map

| Seam | Actual caller/consumer and purpose |
|---|---|
| types.ts | Persisted types derive canonical generated Gaps.flywheel/EvalRuns.flywheel; no parallel collection fields. JSON tuple hashes separate tenant/evaluation/request identities. |
| workflow.ts:createEvaluationFlywheel | Root composition/integrations/evaluation.ts constructs it only under both feature/intake flags, actual lkb_t059_* DB and real request-bound dependencies. Read saved loss; preserve immutable snapshot; CAS revision/lease; verify each real stage; store stable child. |
| store.ts:createMongoFlywheelStore | Canonical scopedCollection for eval_runs/gaps/sources/sessions/turns/chunks/tree_index; every filter/write stamped tenant. Test DB namespace guard precedes all collection use. Natural `_id` upserts preserve first row; revision CAS replaces head only. |
| receipts.ts | Reads actual source/session/held turns, consent/mode, tenantSourceId, timing/speaker/content and ordered transcript digest. Actual index completion and same-tenant stored tree/session node/chunks must agree before Ask. Index UUID is attempt lineage, not a DB generation stamp. |
| ask.ts:buildFlywheelAsk | Reuses actual askV2 and the existing requestDepsFor/hydration/score/router/policy bindings; verifies loaded tree digest before/after. Legacy/unbounded deps cannot substitute. |
| router.ts | Actual composition/integrations/routes.ts mounts after shared auth/rate perimeter; all write routes require compete+gaps+ingest+ask, inspect compete+gaps. Unknown body fields/tenant overrides refuse, safe errors only, source URL never persisted raw, lock token omitted. |
| brain.ts /gaps | Root projection strips complete private flywheel blob and confines rows to verified tenant, preserving standard gap fields. Generic gap description does not disclose private question; dedicated inspect requires compete. |
| server.ts | Current source extends IntegratedWorkflows at line 59, requires shared authentication at line 124 and calls mountIntegratedWorkflows at line 127; actual createServer runtime test invoked the new route before unrelated integration additions. Narrow current-mount probe requested. |
| composition/production.ts | Current buildEvaluationIntegrations(input) at line 307 and spread into returned deps at line 314. buildIndexer creates completion/embedding routes inside the verified tenant-bound callback (lines 190–208). Constructor does not grant availability or invoke providers. |
| source-intake/store.ts + packages/ingest/intake.ts | Existing actual intake planner/sink stores source/session/turns; created/already-ingested both require verified receipt. Fixture consumes actual sink/planner with memory DB, no network. |
| indexing/session.ts/types.ts | Actual grounded strict indexSession on fixture plus healthy vectors returns version-2 completion. Required receipt, source reread and actual stored output digests gate retest. |
| ask/source-context.ts + packages/ask/ask-v2.ts | Genuine production request-bound source hydration and askV2 read newly indexed fixture; exact quote/speaker/turn/session/time retained in child. |

Auth/tenancy/cross-tenant/writes flags are all true. Credentials: no credential creation/read or provider call; only a hash of supplied URL is stored. Metadata/privacy and error leakage are security-relevant. Root schema integration added ordinary canonical metadata only, no new collection/index or frozen contract. Existing tenant-first accessors and `_id` keys provide uniqueness; no migration was requested by this unit.

## Actual runtime evidence

Broker command (approved sole CPU execution, not a maker run):

```text
C:\Program Files\nodejs\node.exe --test --test-concurrency=1 --test-timeout=30000 --import tsx apps/api/src/evaluation-flywheel/workflow.test.ts apps/api/src/evaluation-flywheel/router.test.ts apps/api/src/evaluation-flywheel/composition.test.ts
cwd C:\Users\product\Desktop\KnowledgeBase
outer timeout 120000 ms; exit 0; signal/error null
16 PASS, 0 fail/cancel/skip/todo; TAP 7055.2434 ms; wall 7184.8055 ms
UTC 2026-10-14T20:16:16.977Z -> 2026-10-14T20:16:24.167Z
```

Receipt qa/evidence/goal-t051checker-broker-t059-tests.json SHA256 1de82bfddbd40810ef22af74d8addf1010007149dfc0de980bfa40c8664d7f7f; stdout/stderr paths are in it. All fifteen before/after pins match. Workflow tests cover finite loss/tie/win/foreign refusals, input drift, real receipt requirements, degraded/mismatched/empty index, foreign chunks/tree, provider/index/Ask/write failures, concurrent CAS, expired restart, crash after child write, source rebinding, DB guard, real deadline/late callback, and retained explicit child score. Router tests exercise actual auth/scopes/private-gap projection, unconfigured 503 and actual shared createServer mount.

Affected and immediate downstream fixture: composition.test.ts uses actual createSourceIntakeDeps/createMongoIntakeSink/intakeFromSource, strict grounded indexSession and actual createSourceRequestDepsFor/askV2. Offline model/embed responses are explicitly fixtures; no semantic/provider quality claim. It verifies quote `Registration opens on the first of April.`, session s1, turn s1-t001, speaker speaker:fixture, tStart 3, tEnd 7, unchanged original, idempotent child; malicious generation citation refuses and insufficient coverage remains unscored. Produced representative records qa/evidence/goal-t059-maker/rows.json SHA256 6fe1f1ee906c9a0fbd65086dd77d82aca89ef78df402a9cf6b38092b864b78c9. Checker may independently validate these actual records against the current canonical schemas under its CPU slot.

No environment keys or real DB/provider/media/browser are required for this command. Local ephemeral loopback listeners only. Execution succeeded in the broker's recorded environment; do not prescribe a redundant failing subprocess attempt. New tests/probes require a fresh sole CPU grant from /root/docker_checker. No full suite, provider job, media run, real Mongo write or standalone duplicate tsc/validator is authorized.

Root coherent typecheck receipt qa/goal-2026-10-14/api-types-receipt.json SHA256 89e14679eb16194ccf20fc00ad52b1dd5c03ba4fe9f6cc3121f08628e403d57d: program C:/Users/product/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/bin/node.exe; argv C:/Users/product/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/pnpm/bin/pnpm.mjs --filter @lkb/api typecheck; cwd is recorded as apps/api in stdout. Exit 0, timeout false, elapsed 14239 ms; stdout is successful `tsc --noEmit -p tsconfig.json`, stderr empty. It replaces the earlier failed fixture-spread attempt; no suppression or child duplicate compile was used. Receipt carries no exact start/end timestamps, which are therefore not inferred from file mtime.

Root canonical schema receipt qa/goal-2026-10-14/schema-receipt.json SHA256 79678d5e0e159f35cafaa45132b9abd084a6fd8c00a14446019406640099b77e: .venv/Scripts/python.exe schema/validate.py, exit 0, elapsed 1912 ms, 43 schemas validated; existing eval_runs/gaps one valid+one invalid fixture each accepted/refused. This general fixture validation does not substitute independent validation of the newly produced rows. Root generation receipt qa/goal-2026-10-14/generate-receipt.json SHA256 20f274de79a5965cf40c165cf361634cb5ae706f49d839d477b44e6b0e47b296: C:/Program Files/nodejs/node.exe scripts/gen-types.mjs, exit 0, elapsed 733 ms, 43 collections/18 files written including eval_runs/gaps. A generate --check drift pass is not asserted by that generation-only receipt. Broker's final canonical schema/generated pins still match current files.

Frozen validator reuse: qa/evidence/goal-t051checker-validator.json records `python contracts/verify_contracts.py`, exit 0, PASS by vacuity (no frozen contracts). Script SHA256 1240059fc2abc63cde58472ef8f7964978e74ba5bc2f5156a30379ddae391db3 and registry d31dad4c1fce135238169f48c18bc5ef68ea0deff7978d9323441330778cc940 rechecked unchanged. Original receipt's individual duration unknown; combined batch 1.4327147 seconds. This does not replace affected/downstream checks.

## Frozen pins

The authoritative broker JSON holds all ten new TS files and five schema/generated/factory hashes before/after execution. Additional current pins for root mounting/projection and documentation follow; shared root files may change only with notification/resubmission, and their integration owner supplies whole-module acceptance.

| Path | SHA256 |
|---|---|
| apps/api/src/evaluation-flywheel/schema-request.json | 68c9c03441757b38c46a0091ddbDAC44362f2ca4d51adf20e1340d0685d3776d |
| docs/t059-evaluation-flywheel.md | f8b60229c400d0a9f863ff7e3386343d6536d9d118a55454e9113607f7865d8a |
| apps/api/src/server.ts | 5730f4aeb2086999ebe08e81a729055db118d9a42efd3e425ae7572eaa2328d2 |
| apps/api/src/routes/brain.ts | 3bcf6ea3ac5f1d4446290212fa41ae8984d8a629ab720985ff3bef0510267188 |
| apps/api/src/composition/production.ts | 804bb0a6f99ee875a791d7cfc6f6c91b59794e547b5032131cbad9590e50c254 |
| apps/api/src/composition/integrations/routes.ts | e71a69b44bd8b479c43bbb54d67515153b9cc44c6cc2f44170d663a941935a5d |

These three shared root files changed for other integrations after the broker run. Their flywheel mount/auth/factory hunk is read-confirmed in the current typechecked candidate; independent checker should probe the actual current createServer mount/authorization and factory configuration guard. This packet does not pass whole shared modules from an older runtime receipt. Ten own TS files, both canonical schemas/generated files and evaluation factory retain exact broker-tested bytes.

## Remaining gates and recovery limits

The two-minute provider deadline cannot cancel existing provider/index seams. It records safe failure and retains ten-minute lease until expiry; stale callbacks cannot advance the head. Unrelated index writers and live hanging/host cancellation remain operational gates. Index attempt UUID is not represented as persisted index generation; transcript/tree/chunk digests are the readback binding. `received` means verified source receipt only, never indexed/improved/resolved. New answer needs genuine calibrated/human judgment; explicit later internal scores stay internal and do not close the loss. Whole live L1–L5 require real artifacts and T-022/T-043 dependency acceptance. No parent or ALL40 completion follows from this packet.

## Complete new production logic

### apps/api/src/evaluation-flywheel/types.ts

```typescript
import { createHash } from "node:crypto";
import type { EvalRuns, Gaps, Sources, Sessions, Turns, Chunks, TreeIndexRootDocument } from "@lkb/core";
import type { IndexSessionResult } from "../indexing/types.js";
import type { IntakeResult } from "@lkb/ingest";

/** Root integrates schema-request.json into canonical schemas and regenerates these owning types. */
export type FlywheelHead = NonNullable<Gaps["flywheel"]>;
export type FlywheelStage = FlywheelHead["stage"];
export type LossSnapshot = FlywheelHead["loss"];
export type CaptureReceipt = NonNullable<FlywheelHead["capture"]>;
export type IndexedReceipt = NonNullable<FlywheelHead["index"]>;
export type FlywheelGap = Gaps & { flywheel: FlywheelHead };
export type RetestLineage = NonNullable<EvalRuns["flywheel"]>;
export type RetestRun = EvalRuns & { flywheel: RetestLineage };
export interface SourceRows { source: Sources | null; session: Sessions | null; turns: Turns[] }
export interface IndexedRows { tree: TreeIndexRootDocument | null; chunks: Chunks[] }
export interface FlywheelStore {
  evaluation(tenantId: string, id: string): Promise<EvalRuns | null>;
  gap(tenantId: string, id: string): Promise<FlywheelGap | null>;
  createGap(tenantId: string, row: FlywheelGap): Promise<void>;
  replaceGap(tenantId: string, expectedRevision: number, row: FlywheelGap): Promise<boolean>;
  sourceRows(tenantId: string, sourceId: string, sessionId: string): Promise<SourceRows>;
  indexedRows(tenantId: string, sessionId: string): Promise<IndexedRows>;
  createRetest(tenantId: string, row: RetestRun): Promise<void>;
}
export interface FlywheelDeps {
  store: FlywheelStore;
  intake(req: { tenantId: string; url: string }): Promise<IntakeResult>;
  index(tenantId: string, sessionId: string): Promise<IndexSessionResult>;
  ask(tenantId: string, question: string, receipt: IndexedReceipt): Promise<NonNullable<EvalRuns["aiAnswer"]>>;
  now?: () => Date; newToken?: () => string;
  /** Deadline for a provider stage; timed-out work is not falsely represented as cancelled. */
  operationTimeoutMs?: number;
}
export class FlywheelError extends Error {
  constructor(readonly code: "invalid" | "not_found" | "not_loss" | "input_drift" | "conflict" | "unavailable", readonly status: number) {
    super(code); this.name = "FlywheelError";
  }
}
export function canonical(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(canonical).join(",")}]`;
  if (value !== null && typeof value === "object") return `{${Object.entries(value).filter(([, v]) => v !== undefined)
    .sort(([a], [b]) => a < b ? -1 : a > b ? 1 : 0).map(([k, v]) => `${JSON.stringify(k)}:${canonical(v)}`).join(",")}}`;
  return JSON.stringify(value) ?? "null";
}
export const fingerprint = (value: unknown): string => createHash("sha256").update(canonical(value)).digest("hex");
export const gapId = (tenantId: string, evalId: string): string => `eval-gap-${fingerprint([tenantId, evalId])}`;
export const retestId = (tenantId: string, id: string, requestId: string): string => `eval-retest-${fingerprint([tenantId, id, requestId])}`;
```

### apps/api/src/evaluation-flywheel/store.ts

```typescript
import type { Db } from "mongodb";
import { scopedCollection, assertValidTenantId } from "@lkb/db";
import type { EvalRuns, Sources, Sessions, Turns, Chunks, TreeIndexRootDocument } from "@lkb/core";
import { treeIndexRootFilter } from "@lkb/index";
import type { FlywheelGap, FlywheelStore } from "./types.js";

/** New write seam deliberately limited to test databases until its own production approval. */
export function createMongoFlywheelStore(db: Db): FlywheelStore {
  if (!/^lkb_t059_[a-z0-9_-]+$/i.test(db.databaseName)) throw new Error("flywheel database unavailable");
  const evals = scopedCollection<EvalRuns>(db, "eval_runs");
  const gaps = scopedCollection<FlywheelGap>(db, "gaps");
  const sources = scopedCollection<Sources>(db, "sources");
  const sessions = scopedCollection<Sessions>(db, "sessions");
  const turns = scopedCollection<Turns>(db, "turns");
  const chunks = scopedCollection<Chunks>(db, "chunks");
  const trees = scopedCollection<TreeIndexRootDocument & { _id: string }>(db, "tree_index");
  const owned = <T extends { tenantId: string }>(t: string, row: T | null): T | null => row?.tenantId === t ? row : null;
  return {
    async evaluation(t, id) { return owned(t, await evals(t).findOne({ _id: id })); },
    async gap(t, id) { return owned(t, await gaps(t).findOne({ _id: id })); },
    async createGap(t, row) {
      assertValidTenantId(t, "flywheel.createGap");
      if (row.tenantId !== t) throw new Error("flywheel tenant mismatch");
      const { _id, tenantId: _t, ...fields } = row;
      await gaps(t).updateOne({ _id }, { $setOnInsert: fields }, { upsert: true });
    },
    async replaceGap(t, expectedRevision, row) {
      if (row.tenantId !== t || row.flywheel.revision !== expectedRevision + 1) throw new Error("flywheel revision mismatch");
      const r = await gaps(t).replaceOne({ _id: row._id, "flywheel.revision": expectedRevision }, row);
      return r.matchedCount === 1;
    },
    async sourceRows(t, sourceId, sessionId) {
      const [source, session, rows] = await Promise.all([sources(t).findOne({ _id: sourceId }),
        sessions(t).findOne({ _id: sessionId }), turns(t).find({ sessionId }).sort({ tStart: 1, _id: 1 }).toArray()]);
      return { source: owned(t, source), session: owned(t, session), turns: rows };
    },
    async indexedRows(t, sessionId) {
      const [tree, rows] = await Promise.all([trees(t).findOne(treeIndexRootFilter(t)), chunks(t).find({ sourceRef: sessionId }).sort({ chunkIndex: 1 }).toArray()]);
      return { tree: owned(t, tree), chunks: rows };
    },
    async createRetest(t, row) {
      if (row.tenantId !== t) throw new Error("flywheel tenant mismatch");
      const { _id, tenantId: _t, ...fields } = row;
      await evals(t).updateOne({ _id }, { $setOnInsert: fields }, { upsert: true });
    },
  };
}
```

### apps/api/src/evaluation-flywheel/receipts.ts

```typescript
import type { TreeIndexNode } from "@lkb/core";
import type { IndexSessionResult } from "../indexing/types.js";
import { tenantSourceId } from "@lkb/ingest";
import { fingerprint, FlywheelError, type CaptureReceipt, type SourceRows, type IndexedRows } from "./types.js";

const present = (x: unknown): x is string => typeof x === "string" && x.trim().length > 0;
export function captureReceipt(t: string, sourceId: string, sessionId: string, rows: SourceRows): CaptureReceipt {
  const { source, session, turns } = rows;
  if (!source || !session || source.tenantId !== t || session.tenantId !== t || source._id !== sourceId
    || session._id !== sessionId || session.sourceId !== sourceId || !present(source.hash) || source._id !== tenantSourceId(t, source.hash)
    || !["provided", "public", "notes"].includes(source.captureMode) || source.consent?.given !== true
    || !present(source.consent.recordedBy) || session.status.transcribe !== "done" || !turns.length)
    throw new FlywheelError("unavailable", 503);
  const ids = new Set<string>();
  for (const turn of turns) {
    if (turn.tenantId !== t || turn.sessionId !== sessionId || !present(turn._id) || ids.has(turn._id)
      || !present(turn.text) || !present(turn.speakerRef) || !Number.isFinite(turn.tStart) || !Number.isFinite(turn.tEnd)
      || turn.tStart < 0 || turn.tEnd < turn.tStart) throw new FlywheelError("unavailable", 503);
    ids.add(turn._id);
  }
  const ordered = [...turns].sort((a, b) => a.tStart - b.tStart || (a._id < b._id ? -1 : a._id > b._id ? 1 : 0));
  return { sourceId, sessionId, sourceDigest: source.hash, transcriptDigest: fingerprint(ordered), turnCount: turns.length,
    turnIds: [ordered[0]!._id, ...ordered.slice(1).map((r) => r._id)] };
}
export function indexedDigests(t: string, receipt: CaptureReceipt, rows: IndexedRows): { treeDigest: string; chunksDigest: string } {
  const { tree, chunks } = rows;
  const matches = (n: TreeIndexNode): boolean => n.level === "session" && n.evidence?.sessionRef === receipt.sessionId
    || n.children.some(matches);
  if (!tree || tree.tenantId !== t || tree.node_id !== `tenant:${t}` || !matches(tree) || !chunks.length)
    throw new FlywheelError("unavailable", 503);
  const ids = new Set<string>();
  for (const c of chunks) {
    if (c.tenantId !== t || c.sourceRef !== receipt.sessionId || !present(c._id) || ids.has(c._id)
      || !Array.isArray(c.turnRefs) || !c.turnRefs.length || c.turnRefs.some((id) => !receipt.turnIds.includes(id)) || !Array.isArray(c.vector) || !c.vector.length
      || c.vector.some((v) => !Number.isFinite(v)) || c.dims !== c.vector.length || !present(c.embeddingModel))
      throw new FlywheelError("unavailable", 503);
    ids.add(c._id);
  }
  return { treeDigest: fingerprint(tree), chunksDigest: fingerprint(chunks) };
}
export function assertIndexResult(result: IndexSessionResult, receipt: CaptureReceipt): void {
  const c = result?.completion;
  if (result?.sessionId !== receipt.sessionId || !c || c.version !== 2 || c.complete !== true || c.treeWritten !== true
    || !present(c.generation) || c.turnCount !== receipt.turnCount || c.turnCount < 1
    || !result.chunks || result.chunks.skipped !== null || result.chunks.written < 1
    || !result.summary || result.summary.degraded !== null || !result.claims || result.claims.degraded !== null)
    throw new FlywheelError("unavailable", 503);
}
```

### apps/api/src/evaluation-flywheel/workflow.ts

```typescript
import { randomUUID } from "node:crypto";
import { assertValidTenantId } from "@lkb/db";
import type { EvalRuns } from "@lkb/core";
import { captureReceipt, indexedDigests, assertIndexResult } from "./receipts.js";
import { FlywheelError, fingerprint, gapId, retestId, type FlywheelDeps, type FlywheelGap,
  type LossSnapshot, type RetestRun, type CaptureReceipt, type IndexedReceipt } from "./types.js";

const fail = (code: FlywheelError["code"], status = 409): never => { throw new FlywheelError(code, status); };
const validId = (x: unknown): x is string => typeof x === "string" && x.length > 0 && x.length <= 200 && x === x.trim();
const same = (a: unknown, b: unknown): boolean => fingerprint(a) === fingerprint(b);
function snapshot(row: EvalRuns): LossSnapshot {
  const ai = row.score?.ai, human = row.score?.counsellor;
  if (!Number.isFinite(ai) || !Number.isFinite(human) || !row.question?.trim()
    || !row.aiAnswer?.text?.trim() || !row.counsellorAnswer?.text?.trim() || !row.counsellor?.name?.trim()
    || !["internal", "independent-human", "calibrated-llm"].includes(row.credibility)
    || !Number.isFinite(Date.parse(row.createdAt))) fail("not_loss");
  if (ai! >= human!) fail("not_loss");
  return structuredClone({ question: row.question, aiAnswer: { ...row.aiAnswer!, text: row.aiAnswer!.text! }, counsellor: row.counsellor,
    counsellorAnswer: { ...row.counsellorAnswer!, text: row.counsellorAnswer!.text! }, score: { ...row.score!, ai: ai!, counsellor: human! }, credibility: row.credibility, createdAt: row.createdAt });
}

export function createEvaluationFlywheel(deps: FlywheelDeps) {
  const now = deps.now ?? (() => new Date());
  const iso = (): string => now().toISOString();
  const token = deps.newToken ?? randomUUID;
  const timeout = deps.operationTimeoutMs ?? 120_000;
  if (!Number.isSafeInteger(timeout) || timeout < 1 || timeout > 120_000) fail("invalid", 400);
  class StageTimeout extends FlywheelError { constructor() { super("unavailable", 503); } }
  async function bounded<T>(call: () => Promise<T>): Promise<T> {
    let timer: ReturnType<typeof setTimeout> | undefined;
    try { return await Promise.race([call(), new Promise<never>((_resolve, reject) => {
      timer = setTimeout(() => reject(new StageTimeout()), timeout);
    })]); } finally { if (timer) clearTimeout(timer); }
  }
  async function loss(t: string, id: string): Promise<{ row: EvalRuns; loss: LossSnapshot; fp: string }> {
    assertValidTenantId(t, "evaluationFlywheel");
    if (!validId(id)) fail("invalid", 400);
    const row = await deps.store.evaluation(t, id);
    if (!row || row.tenantId !== t || row._id !== id) fail("not_found", 404);
    const s = snapshot(row!);
    return { row: row!, loss: s, fp: fingerprint(s) };
  }
  async function load(t: string, id: string): Promise<FlywheelGap> {
    const original = await loss(t, id);
    const row = await deps.store.gap(t, gapId(t, id));
    if (!row || row.tenantId !== t || row._id !== gapId(t, id) || row.kind !== "source-pending"
      || row.flywheel?.version !== 1 || row.flywheel.originalEvalRunId !== id) fail("not_found", 404);
    if (row!.flywheel.inputFingerprint !== original.fp || !same(row!.flywheel.loss, original.loss)) fail("input_drift");
    if (!Number.isSafeInteger(row!.flywheel.revision) || row!.flywheel.revision < 0) fail("unavailable", 503);
    const h = row!.flywheel;
    if (!["open", "received", "expired"].includes(row!.status) || !["awaiting-source", "captured", "indexed", "retested"].includes(h.stage)
      || h.capture && (row!.sourceRef !== h.capture.sourceId || !h.sourceUrlFingerprint || row!.status === "open")
      || !h.capture && (row!.status === "received" || h.stage !== "awaiting-source")
      || ["indexed", "retested"].includes(h.stage) && !h.index
      || h.lock && (!validId(h.lock.token) || !/^[a-zA-Z0-9_-]{1,80}$/.test(h.lock.requestId) || !Number.isFinite(Date.parse(h.lock.expiresAt)))) fail("input_drift");
    return structuredClone(row!);
  }
  async function save(t: string, row: FlywheelGap): Promise<FlywheelGap> {
    const expected = row.flywheel.revision;
    const next = structuredClone(row); next.flywheel.revision++;
    if (!await deps.store.replaceGap(t, expected, next)) fail("conflict");
    return next;
  }
  async function open(t: string, id: string): Promise<FlywheelGap> {
    const original = await loss(t, id);
    await deps.store.createGap(t, {
      _id: gapId(t, id), tenantId: t, kind: "source-pending", status: "open",
      description: "Evaluation loss awaiting additional source evidence", requestedAt: iso(),
      flywheel: { version: 1, originalEvalRunId: id, inputFingerprint: original.fp, loss: original.loss,
        revision: 0, stage: "awaiting-source" },
    });
    return load(t, id);
  }
  async function receipt(t: string, r: CaptureReceipt): Promise<CaptureReceipt> {
    return captureReceipt(t, r.sourceId, r.sessionId, await deps.store.sourceRows(t, r.sourceId, r.sessionId));
  }
  async function verifyIndex(t: string, r: IndexedReceipt): Promise<void> {
    if (!same(await receipt(t, r), (({ generation: _g, treeDigest: _t, chunksDigest: _c, completedAt: _a, ...capture }) => capture)(r))) fail("input_drift");
    const digests = indexedDigests(t, r, await deps.store.indexedRows(t, r.sessionId));
    if (digests.treeDigest !== r.treeDigest || digests.chunksDigest !== r.chunksDigest) fail("input_drift");
  }
  async function retest(t: string, id: string, request: { sourceUrl: string; requestId: string }): Promise<RetestRun> {
    if (!request || typeof request.sourceUrl !== "string" || request.sourceUrl.length > 4096
      || typeof request.requestId !== "string" || !/^[a-zA-Z0-9_-]{1,80}$/.test(request.requestId)) fail("invalid", 400);
    try { const u = new URL(request.sourceUrl); if (!["https:", "http:"].includes(u.protocol) || u.username || u.password) fail("invalid", 400); }
    catch { fail("invalid", 400); }
    let head = await load(t, id);
    if (head.status === "expired") fail("conflict");
    if (head.flywheel.sourceUrlFingerprint && head.flywheel.sourceUrlFingerprint !== fingerprint(request.sourceUrl)) fail("input_drift");
    const childId = retestId(t, head._id, request.requestId);
    const existing = await deps.store.evaluation(t, childId);
    const ownedChild = (row: EvalRuns | null): row is RetestRun => !!row && row.tenantId === t && row._id === childId
      && (row.flywheel as RetestRun["flywheel"])?.originalEvalRunId === id
      && (row.flywheel as RetestRun["flywheel"])?.gapId === head._id
      && (row.flywheel as RetestRun["flywheel"])?.requestId === request.requestId
      && (row.flywheel as RetestRun["flywheel"])?.inputFingerprint === head.flywheel.inputFingerprint
      && row.question === head.flywheel.loss.question && row.credibility === "internal"
      && (row.score === undefined || Number.isFinite(row.score.ai) && Number.isFinite(row.score.counsellor));
    if (existing && !ownedChild(existing)) fail("input_drift");
    if (ownedChild(existing) && (!head.flywheel.capture || existing.flywheel.index.sourceId !== head.flywheel.capture.sourceId
      || existing.flywheel.index.sessionId !== head.flywheel.capture.sessionId || existing.flywheel.index.transcriptDigest !== head.flywheel.capture.transcriptDigest)) fail("input_drift");
    if (ownedChild(existing) && head.flywheel.lastRetestId === childId) {
      await verifyIndex(t, existing.flywheel.index);
      return structuredClone(existing);
    }
    const lock = head.flywheel.lock;
    if (lock && Date.parse(lock.expiresAt) > now().getTime()) fail("conflict");
    const mine = token();
    head.flywheel.lock = { token: mine, requestId: request.requestId, expiresAt: new Date(now().getTime() + 600_000).toISOString() };
    head = await save(t, head);
    let stage: "capture" | "index" | "retest" | "persist" = "capture";
    async function checkLock(): Promise<void> {
      const current = await load(t, id);
      if (current.flywheel.lock?.token !== mine || current.flywheel.revision !== head.flywheel.revision
        || Date.parse(current.flywheel.lock.expiresAt) <= now().getTime()) fail("conflict");
    }
    try {
      if (!head.flywheel.capture) {
        await checkLock();
        const intake = await bounded(() => deps.intake({ tenantId: t, url: request.sourceUrl }));
        if (!intake || !["created", "already-ingested"].includes(intake.status) || !validId(intake.sourceId) || !validId(intake.sessionId)) fail("unavailable", 503);
        const rows = await deps.store.sourceRows(t, intake.sourceId, intake.sessionId);
        const captured = captureReceipt(t, intake.sourceId, intake.sessionId, rows);
        await checkLock();
        head.status = "received"; head.sourceRef = captured.sourceId;
        head.flywheel.capture = captured; head.flywheel.sourceUrlFingerprint = fingerprint(request.sourceUrl); head.flywheel.stage = "captured";
        head = await save(t, head);
      } else if (!same(await receipt(t, head.flywheel.capture), head.flywheel.capture)) fail("input_drift");
      stage = "index";
      if (ownedChild(existing)) {
        await verifyIndex(t, existing.flywheel.index);
        head.flywheel.index = existing.flywheel.index;
      } else {
        let current = false;
        if (head.flywheel.index) {
          try { await verifyIndex(t, head.flywheel.index); current = true; } catch { /* retry rebuilds a stale output */ }
        }
        if (!current) {
          await checkLock();
          const captured = head.flywheel.capture!;
          const indexed = await bounded(() => deps.index(t, captured.sessionId));
          assertIndexResult(indexed, captured);
          if (!same(await receipt(t, captured), captured)) fail("input_drift");
          const rows = await deps.store.indexedRows(t, captured.sessionId);
          if (rows.chunks.length !== indexed.chunks.written) fail("unavailable", 503);
          const digests = indexedDigests(t, captured, rows);
          await checkLock();
          head.flywheel.index = { ...captured, generation: indexed.completion!.generation, ...digests, completedAt: iso() };
          head.flywheel.stage = "indexed";
          head = await save(t, head);
        }
      }
      stage = "retest";
      await checkLock(); await verifyIndex(t, head.flywheel.index!);
      let child: RetestRun;
      if (ownedChild(existing)) child = existing;
      else {
        const answer = await bounded(() => deps.ask(t, head.flywheel.loss.question, head.flywheel.index!));
        if (!answer || typeof answer.text !== "string" || !answer.sources || typeof answer.sources !== "object") fail("unavailable", 503);
        await verifyIndex(t, head.flywheel.index!); await checkLock();
        child = { _id: childId, tenantId: t, question: head.flywheel.loss.question,
          counsellor: head.flywheel.loss.counsellor, counsellorAnswer: head.flywheel.loss.counsellorAnswer,
          aiAnswer: answer, credibility: "internal", createdAt: iso(),
          flywheel: { version: 1, originalEvalRunId: id, gapId: head._id, requestId: request.requestId,
            inputFingerprint: head.flywheel.inputFingerprint, index: head.flywheel.index!, comparison: "needs-review" } };
        stage = "persist";
        await deps.store.createRetest(t, child);
        const written = await deps.store.evaluation(t, childId);
        if (!same(written, child)) fail("input_drift");
      }
      await checkLock();
      head.flywheel.lastRetestId = childId; head.flywheel.stage = "retested";
      delete head.flywheel.lock; delete head.flywheel.failure;
      await save(t, head);
      return structuredClone(child);
    } catch (error) {
      // Only the current lease can record failure/release; stale callbacks cannot regress a newer attempt.
      try {
        const current = await load(t, id);
        if (current.flywheel.lock?.token === mine) {
          current.flywheel.failure = { stage, requestId: request.requestId, at: iso() };
          current.flywheel.failureHistory = [...(current.flywheel.failureHistory ?? []), current.flywheel.failure];
          // A deadline cannot cancel these existing provider seams: retain the lease until expiry.
          if (!(error instanceof StageTimeout)) delete current.flywheel.lock;
          await save(t, current);
        }
      } catch { /* durable lock/state remains inspectable if recovery storage also fails */ }
      if (error instanceof FlywheelError) throw error;
      throw new FlywheelError("unavailable", 503);
    }
  }
  return { open, inspect: load, retest };
}
export type EvaluationFlywheel = ReturnType<typeof createEvaluationFlywheel>;
```

### apps/api/src/evaluation-flywheel/ask.ts

```typescript
import { askV2, type AskV2Deps } from "@lkb/ask";
import type { AskRouteDeps } from "../routes/ask/ask.js";
import { fingerprint, FlywheelError, type FlywheelDeps } from "./types.js";

/** Mandatory request-bound hydration: uses the same source/policy/router deps as actual /ask. */
export function buildFlywheelAsk(deps: AskRouteDeps): FlywheelDeps["ask"] {
  return async (tenantId, question, receipt) => {
    const tree = await deps.tree.load(tenantId);
    if (!tree || tree.node_id !== `tenant:${tenantId}` || fingerprint(tree) !== receipt.treeDigest || !deps.requestDepsFor)
      throw new FlywheelError("unavailable", 503);
    const scoped: Omit<AskV2Deps, "tenantId"> = await deps.requestDepsFor(tenantId);
    if (!scoped || [scoped.complete, scoped.scoreFn, scoped.treeSearchFn, scoped.write, scoped.sourceContext?.hydrate]
      .some((value) => typeof value !== "function")) throw new FlywheelError("unavailable", 503);
    const result = await askV2(question, tree, { ...scoped, tenantId });
    if (fingerprint(await deps.tree.load(tenantId)) !== receipt.treeDigest) throw new FlywheelError("input_drift", 409);
    return { text: result.answer, ...result };
  };
}
```

### apps/api/src/evaluation-flywheel/router.ts

```typescript
import { Router, type Request, type Response, type NextFunction } from "express";
import { requireScope } from "../auth.js";
import { FlywheelError } from "./types.js";
import type { EvaluationFlywheel } from "./workflow.js";

export function createEvaluationFlywheelRouter(workflow?: EvaluationFlywheel): Router {
  const r = Router();
  const auth = [requireScope("compete"), requireScope("gaps")];
  const handler = (action: (t: string, id: string, req: Request) => Promise<unknown>) => async (req: Request, res: Response, _next: NextFunction) => {
    if (!workflow) { res.status(503).json({ error: "flywheel_unavailable" }); return; }
    try { res.json(await action(req.auth!.tenantId, req.params.id as string, req)); }
    catch (e) { res.status(e instanceof FlywheelError ? e.status : 503).json({ error: e instanceof FlywheelError ? e.code : "flywheel_unavailable" }); }
  };
  const publicHead = (row: Awaited<ReturnType<EvaluationFlywheel["inspect"]>>) => {
    const copy = structuredClone(row);
    if (copy.flywheel.lock) {
      const { requestId, expiresAt } = copy.flywheel.lock;
      return { ...copy, flywheel: { ...copy.flywheel, lock: { requestId, expiresAt } } };
    }
    return copy;
  };
  r.get("/evaluations/:id/flywheel", ...auth, handler(async (t, id) => publicHead(await workflow!.inspect(t, id))));
  r.post("/evaluations/:id/gap", ...auth, requireScope("ingest"), requireScope("ask"), handler((t, id, req) => {
    if (req.body !== undefined && (req.body === null || typeof req.body !== "object" || Array.isArray(req.body) || Object.keys(req.body).length))
      throw new FlywheelError("invalid", 400);
    return workflow!.open(t, id).then(publicHead);
  }));
  r.post("/evaluations/:id/retest", ...auth, requireScope("ingest"), requireScope("ask"), handler((t, id, req) => {
    if (!req.body || typeof req.body !== "object" || Array.isArray(req.body)
      || Object.keys(req.body).some((key) => !["sourceUrl", "requestId"].includes(key))) throw new FlywheelError("invalid", 400);
    return workflow!.retest(t, id, req.body);
  }));
  return r;
}
```

