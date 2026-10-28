import { randomUUID } from "node:crypto";
import { evidenceFor, currentEvidence, hasUnverifiedCitation } from "./evidence.js";
import { synthesize, validateItems } from "./synthesis.js";
import { OutputError, record, text, parseOutputInput, type OutputDeps, type OutputDraft } from "./types.js";
import { renderOutputMarkdown } from "./markdown.js";

const noUnsupported = (draft: OutputDraft): boolean => draft.sections.every((s) => s.items.length > 0 && s.items.every((i) => i.validation === "ai-supported"));
/** D-201 [C5]: under onInsufficient=refuse, any needs-review citation is insufficient (stays as strict as before D-200). */
const refusesDraft = (draft: OutputDraft): boolean => !noUnsupported(draft) || draft.sourceCoverage.status !== "ready" || hasUnverifiedCitation(draft.citations);
export function createOutputService(deps: OutputDeps) {
  const now = () => (deps.now?.() ?? new Date()).toISOString();
  async function get(tenantId: string, id: string): Promise<OutputDraft> {
    const draft = await deps.repository.get(tenantId, id);
    if (!draft || draft.tenantId !== tenantId) throw new OutputError("not_found", 404);
    await currentEvidence(deps, tenantId, draft);
    return draft;
  }
  async function replace(tenantId: string, draft: OutputDraft, expected: number): Promise<OutputDraft> {
    const next = { ...draft, revision: expected + 1, updatedAt: now() };
    if (!await deps.repository.replace(tenantId, next, expected)) throw new OutputError("conflict", 409);
    return next;
  }
  return {
    async list(tenantId: string) { return (await deps.repository.list(tenantId)).filter((d) => d.tenantId === tenantId).map((d) => ({ id: d._id, title: d.title, kind: d.kind, revision: d.revision, updatedAt: d.updatedAt })); },
    get,
    async create(tenantId: string, body: unknown): Promise<OutputDraft> {
      const input = parseOutputInput(body);
      const source = await evidenceFor(deps, tenantId, input);
      const generated = await synthesize(deps, tenantId, input, source.citations, source.policy, source.sourceDigest);
      const timestamp = now();
      const draft: OutputDraft = { _id: randomUUID(), tenantId, kind: input.kind, title: input.title, purpose: input.purpose,
        sessionIds: input.sessionIds, revision: 1, createdAt: timestamp, updatedAt: timestamp, reviewState: "draft",
        sourceDigest: source.sourceDigest, sourceCoverage: source.sourceCoverage, citations: source.citations, ...generated, ...(source.policy ? { policy: source.policy } : {}) };
      if (source.policy?.onInsufficient === "refuse" && refusesDraft(draft)) throw new OutputError("unavailable", 422);
      // Re-read after both model calls: a source/policy change during generation cannot land an apparently current draft.
      await currentEvidence(deps, tenantId, draft);
      await deps.repository.insert(tenantId, draft);
      return draft;
    },
    async edit(tenantId: string, id: string, body: unknown): Promise<OutputDraft> {
      if (!record(body) || Object.keys(body).some((k) => !["revision", "title", "edits"].includes(k))
        || !Number.isSafeInteger(body.revision) || (body.revision as number) < 1 || !text(body.title, 180)
        || !Array.isArray(body.edits) || body.edits.length > 32) throw new OutputError("invalid_request", 400);
      const draft = await get(tenantId, id);
      if (draft.revision !== body.revision) throw new OutputError("conflict", 409);
      const updates = new Map<string, string>();
      const itemIds = new Set(draft.sections.flatMap((s) => s.items.map((i) => i.id)));
      for (const edit of body.edits) {
        if (!record(edit) || Object.keys(edit).some((k) => !["id", "text"].includes(k)) || typeof edit.id !== "string"
          || !itemIds.has(edit.id) || updates.has(edit.id) || (edit.text !== "" && !text(edit.text, 2000))) throw new OutputError("invalid_request", 400);
        updates.set(edit.id, (edit.text as string).trim());
      }
      const sections = draft.sections.map((s) => {
        const items = s.items.filter((i) => updates.get(i.id) !== "").map((i) => updates.has(i.id)
          ? { ...i, text: updates.get(i.id)!, validation: "needs-review" as const, assessmentDigest: "" } : i);
        return { ...s, items, missing: items.length ? (items.some((i) => i.validation === "needs-review") ? "Edited or withheld items need grounding review." : "") : "No supported material remains in this section." };
      });
      return replace(tenantId, { ...draft, title: body.title.trim(), sections }, draft.revision);
    },
    async revalidate(tenantId: string, id: string, revision: number): Promise<OutputDraft> {
      const draft = await get(tenantId, id);
      if (draft.revision !== revision) throw new OutputError("conflict", 409);
      await currentEvidence(deps, tenantId, draft);
      const sections = await validateItems(deps, tenantId, draft.sections, draft.citations, draft.sourceDigest);
      await currentEvidence(deps, tenantId, draft);
      return replace(tenantId, { ...draft, sections }, draft.revision);
    },
    async export(tenantId: string, id: string, revision: number): Promise<{ markdown: string; filename: string }> {
      const draft = await get(tenantId, id);
      if (draft.revision !== revision) throw new OutputError("conflict", 409);
      await currentEvidence(deps, tenantId, draft);
      if (draft.sections.some((s) => s.items.some((i) => i.validation !== "ai-supported"))) throw new OutputError("needs_review", 409);
      if (!draft.sections.some((s) => s.items.some((i) => i.validation === "ai-supported"))) throw new OutputError("unavailable", 422);
      if (draft.policy?.onInsufficient === "refuse" && refusesDraft(draft)) throw new OutputError("unavailable", 422);
      return { markdown: renderOutputMarkdown(draft), filename: `${draft.kind}-${draft._id}.md` };
    },
  };
}
export type OutputService = ReturnType<typeof createOutputService>;
