import { apiFetch, ApiError } from "../../api/client.js";
export interface SavedMember { kind: "session" | "document" | "topic" | "speaker"; id: string; available?: boolean; personId?: string | null }
export interface SavedCollection { id: string; title: string; revision: number; updatedAt: string; members: SavedMember[]; unavailableMembers?: boolean }
export interface MemberChoice extends SavedMember { title: string }
const obj = (v: unknown): v is Record<string, unknown> => Boolean(v) && typeof v === "object" && !Array.isArray(v);
const member = (v: unknown): v is SavedMember => obj(v) && ["session", "document", "topic", "speaker"].includes(v.kind as string) && typeof v.id === "string" && v.id.length > 0 && (v.personId === undefined || v.personId === null || typeof v.personId === "string" && v.personId.length > 0);
const bad = () => new ApiError(503, "Invalid saved collections response.");
export async function getSavedCollections(key: string): Promise<{ collections: SavedCollection[]; truncated: boolean }> {
  const r = await apiFetch<{ collections: unknown[]; truncated: boolean }>("/knowledge/collections", key);
  if (!r || !Array.isArray(r.collections) || r.collections.length > 100 || typeof r.truncated !== "boolean" || !r.collections.every(c => obj(c) && typeof c.id === "string" && typeof c.title === "string" && Number.isSafeInteger(c.revision) && Number(c.revision) > 0 && typeof c.updatedAt === "string" && (c.unavailableMembers === undefined || typeof c.unavailableMembers === "boolean") && Array.isArray(c.members) && c.members.every(m => member(m) && typeof m.available === "boolean"))) throw bad();
  const checked = r as { collections: SavedCollection[]; truncated: boolean };
  return { ...checked, collections: checked.collections.map(c => ({ ...c, unavailableMembers: Boolean(c.unavailableMembers || c.members.some(m => m.available === false)), members: c.members.filter(m => m.available === true) })) };
}
export async function getCollectionMembers(key: string): Promise<{ members: MemberChoice[]; truncated: boolean }> {
  const r = await apiFetch<{ members: unknown[]; truncated: boolean }>("/knowledge/members", key);
  if (!r || !Array.isArray(r.members) || r.members.length > 400 || typeof r.truncated !== "boolean" || !r.members.every(m => member(m) && obj(m) && typeof m.title === "string")) throw bad();
  return r as { members: MemberChoice[]; truncated: boolean };
}
export async function writeSavedCollection(key: string, id: string, title: string, members: SavedMember[], expectedRevision: number): Promise<void> {
  const requested = members.map(({ kind, id }) => ({ kind, id }));
  const unique = requested.filter((m, index) => requested.findIndex(p => p.kind === m.kind && p.id === m.id) === index);
  const r = await apiFetch<unknown>(`/knowledge/collections/${encodeURIComponent(id)}`, key, { method: "PUT", body: { title, members: requested, expectedRevision } });
  if (!obj(r) || typeof r.id !== "string" || !/^[a-f0-9]{64}$/.test(r.id) || (expectedRevision > 0 && r.id !== id) || r.revision !== expectedRevision + 1 || r.title !== title || !Array.isArray(r.members) || !r.members.every(member) || JSON.stringify(r.members.map(({ kind, id }) => ({ kind, id }))) !== JSON.stringify(unique)) throw bad();
}
export async function deleteSavedCollection(key: string, collection: SavedCollection): Promise<void> {
  const r = await apiFetch<unknown>(`/knowledge/collections/${encodeURIComponent(collection.id)}`, key, { method: "DELETE", body: { expectedRevision: collection.revision } });
  if (!obj(r) || r.deleted !== true) throw bad();
}
/** Source-owned entity IDs are encoded whole; no suffix stripping creates an authoritative identity. */
export function savedMemberHref(member: SavedMember): string | null {
  if (member.available === false) return null;
  if (member.kind === "session") return `/sessions/${encodeURIComponent(member.id)}`;
  if (member.kind === "document") return `/knowledge/documents/${encodeURIComponent(member.id)}`;
  if (member.kind === "topic") return `/knowledge/topics/${encodeURIComponent(member.id)}`;
  if (member.kind === "speaker" && member.personId) return `/knowledge/speakers/${encodeURIComponent(member.personId)}`;
  // The graph ID and database entity ID are distinct namespaces. Do not guess a profile link.
  return null;
}
