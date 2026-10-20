/** Runtime evidence validation; permissive canonical schemas remain unchanged. */
import { createHash } from "node:crypto";
import type { Turns, QuotedEvidence, CitedItem, QaEntry } from "@lkb/core";
import { parseJsonLoose, type CompleteResult, type Job } from "@lkb/ai";
export type RuntimeComplete = (job: Job) => Promise<CompleteResult>;
export type RuntimeOrigin = CitedItem["origin"];
/** The generated canonical types (ISS-SCHEMAEDIT-002); the old runtime duplicates are aliases only. */
export type RuntimeEvidence = QuotedEvidence;
export type RuntimeItem = CitedItem;
export type RuntimeQA = QaEntry;
type NonEmptyEvidence = [QuotedEvidence, ...QuotedEvidence[]];
export interface RuntimeSpan {
    turnId: string;
    sessionId: string;
    from: number;
    to: number;
    digest: string;
    text: string;
    origin: RuntimeOrigin;
    speakerRef: string;
    tStart: number;
    tEnd: number;
}
export const runtimeDigest = (value: unknown) => createHash("sha256").update(JSON.stringify(value)).digest("hex");
export function runtimeRecord(value: unknown): Record<string, unknown> {
    if (!value || typeof value !== "object" || Array.isArray(value))
        throw new RuntimeIncompleteError("expected evidence object");
    return value as Record<string, unknown>;
}
export function runtimeArray(value: unknown): unknown[] { if (!Array.isArray(value))
    throw new RuntimeIncompleteError("expected evidence array"); return value; }
export function runtimeString(value: unknown): string { if (typeof value !== "string" || !value.trim())
    throw new Error("expected evidence text"); return value; }
export function runtimeOrigin(turn: Turns): RuntimeOrigin {
    if (turn.speakerRef !== "screen") {
        if (turn.screenEvidence)
            throw new Error("screen evidence with speech identity");
        return "speaker-statement";
    }
    const frame = runtimeRecord(turn.screenEvidence);
    const frameId = runtimeString(frame.frameId), file = runtimeString(frame.file);
    if (frameId !== frameId.trim() || file !== file.trim() || /[\x00-\x1f\x7f]/.test(file) ||
        /(^[\\/]|^[A-Za-z]:|(^|[\\/])\.\.([\\/]|$))/.test(file) ||
        typeof frame.hash !== "string" || !/^[a-f0-9]{64}$/i.test(frame.hash) || frame.tStart !== turn.tStart)
        throw new Error("invalid screen evidence identity");
    if (turn.text.startsWith("[Screen OCR; unverified]"))
        return "screen-ocr";
    if (turn.text.startsWith("[Visual observation; unverified]"))
        return "visual-observation";
    throw new Error("screen evidence origin unavailable");
}
export function assertGroundedTurns(turns: Turns[], tenantId = turns[0]?.tenantId, sessionId = turns[0]?.sessionId): void {
    if (!turns.length)
        throw new Error("empty required transcript");
    runtimeString(tenantId);
    runtimeString(sessionId);
    const ids = new Set<string>();
    for (const turn of turns) {
        if (typeof turn._id !== "string" || !turn._id.trim() || typeof turn.tenantId !== "string" || !turn.tenantId.trim() || typeof turn.sessionId !== "string" || !turn.sessionId.trim() || typeof turn.speakerRef !== "string" || !turn.speakerRef.trim() || ids.has(turn._id) || turn.tenantId !== tenantId || turn.sessionId !== sessionId || typeof turn.text !== "string" || !turn.speakerRef ||
            !Number.isFinite(turn.tStart) || !Number.isFinite(turn.tEnd) || turn.tStart < 0 || turn.tEnd < turn.tStart)
            throw new Error("invalid transcript ownership/identity/time");
        ids.add(turn._id);
        runtimeOrigin(turn);
    }
}
export function runtimeChronologicalTurns(turns: Turns[]): Turns[] {
    assertGroundedTurns(turns);
    return turns.map((turn, index) => ({ turn: structuredClone(turn), index })).sort((a, b) => a.turn.tStart - b.turn.tStart || a.turn.tEnd - b.turn.tEnd || a.index - b.index).map(({ turn }) => turn);
}
/** Per-request character budget for strict grounded LLM calls (ISS-GROUNDBUDGET-001). Default 16000; override with
 * LKB_GROUNDED_REQUEST_BUDGET (positive integer >= 4000, e.g. derived from a larger-context model). Judge (x4) and
 * reconcile (x2) budgets scale from it. Strictness is unchanged: an over-budget payload still refuses. */
