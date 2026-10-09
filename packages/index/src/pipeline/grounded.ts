/** Runtime evidence validation; permissive canonical schemas remain unchanged. */
import { createHash } from "node:crypto";
import type { Turns } from "@lkb/core";
import { parseJsonLoose, type CompleteResult, type Job } from "@lkb/ai";
export type RuntimeComplete = (job: Job) => Promise<CompleteResult>;
export type RuntimeOrigin = "speaker-statement" | "screen-ocr" | "visual-observation";
export interface RuntimeEvidence {
    turnId: string;
    sessionId: string;
    quote: string;
}
export interface RuntimeItem {
    id: string;
    kind: "insight" | "decision" | "action";
    text: string;
    origin: RuntimeOrigin;
    verification: "unverified";
    evidence: RuntimeEvidence[];
}
export interface RuntimeQA {
    id: string;
    question: string;
    questionEvidence: RuntimeEvidence[];
    answer: string | null;
    answerEvidence: RuntimeEvidence[];
    status: "answered" | "unanswered";
}
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
        throw new Error("expected evidence object");
    return value as Record<string, unknown>;
}
export function runtimeArray(value: unknown): unknown[] { if (!Array.isArray(value))
    throw new Error("expected evidence array"); return value; }
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
export function runtimeWindows(turns: Turns[]): RuntimeSpan[][] {
    turns = runtimeChronologicalTurns(turns);
    const spans: RuntimeSpan[] = [];
    for (const turn of turns) {
        let from = 0;
        do {
            let to = Math.min(from + 4000, turn.text.length);
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
        if (JSON.stringify([span]).length > 12000)
            throw new Error("source metadata exceeds window budget");
        if (JSON.stringify([...current, span]).length > 12000) {
            windows.push(current);
            current = current.slice(-2);
            while (JSON.stringify([...current, span]).length > 12000)
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
        const r = runtimeRecord(entry);
        if (Object.keys(r).sort().join(",") !== "digest,from,to,turnId")
            throw new Error("invalid processed-span shape");
        return { turnId: r.turnId, from: r.from, to: r.to, digest: r.digest };
    });
    if (JSON.stringify(rows) !== JSON.stringify(runtimeInventory(spans)))
        throw new Error("incomplete or altered processed-span acknowledgement");
}
export function runtimeEvidence(value: unknown, turns: Turns[], spans?: RuntimeSpan[]): RuntimeEvidence[] {
    const evidence = runtimeArray(value).map((raw) => {
        const e = runtimeRecord(raw), turnId = runtimeString(e.turnId), sessionId = runtimeString(e.sessionId), quote = runtimeString(e.quote);
        const turn = turns.find((t) => t._id === turnId && t.sessionId === sessionId);
        if (!turn || !turn.text.includes(quote) || (spans && !spans.some((s) => s.turnId === turnId && s.text.includes(quote))))
            throw new Error("quote not bound to submitted source");
        return { turnId, sessionId, quote };
    });
    if (!evidence.length || new Set(evidence.map((e) => JSON.stringify(e))).size !== evidence.length)
        throw new Error("empty/duplicate quoted evidence");
    return evidence;
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
export async function runtimeComplete(complete: RuntimeComplete, kind: "summarize" | "claims", system: string, payload: unknown, budget = 16000): Promise<unknown> {
    const content = JSON.stringify(payload);
    if (content.length > budget)
        throw new Error("complete evidence context exceeds request budget");
    const result = await complete({ kind, messages: [{ role: "system", content: system }, { role: "user", content }] });
    return result.json ?? parseJsonLoose(result.text);
}
export async function runtimeJudge(complete: RuntimeComplete, kind: "summarize" | "claims", turns: Turns[], spans: RuntimeSpan[], items: {
    id: string;
}[], mode: "summary-extraction" | "claim-extraction" | "pending-qa" = kind === "claims" ? "claim-extraction" : "summary-extraction"): Promise<void> {
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
    if (JSON.stringify(context).length > 48000)
        throw new Error("full semantic context exceeds48K budget");
    const raw = runtimeRecord(await runtimeComplete(complete, kind, (mode === "pending-qa" ? 'Review exactly every pending question candidate; completeness is per-question judgment, not new insight extraction. ' : mode === "claim-extraction" ? 'Review factual claim extraction completeness; informative but fact-free source may have noClaims=true. ' : 'Review informative summary extraction completeness. ') +
        'Independently check all submitted source spans and proposed extracts using full source and adjacent context. Return {processed: exact span inventory, complete: true|false, noContent: true|false, noClaims: true|false, verdicts:[{id,supported:boolean,categoryCorrect:boolean,answerRelevant:boolean}]}. Verdict every id exactly once. Negated/proposed adoption is not a decision; suggestions are not assigned actions. A quoted answer must answer its quoted question. Screen OCR/visual observations are unverified source observations, never verified speaker facts. complete=false for omissions; noContent=true only if these source spans contain no informative extract. No extra IDs.', { phase: "judge", mode, spans, context, items, inventory: runtimeInventory(spans) }, 64000));
    assertRuntimeCoverage(raw.processed, spans);
    if (raw.complete !== true || (items.length === 0 && (mode === "claim-extraction" ? raw.noClaims !== true : mode === "summary-extraction" && raw.noContent !== true)))
        throw new Error("informative extraction gap or incomplete semantic review");
    const verdicts = runtimeArray(raw.verdicts).map(runtimeRecord);
    if (verdicts.length !== items.length || new Set(verdicts.map((v) => v.id)).size !== verdicts.length || verdicts.some((v) => !items.some((item) => item.id === v.id) || v.supported !== true || v.categoryCorrect !== true || v.answerRelevant !== true))
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
