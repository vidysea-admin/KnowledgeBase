/**
 * Synthetic webinar-session fixture for the t043 Ask citation proof. All text is invented for
 * this test; nothing here is copied from real transcripts. Tenant A owns three sessions, tenant B
 * owns one session carrying a near-identical, HIGHER-scoring passage (the bait).
 */
import { createHash } from "node:crypto";
import type { TreeIndexNode } from "@lkb/core";
import type { SourceQuote, SourceHydration } from "./source-context.js";

export interface FixtureTurn { turnId: string; speakerRef: string; tStart: number; tEnd: number; text: string }

const sha = (s: string): string => createHash("sha256").update(s, "utf8").digest("hex");

export function quoteFor(nodeId: string, sessionRef: string, t: FixtureTurn): SourceQuote {
  return {
    id: `${sessionRef}:${t.turnId}:q0`, nodeId, sessionRef, turnId: t.turnId, speakerRef: t.speakerRef,
    tStart: t.tStart, tEnd: t.tEnd, charStart: 0, charEnd: t.text.length, byteStart: 0,
    byteEnd: Buffer.byteLength(t.text, "utf8"), turnTextSHA256: sha(t.text), sliceSHA256: sha(t.text),
    quote: t.text, origin: "speech",
  };
}

export interface FixtureSession { nodeId: string; sessionRef: string; title: string; turns: FixtureTurn[] }

export const A_TENANT = "tA";
export const B_TENANT = "tB";

export const A_SESSIONS: FixtureSession[] = [
  { nodeId: "tenant:tA/session:wb-a-001", sessionRef: "wb-a-001", title: "Webinar 1 onboarding basics", turns: [
    { turnId: "wb-a-001-t1", speakerRef: "Host", tStart: 0, tEnd: 14.2, text: "Welcome everyone to the onboarding basics session." },
    { turnId: "wb-a-001-t2", speakerRef: "Host", tStart: 14.2, tEnd: 31, text: "Our Europe office hours start at nine." },
  ] },
  { nodeId: "tenant:tA/session:wb-a-002", sessionRef: "wb-a-002", title: "Webinar 2 expansion planning", turns: [
    { turnId: "wb-a-002-t7", speakerRef: "Host", tStart: 301, tEnd: 312.5, text: "Let us talk about the next regions." },
    { turnId: "wb-a-002-t8", speakerRef: "Priya", tStart: 312.5, tEnd: 341, text: "The countries I suggested for Europe are Germany, Poland and Portugal as first markets." },
    { turnId: "wb-a-002-t9", speakerRef: "Host", tStart: 341, tEnd: 350.25, text: "Thanks, noted." },
  ] },
  { nodeId: "tenant:tA/session:wb-a-003", sessionRef: "wb-a-003", title: "Webinar 3 pricing", turns: [
    { turnId: "wb-a-003-t3", speakerRef: "Arjun", tStart: 95.5, tEnd: 120, text: "The pricing model we settled on is a flat annual subscription with seat bands." },
  ] },
];

/** Same shape of passage, but repeats the query terms so any lexical scorer ranks it higher. */
export const B_SESSION: FixtureSession = {
  nodeId: "tenant:tB/session:wb-b-001", sessionRef: "wb-b-001", title: "Webinar B expansion", turns: [
    { turnId: "wb-b-001-t1", speakerRef: "Mira", tStart: 40, tEnd: 66,
      text: "Which countries were suggested for Europe? The countries suggested for Europe are France, Spain and Italy; suggested countries for Europe again." },
  ],
};

export const B_MARKERS = ["tenant:tB", "wb-b-001", "France", "Spain", "Italy", "Mira"];

export const quotesOf = (s: FixtureSession): SourceQuote[] => s.turns.map((t) => quoteFor(s.nodeId, s.sessionRef, t));

const sessionNode = (s: FixtureSession): TreeIndexNode => ({
  node_id: s.nodeId, title: s.title, level: "session", summary: "Transcript source.", children: [],
  evidence: { sessionRef: s.sessionRef },
} as TreeIndexNode);

export function treeFor(tenant: string, sessions: FixtureSession[]): TreeIndexNode {
  return { node_id: `tenant:${tenant}`, title: tenant, level: "tenant", summary: "Tenant root.",
    children: sessions.map(sessionNode) } as TreeIndexNode;
}

export const SNAPSHOT = "a".repeat(64);

/** Hydrator over a quote store keyed by node_id (what a tenant-scoped DB read would return). */
export function hydratorOver(store: Map<string, SourceQuote[]>, seen?: string[][]) {
  return async (_q: string, nodes: TreeIndexNode[]): Promise<SourceHydration> => {
    seen?.push(nodes.map((n) => n.node_id));
    const out: TreeIndexNode[] = nodes.filter((n) => store.has(n.node_id)).map((n) => {
      const quotes = store.get(n.node_id)!;
      return { ...n, summary: JSON.stringify(quotes),
        evidence: { ...n.evidence, sourceQuotes: quotes, sourceSnapshotSHA256: SNAPSHOT } } as TreeIndexNode;
    });
    return { nodes: out, snapshotSHA256: SNAPSHOT, sourceBytes: 1 };
  };
}
