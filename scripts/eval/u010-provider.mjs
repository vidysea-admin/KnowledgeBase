/** Explicit one-provider production scorer; transport is bounded and supplied by the run. */
import { hash, requireValue } from './u010-corpus.mjs';

export async function productionScorer(configuration, transport, env) {
  const { register } = await import('tsx/esm/api'); register();
  const { OllamaProvider } = await import('../../packages/ai/src/providers/ollama.ts');
  const { GeminiProvider } = await import('../../packages/ai/src/providers/gemini.ts');
  const { createLlmScorer } = await import('../../apps/api/src/score.ts');
  const provider = configuration.provider === 'ollama'
    ? new OllamaProvider(transport, { model: configuration.model, baseUrl: 'https://ollama.com', apiKey: env.OLLAMA_API_KEY })
    : new GeminiProvider(transport, { model: configuration.model, apiKey: env.GEMINI_API_KEY });
  // Direct explicit adapter prevents ambient router telemetry sinks or job writers from
  // performing additional I/O outside the bounded eval transport. Judge prompt/parser
  // and provider adapters are the actual production sources, without production defaults.
  const inner = createLlmScorer((job) => { requireValue(job.kind === 'evaluator', 'foreign job kind'); return provider.complete(job); });
  return async (query, node) => {
    const [score, reason] = await inner(query, node);
    // Persist only classification and a hash: provider errors/reasons may contain credentials.
    return { score, fallback: /fell back/.test(reason), reasonClass: /fell back/.test(reason) ? 'heuristic-fallback' : 'provider-judge', reasonSha256: hash(reason) };
  };
}

export async function boundedHttp(req, signal) {
  requireValue(req.kind === 'http', 'eval transport accepts HTTP only');
  const res = await fetch(req.url, { method: req.method ?? 'POST', headers: req.headers, body: JSON.stringify(req.body), signal, redirect: 'error' });
  const chunks = []; let size = 0;
  const reader = res.body?.getReader();
  try {
    if (reader) for (;;) {
      const { done, value } = await reader.read(); if (done) break;
      size += value.byteLength;
      if (size > 1_048_576) { await reader.cancel(); throw new Error('provider response exceeds byte limit'); }
      chunks.push(value);
    }
  } finally { reader?.releaseLock(); }
  const text = Buffer.concat(chunks).toString('utf8');
  let body; try { body = JSON.parse(text); } catch { body = text; }
  return { status: res.status, body, text };
}

export function providerConfiguration(provider, model, kind, execution = 'real-provider') {
  requireValue(['ollama', 'gemini'].includes(provider), 'unsupported provider');
  requireValue(typeof model === 'string' && /^[A-Za-z0-9._:-]{1,120}$/.test(model), 'explicit safe model ID required');
  requireValue(provider !== 'ollama' || ['glm-5.3-flash', 'deepseek-v4.1-flash'].includes(model), 'Ollama model outside D-164');
  requireValue(['recall', 'calibration'].includes(kind), 'unsupported run kind');
  requireValue(['real-provider', 'synthetic-test'].includes(execution), 'invalid execution classification');
  return { provider, model, kind, execution, k: 5, jobKind: 'evaluator', origin: provider === 'ollama' ? 'https://ollama.com' : 'https://generativelanguage.googleapis.com',
    generation: 'unchanged production adapter defaults; each actual request configuration is hashed in receipts', retryPolicy: 'no runner retries; every actual transport attempt consumes cap' };
}
