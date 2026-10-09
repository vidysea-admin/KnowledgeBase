/** Offline extraction measurement. Citation integrity is not semantic support. No I/O. */
import { parseJsonLoose } from "@lkb/ai";
type Obj = Record<string, unknown>;
export interface Rate { numerator: number; denominator: number; value: number | null; }
export interface ExtractionCase extends Obj {
  id: string; tenantId: string; sessionId: string; artifactHash: string; turns: unknown[];
  rawText?: string; parsed?: unknown; persisted?: unknown; mediaDuration?: number;
  filtered?: {claims: unknown; degraded: unknown}; labels?: unknown[];
  expectedFacts?: {id: string}[]; predictedEntities?: {id: string; kind: "topic" | "person"}[];
  entityLabels?: unknown[];
}
export interface StageReport {
  available: boolean; reason: string | null; rows: number | null; wellFormedClaims: number | null;
  invalidCitationRate: Rate; affectedClaims: number; claimIds: string[];
  issues: {claimId: string; code: string; turnId?: string; sessionId?: string}[];
  optionalChecks: {span: number; attribution: number; excerpt: number};
}
export interface ExtractionReport {
  version: 1; id: string; tenantId: string; sessionId: string; artifactHash: string; complete: boolean;
  sourceTurns: number; sourceIssues: string[]; incompleteReasons: string[];
  stages: Record<"raw" | "parsed" | "filtered" | "persisted", StageReport>;
  filterLoss: {droppedClaims: number; removedCitations: number} | null;
  semantic: {measured: boolean; labeled: number; eligible: number; coverage: Rate;
    counts: Record<string, number>; unsupportedRate: Rate; omissionRate: Rate};
  entities: Record<"topic" | "person", {measured: boolean; labeled: number; predicted: number; precision: Rate}>;
}
const object = (v: unknown): v is Obj => !!v && typeof v === "object" && !Array.isArray(v);
const text = (v: unknown): v is string => typeof v === "string" && v.trim().length > 0;
const rate = (numerator: number, denominator: number): Rate => ({numerator, denominator, value: denominator ? numerator / denominator : null});
const time = (a: unknown, b: unknown) => typeof a === "number" && typeof b === "number" && Number.isFinite(a) && Number.isFinite(b) && a >= 0 && b >= a;
const unavailable = (reason: string): StageReport => ({available: false, reason, rows: null, wellFormedClaims: null,
  invalidCitationRate: rate(0, 0), affectedClaims: 0, claimIds: [], issues: [], optionalChecks: {span: 0, attribution: 0, excerpt: 0}});
