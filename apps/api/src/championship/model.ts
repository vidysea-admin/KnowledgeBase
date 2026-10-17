import { createHash, randomUUID } from "node:crypto";
import type { ChampionshipEvents } from "@lkb/core";

// The collection schema is central source-of-truth; API DTOs derive its generated fields.
export type ChampionshipEvent = ChampionshipEvents;
export type ChampionshipQuestion = ChampionshipEvents["questions"][number];
export type ChampionshipPerson = ChampionshipEvents["counsellors"][number];
export type ChampionshipTrial = ChampionshipEvents["trials"][number];
export type ChampionshipPlan = Pick<ChampionshipEvents, "title" | "questions" | "counsellors" | "judges" | "rubric" | "reviewReference">;
export class ChampionshipError extends Error {
  constructor(public code: string, message: string) { super(message); }
}
export function championshipText(value: unknown, max = 2000): value is string {
  return typeof value === "string" && value.trim().length > 0 && value.length <= max && !/[\u0000-\u0008\u000b\u000c\u000e-\u001f]/.test(value) && !/[\ud800-\udfff]/u.test(value);
}
function unique(items: { id: string }[]) { return new Set(items.map(x => x.id)).size === items.length; }
export function validateChampionshipPlan(input: unknown): ChampionshipPlan {
  const p = input as ChampionshipPlan;
  const people = (items: ChampionshipPerson[]) => Array.isArray(items) && items.length <= 100 &&
    items.every(x => x && championshipText(x.id, 100) && championshipText(x.name, 200) && championshipText(x.evidenceReference)) && unique(items);
  if (!p || !championshipText(p.title, 200) || !Array.isArray(p.questions) || p.questions.length < 1 || p.questions.length > 1000 ||
    !p.questions.every(q => q && championshipText(q.id, 100) && championshipText(q.text, 10000) && q.source &&
      ["toc", "pathlynks", "counsellor"].includes(q.source.kind) && championshipText(q.source.reference)) || !unique(p.questions) ||
    !people(p.counsellors) || p.counsellors.length < 1 || !people(p.judges) ||
    !p.rubric || !championshipText(p.rubric.version, 100) || !championshipText(p.rubric.reference) || !championshipText(p.reviewReference)) {
    throw new ChampionshipError("bad_plan", "Supply unique source-cited questions, counsellors, judge roster, rubric and review references");
  }
  if (p.judges.some(j => p.counsellors.some(c => c.id === j.id))) throw new ChampionshipError("bad_plan", "Counsellor and judge IDs must be separate");
  if (new Set(p.counsellors.map(c => c.name)).size !== p.counsellors.length || new Set(p.questions.map(q => q.text)).size !== p.questions.length) {
    throw new ChampionshipError("bad_plan", "Exact counsellor names and question texts must also be unique");
  }
  // Construct an allowlisted snapshot; submitted tenant, credibility and approval fields never enter storage.
  const questions = p.questions.map(q => ({ id: q.id, text: q.text, source: { kind: q.source.kind, reference: q.source.reference } }));
  const counsellors = p.counsellors.map(x => ({ id: x.id, name: x.name, evidenceReference: x.evidenceReference }));
  // Nonempty cardinality was checked above; construct the generated nonempty tuples explicitly.
  return { title: p.title, questions: [questions[0]!, ...questions.slice(1)], counsellors: [counsellors[0]!, ...counsellors.slice(1)],
    judges: p.judges.map(x => ({ id: x.id, name: x.name, evidenceReference: x.evidenceReference })),
    rubric: { version: p.rubric.version, reference: p.rubric.reference }, reviewReference: p.reviewReference };
}
export function championshipBankDigest(questions: ChampionshipQuestion[]): string {
  return createHash("sha256").update(JSON.stringify(questions.map(q => ({ id: q.id, text: q.text, source: { kind: q.source.kind, reference: q.source.reference } })))).digest("hex");
}
export function createChampionshipEvent(tenantId: string, input: unknown, now: string): ChampionshipEvent {
  const plan = validateChampionshipPlan(input);
  if (!championshipText(tenantId, 200) || !Number.isFinite(Date.parse(now))) throw new ChampionshipError("bad_metadata", "Authenticated tenant and server creation time are required");
  return { ...plan, _id: randomUUID(), tenantId, revision: 0, createdAt: now, bankDigest: championshipBankDigest(plan.questions),
    trials: [], evidenceStatus: "operator-supplied-unverified" };
}
export function assertChampionshipBank(event: ChampionshipEvent): void {
  validateChampionshipPlan(event);
  if (!championshipText(event._id, 100) || !championshipText(event.tenantId, 200) || !Number.isSafeInteger(event.revision) || event.revision < 0 ||
    !Number.isFinite(Date.parse(event.createdAt)) || !Array.isArray(event.trials) || event.evidenceStatus !== "operator-supplied-unverified" ||
    event.frozenAt !== undefined && (!Number.isFinite(Date.parse(event.frozenAt)) || Date.parse(event.frozenAt) < Date.parse(event.createdAt)) ||
    (event.frozenAt ? event.revision !== 1 + event.trials.length : event.revision !== 0 || event.trials.length !== 0)) {
    throw new ChampionshipError("corrupt_event", "Invalid retained event metadata");
  }
  if (championshipBankDigest(event.questions) !== event.bankDigest) throw new ChampionshipError("bank_drift", "Frozen question-bank content does not match its digest");
}
