import { apiFetch } from "../../api/client.js";

export interface ChampionshipView {
  event: { _id: string; revision: number; bankDigest: string; frozenAt?: string;
    questions: { id: string; text: string }[]; counsellors: { id: string; name: string }[] };
  report: { status: string; plannedPairs: number; recordedPairs: number; notice: string; unresolvedGates: string[]; trials: unknown[]; credibility: "internal"; publicResult: false };
}
function checkedView(value: unknown): ChampionshipView {
  const v = value as ChampionshipView;
  if (!v?.event || typeof v.event._id !== "string" || !v.event._id || !Number.isSafeInteger(v.event.revision) || v.event.revision < 0 ||
    typeof v.event.bankDigest !== "string" || !/^[a-f0-9]{64}$/.test(v.event.bankDigest) ||
    v.event.frozenAt !== undefined && (typeof v.event.frozenAt !== "string" || !Number.isFinite(Date.parse(v.event.frozenAt))) ||
    !Array.isArray(v.event.questions) || !v.event.questions.length || !v.event.questions.every(q => q && typeof q.id === "string" && typeof q.text === "string") ||
    !Array.isArray(v.event.counsellors) || !v.event.counsellors.length || !v.event.counsellors.every(c => c && typeof c.id === "string" && typeof c.name === "string") ||
    !v.report || !["incomplete", "internal-evidence-complete"].includes(v.report.status) || typeof v.report.notice !== "string" ||
    !Number.isSafeInteger(v.report.plannedPairs) || !Number.isSafeInteger(v.report.recordedPairs) || v.report.recordedPairs < 0 ||
    v.report.plannedPairs !== v.event.questions.length * v.event.counsellors.length || v.report.recordedPairs > v.report.plannedPairs ||
    v.report.credibility !== "internal" || v.report.publicResult !== false ||
    !Array.isArray(v.report.unresolvedGates) || !v.report.unresolvedGates.every(g => typeof g === "string") || !Array.isArray(v.report.trials) || v.report.trials.length !== v.report.recordedPairs) throw new Error("Malformed championship response; reload before acting");
  return v;
}
export async function loadChampionship(key: string, id: string): Promise<ChampionshipView> {
  const v = checkedView(await apiFetch(`/championship/${encodeURIComponent(id)}`, key));
  if (v.event._id !== id) throw new Error("Returned championship does not match requested event"); return v;
}
export async function createChampionship(key: string, plan: unknown): Promise<ChampionshipView> {
  const event = await apiFetch<ChampionshipView["event"]>("/championship", key, { method: "POST", body: plan });
  if (!event || typeof event._id !== "string" || !event._id) throw new Error("Malformed created event identity");
  return loadChampionship(key, event._id);
}
export async function freezeChampionshipBank(key: string, event: ChampionshipView["event"]): Promise<ChampionshipView> {
  return checkedMutation(await apiFetch(`/championship/${encodeURIComponent(event._id)}/freeze`, key, { method: "POST", body: { expectedRevision: event.revision, bankDigest: event.bankDigest } }), event);
}
export async function importChampionshipTrial(key: string, event: ChampionshipView["event"], questionId: string, counsellorId: string, evalRunId: string): Promise<ChampionshipView> {
  return checkedMutation(await apiFetch(`/championship/${encodeURIComponent(event._id)}/trials`, key, { method: "POST", body: { expectedRevision: event.revision, questionId, counsellorId, evalRunId } }), event);
}
function checkedMutation(value: unknown, original: ChampionshipView["event"]): ChampionshipView {
  const v = checkedView(value);
  if (v.event._id !== original._id || v.event.revision !== original.revision + 1 || v.event.bankDigest !== original.bankDigest || !v.event.frozenAt) throw new Error("Mutation response does not match the requested frozen event/revision"); return v;
}
export async function startChampionshipTrial(key: string, question: string, name: string): Promise<{ evalRunId: string; aiAnswer: { text: string; sources?: unknown } }> {
  const value = await apiFetch<{ evalRunId: string; aiAnswer: { text: string; sources?: unknown } }>("/compete/start", key, { method: "POST", body: { question, counsellor: { name } } });
  if (!value || typeof value.evalRunId !== "string" || !value.evalRunId || typeof value.aiAnswer?.text !== "string") throw new Error("Malformed Compete response; trial was not accepted"); return value;
}
export const scoreChampionshipTrial = (key: string, id: string, text: string, ai: number, counsellor: number): Promise<unknown> =>
  apiFetch(`/compete/${encodeURIComponent(id)}/score`, key, { method: "POST", body: { counsellorAnswer: { text }, score: { ai, counsellor } } });
