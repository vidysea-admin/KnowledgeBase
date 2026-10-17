/**
 * packages/ai/src/stt/gemini.ts — T-019 C6. Gemini STT adapter: used when a Gemini key is
 * configured and preferred over local whisper (ARCHITECTURE H9 — "an API key for an advanced
 * model (e.g. gemini-3.5-transcribe) can be dropped in and preferred"). Behind the same
 * injectable `Transport` seam as `whisper.ts` — no real network call in tests.
 */
import type { Transport } from "../provider.js";
import { detectGeminiFreeTier } from "../gemini-quota.js";
import type { SttAdapter, Turn, TranscribeOpts } from "./transcribe.js";

const DEFAULT_MODEL = "gemini-3.5-transcribe";

export interface GeminiSttConfig {
  apiKey: string;
  model?: string;
}

export function createGeminiSttAdapter(transport: Transport, config: GeminiSttConfig): SttAdapter {
  const model = config.model ?? DEFAULT_MODEL;

  return {
    name: "gemini",
    async transcribe(audio: Uint8Array, opts: TranscribeOpts): Promise<Turn[]> {
      const res = await transport({
        kind: "http",
        url: `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${config.apiKey}`,
        method: "POST",
        headers: { "content-type": "application/json" },
        body: {
          contents: [
            {
              parts: [
                { text: `Transcribe and diarize this audio. language=${opts.language ?? "auto"}` },
                { inlineData: { mimeType: "audio/wav", data: Buffer.from(audio).toString("base64") } },
              ],
            },
          ],
        },
      });

      if (res.status < 200 || res.status >= 300) {
        const quota = detectGeminiFreeTier(res.status, res.body, `gemini STT error ${res.status}`);
        if (quota) throw quota;
        throw new Error(`gemini STT error ${res.status}: ${JSON.stringify(res.body)}`);
      }

      const body = res.body as { turns?: Turn[] };
      return body.turns ?? [];
    },
  };
}
