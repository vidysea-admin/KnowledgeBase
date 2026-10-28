/**
 * Career-guidance topic classifier (Umesh decision 2026-10-14: the knowledge base is for career counselling; it wins overlaps).
 * Pure and explainable: the verdict lists every keyword that matched and in which field. The keyword list lives in
 * `config/career-topics.json` (LKB_CAREER_TOPICS_FILE overrides the path), never in code.
 */
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";

export type TopicField = "title" | "description" | "sender";
export interface TopicConfig { keywords: string[]; weights: Record<TopicField, number>; minScore: number }
export interface TopicInput { title?: string; description?: string; sender?: string }
export interface TopicMatch { keyword: string; field: TopicField }
export interface TopicVerdict { careerGuidance: boolean; score: number; matched: TopicMatch[]; keywords: string[] }

const FIELDS: TopicField[] = ["title", "description", "sender"];
const escape = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

/** Throws on a malformed config (the caller decides what "classifier unavailable" means). */
export function parseTopicConfig(raw: unknown): TopicConfig {
  const o = (typeof raw === "object" && raw !== null ? raw : {}) as Record<string, unknown>;
  const kws = Array.isArray(o.keywords) ? o.keywords.filter((k): k is string => typeof k === "string" && k.trim().length > 0 && k.length <= 80) : [];
  if (kws.length === 0 || kws.length > 500) throw new Error("career topic config needs 1-500 keywords");
  const w = (typeof o.weights === "object" && o.weights !== null ? o.weights : {}) as Record<string, unknown>;
  const weight = (f: TopicField, d: number) => (typeof w[f] === "number" && Number.isFinite(w[f]) && (w[f] as number) >= 0 ? w[f] as number : d);
  const minScore = typeof o.minScore === "number" && o.minScore > 0 ? o.minScore : 3;
  return { keywords: [...new Set(kws.map((k) => k.trim().toLowerCase()))], weights: { title: weight("title", 3), description: weight("description", 1), sender: weight("sender", 2) }, minScore };
}

export function loadTopicConfig(repoRoot: string, env: NodeJS.ProcessEnv = process.env): TopicConfig {
  const file = env.LKB_CAREER_TOPICS_FILE?.trim() || path.join(repoRoot, "config", "career-topics.json");
  if (!existsSync(file)) throw new Error(`career topic config not found: ${path.basename(file)}`);
  return parseTopicConfig(JSON.parse(readFileSync(file, "utf8")));
}

function patternFor(keyword: string): RegExp {
  const body = keyword.split(/[\s-]+/).map(escape).join("[\\s-]+");
  return new RegExp(`(?<![a-z0-9])${body}s?(?![a-z0-9])`, "i");
}

export function classifyTopic(input: TopicInput, cfg: TopicConfig): TopicVerdict {
  const matched: TopicMatch[] = [];
  let score = 0;
  for (const keyword of cfg.keywords) {
    const re = patternFor(keyword);
    for (const field of FIELDS) {
      const text = (input[field] ?? "").slice(0, 20000);
      if (text && re.test(text)) { matched.push({ keyword, field }); score += cfg.weights[field]; }
    }
  }
  return { careerGuidance: score >= cfg.minScore, score, matched, keywords: [...new Set(matched.map((m) => m.keyword))] };
}
