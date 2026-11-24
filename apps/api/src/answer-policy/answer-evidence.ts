import { createHash } from "node:crypto";
import type { AskV2Result, NativeSourceQuote } from "@lkb/ask";
import type { Turns } from "@lkb/core";
import type { Db } from "mongodb";
import { createGuardedFetcher, httpRequest, resolveAll } from "@lkb/ingest";
import { parse, type DefaultTreeAdapterTypes } from "parse5";
import { parse as parseCss, type Declaration } from "postcss";
import { assertValidTenantId } from "../../../../packages/db/src/lib/tenantScope.js";
import type { EvidenceBinding, VerifyEvidence } from "./answer-records.js";
import { readEffectiveTurns } from "../transcript-review/effective-reader.js";
import { parseNativeSourceLocator, type NativeEvidenceResolver } from "../native-evidence/resolver.js";
import { verifyNativeSourceQuotes } from "./native-evidence.js";
import { passageLexicalScorer, slices } from "../ask/passage-lexical.js";

function ordered(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(ordered);
  if (value && typeof value === "object") return Object.fromEntries(Object.entries(value).sort(([a], [b]) => a < b ? -1 : a > b ? 1 : 0).map(([key, item]) => [key, ordered(item)]));
  return value;
}
/** Hash the JSON value, independent of BSON/provider property order and optional undefined fields. */
export const digest = (value: unknown): string => createHash("sha256").update(JSON.stringify(ordered(JSON.parse(JSON.stringify(value) ?? "null")))).digest("hex");

const MAX_URL = 2048, MAX_BODY = 512 * 1024, MAX_TITLE = 240, MAX_EXCERPT = 1024;
const MAX_WEB_BINDINGS = 8, MAX_CANDIDATES = 256;
const clean = (text: string) => text.replace(/\s+/gu, " ").trim();
const UNSAFE_TEXT = /[\u0000-\u0008\u000b\u000e-\u001f\u007f\ufffd\u202a-\u202e\u2066-\u2069]/u;
type PublisherSource = { url: string; title: string; content: string };
type PublisherPage = { url: string; title: string; excerpts: string[] };
type HtmlNode = DefaultTreeAdapterTypes.Node;
type HtmlElement = DefaultTreeAdapterTypes.Element;
const isElement = (node: HtmlNode): node is HtmlElement => "tagName" in node;
const children = (node: HtmlNode) => "childNodes" in node ? node.childNodes : [];
const attr = (node: HtmlElement, name: string) => node.attrs.find(a => a.name === name)?.value;
const rawText = (node: HtmlNode) => children(node).map(child => "value" in child ? child.value : "").join("");
const OMIT = new Set("aside audio button canvas details dialog footer form header iframe math menu nav noscript object script select style svg template textarea video".split(" "));
const BLOCK = new Set("address article blockquote br caption dd div dl dt figcaption figure h1 h2 h3 h4 h5 h6 hr li main ol p pre section table td th tr ul".split(" "));

