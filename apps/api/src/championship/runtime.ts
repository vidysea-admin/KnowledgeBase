import type { EvalRuns } from "@lkb/core";
import { assertChampionshipBank, ChampionshipError, championshipText, type ChampionshipEvent } from "./model.js";

export const CHAMPIONSHIP_GATES = ["Umesh-approved real Q3 counsellor roster and independent judges", "Named human bank review/anonymisation and proof of freeze before any AI exposure",
  "Panel-owned rubric, blind judging and agreed conditions", "Complete T-013 real counsellor-client acceptance", "Agreed internal winning-streak threshold and actual qualifying evidence",
  "Real public event, independent-human scoring and verifiable publication"];

export function freezeChampionship(event: ChampionshipEvent, expectedDigest: unknown, now: string): ChampionshipEvent {
  assertChampionshipBank(event);
  if (event.frozenAt) throw new ChampionshipError("already_frozen", "The bank is already frozen");
  if (expectedDigest !== event.bankDigest) throw new ChampionshipError("bank_drift", "Confirm the exact current bank digest");
  if (!Number.isFinite(Date.parse(now)) || Date.parse(now) < Date.parse(event.createdAt)) throw new ChampionshipError("freeze_time", "Freeze time must follow event creation");
  return { ...event, frozenAt: now, revision: event.revision + 1 };
}
function validScore(value: unknown): value is number { return typeof value === "number" && Number.isFinite(value) && value >= 1 && value <= 5; }
export function addChampionshipTrial(event: ChampionshipEvent, questionId: unknown, counsellorId: unknown, run: EvalRuns, now: string): ChampionshipEvent {
  assertChampionshipBank(event);
  if (event.trials.length) championshipReport(event);
  if (!event.frozenAt) throw new ChampionshipError("not_frozen", "Freeze the bank before recording trials");
  const q = event.questions.find(x => x.id === questionId), c = event.counsellors.find(x => x.id === counsellorId);
  if (!q || !c || !run || run.tenantId !== event.tenantId) throw new ChampionshipError("invalid_pair", "No authorised matched question/counsellor/run");
  if (run.question !== q.text || run.counsellor?.name !== c.name) throw new ChampionshipError("invalid_pair", "Evaluation does not match the exact frozen question and counsellor");
  if (run.credibility !== "internal") throw new ChampionshipError("unsupported_tier", "This workflow imports T-012 internal evidence only");
  if (!championshipText(run._id, 100) || !championshipText(run.aiAnswer?.text, 100000) || !championshipText(run.counsellorAnswer?.text, 100000) ||
      !validScore(run.score?.ai) || !validScore(run.score?.counsellor) || run.score?.notes !== undefined && typeof run.score.notes !== "string") {
    throw new ChampionshipError("incomplete_run", "Both original answers and finite scores from 1 through 5 are required");
  }
  const created = Date.parse(run.createdAt), freeze = Date.parse(event.frozenAt);
  if (!Number.isFinite(created) || !Number.isFinite(freeze) || !Number.isFinite(Date.parse(now)) || created < freeze || created > Date.parse(now)) throw new ChampionshipError("trial_time", "Run must be recorded after this freeze and before capture");
  if (event.trials.some(t => t.evalRunId === run._id || t.questionId === q.id && t.counsellorId === c.id)) throw new ChampionshipError("duplicate_trial", "Evaluation ID and planned pair may be recorded only once");
  const trial = { questionId: q.id, counsellorId: c.id, evalRunId: run._id, question: run.question,
    aiAnswer: structuredClone(run.aiAnswer!), counsellorAnswer: { ...structuredClone(run.counsellorAnswer!), text: run.counsellorAnswer!.text! },
    score: { ...structuredClone(run.score!), ai: run.score!.ai!, counsellor: run.score!.counsellor! },
    credibility: "internal" as const, evalCreatedAt: run.createdAt, capturedAt: now };
  return { ...event, trials: [...event.trials, trial], revision: event.revision + 1 };
}
export function championshipReport(event: ChampionshipEvent) {
  assertChampionshipBank(event);
  const seen = new Set<string>(), ids = new Set<string>();
  for (const t of event.trials) {
    const key = JSON.stringify([t.questionId, t.counsellorId]);
    if (seen.has(key) || ids.has(t.evalRunId) || !event.questions.some(q => q.id === t.questionId && q.text === t.question) ||
      !event.counsellors.some(c => c.id === t.counsellorId) || t.credibility !== "internal" || !validScore(t.score?.ai) || !validScore(t.score?.counsellor)) {
      throw new ChampionshipError("corrupt_trials", "Stored trials cannot be safely aggregated");
    }
    const c = event.counsellors.find(x => x.id === t.counsellorId)!;
    addChampionshipTrial({ ...event, revision: 1, trials: [] }, t.questionId, t.counsellorId, {
      _id: t.evalRunId, tenantId: event.tenantId, question: t.question, counsellor: { name: c.name },
      aiAnswer: t.aiAnswer as EvalRuns["aiAnswer"], counsellorAnswer: t.counsellorAnswer, score: t.score,
      credibility: t.credibility, createdAt: t.evalCreatedAt,
    }, t.capturedAt);
    seen.add(key); ids.add(t.evalRunId);
  }
  const counsellors = event.counsellors.map(c => {
    const trials = event.trials.filter(t => t.counsellorId === c.id);
    return { id: c.id, name: c.name, planned: event.questions.length, recorded: trials.length,
      missingQuestionIds: event.questions.filter(q => !trials.some(t => t.questionId === q.id)).map(q => q.id),
      observedScoreTotals: { ai: trials.reduce((n, t) => n + t.score.ai, 0), counsellor: trials.reduce((n, t) => n + t.score.counsellor, 0) } };
  });
  return { eventId: event._id, revision: event.revision, title: event.title, bankDigest: event.bankDigest,
    frozenAt: event.frozenAt ?? null, evidenceStatus: event.evidenceStatus, credibility: "internal", publicResult: false,
    status: event.frozenAt && counsellors.every(c => c.recorded === c.planned) ? "internal-evidence-complete" : "incomplete",
    plannedPairs: event.questions.length * event.counsellors.length, recordedPairs: event.trials.length, counsellors,
    trials: structuredClone(event.trials), questions: structuredClone(event.questions), missingSourceEvidenceRunIds:
      event.trials.filter(t => !hasSourceEntries(t.aiAnswer)).map(t => t.evalRunId),
    unresolvedGates: [...CHAMPIONSHIP_GATES], notice: "Internal operator evidence only. References are unverified assertions; no public victory or independent-human result is established." };
}
function hasSourceEntries(answer: unknown): boolean {
  const sources = (answer as { sources?: { internal?: unknown; web?: unknown } })?.sources;
  return !!sources && [sources.internal, sources.web].some(value => Array.isArray(value) && value.length > 0);
}