/** Evaluate recorded artifacts independently; missing stages never become healthy zero coverage. */
export function evaluateExtractionCase(input: ExtractionCase): ExtractionReport {
  if (!text(input.id) || !text(input.tenantId) || !text(input.sessionId) || !/^[a-f0-9]{64}$/.test(input.artifactHash) ||
      !Array.isArray(input.turns) || input.turns.length > 100000 ||
      (input.mediaDuration !== undefined && (!Number.isFinite(input.mediaDuration) || input.mediaDuration < 0))) throw new Error("Invalid extraction case");
  for (const k of ["labels", "entityLabels", "expectedFacts", "predictedEntities"] as const) {
    if (input[k] !== undefined && (!Array.isArray(input[k]) || input[k]!.length > 100000)) throw new Error("Invalid label inventory");
  }
  const facts = new Set<string>(); for (const f of input.expectedFacts ?? []) {
    if (!object(f) || !text(f.id) || facts.has(f.id)) throw new Error("Invalid expected fact"); facts.add(f.id);
  }
  const sourceIssues: string[] = [], sources = new Map<string, Obj>(), ambiguous = new Set<string>();
  const sourceIssue = (code: string) => {if (!sourceIssues.includes(code)) sourceIssues.push(code);};
  for (const t of input.turns) {
    if (!object(t) || !text(t._id) || !text(t.text) || !text(t.speakerRef)) {sourceIssue("invalid-turn-shape"); continue;}
    if (sources.has(t._id)) {ambiguous.add(t._id); sourceIssue("duplicate-turn-id");}
    sources.set(t._id, t);
    if (t.tenantId !== input.tenantId || t.sessionId !== input.sessionId) sourceIssue("foreign-turn-owner");
    if (!time(t.tStart, t.tEnd)) sourceIssue("invalid-turn-time");
    else if (input.mediaDuration !== undefined && (t.tEnd as number) > input.mediaDuration) sourceIssue("turn-outside-media");
  }
  function stage(value: unknown, format: "extractor" | "filtered" | "persisted"): StageReport {
    if (value === undefined) return unavailable("artifact-absent");
    if (!Array.isArray(value) || value.length > 100000) return unavailable("invalid-artifact");
    const r = {...unavailable(""), available: true, reason: null, rows: value.length, wellFormedClaims: 0};
    let citations = 0, invalid = 0; const seen = new Set<string>();
    for (let index = 0; index < value.length; index++) {
      const row = value[index], id = object(row) && text(row._id) ? row._id : "row:" + index;
      r.claimIds.push(id); const issue = (code: string, extra: {turnId?: string; sessionId?: string} = {}) => r.issues.push({claimId: id, code, ...extra});
      const startIssues = r.issues.length;
      if (seen.has(id)) issue("duplicate-claim-id"); seen.add(id);
      if (!object(row) || !text(row.text)) {issue("invalid-claim-shape"); r.affectedClaims++; continue;}
      if (row.tenantId !== undefined && row.tenantId !== input.tenantId) issue("foreign-claim-owner");
      if (row.sessionId !== undefined && row.sessionId !== input.sessionId) issue("foreign-claim-session");
      if (format === "persisted" && row.tenantId !== input.tenantId) issue("foreign-claim-owner");
      const rawIds = format === "persisted" ? row.evidence : format === "filtered" ? row.evidenceTurnIds : row.turnIds;
      if (!Array.isArray(rawIds) || rawIds.length === 0) {issue("empty-or-malformed-evidence"); r.affectedClaims++; continue;}
      r.wellFormedClaims!++; const resolved: Obj[] = [];
      for (const evidence of rawIds) {
        citations++; const turnId = format === "persisted" && object(evidence) ? evidence.turnId : format !== "persisted" ? evidence : undefined;
        const sessionId = format === "persisted" && object(evidence) ? evidence.sessionId : input.sessionId;
        const t = typeof turnId === "string" ? sources.get(turnId) : undefined;
        let code: string | undefined;
        if (!text(turnId) || !text(sessionId)) code = "invalid-citation-shape";
        else if (sessionId !== input.sessionId) code = "foreign-citation-session";
        else if (!t) code = "missing-turn";
        else if (ambiguous.has(turnId)) code = "ambiguous-turn-id";
        else if (t.tenantId !== input.tenantId || t.sessionId !== input.sessionId) code = "foreign-citation-owner";
        if (code) {invalid++; issue(code, {...(text(turnId) ? {turnId} : {}), ...(text(sessionId) ? {sessionId} : {})});}
        else if (t) resolved.push(t);
      }
      if (row.tStart !== undefined || row.tEnd !== undefined) {
        r.optionalChecks.span++;
        if (!time(row.tStart, row.tEnd) || !resolved.length || resolved.some(t => !time(t.tStart, t.tEnd)) ||
            (row.tStart as number) < Math.min(...resolved.map(t => t.tStart as number)) ||
            (row.tEnd as number) > Math.max(...resolved.map(t => t.tEnd as number))) issue("claim-span-mismatch");
      }
      if (row.speakerRef !== undefined) {r.optionalChecks.attribution++; if (!text(row.speakerRef) || !resolved.some(t => t.speakerRef === row.speakerRef)) issue("speaker-mismatch");}
      if (row.sourceExcerpt !== undefined) {r.optionalChecks.excerpt++; if (!text(row.sourceExcerpt) || !resolved.some(t => (t.text as string).includes(row.sourceExcerpt as string))) issue("excerpt-mismatch");}
      if (r.issues.length > startIssues) r.affectedClaims++;
    }
    r.invalidCitationRate = rate(invalid, citations); return r;
  }
  let rawValue: unknown, rawReason = "artifact-absent";
  if (input.rawText !== undefined) {
    if (typeof input.rawText !== "string" || input.rawText.length > 16 * 1024 * 1024) throw new Error("Invalid raw artifact");
    try {rawValue = parseJsonLoose(input.rawText); rawReason = "invalid-artifact";} catch {rawReason = "raw-parse-failed";}
  }
  const stages = {raw: rawValue === undefined ? unavailable(rawReason) : stage(rawValue, "extractor"),
    parsed: stage(input.parsed ?? rawValue, "extractor"),
    filtered: input.filtered?.degraded ? unavailable("extraction-degraded") : stage(input.filtered?.claims, "filtered"),
    persisted: stage(input.persisted, "persisted")};
  const effective = stages.parsed.available ? stages.parsed : stages.persisted.available ? stages.persisted : stages.filtered;
  const incompleteReasons = [...sourceIssues]; if (!effective.available) incompleteReasons.push("no-effective-artifact");
  for (const name of ["parsed", "filtered", "persisted"] as const) if (stages[name].reason && stages[name].reason !== "artifact-absent") incompleteReasons.push(name + ":" + stages[name].reason);
  const semantic: ExtractionReport["semantic"] = {measured: false, labeled: 0, eligible: effective.claimIds.length,
    coverage: rate(0, effective.claimIds.length), counts: {supported: 0, unsupported: 0, contradicted: 0, uncertain: 0, omitted: 0},
    unsupportedRate: rate(0, 0), omissionRate: rate(0, 0)};
  const seenLabels = new Set<string>();
  for (const label of input.labels ?? []) {
    if (!object(label) || label.caseId !== input.id || label.artifactHash !== input.artifactHash || !text(label.claimId) || !text(label.status) ||
        !["supported", "unsupported", "contradicted", "uncertain", "omitted"].includes(label.status)) throw new Error("Invalid human label");
    const omitted = label.status === "omitted", name = label.stage as keyof typeof stages;
    if (omitted ? !(input.expectedFacts ?? []).some(f => f.id === label.claimId) : !stages[name]?.available || stages[name].claimIds.filter(id => id === label.claimId).length !== 1) throw new Error("Invalid human label target");
    const key = String(label.stage) + ":" + label.claimId;
    if (seenLabels.has(key)) throw new Error("Invalid human label duplicate"); seenLabels.add(key);
    semantic.counts[label.status]!++; if (!omitted) semantic.labeled++;
  }
  semantic.measured = (input.labels?.length ?? 0) > 0;
  // Multiple stages may be labeled; coverage denominator is the explicit labeled-stage inventory.
  const labeledStages = new Set((input.labels ?? []).filter(object).filter(l => l.status !== "omitted").map(l => String(l.stage)));
  semantic.eligible = labeledStages.size ? [...labeledStages].reduce((n, k) => n + stages[k as keyof typeof stages].claimIds.length, 0) : effective.claimIds.length;
  semantic.coverage = rate(semantic.labeled, semantic.eligible);
  const adjudicated = semantic.counts.supported! + semantic.counts.unsupported! + semantic.counts.contradicted!;
  semantic.unsupportedRate = rate(semantic.counts.unsupported! + semantic.counts.contradicted!, adjudicated);
  semantic.omissionRate = rate(semantic.counts.omitted!, semantic.counts.omitted! ? input.expectedFacts?.length ?? 0 : 0);
  const entities: ExtractionReport["entities"] = {topic: {measured: false, labeled: 0, predicted: 0, precision: rate(0, 0)}, person: {measured: false, labeled: 0, predicted: 0, precision: rate(0, 0)}};
  const predictionIds = new Set<string>();
  for (const e of input.predictedEntities ?? []) {if (!object(e) || !text(e.id) || !["topic", "person"].includes(e.kind)) throw new Error("Invalid entity prediction"); if (predictionIds.has(e.kind + ":" + e.id)) throw new Error("Invalid duplicate entity prediction"); predictionIds.add(e.kind + ":" + e.id); entities[e.kind].predicted++;}
  const entitySeen = new Set<string>();
  for (const l of input.entityLabels ?? []) {
    if (!object(l) || l.caseId !== input.id || l.artifactHash !== input.artifactHash || !["topic", "person"].includes(String(l.kind)) || typeof l.correct !== "boolean" ||
        !(input.predictedEntities ?? []).some(e => e.id === l.id && e.kind === l.kind)) throw new Error("Invalid entity label");
    const key = l.kind + ":" + l.id; if (entitySeen.has(key)) throw new Error("Invalid entity label duplicate"); entitySeen.add(key);
    const e = entities[l.kind as "topic" | "person"]; e.measured = true; e.labeled++; e.precision = rate(e.precision.numerator + Number(l.correct), e.labeled);
  }
  return {version: 1, id: input.id, tenantId: input.tenantId, sessionId: input.sessionId, artifactHash: input.artifactHash,
    complete: incompleteReasons.length === 0, sourceTurns: input.turns.length, sourceIssues, incompleteReasons, stages,
    filterLoss: stages.parsed.available && stages.filtered.available ? {droppedClaims: Math.max(0, stages.parsed.rows! - stages.filtered.rows!),
      removedCitations: Math.max(0, stages.parsed.invalidCitationRate.denominator - stages.filtered.invalidCitationRate.denominator)} : null, semantic, entities};
}
/** Weighted sums retain case coverage; unavailable observations contribute no invented denominator. */
export function aggregateExtractionReports(reports: ExtractionReport[]) {
  const ids = new Set<string>(); for (const r of reports) {if (ids.has(r.id)) throw new Error("Duplicate extraction case"); ids.add(r.id);}
  const sum = (fn: (r: ExtractionReport) => number) => reports.reduce((n, r) => n + fn(r), 0);
  const stages = Object.fromEntries((["raw", "parsed", "filtered", "persisted"] as const).map(k => [k, {
    availableCases: sum(r => Number(r.stages[k].available)), unavailableCases: sum(r => Number(!r.stages[k].available)),
    rows: reports.some(r => r.stages[k].available) ? sum(r => r.stages[k].rows ?? 0) : null, affectedClaims: sum(r => r.stages[k].affectedClaims),
    invalidCitationRate: rate(sum(r => r.stages[k].invalidCitationRate.numerator), sum(r => r.stages[k].invalidCitationRate.denominator))}]));
  return {version: 1, cases: reports.length, completeCases: sum(r => Number(r.complete)), sourceTurns: sum(r => r.sourceTurns),
    incompleteCases: reports.filter(r => !r.complete).map(r => ({id: r.id, reasons: r.incompleteReasons})), stages,
    semantic: {labeledCases: sum(r => Number(r.semantic.measured)), unmeasuredCases: sum(r => Number(!r.semantic.measured)),
      unsupportedRate: rate(sum(r => r.semantic.unsupportedRate.numerator), sum(r => r.semantic.unsupportedRate.denominator)),
      coverage: rate(sum(r => r.semantic.coverage.numerator), sum(r => r.semantic.coverage.denominator))},
    unresolvedReferences: reports.flatMap(r => Object.values(r.stages).flatMap(s => s.issues.filter(i => i.code === "missing-turn").map(i => ({caseId: r.id, claimId: i.claimId, turnId: i.turnId, sessionId: i.sessionId}))))};
}
