import { createHash } from "node:crypto";
import type { AskV2Result, NativeSourceQuote } from "@lkb/ask";
import type { Turns } from "@lkb/core";
import type { Db } from "mongodb";
import { assertValidTenantId } from "../../../../packages/db/src/lib/tenantScope.js";
import type { EvidenceBinding, VerifyEvidence } from "./answer-records.js";
import { readEffectiveTurns } from "../transcript-review/effective-reader.js";
import { parseNativeSourceLocator, type NativeEvidenceResolver } from "../native-evidence/resolver.js";
import { verifyNativeSourceQuotes } from "./native-evidence.js";

function ordered(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(ordered);
  if (value && typeof value === "object") return Object.fromEntries(Object.entries(value).sort(([a], [b]) => a < b ? -1 : a > b ? 1 : 0).map(([key, item]) => [key, ordered(item)]));
  return value;
}
/** Hash the JSON value, independent of BSON/provider property order and optional undefined fields. */
export const digest = (value: unknown): string => createHash("sha256").update(JSON.stringify(ordered(JSON.parse(JSON.stringify(value) ?? "null")))).digest("hex");
export function answerEvidence(result: AskV2Result): EvidenceBinding[] {
  return [...result.sources.internal.map((source) => {
    const quotes = source.evidence?.sourceQuotes;
    const excerpt = Array.isArray(quotes) ? quotes.map((q: { quote?: unknown }) => typeof q?.quote === "string" ? q.quote : "").join("\n") : "";
    return { id: `internal:${source.node_id}`, origin: "internal" as const, fingerprint: digest(source), source: { ...structuredClone(source) }, excerpt };
  }), ...result.sources.web.map((source, index) => {
    const excerpt = [source.content, source.snippet, source.text].filter((v): v is string => typeof v === "string").join("\n");
    return { id: `web:${index}:${digest(source.url).slice(0, 16)}`, origin: "web" as const, fingerprint: digest(source), source: structuredClone(source), excerpt };
  })];
}

/** Review freshness requires canonical turn bytes; cached source summaries cannot authorize release.
 * Web-only freshness needs the trusted provider verifier supplied by composition, so default refuses it.
 */
