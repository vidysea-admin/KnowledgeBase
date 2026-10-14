/**
 * packages/ingest/src/sources/url.ts — T-023 C2-C4. Detects a bare `http(s)://` string or a
 * `{ kind: "url", url }` hint, extracts text via an injected `UrlFetcher` (Jina Reader / Firecrawl
 * / a fake — no vendor hardcoded), and reuses `document.ts`'s `splitIntoParagraphTurns` for the
 * paragraph-turn split (that module's own doc comment predicted this reuse — the "extracted text
 * -> paragraph turns" shape is identical for a document and a URL). No live HTTP call required to
 * satisfy this contract; real Jina/Firecrawl wiring is a later composition-root concern.
 */
import { tenantSourceId, type Source, type SourceDoc, type MediaDoc, type ConsentContext, type Turn } from "../source.js";
import { splitIntoParagraphTurns } from "./document.js";

/** Injected content hasher — hashes the extracted text (no `crypto` call baked in). */
export type UrlHasher = (text: string) => string | Promise<string>;
/** Injected fetcher that returns extracted plain text/markdown for a URL — no direct network
 * call baked in; a real impl wraps Jina Reader, Firecrawl, or any other extractor. */
export type UrlFetcher = (url: string) => Promise<string>;

export interface UrlAdapterDeps {
  hasher: UrlHasher;
  fetcher: UrlFetcher;
  now?: () => string;
}

export interface UrlInput {
  url: string;
  tenantId: string;
}

const URL_RE = /^https?:\/\//i;

function isUrlHint(input: unknown): input is { kind: "url"; url: string; tenantId?: string } {
  return (
    typeof input === "object" &&
    input !== null &&
    (input as Record<string, unknown>).kind === "url" &&
    typeof (input as Record<string, unknown>).url === "string"
  );
}

function extractUrl(input: unknown): string | undefined {
  if (typeof input === "string" && URL_RE.test(input)) return input;
  if (isUrlHint(input)) return input.url;
  return undefined;
}

/** Creates the `url` `Source` adapter (contract C2-C4). */
export function createUrlSource(deps: UrlAdapterDeps): Source {
  const now = deps.now ?? (() => new Date().toISOString());

  return {
    name: "url",

    detect(input: unknown): boolean {
      return extractUrl(input) !== undefined;
    },

    async fetch(
      input: unknown,
      consent: ConsentContext,
    ): Promise<{ source: SourceDoc; media: MediaDoc[] }> {
      const url = extractUrl(input);
      if (!url) throw new Error("url adapter: fetch() called with an unrecognized input");

      const tenantId = isUrlHint(input) && input.tenantId ? input.tenantId : (input as UrlInput)?.tenantId;
      if (!tenantId) throw new Error("url adapter: fetch() requires a tenantId");

      const text = await deps.fetcher(url);
      const hash = await deps.hasher(text);

      const source: SourceDoc = {
        _id: tenantSourceId(tenantId, hash),
        tenantId,
        kind: "url",
        captureMode: consent.captureMode,
        url,
        hash,
        consent: {
          given: consent.given,
          recordedBy: consent.recordedBy,
          note: consent.note,
        },
        createdAt: now(),
      };

      const media: MediaDoc[] = [];

      return { source, media };
    },

    async toTurns(source: SourceDoc): Promise<Turn[]> {
      if (!source.url) throw new Error("url adapter: toTurns() requires source.url");
      const text = await deps.fetcher(source.url as string);
      return splitIntoParagraphTurns(text).map((t) => ({ ...t, speakerRef: "url" }));
    },
  };
}
