import type { Claims, Turns } from "@lkb/core";
import { assertGroundedTurns, runtimeEvidence, type NoteJudge } from "@lkb/index";

/** Source-native summaries may paraphrase; evidence identity and exact supplied quotes cannot. */
export function assertSourceBoundPublication(
  tenantId: string, sessionId: string, turns: Turns[],
  page: { summary: string; keyInsights: string[]; decisions: string[]; actionItems: string[] },
  claims: { text: string; evidenceTurnIds: string[]; evidence?: unknown }[],
): void {
  assertGroundedTurns(turns, tenantId, sessionId);
  if (![page.summary, ...page.keyInsights, ...page.decisions, ...page.actionItems].every(text => typeof text === "string" && text.trim().length > 0)) {
    throw new Error("vectorless page content is invalid");
  }
  for (const claim of claims) {
    const rows = claim.evidenceTurnIds.map(id => turns.find(turn => turn._id === id));
    if (!rows.length || rows.some(row => !row) || !claim.text.trim()) {
      throw new Error("vectorless claim lacks current source evidence");
    }
    if (claim.evidence !== undefined) runtimeEvidence(claim.evidence, turns);
  }
}

/** Reviewed status is not a semantic bypass after a source correction. Literal claims can be
 * rebound deterministically; paraphrases require the independently configured meaning judge. */
export async function assertPreservedClaimMeaning(claims: Claims[], turns: Turns[], judge?: NoteJudge, maxCostUsd?: number): Promise<void> {
  let cost = 0;
  for (const claim of claims) {
    const evidence = runtimeEvidence(claim.evidence, turns);
    if (evidence.some(item => item.quote.trim() === claim.text.trim() &&
      turns.find(turn => turn._id === item.turnId)!.text.trim() === claim.text.trim())) continue;
    if (!judge) throw new Error("preserved reviewed paraphrase requires current-source meaning verification");
    if (maxCostUsd !== undefined && !(cost < maxCostUsd)) throw new Error("preserved claim verification budget unavailable");
    const input = [{ id: claim._id, kind: "preserved-claim", note: claim.text, sources: evidence.map(item => ({
      turnId: item.turnId, speakerRef: turns.find(turn => turn._id === item.turnId)!.speakerRef,
      text: turns.find(turn => turn._id === item.turnId)!.text,
    })) }];
    if (JSON.stringify(input).length > 16000) throw new Error("preserved claim verification context exceeds budget");
    const result = await judge(input);
    if (maxCostUsd !== undefined) {
      if (typeof result.costUsd !== "number" || !Number.isFinite(result.costUsd) || result.costUsd < 0) throw new Error("preserved claim verification cost unavailable");
      cost += result.costUsd;
      if (cost > maxCostUsd) throw new Error("preserved claim verification budget exceeded");
    }
    if (result.verdicts.length !== 1 || result.verdicts[0]?.id !== claim._id || result.verdicts[0].verdict !== "same") {
      throw new Error("preserved reviewed claim is not supported by its current source");
    }
  }
}