export function createMongoEvidenceVerifier(db: Db, web?: VerifyEvidence,
  eligibleTurn?: (tenantId: string, sessionId: string, turnId: string, quote: string) => Promise<boolean>,
  nativeResolver?: NativeEvidenceResolver): VerifyEvidence {
  return async (tenantId, bindings) => {
    assertValidTenantId(tenantId, "answerEvidenceVerifier");
    if (!bindings.length) return false;
    for (const binding of bindings) {
      if (binding.fingerprint !== digest(binding.source) || !binding.excerpt.trim()) return false;
      if (binding.origin === "web") {
        if (!web || !(await web(tenantId, [binding]))) return false;
        continue;
      }
      const evidence = binding.source.evidence as Record<string, unknown> | undefined;
      if (!evidence || typeof evidence !== "object" || Array.isArray(evidence) || !Array.isArray(evidence.sourceQuotes) || !evidence.sourceQuotes.length) return false;
      const native = "sourceId" in evidence || "revisionHash" in evidence || evidence.sourceQuotes.some(q => q && typeof q === "object"
        && ("sourceLocator" in q || q.origin === "document-page" || q.origin === "message"));
      if (native) {
        if (!nativeResolver || "sessionRef" in evidence || typeof evidence.sourceId !== "string" || typeof evidence.revisionHash !== "string") return false;
        const quotes: NativeSourceQuote[] = [], ids = new Set<string>();
        for (const q of evidence.sourceQuotes) {
          if (!q || typeof q !== "object" || Array.isArray(q) || Object.keys(q).length !== 5
            || Object.keys(q).some(key => !["id", "nodeId", "quote", "origin", "sourceLocator"].includes(key))
            || typeof q.id !== "string" || !q.id.trim() || ids.has(q.id) || q.nodeId !== binding.source.node_id
            || typeof q.nodeId !== "string" || !q.nodeId.trim() || typeof q.quote !== "string" || !q.quote.trim()) return false;
          const locator = parseNativeSourceLocator(q.sourceLocator);
          if (!locator || q.origin !== locator.kind || locator.sourceId !== evidence.sourceId || locator.revisionHash !== evidence.revisionHash) return false;
          ids.add(q.id);
          quotes.push({ id: q.id, nodeId: q.nodeId, quote: q.quote, origin: locator.kind, sourceLocator: locator });
        }
        if (binding.excerpt !== quotes.map(q => q.quote).join("\n") || !(await verifyNativeSourceQuotes(tenantId, quotes, nativeResolver))) return false;
        continue;
      }
      if (typeof evidence.sessionRef !== "string") return false;
      const session = await db.collection("sessions").findOne({ tenantId, _id: evidence.sessionRef as never });
      if (!session) return false;
      const source = typeof session.sourceId === "string" ? await db.collection("sources").findOne({ tenantId, _id: session.sourceId as never }) : null;
      if (!source || ((source.kind === "whatsapp-batch" || source.kind === "whatsapp") && !eligibleTurn)) return false;
      for (const q of evidence.sourceQuotes as Record<string, unknown>[]) {
        if (typeof q.turnId !== "string" || q.sessionRef !== evidence.sessionRef || typeof q.quote !== "string"
          || !q.quote.trim() || q.nodeId !== binding.source.node_id || !Number.isSafeInteger(q.charStart) || !Number.isSafeInteger(q.charEnd)
          || (q.charStart as number) < 0 || (q.charEnd as number) < (q.charStart as number)) return false;
        const rawTurn = await db.collection<Turns>("turns").findOne({ tenantId, sessionId: evidence.sessionRef, _id: q.turnId });
        if (!rawTurn) return false;
        // Citations and review freshness use the same committed transcript overlay as
        // retrieval. A failed overlay lookup must never fall back to obsolete originals.
        const [turn] = await readEffectiveTurns(db, tenantId, [rawTurn], evidence.sessionRef);
        if (!turn || typeof turn.text !== "string" || turn.speakerRef !== q.speakerRef || turn.tStart !== q.tStart || turn.tEnd !== q.tEnd
          || createHash("sha256").update(turn.text).digest("hex") !== q.turnTextSHA256
          || (q.charEnd as number) > turn.text.length || turn.text.slice(q.charStart as number, q.charEnd as number) !== q.quote
          || createHash("sha256").update(q.quote).digest("hex") !== q.sliceSHA256
          || Buffer.byteLength(turn.text.slice(0, q.charStart as number), "utf8") !== q.byteStart
          || Buffer.byteLength(turn.text.slice(0, q.charEnd as number), "utf8") !== q.byteEnd) return false;
        const origin = turn.speakerRef === "screen"
          ? turn.text.startsWith("[Screen OCR; unverified]") ? "screen-ocr-unverified"
            : turn.text.startsWith("[Visual observation; unverified]") ? "visual-observation-unverified" : null
          : "speech";
        if (!origin || origin !== q.origin) return false;
        if (eligibleTurn && !(await eligibleTurn(tenantId, evidence.sessionRef, q.turnId, q.quote))) return false;
      }
    }
    return true;
  };
}

/** Why a just-produced answer's evidence did not verify, split by origin so the reason names the real cause (never a generic wipe). */
export async function whyUnverified(tenantId: string, bindings: EvidenceBinding[], verify: VerifyEvidence): Promise<string> {
  const internal = bindings.filter((b) => b.origin === "internal"), web = bindings.filter((b) => b.origin === "web");
  if (!bindings.length) return "No supporting source was retrieved or cited, so there is nothing to verify.";
  if (internal.length && !(await verify(tenantId, internal)))
    return "Internal source evidence changed, was withdrawn, or no longer matches the stored transcript turn; sources withheld.";
  if (web.length && !(await verify(tenantId, web)))
    return "Web evidence cannot be verified by this deployment (no web verifier is configured); web sources withheld.";
  return "The effective answer policy changed while this answer was produced; ask again.";
}
