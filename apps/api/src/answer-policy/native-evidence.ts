/** Release-time native checks use the same current-head authority as source hydration and navigation. */
import type { TreeIndexNode } from "@lkb/core";
import { BoundedAskError } from "@lkb/ask";
import { isNativeSourceQuote, sourceQuotes, type NativeSourceQuote } from "../../../../packages/ask/src/source-context.js";
import type { NativeEvidenceResolver } from "../native-evidence/resolver.js";

export async function verifyNativeSourceQuotes(tenantId: string, quotes: readonly NativeSourceQuote[], resolver: NativeEvidenceResolver): Promise<boolean> {
  if (!quotes.length) return false;
  for (const quote of quotes) {
    if (!quote || quote.origin !== quote.sourceLocator?.kind || !quote.quote?.trim()) return false;
    // The resolver re-reads the authoritative head/eligibility; existence of an old revision cannot release an answer.
    const current = await resolver.revalidate(tenantId, { sourceLocator: structuredClone(quote.sourceLocator), quote: quote.quote });
    if (!current || current.quote !== quote.quote) return false;
  }
  return true;
}

/** Request-local graph hook: reload selected native authority before generation and after grounding. */
export function createNativeSourceRevalidator(tenantId: string, resolver: NativeEvidenceResolver): (nodes: TreeIndexNode[]) => Promise<void> {
  return async nodes => {
    for (const node of nodes) {
      const native = sourceQuotes(node).filter(isNativeSourceQuote);
      if (!native.length) continue;
      if (native.some(quote => quote.nodeId !== node.node_id || quote.sourceLocator.sourceId !== node.evidence?.sourceId
        || quote.sourceLocator.revisionHash !== node.evidence?.revisionHash)
        || !(await verifyNativeSourceQuotes(tenantId, native, resolver))) {
        throw new BoundedAskError("native source changed before answer release");
      }
    }
  };
}