export const DEFAULT_REQUEST_BUDGET = 16000;
export function runtimeRequestBudget(env: Record<string, string | undefined> = process.env): number {
    const raw = env.LKB_GROUNDED_REQUEST_BUDGET;
    if (raw === undefined || raw === "")
        return DEFAULT_REQUEST_BUDGET;
    const n = Number(raw);
    if (!Number.isInteger(n) || n < 4000)
        throw new Error("LKB_GROUNDED_REQUEST_BUDGET must be an integer >= 4000");
    return n;
}
/** Exact size of the extract request a window produces: spans plus the duplicated inventory plus wrapper. */
const extractPayloadLength = (spans: RuntimeSpan[]) => JSON.stringify({ phase: "extract-summary", spans, inventory: runtimeInventory(spans) }).length;
/** Dense windows defeat the completeness judge (live 2026-10-19): a window holds <= windowTextCap(budget) characters (spans no longer than that) of source text. */
export const windowTextCap = (budget: number) => Math.floor(budget / 8); // 16000 -> 2000; a larger budget still yields fewer windows
/** Retries extract with the verifier model (multi-model hybrid): the router chain for this kind is the verifier alone. */
export const RETRY_EXTRACT_KIND = "output-verifier";
export function runtimeWindows(turns: Turns[], budget = runtimeRequestBudget()): RuntimeSpan[][] {
    const spanBudget = Math.floor(budget * 3 / 4), fits = (spans: RuntimeSpan[]) => spans.reduce((n, x) => n + x.text.length, 0) <= windowTextCap(budget) && JSON.stringify(spans).length <= spanBudget && extractPayloadLength(spans) <= budget;
    turns = runtimeChronologicalTurns(turns);
    const spans: RuntimeSpan[] = [];
    for (const turn of turns) {
        let from = 0;
        do {
            let to = Math.min(from + Math.min(4000, windowTextCap(budget)), turn.text.length);
            if (to < turn.text.length && /[\uD800-\uDBFF]/.test(turn.text[to - 1]!))
                to--;
            const text = turn.text.slice(from, to);
            spans.push({ turnId: turn._id, sessionId: turn.sessionId, from, to, text, origin: runtimeOrigin(turn), speakerRef: turn.speakerRef,
                tStart: turn.tStart, tEnd: turn.tEnd, digest: runtimeDigest([turn.tenantId, turn.sessionId, turn._id, from, to, text]) });
            from = to;
        } while (from < turn.text.length);
    }
    const windows: RuntimeSpan[][] = [];
    let current: RuntimeSpan[] = [];
    for (const span of spans) {
        if (!fits([span]))
            throw new Error("source metadata exceeds window budget");
        if (!fits([...current, span])) {
            windows.push(current);
            current = current.slice(-2);
            while (!fits([...current, span]))
                current.shift();
        }
        current.push(span);
    }
    if (current.length)
        windows.push(current);
    return windows;
}
export const runtimeInventory = (spans: RuntimeSpan[]) => spans.map(({ turnId, from, to, digest }) => ({ turnId, from, to, digest }));
export function assertRuntimeCoverage(value: unknown, spans: RuntimeSpan[]): void {
    const rows = runtimeArray(value).map((entry) => {
        if (!entry || typeof entry !== "object" || Array.isArray(entry))
            throw new RuntimeIncompleteError("invalid processed-span shape"); // e.g. a bare turn id string instead of the inventory row
        const r = entry as Record<string, unknown>;
        // Models echo the whole span object (GLM, live 2026-10-19): the span's own sessionId is tolerated, never any other extra key.
        const keys = Object.keys(r).filter((k) => k !== "sessionId" || !spans.some((s) => s.sessionId === r.sessionId)).sort().join(",");
        if (keys !== "digest,from,to,turnId")
            throw new RuntimeIncompleteError("invalid processed-span shape");
        return { turnId: r.turnId, from: r.from, to: r.to, digest: r.digest };
    });
    if (JSON.stringify(rows) !== JSON.stringify(runtimeInventory(spans)))
        throw new RuntimeIncompleteError("incomplete or altered processed-span acknowledgement");
}
export function runtimeEvidence(value: unknown, turns: Turns[], spans?: RuntimeSpan[]): NonEmptyEvidence {
    const evidence = runtimeArray(value).map((raw) => {
        const e = runtimeRecord(raw), turnId = runtimeString(e.turnId), sessionId = runtimeString(e.sessionId), quote = runtimeString(e.quote);
        const turn = turns.find((t) => t._id === turnId && t.sessionId === sessionId);
        if (!turn || !turn.text.includes(quote) || (spans && !spans.some((s) => s.turnId === turnId && s.text.includes(quote))))
            throw new Error("quote not bound to submitted source");
        return { turnId, sessionId, quote };
    });
    if (!evidence.length || new Set(evidence.map((e) => JSON.stringify(e))).size !== evidence.length)
        throw new Error("empty/duplicate quoted evidence");
    return evidence as NonEmptyEvidence;
}
export function runtimeExtractive(text: unknown, evidence: RuntimeEvidence[]): string {
    const result = runtimeString(text);
    if (result !== evidence.map((e) => e.quote).join("\n"))
        throw new Error("display text adds or changes source facts");
    return result;
}
export function runtimeEvidenceOrigin(evidence: RuntimeEvidence[], turns: Turns[]): RuntimeOrigin {
    const origins = new Set(evidence.map((e) => runtimeOrigin(turns.find((t) => t._id === e.turnId)!)));
    if (origins.size !== 1)
        throw new Error("mixed source origins require separate items");
    return [...origins][0]!;
}
export function runtimeItem(raw: unknown, turns: Turns[], spans?: RuntimeSpan[]): RuntimeItem {
    const r = runtimeRecord(raw), evidence = runtimeEvidence(r.evidence, turns, spans), kind = r.kind;
    if (kind !== "insight" && kind !== "decision" && kind !== "action")
        throw new Error("unknown extraction category");
    const origin = runtimeEvidenceOrigin(evidence, turns);
    if (r.origin !== origin || r.verification !== "unverified")
        throw new Error("source origin/verification mismatch");
    const text = runtimeExtractive(r.text, evidence);
    const id = runtimeDigest([kind, evidence]);
    if (r.id !== undefined && r.id !== id)
        throw new Error("item evidence identity mismatch");
    return { id, kind, text, origin, verification: "unverified", evidence };
}
export function runtimeQA(raw: unknown, turns: Turns[], questionSpans?: RuntimeSpan[], answerSpans?: RuntimeSpan[]): RuntimeQA {
    const r = runtimeRecord(raw), questionEvidence = runtimeEvidence(r.questionEvidence, turns, questionSpans);
    const question = runtimeExtractive(r.question, questionEvidence), id = runtimeDigest(["question", questionEvidence]);
    if (r.id !== undefined && r.id !== id)
        throw new Error("question evidence identity mismatch");
    if (r.status === "unanswered" && r.answer === null && runtimeArray(r.answerEvidence).length === 0) {
        return { id, question, questionEvidence, answer: null, answerEvidence: [], status: "unanswered" };
    }
    if (r.status !== "answered")
        throw new Error("invalid question status");
    const answerEvidence = runtimeEvidence(r.answerEvidence, turns, answerSpans);
    return { id, question, questionEvidence, answer: runtimeExtractive(r.answer, answerEvidence), answerEvidence, status: "answered" };
}
export async function runtimeComplete(complete: RuntimeComplete, kind: "summarize" | "claims" | typeof RETRY_EXTRACT_KIND, system: string, payload: unknown, budget = runtimeRequestBudget()): Promise<unknown> {
    const content = JSON.stringify(payload);
    if (content.length > budget)
        throw new Error("complete evidence context exceeds request budget");
    const result = await complete({ kind, messages: [{ role: "system", content: system }, { role: "user", content }] });
    return result.json ?? parseJsonLoose(result.text);
}
/** Judge verdict that the extractor omitted informative content: the one failure a fresh extraction of the same window can legitimately cure. */
export class RuntimeIncompleteError extends Error {
}
/** Verifier edge rule (notes/sentence-span.ts), stated to the extractor so quotes are not dropped for their cut points; the verifier itself is unchanged. */
export const QUOTE_RULE = " Each evidence quote must be one or more WHOLE sentences or clauses copied exactly: begin at the start of the turn or right after . ? ! , ; : and end ON a . ? ! , ; : mark or at the turn end. Never begin or stop mid-sentence, and never end on a dangling vocative or fragment such as a trailing name; if a sentence is cut short in the source, quote the whole preceding clause instead.";
export const RETRY_HINT = "A previous independent review found informative statements omitted from an earlier attempt at these exact spans. Extract EVERY informative statement: lists of offerings, methods, plans, numbers, dates and conflicting statements, each as its own exact whole-sentence quote. Offers, requests and suggestions are insights, never actions." + QUOTE_RULE;
/** Rolls the drop log back to `mark` and returns the verifier's rejections since then (reason + excerpt), to tell the extractor what to re-quote. */
export function rejectedFeedback(log: { reason: string; excerpt: string }[] | undefined, mark: number): string {
    if (!log)
        return "";
    const rejected = log.splice(mark).filter((d) => d.excerpt).slice(0, 12).map((d) => `${d.reason}: "${d.excerpt}"`);
    return rejected.length ? " Rejected last time (re-quote these as whole sentences): " + rejected.join(" | ") : "";
}
/** Runs one window's extract+judge. A malformed acknowledgement/reply or missing per-item verdict (RuntimeIncompleteError) is retried: a lone span once, else as two halves (recursively), each told which proposals the verifier rejected (`rollback` returns that feedback). A part that still fails is SKIPPED (`empty`, reported via `onSkip`), never thrown: D-185 treats it as not processed. Grounding failures of single items are dropped by the callers, not here. */
export async function withWindowRetry<T>(spans: RuntimeSpan[], run: (spans: RuntimeSpan[], hint?: string) => Promise<T>, join: (parts: T[]) => T, rollback: () => string, empty: T, onSkip: (error: Error) => void, hint?: string): Promise<T> {
    try {
        return await run(spans, hint);
    }
    catch (error) {
        if (!(error instanceof RuntimeIncompleteError))
            throw error;
        const next = RETRY_HINT + rollback();
        if (spans.length < 2 && hint !== undefined) {
            onSkip(error);
            return empty;
        }
        if (spans.length < 2)
            return withWindowRetry(spans, run, join, rollback, empty, onSkip, next);
        const mid = Math.ceil(spans.length / 2), first = await withWindowRetry(spans.slice(0, mid), run, join, rollback, empty, onSkip, next);
        return join([first, await withWindowRetry(spans.slice(mid), run, join, rollback, empty, onSkip, next)]);
    }
}
export type RuntimeVerdicts = RuntimeVerdict[] & { advisory?: string };
export interface RuntimeVerdict { id: string; supported: unknown; categoryCorrect: unknown; answerRelevant: unknown }
/** Runs the independent judge and returns the verdict records; protocol failures (coverage, completeness, missing/duplicate/unknown ids) still throw. */
export async function runtimeVerdicts(complete: RuntimeComplete, kind: "summarize" | "claims", turns: Turns[], spans: RuntimeSpan[], items: {
    id: string;
}[], mode: "summary-extraction" | "claim-extraction" | "pending-qa" = kind === "claims" ? "claim-extraction" : "summary-extraction"): Promise<RuntimeVerdicts> {
    const citedIds = new Set(spans.map((s) => s.turnId));
    for (const item of items)
        for (const key of ["evidence", "questionEvidence", "answerEvidence"]) {
            const evidence = runtimeRecord(item)[key];
            if (Array.isArray(evidence))
                for (const e of evidence)
                    citedIds.add(runtimeString(runtimeRecord(e).turnId));
        }
    const indices = turns.flatMap((t, i) => citedIds.has(t._id) ? [i] : []);
    const context = turns.filter((_, i) => indices.some((n) => Math.abs(i - n) <= 1));
    if (JSON.stringify(context).length > runtimeRequestBudget() * 3)
        throw new Error("full semantic context exceeds48K budget");
    const raw = runtimeRecord(await runtimeComplete(complete, kind, (mode === "pending-qa" ? 'Review exactly every pending question candidate; completeness is per-question judgment, not new insight extraction. ' : mode === "claim-extraction" ? 'Review factual claim extraction completeness; informative but fact-free source may have noClaims=true. ' : 'Review informative summary extraction completeness. ') +
        'Independently check all submitted source spans and proposed extracts using full source and adjacent context. Return {processed: exact span inventory, complete: true|false, noContent: true|false, noClaims: true|false, verdicts:[{id,supported:boolean,categoryCorrect:boolean,answerRelevant:boolean}]}. Verdict every id exactly once. Negated/proposed adoption is not a decision; suggestions are not assigned actions. A quoted answer must answer its quoted question. Screen OCR/visual observations are unverified source observations, never verified speaker facts. complete=false for omissions of informative content INSIDE the submitted spans only: adjacent context turns outside the spans belong to other windows and never make complete=false. noContent=true only if these source spans contain no informative extract. No extra IDs.', { phase: "judge", mode, spans, context, items, inventory: runtimeInventory(spans) }, runtimeRequestBudget() * 4));
    assertRuntimeCoverage(raw.processed, spans);
    // D-185: completeness is ADVISORY. The omission verdict is reported on the result, never thrown; per-item verdicts below remain a hard gate.
    const advisory = raw.complete !== true || (items.length === 0 && (mode === "claim-extraction" ? raw.noClaims !== true : mode === "summary-extraction" && raw.noContent !== true)) ? "coverage advisory: judge reported informative content not extracted (D-185)" : undefined;
    const verdicts = runtimeArray(raw.verdicts).map(runtimeRecord);
    if (verdicts.length !== items.length || new Set(verdicts.map((v) => v.id)).size !== verdicts.length || verdicts.some((v) => !items.some((item) => item.id === v.id)))
        throw new RuntimeIncompleteError("missing/failed/unknown semantic verdict");
    return Object.assign(verdicts as unknown as RuntimeVerdict[], { advisory });
}
export const verdictPasses = (v: RuntimeVerdict | undefined) => v?.supported === true && v.categoryCorrect === true && v.answerRelevant === true;
export async function runtimeJudge(complete: RuntimeComplete, kind: "summarize" | "claims", turns: Turns[], spans: RuntimeSpan[], items: {
    id: string;
}[], mode: "summary-extraction" | "claim-extraction" | "pending-qa" = kind === "claims" ? "claim-extraction" : "summary-extraction"): Promise<void> {
    if ((await runtimeVerdicts(complete, kind, turns, spans, items, mode)).some((v) => !verdictPasses(v)))
        throw new Error("missing/failed/unknown semantic verdict");
}
export function validateRuntimePage(turns: Turns[], raw: unknown): {
    citedItems: RuntimeItem[];
    qa: RuntimeQA[];
    coveredTurnIds: string[];
} {
    assertGroundedTurns(turns);
    const r = runtimeRecord(raw);
    const citedItems = runtimeArray(r.citedItems).map((item) => runtimeItem(item, turns));
    const qa = runtimeArray(r.qa).map((q) => runtimeQA(q, turns));
    const coveredTurnIds = runtimeArray(r.coveredTurnIds);
    if (coveredTurnIds.length !== turns.length || new Set(coveredTurnIds).size !== turns.length || coveredTurnIds.some((id) => typeof id !== "string" || !turns.some((t) => t._id === id)) ||
        !citedItems.some((i) => i.kind === "insight") || new Set([...citedItems, ...qa].map((i) => i.id)).size !== citedItems.length + qa.length)
        throw new Error("required grounded evidence/coverage unavailable");
    return { citedItems, qa, coveredTurnIds: coveredTurnIds as string[] };
}
