/** Strict runtime producer: windowed extracts, separate judgments and unresolved questions. */
import type { Turns } from "@lkb/core";
import { runtimeChronologicalTurns, runtimeArray, runtimeRecord, runtimeComplete, runtimeWindows, runtimeInventory, assertRuntimeCoverage, runtimeItem, runtimeQA, runtimeJudge, validateRuntimePage, type RuntimeComplete, type RuntimeItem, type RuntimeQA } from "./grounded.js";
const EXTRACT = 'Read ALL supplied source spans. Return {processed: exact inventory, items:[], qa:[]}. Items: {kind:insight|decision|action,text,origin:speaker-statement|screen-ocr|visual-observation,verification:"unverified",evidence:[{turnId,sessionId,quote}]}. QA: {question,questionEvidence,answer:null|string,answerEvidence:[],status:answered|unanswered}. Every text/question/answer must equal its exact evidence quotes joined by newline. Evidence quotes must lie entirely inside a submitted span. Do not supply ids. Preserve source origin; screen content is unverified. Proposals/negated adoption are not decisions; suggestions are not assigned actions. Extract informative content throughout; no inferred owners/names/dates. Questions without relevant cited answers are unanswered/null/empty answerEvidence.';
function mergeQuestion(map: Map<string, RuntimeQA>, q: RuntimeQA): void {
    const prior = map.get(q.id);
    if (prior?.status === "answered" && q.status === "answered" && JSON.stringify(prior) !== JSON.stringify(q))
        throw new Error("conflicting answer evidence");
    if (!prior || q.status === "answered")
        map.set(q.id, q);
}
export async function produceRuntimeSummary(turns: Turns[], complete: RuntimeComplete) {
    turns = runtimeChronologicalTurns(turns);
    const windows = runtimeWindows(turns), items = new Map<string, RuntimeItem>(), questions = new Map<string, RuntimeQA>();
    const processed = new Map<string, Set<string>>();
    for (const spans of windows) {
        const raw = runtimeRecord(await runtimeComplete(complete, "summarize", EXTRACT, { phase: "extract-summary", spans, inventory: runtimeInventory(spans) }));
        assertRuntimeCoverage(raw.processed, spans);
        const nextItems = runtimeArray(raw.items).map((i) => runtimeItem(i, turns, spans));
        const nextQuestions = runtimeArray(raw.qa).map((q) => runtimeQA(q, turns, spans, spans));
        const proposed = [...nextItems, ...nextQuestions];
        if (new Set(proposed.map((i) => i.id)).size !== proposed.length)
            throw new Error("duplicate window extracts");
        await runtimeJudge(complete, "summarize", turns, spans, proposed);
        for (const item of nextItems)
            items.set(item.id, item);
        for (const q of nextQuestions)
            mergeQuestion(questions, q);
        // Previously unanswered questions remain pending across ALL subsequent windows.
        const pending = [...questions.values()].filter((q) => q.status === "unanswered");
        for (let offset = 0; offset < pending.length;) {
            let batch = pending.slice(offset, offset + 8);
            while (batch.length > 1 && JSON.stringify({ phase: "reconcile-questions", spans, questions: batch, inventory: runtimeInventory(spans) }).length > 32000)
                batch = batch.slice(0, -1);
            const answerRaw = runtimeRecord(await runtimeComplete(complete, "summarize", 'Review every pending question against all CURRENT spans. Return {processed: exact inventory, answers:[{id,answer:null|string,answerEvidence:[]}]}, exactly once for every pending id and no other id. Answers require relevant literal quotes entirely inside current spans, joined by newline; unresolved means null and []. Never reinterpret question text.', { phase: "reconcile-questions", spans, questions: batch, inventory: runtimeInventory(spans) }, 32000));
            assertRuntimeCoverage(answerRaw.processed, spans);
            const answers = runtimeArray(answerRaw.answers).map(runtimeRecord);
            if (answers.length !== batch.length || new Set(answers.map((a) => a.id)).size !== batch.length || answers.some((a) => !batch.some((q) => q.id === a.id)))
                throw new Error("missing/unknown/duplicate pending question answer");
            const candidates = answers.map((a) => {
                const q = batch.find((p) => p.id === a.id)!;
                return runtimeQA({ ...q, answer: a.answer, answerEvidence: a.answerEvidence, status: a.answer === null ? "unanswered" : "answered" }, turns, undefined, spans);
            });
            await runtimeJudge(complete, "summarize", turns, spans, candidates, "pending-qa");
            for (const q of candidates)
                mergeQuestion(questions, q);
            offset += batch.length;
        }
        for (const s of spans) {
            if (!processed.has(s.turnId))
                processed.set(s.turnId, new Set());
            processed.get(s.turnId)!.add(`${s.from}:${s.to}:${s.digest}`);
        }
    }
    const required = windows.flat();
    const coveredTurnIds = turns.filter((t) => required.filter((s) => s.turnId === t._id).every((s) => processed.get(t._id)?.has(`${s.from}:${s.to}:${s.digest}`))).map((t) => t._id);
    const evidence = validateRuntimePage(turns, { citedItems: [...items.values()], qa: [...questions.values()], coveredTurnIds });
    const ofKind = (kind: RuntimeItem["kind"]) => evidence.citedItems.filter((i) => i.kind === kind).map((i) => i.text);
    return { summary: evidence.citedItems.filter((i) => i.kind === "insight").map((i) => `${i.text} [${i.evidence.map((e) => e.turnId).join(", ")}]`).join("\n"),
        keyInsights: ofKind("insight"), decisions: ofKind("decision"), actionItems: ofKind("action"), ...evidence };
}
