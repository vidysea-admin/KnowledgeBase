/**
 * packages/ingest/src/sources/document.ts — T-020 C3. Detects document files (`.pdf/.docx/.txt/
 * .md`), reads + extracts text via an injected `reader`, and splits the extracted text into
 * paragraph-level turns with `tStart` = character offset. Establishes the paragraph-turn
 * convention the plan's `url` adapter (T-023) will reuse, since document and URL content share
 * the same "extracted text -> paragraph turns" shape.
 */
import { tenantSourceId, type Source, type SourceDoc, type MediaDoc, type ConsentContext, type Turn } from "../source.js";

const DOCUMENT_EXTENSIONS = [".pdf", ".docx", ".txt", ".md"];
/** T-023: an http(s) string is a URL-shaped input, never a local document path, even when it
 * happens to end in a document extension (e.g. "https://example.com/report.pdf") — that belongs
 * to the `url` adapter, not this one. */
const URL_RE = /^https?:\/\//i;

/** Injected content hasher — hashes the extracted text (no `crypto` call baked in). */
export type DocumentHasher = (text: string) => string | Promise<string>;
/** Injected reader that returns extracted plain text — no direct `fs` call baked in. */
export type DocumentReader = (path: string) => Promise<string>;

export interface DocumentAdapterDeps {
  hasher: DocumentHasher;
  reader: DocumentReader;
  now?: () => string;
}

export interface DocumentInput {
  path: string;
  tenantId: string;
}

function isDocumentHint(input: unknown): input is { kind: "document"; path: string; tenantId?: string } {
  return (
    typeof input === "object" &&
    input !== null &&
    (input as Record<string, unknown>).kind === "document" &&
    typeof (input as Record<string, unknown>).path === "string"
  );
}

function extractPath(input: unknown): string | undefined {
  if (typeof input === "string") return input;
  if (isDocumentHint(input)) return input.path;
  return undefined;
}

function hasDocumentExtension(path: string): boolean {
  if (URL_RE.test(path)) return false;
  const lower = path.toLowerCase();
  return DOCUMENT_EXTENSIONS.some((ext) => lower.endsWith(ext));
}

/** Splits extracted text into paragraphs (blank-line separated), each carrying its character
 * offset in the original text as `tStart`/`tEnd`. Empty paragraphs are dropped. */
export function splitIntoParagraphTurns(text: string): Turn[] {
  const turns: Turn[] = [];
  const paragraphRe = /[^\n]+(?:\n(?!\n)[^\n]+)*/g;
  let match: RegExpExecArray | null;
  while ((match = paragraphRe.exec(text)) !== null) {
    const paragraph = match[0].trim();
    if (!paragraph) continue;
    const tStart = match.index;
    turns.push({ speakerRef: "document", tStart, tEnd: tStart + match[0].length, text: paragraph });
  }
  return turns;
}

/** Creates the `document` `Source` adapter (contract C3). */
export function createDocumentSource(deps: DocumentAdapterDeps): Source {
  const now = deps.now ?? (() => new Date().toISOString());

  return {
    name: "document",

    detect(input: unknown): boolean {
      if (isDocumentHint(input)) return true;
      const path = extractPath(input);
      return typeof path === "string" && hasDocumentExtension(path);
    },

    async fetch(
      input: unknown,
      consent: ConsentContext,
    ): Promise<{ source: SourceDoc; media: MediaDoc[] }> {
      const path = extractPath(input);
      if (!path) throw new Error("document adapter: fetch() called with an unrecognized input");

      const tenantId = isDocumentHint(input) && input.tenantId ? input.tenantId : (input as DocumentInput)?.tenantId;
      if (!tenantId) throw new Error("document adapter: fetch() requires a tenantId");

      const text = await deps.reader(path);
      const hash = await deps.hasher(text);

      const source: SourceDoc = {
        _id: tenantSourceId(tenantId, hash),
        tenantId,
        kind: "document",
        captureMode: consent.captureMode,
        path,
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
      if (!source.path) throw new Error("document adapter: toTurns() requires source.path");
      const text = await deps.reader(source.path);
      return splitIntoParagraphTurns(text);
    },
  };
}
