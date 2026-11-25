import { createHash } from "node:crypto";
import type { AskV2Result, NativeSourceQuote } from "@lkb/ask";
import type { Turns } from "@lkb/core";
import type { Db } from "mongodb";
import { createGuardedFetcher, httpRequest, resolveAll } from "@lkb/ingest";
import { assertValidTenantId } from "../../../../packages/db/src/lib/tenantScope.js";
import type { EvidenceBinding, VerifyEvidence } from "./answer-records.js";
import { readEffectiveTurns } from "../transcript-review/effective-reader.js";
import { parseNativeSourceLocator, type NativeEvidenceResolver } from "../native-evidence/resolver.js";
import { verifyNativeSourceQuotes } from "./native-evidence.js";
import { passageLexicalScorer, slices } from "../ask/passage-lexical.js";
import { publisherBlocks, publisherUrl } from "./publisher/publisher-html.js";

function ordered(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(ordered);
  if (value && typeof value === "object") return Object.fromEntries(Object.entries(value).sort(([a], [b]) => a < b ? -1 : a > b ? 1 : 0).map(([key, item]) => [key, ordered(item)]));
  return value;
}
/** Hash the JSON value, independent of BSON/provider property order and optional undefined fields. */
export const digest = (value: unknown): string => createHash("sha256").update(JSON.stringify(ordered(JSON.parse(JSON.stringify(value) ?? "null")))).digest("hex");

const MAX_BODY = 512 * 1024, MAX_TITLE = 240, MAX_EXCERPT = 1024;
const MAX_WEB_BINDINGS = 8, MAX_CANDIDATES = 256;
const MAX_PUBLISHER_BYTES = 2 * 1024 * 1024;
const UNSAFE_TEXT = /[\u0000-\u0008\u000b\u000e-\u001f\u007f\ufffd\u202a-\u202e\u2066-\u2069]/u;
type PublisherSource = { url: string; title: string; content: string };
type PublisherPage = { url: string; title: string; excerpts: string[] };

