/**
 * packages/ai/src/json.ts — shared LLM-JSON-reply parsing. Real bug found live (2026-09-04)
 * running `/ask` against the real server for the first time: Gemini routinely wraps a
 * requested-JSON-only reply in a markdown code fence (` ```json\n{...}\n``` `) even when told
 * "reply with JSON only" — a bare `JSON.parse(text)` throws on that and every caller that fell
 * back to it (packages/ask's selectNodes and refine, apps/api's LLM judge) silently treated a
 * valid answer as "couldn't parse", either dropping it to an empty result or degrading to a
 * cruder heuristic. One shared parser fixes all three call sites instead of patching each's own
 * copy of the same broken try/catch.
 */
// Not anchored: models (GLM judge replies, live 2026-10-19) append prose after the closing fence.
const FENCE_RE = /```(?:json)?\s*\n?([\s\S]*?)\n?```/;

/** First complete top-level JSON object/array in `text` (string-aware brace matching), or undefined. For replies with prose around the JSON. */
function firstJsonValue(text: string): string | undefined {
  const start = text.search(/[{[]/);
  if (start < 0) return undefined;
  let depth = 0, inString = false;
  for (let i = start; i < text.length; i++) {
    const ch = text[i]!;
    if (inString) { if (ch === "\\") i++; else if (ch === '"') inString = false; continue; }
    if (ch === '"') inString = true;
    else if (ch === "{" || ch === "[") depth++;
    else if ((ch === "}" || ch === "]") && --depth === 0) return text.slice(start, i + 1);
  }
  return undefined;
}

/** Best-effort JSON.parse that also handles a reply wrapped in a markdown code fence and a reply with prose
 * before/after the JSON (live 2026-10-19: GLM appends "Notes:" after an unfenced object). Returns
 * `null` (never throws) if no valid JSON value can be recovered. */
export function parseJsonLoose(text: string): unknown {
  const trimmed = text.trim();
  try {
    return JSON.parse(trimmed);
  } catch {
    const fenced = FENCE_RE.exec(trimmed);
    for (const candidate of [fenced?.[1]?.trim(), firstJsonValue(trimmed)]) {
      if (candidate === undefined) continue;
      try { return JSON.parse(candidate); } catch { /* try the next recovery */ }
    }
    return null;
  }
}
