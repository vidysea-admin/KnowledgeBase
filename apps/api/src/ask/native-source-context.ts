/** Native passage hydration composes the shared authority resolver; retrieval never supplies text. */
import { createHash } from "node:crypto";
import type { TreeIndexNode, NativeSourceLocator } from "@lkb/core";
import { BoundedAskError, payloadBytes, SOURCE_LIMITS, type HydrateSourcesFn } from "@lkb/ask";
import type { NativeSourceQuote } from "../../../../packages/ask/src/source-context.js";
import type { NativeEvidenceResolver, ResolvedNativeEvidence } from "../native-evidence/resolver.js";
import { passageLexicalScorer } from "./passage-lexical.js";

export interface NativeSourceIdentity { sourceId: string; revisionHash: string }
/** The production publisher must enumerate bounded, tenant-authorized current passage locators. */
export type ListNativeLocators = (tenantId: string, source: NativeSourceIdentity) => Promise<readonly NativeSourceLocator[]>;
/** `externalEligible` is the W11/R-32 gate (a WhatsApp source not studentData "no", or unresolvable, is false). Required, so no caller can forget it. */
export interface NativeHydratorDeps { resolver: NativeEvidenceResolver; listLocators: ListNativeLocators; externalEligible: (tenantId: string, sourceId: string) => Promise<boolean> }
const sha = (value: string) => createHash("sha256").update(value, "utf8").digest("hex");

export function createNativeSourceHydrator(tenantId: string, deps: NativeHydratorDeps): HydrateSourcesFn {
  return async (query, admitted) => {
    if (admitted.length > SOURCE_LIMITS.candidates) throw new BoundedAskError("native source admission exceeds budget");
    const seen = new Set<string>();
    const inventory: { node: TreeIndexNode; identity: NativeSourceIdentity; resolved: ResolvedNativeEvidence[] }[] = [];
    for (const node of admitted) {
      const sourceId = node.evidence?.sourceId, revisionHash = node.evidence?.revisionHash;
      if (typeof sourceId !== "string" || !sourceId.trim() || typeof revisionHash !== "string" || !revisionHash.trim()
        || seen.has(node.node_id)) throw new BoundedAskError("ambiguous native source identity");
      seen.add(node.node_id);
      if (!await deps.externalEligible(tenantId, sourceId)) throw new BoundedAskError("native source is unavailable for external-model use");
      const identity = { sourceId, revisionHash };
      const exact = node.evidence?.sourceLocator;
      const locators = exact === undefined ? await deps.listLocators(tenantId, identity) : [exact as NativeSourceLocator];
      if (!Array.isArray(locators) || payloadBytes(locators) > SOURCE_LIMITS.catalogBytes)
        throw new BoundedAskError("native passage inventory exceeds budget");
      if (!locators.length) throw new BoundedAskError("native source has no current passages");
      const resolved: ResolvedNativeEvidence[] = [];
      const locatorIds = new Set<string>();
      for (const locator of locators) {
        // Scope binding is independent of authority: the shared resolver validates every native locator.
        if (!locator || locator.sourceId !== sourceId || locator.revisionHash !== revisionHash)
          throw new BoundedAskError("native passage is outside admitted source");
        const key = JSON.stringify(locator);
        if (locatorIds.has(key)) throw new BoundedAskError("duplicate native passage identity");
        locatorIds.add(key);
        const current = await deps.resolver.resolve(tenantId, structuredClone(locator));
        if (!current) throw new BoundedAskError("native source changed or is unavailable");
        resolved.push(structuredClone(current));
        if (payloadBytes(resolved) > SOURCE_LIMITS.contextBytes) throw new BoundedAskError("native source passages exceed budget");
      }
      inventory.push({ node, identity, resolved });
    }
    const bytes = JSON.stringify(inventory.map(({ identity, resolved }) => ({ ...identity, resolved })));
    if (Buffer.byteLength(bytes, "utf8") > SOURCE_LIMITS.contextBytes) throw new BoundedAskError("native source snapshot exceeds budget");
    const snapshotSHA256 = sha(bytes), nodes: TreeIndexNode[] = [];
    for (const { node, identity, resolved } of inventory) {
      const score = passageLexicalScorer(query, resolved.map(item => ({ text: item.quote })));
      const ranked = resolved.map((item, order) => ({ item, order, score: score(item.quote).textContribution }))
        .filter(item => item.score > 0).sort((a, b) => b.score - a.score || a.order - b.order);
      const selected: NativeSourceQuote[] = [];
      for (const { item } of ranked.slice(0, 2)) {
        const q: NativeSourceQuote = { id: "native-quote-" + sha(JSON.stringify([node.node_id, item.sourceLocator, item.quote])).slice(0, 24),
          nodeId: node.node_id, quote: item.quote, origin: item.sourceLocator.kind, sourceLocator: item.sourceLocator };
        if (payloadBytes([...selected, q]) <= 3500) selected.push(q);
      }
      if (selected.length) nodes.push({ ...node, children: [], summary: JSON.stringify(selected),
        evidence: { ...identity, sourceQuotes: selected, sourceSnapshotSHA256: snapshotSHA256, sourceMode: "exact-native-passages" } });
    }
    return { nodes, snapshotSHA256, sourceBytes: Buffer.byteLength(bytes, "utf8") };
  };
}