function publisherUrl(value: string, base?: string): string | null {
  if (!value || value.length > MAX_URL || /[\s\\]/u.test(value) || /^(?:https:)?\/\/[^/?#]*@/i.test(value)) return null;
  const url = URL.parse(value, base);
  if (!url || url.protocol !== "https:" || url.username || url.password || url.port) return null;
  url.hash = "";
  return url.href.length <= MAX_URL ? url.href : null;
}

function conceals(decl: Declaration): boolean {
  const prop = decl.prop.toLowerCase(), value = decl.value.replace(/\/\*[\s\S]*?\*\//g, "").trim().toLowerCase();
  if (prop.includes("\\")) return true;
  if (/^(?:-webkit-)?animation(?:-name)?$/.test(prop)) return value !== "none";
  if (prop === "display") return !/^(?:block|inline(?:-block|-flex|-grid|-table)?|contents|flex|flow-root|grid|list-item|table(?:-[a-z-]+)?)$/.test(value);
  if (prop === "visibility" || prop === "content-visibility") return !/^(?:visible|initial)$/.test(value);
  if (prop === "opacity") return !/^(?:0?\.\d*[1-9]\d*|1(?:\.0+)?)$/.test(value);
  return false;
}

/** Over-exclude on conditional rules, overrides and combinators. Unknown hiding selectors refuse the page. */
function hidingSelectors(styles: Iterable<string>): ((element: HtmlElement) => boolean)[] {
  const hidden: ((element: HtmlElement) => boolean)[] = [];
  const compound = "(?:[a-zA-Z][\\w-]*|\\*)?(?:[.#][\\w-]+)*";
  const supported = new RegExp("^(?=.)" + compound + "(?:(?:\\s+|\\s*>\\s*)" + compound + ")*$");
  for (const style of styles) {
    const css = parseCss(style);
    css.walkAtRules(/^import$/i, () => { throw new Error("Publisher stylesheet cannot be checked"); });
    const rules = new Set<string>();
    css.walkDecls(decl => {
      if (!conceals(decl)) return;
      for (let parent = decl.parent; parent && parent.type !== "root"; parent = parent.parent) {
        // Keyframes have no DOM selector. Elements that apply an animation are omitted above.
        if (parent.type === "atrule" && /^(?:-webkit-)?keyframes$/i.test(parent.name)) return;
        if (parent.type === "atrule" && !/^(?:media|supports|layer|container|scope)$/i.test(parent.name)) {
          throw new Error("Unsupported publisher hiding rule");
        }
      }
      if (decl.parent?.type !== "rule") throw new Error("Unsupported publisher hiding declaration");
      for (const selector of decl.parent.selectors) rules.add(selector);
    });
    for (const selector of rules) {
      if (hidden.length >= 96 || selector.length > 200) throw new Error("Publisher hiding selector exceeds bounds");
      // The HTML hidden attribute and its entire subtree are already removed by visible().
      if (!selector.includes("\\") && /\[hidden\]$/i.test(selector.trim())) continue;
      // Dropping a simple negation matches a superset and hides every affected subtree.
      const wider = selector.replace(/:not\([.#][\w-]+\)/gi, "");
      if (!supported.test(wider)) throw new Error("Unsupported publisher hiding selector");
      const parts = wider.trim().split(/[\s>]+/u).at(-1)?.match(/[.#]?[\w-]+|\*/g);
      if (!parts?.length) throw new Error("Missing publisher hiding selector");
      hidden.push(element => parts.every(part => {
        if (part[0] === ".") return (attr(element, "class") ?? "").split(/[\t\n\f\r ]+/).includes(part.slice(1));
        if (part[0] === "#") return attr(element, "id") === part.slice(1);
        return part === "*" || part.toLowerCase() === element.tagName;
      }));
    }
  }
  return hidden;
}

function publisherBlocks(body: string): { title: string; blocks: string[] } {
  if (!/<(?:[a-z][\w:-]*[\s/>]|!|\/[a-z]|\?)/i.test(body)) {
    const blocks = body.split(/\r?\n/u).map(clean).filter(Boolean);
    return { title: blocks[0] ?? "", blocks };
  }
  const html = children(parse(body)).find(isElement);
  const head = html?.childNodes.find(node => isElement(node) && node.tagName === "head");
  const content = html?.childNodes.find(node => isElement(node) && node.tagName === "body");
  const titleNode = head && children(head).find(node => isElement(node) && node.tagName === "title");
  const styles: string[] = [], blocks: string[] = [], mainBlocks: string[] = [];
  let nodes = 0, pending = "";
  function collectStyles(node: HtmlNode, depth: number) {
    if (++nodes > 8000 || depth > 80) throw new Error("Publisher document too complex");
    if (isElement(node) && node.tagName === "style") styles.push(rawText(node));
    for (const child of children(node)) collectStyles(child, depth + 1);
  }
  if (html) collectStyles(html, 0);
  const hidden = hidingSelectors(styles);
  const flush = (inMain: boolean) => {
    const block = clean(pending);
    if (block) (inMain ? mainBlocks : blocks).push(block);
    pending = "";
  };
  function visible(node: HtmlNode, inMain: boolean) {
    if ("value" in node) { pending += node.value; return; }
    if (!isElement(node)) return;
    const style = attr(node, "style");
    if (OMIT.has(node.tagName) || attr(node, "hidden") !== undefined || attr(node, "inert") !== undefined
      || attr(node, "aria-hidden")?.trim().toLowerCase() === "true" || /^(?:navigation|banner|contentinfo|complementary)$/i.test(attr(node, "role") ?? "")
      || hidden.some(matches => matches(node))
      || (style && parseCss(style).nodes.some(item => item.type !== "comment" && (item.type !== "decl" || conceals(item))))) {
      flush(inMain);
      return;
    }
    const useMain = inMain || node.tagName === "main" || node.tagName === "article" || attr(node, "role") === "main";
    const block = BLOCK.has(node.tagName) || useMain !== inMain;
    if (block) flush(inMain);
    for (const child of node.childNodes) visible(child, useMain);
    if (block) flush(useMain);
  }
  if (content) visible(content, false);
  flush(false);
  const passages = mainBlocks.length ? mainBlocks : blocks;
  return { title: (titleNode ? clean(rawText(titleNode)) : "") || passages[0] || "", blocks: passages };
}

/** One process-wide reader in production. Tests substitute only DNS and the pinned transport. */
export function createPublisherEvidenceReader(deps: {
  resolve?: typeof resolveAll; request?: typeof httpRequest; now?: () => number; timeoutMs?: number;
  concurrency?: number; capacity?: number;
} = {}) {
  const resolve = deps.resolve ?? resolveAll, request = deps.request ?? httpRequest;
  const now = deps.now ?? (() => performance.now()), timeoutMs = deps.timeoutMs ?? 3000;
  const concurrency = deps.concurrency ?? 24, capacity = deps.capacity ?? 512;
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
    let finalUrl = url;
    const read = createGuardedFetcher({
      maxBytes: MAX_BODY, maxRedirects: 3, timeoutMs,
      lookup: hostname => resolve(hostname, { timeoutMs: remaining() }),
      request: async (hop, options) => {
        const vetted = publisherUrl(hop);
        if (!vetted) throw new Error("Unsafe publisher URL");
        const response = await request(vetted, { ...options, timeoutMs: remaining() });
        remaining();
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
    const body = await read(url);
    remaining();
    if (Buffer.byteLength(body) > MAX_BODY || UNSAFE_TEXT.test(body)) return null;
    const { title, blocks } = publisherBlocks(body);
    const excerpts = blocks.flatMap(block => slices(block).map(({ charStart, charEnd }) => block.slice(charStart, charEnd).trim()))
      .filter(text => text.length >= 16 && /\s/u.test(text)).slice(0, MAX_CANDIDATES);
    return title && excerpts.length ? { url: finalUrl, title: Array.from(title).slice(0, MAX_TITLE).join(""), excerpts } : null;
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
