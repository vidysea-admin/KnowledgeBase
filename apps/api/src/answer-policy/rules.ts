/** Validation of policy input. Anything that would weaken grounded-citation requirements is refused by name. */
import { ON_INSUFFICIENT, POLICY_MODES, POLICY_STYLES, type PolicyBody } from "./types.js";

export class PolicyInputError extends Error {
  constructor(readonly code: "invalid_policy" | "policy_cannot_override_evidence", message: string) { super(message); }
}
const ALLOWED = new Set(["questionClass", "mode", "style", "onInsufficient", "citations", "note", "expectedVersion", "claimedBy"]);
const EVIDENCE_KEY = /cit|evidence|ground|source|provenance|uncited/i;
const POLICY_ID = /^[a-z0-9][a-z0-9_-]{0,63}$/i;
const CLASS = /^[a-z0-9][a-z0-9 _:./-]{0,79}$/;

export function validPolicyId(id: unknown): id is string { return typeof id === "string" && POLICY_ID.test(id); }
export function normalizeQuestionClass(v: unknown): string | null {
  if (typeof v !== "string") return null;
  const n = v.trim().toLowerCase().replace(/\s+/g, " ");
  return CLASS.test(n) ? n : null;
}
function oneOf<T extends string>(list: readonly T[], v: unknown): v is T { return typeof v === "string" && (list as readonly string[]).includes(v); }

export interface ParsedSave { body: PolicyBody; note: string; expectedVersion: number | null; claimedBy?: string }
export function parseNote(v: unknown): string {
  const note = typeof v === "string" ? v.trim() : "";
  if (!note || note.length > 500) throw new PolicyInputError("invalid_policy", "A note of 1-500 characters is required.");
  return note;
}
export function parseSave(input: unknown): ParsedSave {
  if (!input || typeof input !== "object" || Array.isArray(input)) throw new PolicyInputError("invalid_policy", "Body must be an object.");
  const o = input as Record<string, unknown>;
  for (const key of Object.keys(o)) {
    if (ALLOWED.has(key)) continue;
    if (EVIDENCE_KEY.test(key)) throw new PolicyInputError("policy_cannot_override_evidence", `Field "${key}" is refused: a policy cannot change citation or grounded-evidence rules.`);
    throw new PolicyInputError("invalid_policy", `Unknown field "${key}".`);
  }
  if (o.citations !== undefined && o.citations !== "required")
    throw new PolicyInputError("policy_cannot_override_evidence", 'citations must be "required"; policies cannot relax citations.');
  const questionClass = normalizeQuestionClass(o.questionClass);
  if (!questionClass) throw new PolicyInputError("invalid_policy", "questionClass must be 1-80 chars of a-z 0-9 space _ : . / -.");
  if (!oneOf(POLICY_MODES, o.mode)) throw new PolicyInputError("invalid_policy", "mode must be internal-only or internal-and-web.");
  if (!oneOf(POLICY_STYLES, o.style)) throw new PolicyInputError("invalid_policy", "style must be concise or detailed.");
  if (!oneOf(ON_INSUFFICIENT, o.onInsufficient)) throw new PolicyInputError("invalid_policy", "onInsufficient must be review or refuse.");
  const note = parseNote(o.note);
  let expectedVersion: number | null = null;
  if (o.expectedVersion !== undefined) {
    if (!Number.isSafeInteger(o.expectedVersion) || (o.expectedVersion as number) < 1) throw new PolicyInputError("invalid_policy", "expectedVersion must be a positive integer.");
    expectedVersion = o.expectedVersion as number;
  }
  let claimedBy: string | undefined;
  if (o.claimedBy !== undefined) {
    if (typeof o.claimedBy !== "string" || !o.claimedBy.trim() || o.claimedBy.length > 80) throw new PolicyInputError("invalid_policy", "claimedBy must be 1-80 characters.");
    claimedBy = o.claimedBy.trim();
  }
  return { body: { questionClass, mode: o.mode, style: o.style, onInsufficient: o.onInsufficient, citations: "required" }, note, expectedVersion, ...(claimedBy ? { claimedBy } : {}) };
}
