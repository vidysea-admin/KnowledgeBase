/** Validate the vocabulary used by this collection directly from its canonical schema. */
import candidateSchema from "../../../../../schema/whatsapp_candidates.schema.json" with { type: "json" };
import type { WhatsAppReviewCandidate } from "./detection.js";

type Rule = {
  type?: string; required?: string[]; properties?: Record<string, Rule>; additionalProperties?: boolean;
  enum?: unknown[]; const?: unknown; pattern?: string; minLength?: number; format?: string;
  minItems?: number; items?: Rule; contains?: Rule; allOf?: Rule[]; not?: Rule; if?: Rule; then?: Rule; else?: Rule;
};
const object = (value: unknown): value is Record<string, unknown> => value !== null && typeof value === "object" && !Array.isArray(value);
const vocabulary = new Set(["$schema", "$id", "title", "description", "type", "required", "properties", "additionalProperties", "enum", "const", "pattern", "minLength", "format", "minItems", "items", "contains", "allOf", "not", "if", "then", "else"]);
function checkVocabulary(rule: Rule): void {
  if (Object.keys(rule).some(key => !vocabulary.has(key))) throw new Error("WhatsApp review: canonical schema uses unsupported validation vocabulary");
  if (rule.type && !["object", "array", "string"].includes(rule.type)) throw new Error("WhatsApp review: canonical schema uses unsupported type");
  if (rule.format && rule.format !== "date-time") throw new Error("WhatsApp review: canonical schema uses unsupported format");
  for (const child of [...Object.values(rule.properties ?? {}), ...(rule.allOf ?? []), rule.items, rule.contains, rule.not, rule.if, rule.then, rule.else]) {
    if (child) checkVocabulary(child);
  }
}
const canonicalRule = candidateSchema as unknown as Rule;
checkVocabulary(canonicalRule);
function validDateTime(value: string): boolean {
  const match = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2}):(\d{2})(?:\.\d+)?(?:Z|[+-](\d{2}):(\d{2}))$/u.exec(value);
  if (!match) return false;
  const [year, month, day, hour, minute, second, offsetHour, offsetMinute] = match.slice(1).map(Number);
  const leap = year! % 4 === 0 && (year! % 100 !== 0 || year! % 400 === 0);
  const days = [31, leap ? 29 : 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];
  if (month! < 1 || month! > 12 || day! < 1 || day! > days[month! - 1]!
      || hour! > 23 || minute! > 59 || second! > 59 || (offsetHour ?? 0) > 23 || (offsetMinute ?? 0) > 59) return false;
  return Number.isFinite(Date.parse(value));
}
function matches(rule: Rule, value: unknown): boolean {
  if (rule.type === "object" && !object(value)) return false;
  if (rule.type === "array" && !Array.isArray(value)) return false;
  if (rule.type === "string" && typeof value !== "string") return false;
  if (rule.enum && !rule.enum.includes(value)) return false;
  if (Object.hasOwn(rule, "const") && value !== rule.const) return false;
  if (typeof value === "string") {
    if (rule.minLength !== undefined && [...value].length < rule.minLength) return false;
    if (rule.pattern && !new RegExp(rule.pattern, "u").test(value)) return false;
    if (rule.format === "date-time" && !validDateTime(value)) return false;
  }
  if (object(value)) {
    if (rule.required?.some(key => !Object.hasOwn(value, key))) return false;
    if (rule.additionalProperties === false && Object.keys(value).some(key => !Object.hasOwn(rule.properties ?? {}, key))) return false;
    if (Object.entries(rule.properties ?? {}).some(([key, child]) => Object.hasOwn(value, key) && !matches(child, value[key]))) return false;
  }
  if (Array.isArray(value)) {
    if (rule.minItems !== undefined && value.length < rule.minItems) return false;
    if (rule.items && value.some(item => !matches(rule.items!, item))) return false;
    if (rule.contains && !value.some(item => matches(rule.contains!, item))) return false;
  }
  if (rule.allOf?.some(child => !matches(child, value))) return false;
  if (rule.not && matches(rule.not, value)) return false;
  if (rule.if) {
    const branch = matches(rule.if, value) ? rule.then : rule.else;
    if (branch && !matches(branch, value)) return false;
  }
  return true;
}

export function assertWhatsAppReviewCandidateSchema(value: unknown): asserts value is WhatsAppReviewCandidate {
  if (!matches(canonicalRule, value)) throw new Error("WhatsApp review: candidate does not match canonical schema");
}