/** One process-wide reader in production. Tests substitute only DNS and the pinned transport. */
export function createPublisherEvidenceReader(deps: {
  resolve?: typeof resolveAll; request?: typeof httpRequest; now?: () => number; timeoutMs?: number;
  maxBytes?: number; concurrency?: number; capacity?: number;
} = {}) {
  const resolve = deps.resolve ?? resolveAll, request = deps.request ?? httpRequest;
  // One deadline covers the document, its linked stylesheets, redirects and parsing.
  const now = deps.now ?? (() => performance.now()), timeoutMs = deps.timeoutMs ?? 10_000;
  const concurrency = deps.concurrency ?? 24, capacity = deps.capacity ?? 512;
  const maxBytes = deps.maxBytes ?? MAX_PUBLISHER_BYTES;
  if (!Number.isSafeInteger(maxBytes) || maxBytes <= 0) throw new Error("Invalid publisher byte budget");
  const pending = new Map<string, Promise<PublisherPage | null>>();
  const queue: (() => void)[] = [];
  let active = 0;
  async function guardedRead(url: string, queueDeadline: number): Promise<PublisherPage | null> {
    const deadline = Math.min(now() + timeoutMs, queueDeadline);
    const remaining = () => {
      const left = Math.floor(deadline - now());
      if (left < 1) throw new Error("Publisher deadline reached");
      return left;
    };
    let bytesLeft = maxBytes;
    async function readResource(initialUrl: string) {
      let finalUrl = initialUrl;
      const read = createGuardedFetcher({
        maxBytes: Math.min(MAX_BODY, bytesLeft), maxRedirects: 3, timeoutMs: remaining(),
        lookup: hostname => {
          if (bytesLeft < 1) throw new Error("Publisher byte budget exhausted");
          return resolve(hostname, { timeoutMs: remaining() });
        },
        request: async (hop, options) => {
          const vetted = publisherUrl(hop);
          if (!vetted) throw new Error("Unsafe publisher URL");
          const limit = Math.min(options.maxBytes, bytesLeft);
          const response = await request(vetted, { ...options, maxBytes: limit, timeoutMs: remaining() });
          remaining();
          const size = Buffer.byteLength(response.body);
          if (size > limit || UNSAFE_TEXT.test(response.body)) throw new Error("Invalid publisher response body");
          bytesLeft -= size;
          if (response.status >= 300 && response.status < 400) {
            const location = response.location && publisherUrl(response.location, vetted);
            if (!location) throw new Error("Unsafe publisher redirect");
            return { ...response, location };
          }
          if (response.status !== 200) throw new Error("Publisher unavailable");
          finalUrl = vetted;
          return response;
        },
      });
      return { body: await read(initialUrl), url: finalUrl };
    }
    const page = await readResource(url);
    const { title, blocks } = await publisherBlocks(page.body, page.url, readResource, remaining);
    const excerpts = blocks.flatMap(block => slices(block).map(({ charStart, charEnd }) => block.slice(charStart, charEnd).trim()))
      .filter(text => text.length >= 16 && /\s/u.test(text)).slice(0, MAX_CANDIDATES);
    remaining();
    return title && excerpts.length ? { url: page.url, title: Array.from(title).slice(0, MAX_TITLE).join(""), excerpts } : null;
  }
  function load(url: string): Promise<PublisherPage | null> {
    const existing = pending.get(url);
    if (existing) return existing;
    if (pending.size >= capacity) return Promise.resolve(null);
    // A history response can request 100 runs at once. Queue distinct URLs with a finite
    // wait, and release the slot before waking callers so a later check performs a fresh read.
    const queueDeadline = now() + timeoutMs * 2;
    const task = new Promise<PublisherPage | null>(finish => {
      const start = () => {
        clearTimeout(wait);
        active++;
        void guardedRead(url, queueDeadline).catch(() => null).then(page => {
          pending.delete(url);
          active--;
          queue.shift()?.();
          finish(page);
        });
      };
      const wait = setTimeout(() => {
        queue.splice(queue.indexOf(start), 1);
        pending.delete(url);
        finish(null);
      }, timeoutMs);
      if (active < concurrency) start();
      else queue.push(start);
    });
    pending.set(url, task);
    return task;
  }
  const verify: VerifyEvidence = async (tenantId, bindings) => {
    assertValidTenantId(tenantId, "publisherEvidenceVerifier");
    if (!bindings.length || bindings.length > MAX_WEB_BINDINGS) return false;
    const sources: PublisherSource[] = [];
    for (const { origin, source, excerpt, fingerprint } of bindings) {
      if (origin !== "web" || !source || typeof source !== "object" || Array.isArray(source)) return false;
      const { url, title, content } = source;
      if (Object.keys(source).length !== 3 || typeof url !== "string" || publisherUrl(url) !== url
        || typeof title !== "string" || !title || title.length > MAX_TITLE * 2
        || typeof content !== "string" || !content || Buffer.byteLength(content) > MAX_EXCERPT
        || excerpt !== content || fingerprint !== digest(source)) return false;
      sources.push({ url, title, content });
    }
    const matches = await Promise.all(sources.map(async ({ url, title, content }) => {
      const page = await load(url);
      return page?.url === url && page.title === title && page.excerpts.includes(content);
    }));
    return matches.every(Boolean);
  };
  return {
    async resolve(query: string, url: string): Promise<PublisherSource | null> {
      const canonical = publisherUrl(url);
      if (!canonical || !query.trim() || query.length > 4096) return null;
      const page = await load(canonical);
      if (!page) return null;
      const score = passageLexicalScorer(query, page.excerpts.map(text => ({ text })));
      let content = "", best = 0;
      for (const excerpt of page.excerpts) {
        const relevance = score(excerpt).textContribution;
        if (relevance > best) { best = relevance; content = excerpt; }
      }
      return content ? { url: page.url, title: page.title, content } : null;
    },
    verify,
  };
}

const publisherEvidence = createPublisherEvidenceReader();
export const resolvePublisherSource = publisherEvidence.resolve;
export const verifyPublisherEvidence: VerifyEvidence = publisherEvidence.verify;

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
    const webBindings: EvidenceBinding[] = [];
    for (const binding of bindings) {
      if (binding.fingerprint !== digest(binding.source) || !binding.excerpt.trim()) return false;
      if (binding.origin === "web") {
        if (!web) return false;
        webBindings.push(binding);
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
    return !webBindings.length || (web !== undefined && await web(tenantId, webBindings));
  };
}

/** Why a just-produced answer's evidence did not verify, split by origin so the reason names the real cause (never a generic wipe). */
export async function whyUnverified(tenantId: string, bindings: EvidenceBinding[], verify: VerifyEvidence): Promise<string> {
  const internal = bindings.filter((b) => b.origin === "internal"), web = bindings.filter((b) => b.origin === "web");
  if (!bindings.length) return "No supporting source was retrieved or cited, so there is nothing to verify.";
  if (internal.length && !(await verify(tenantId, internal)))
    return "Internal source evidence changed, was withdrawn, or no longer matches the stored transcript turn; sources withheld.";
  if (web.length && !(await verify(tenantId, web)))
    return "Publisher evidence changed or could not be verified; web sources withheld.";
  return "The effective answer policy changed while this answer was produced; ask again.";
}
