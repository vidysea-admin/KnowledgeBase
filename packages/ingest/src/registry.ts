/**
 * packages/ingest/src/registry.ts — T-020 C4. `detectSource` picks the first adapter whose
 * `detect()` returns true — a registry, not a growing if/else chain — and throws a typed
 * `NoMatchingSourceError` (never silently returns `undefined` or picks the wrong adapter).
 */
import type { Source } from "./source.js";

export class NoMatchingSourceError extends Error {
  constructor(input: unknown) {
    super(`no Source adapter matched input: ${describeInput(input)}`);
    this.name = "NoMatchingSourceError";
  }
}

function describeInput(input: unknown): string {
  if (typeof input === "string") return JSON.stringify(input);
  try {
    return JSON.stringify(input);
  } catch {
    return String(input);
  }
}

/** Returns the first `adapters` entry whose `detect(input)` is true; throws otherwise. */
export function detectSource(input: unknown, adapters: Source[]): Source {
  for (const adapter of adapters) {
    if (adapter.detect(input)) return adapter;
  }
  throw new NoMatchingSourceError(input);
}

/** The adapters `buildSourceRegistry` orders. `whatsapp` is optional (not every composition root wires it). */
export interface SourceRegistryParts {
  recording: Source;
  document: Source;
  whatsapp?: Source;
  youtube: Source;
  onair: Source;
  zoomRecording: Source;
  url: Source;
}

/**
 * T-045: the one place the precedence is decided. First match wins (`detectSource`), so:
 *  1. recording, document, whatsapp keep their historic slots, ahead of everything new, so no input
 *     they accepted before is re-routed;
 *  2. youtube, onair, zoom-recording next: each is a strict recogniser (https, allow-listed host, no
 *     userinfo, no port, validated id), so they only take URLs the generic url adapter used to catch;
 *  3. url last: it is the catch-all for any http(s) input.
 * A look-alike (wrong host, http, `@` tricks, subdomain spoofing) fails the strict recognisers and
 * falls through to `url`, exactly as before this change.
 */
export function buildSourceRegistry(parts: SourceRegistryParts): Source[] {
  const expected: Array<[keyof SourceRegistryParts, string]> = [
    ["recording", "recording"],
    ["document", "document"],
    ["youtube", "youtube"],
    ["onair", "cloudonair"],
    ["zoomRecording", "zoom-recording"],
    ["url", "url"],
  ];
  for (const [key, name] of expected) {
    if (parts[key]?.name !== name) throw new Error(`buildSourceRegistry: parts.${key} must be the "${name}" adapter`);
  }
  if (parts.whatsapp && parts.whatsapp.name !== "whatsapp") {
    throw new Error('buildSourceRegistry: parts.whatsapp must be the "whatsapp" adapter');
  }
  return [
    parts.recording,
    parts.document,
    ...(parts.whatsapp ? [parts.whatsapp] : []),
    parts.youtube,
    parts.onair,
    parts.zoomRecording,
    parts.url,
  ];
}
