import { apiFetch, ApiError } from "../../../api/client.js";
import { safeHttpUrl } from "../../../safe-url.js";
export interface CatalogTopic { id: string; name: string }
interface CatalogSession { id: string; title: string }
interface CatalogEvidence { sessionId: string; turnId: string; title: string; quote: string; speaker: string; tStart: number; origin: string; coordinate: "seconds" | "character-offset" }
export interface CatalogTopicDetail extends CatalogTopic { classification: "unclassified"; sessions: CatalogSession[]; documents: Array<{ id: string; title: string; sourceId: string; version: string; pageCount: number; collectionId: string; association: "co-curated-unverified" }>; claims: Array<{ id: string; text: string; status: string; confidence?: number; evidence: CatalogEvidence[] }>; withheldClaims: number; truncated: boolean }
export interface CatalogResources { resources: Array<{ id: string; kind: string; createdAt: string; url: string | null }>; programs: Array<{ id: string; name: string; classification: "unclassified"; organization: "unverified"; sessions: CatalogSession[] }>; truncated: boolean }
const obj = (v: unknown): v is Record<string, unknown> => Boolean(v) && typeof v === "object" && !Array.isArray(v);
const text = (v: unknown) => typeof v === "string" && v.length > 0;
const topic = (v: unknown): v is CatalogTopic => obj(v) && text(v.id) && typeof v.name === "string";
const session = (v: unknown): v is CatalogSession => obj(v) && text(v.id) && typeof v.title === "string";
const bad = () => new ApiError(503, "Invalid knowledge catalog response.");
const publicLink = (v: unknown) => { const safe = safeHttpUrl(v); if (!safe) return false; const u = new URL(safe); return !u.username && !u.password && !/[\x00-\x20\x7f-\x9f]/.test(safe); };
export async function listCatalogTopics(key: string): Promise<{ topics: CatalogTopic[]; truncated: boolean }> {
  const r = await apiFetch<{ topics: unknown[]; truncated: boolean }>("/knowledge/topics", key);
  if (!r || !Array.isArray(r.topics) || !r.topics.every(topic) || r.topics.length > 100 || typeof r.truncated !== "boolean") throw bad(); return r as { topics: CatalogTopic[]; truncated: boolean };
}
export async function getCatalogTopic(key: string, id: string): Promise<CatalogTopicDetail> {
  const r = await apiFetch<unknown>(`/knowledge/topics/${encodeURIComponent(id)}`, key);
  if (!obj(r) || !Array.isArray(r.documents) || !r.documents.every(d => obj(d) && text(d.id) && d.sourceId === d.id && typeof d.version === "string" && /^[a-f0-9]{64}$/.test(d.version) && typeof d.title === "string" && Number.isInteger(d.pageCount) && Number(d.pageCount) > 0 && text(d.collectionId) && d.association === "co-curated-unverified")) throw bad();
  if (!topic(r) || r.id !== id || !obj(r) || r.classification !== "unclassified" || !Array.isArray(r.sessions) || !r.sessions.every(session) || !Number.isInteger(r.withheldClaims) || Number(r.withheldClaims) < 0 || typeof r.truncated !== "boolean" || !Array.isArray(r.claims) || !r.claims.every(c => obj(c) && text(c.id) && typeof c.text === "string" && ["verified", "needs-review", "conflicting"].includes(c.status as string) && (c.confidence === undefined || typeof c.confidence === "number" && c.confidence >= 0 && c.confidence <= 1) && Array.isArray(c.evidence) && c.evidence.length > 0 && c.evidence.every(e => obj(e) && text(e.sessionId) && text(e.turnId) && typeof e.title === "string" && text(e.quote) && typeof e.speaker === "string" && typeof e.tStart === "number" && Number.isFinite(e.tStart) && typeof e.origin === "string" && ["seconds", "character-offset"].includes(e.coordinate as string)))) throw bad();
  return r as unknown as CatalogTopicDetail;
}
export async function getCatalogResources(key: string): Promise<CatalogResources> {
  const r = await apiFetch<unknown>("/knowledge/resources", key);
  if (!obj(r) || typeof r.truncated !== "boolean" || !Array.isArray(r.resources) || !r.resources.every(s => obj(s) && text(s.id) && typeof s.kind === "string" && typeof s.createdAt === "string" && (s.url === null || publicLink(s.url))) || !Array.isArray(r.programs) || !r.programs.every(p => topic(p) && obj(p) && p.classification === "unclassified" && p.organization === "unverified" && Array.isArray(p.sessions) && p.sessions.every(session))) throw bad();
  return r as unknown as CatalogResources;
}
