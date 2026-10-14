import { OllamaProvider, complete as routeComplete, type CompleteResult, type Job, type Transport, type WriteJobFn } from "@lkb/ai";

export type SpeakerComplete = (job: Job) => Promise<CompleteResult>;
export interface SpeakerSuggestionRouting {
  complete: SpeakerComplete;
  verifierComplete: SpeakerComplete;
  mode: "suggestions-only";
  autoFinal: false;
  models: Readonly<{ proposer: string; verifier: string }>;
}
export interface SpeakerRoutingContext { tenantId: string; write: WriteJobFn }
type SpeakerEnv = Record<string, string | undefined>;
const CLOUD_ORIGIN = "https://ollama.com";
const CHAT_URL = `${CLOUD_ORIGIN}/api/chat`;
const CLOUD_TIMEOUT_MS = 120_000;

function configuredModel(value: string | undefined): string {
  const model = value?.trim();
  if (!model || !/^[a-zA-Z0-9][a-zA-Z0-9._:/-]*$/.test(model) || model.length > 160) {
    throw new Error("speaker cloud model configuration required");
  }
  return model;
}
function identity(model: string): string { return model.toLowerCase().replace(/(?::(?:cloud|latest)|-cloud)+$/, ""); }

/** Cloud credentials and transcripts never follow a redirect. Injectable only for offline checks. */
export function createSpeakerCloudTransport(fetcher: typeof fetch = fetch): Transport {
  return async (request) => {
    if (request.kind !== "http" || request.url !== CHAT_URL || request.method !== "POST") {
      throw new Error("invalid speaker cloud request");
    }
    const signal = request.signal
      ? AbortSignal.any([request.signal, AbortSignal.timeout(CLOUD_TIMEOUT_MS)])
      : AbortSignal.timeout(CLOUD_TIMEOUT_MS);
    try {
      const response = await fetcher(CHAT_URL, {
        method: "POST", headers: request.headers, body: JSON.stringify(request.body),
        redirect: "error", signal,
      });
      // Error bodies may echo transcript text or credentials; never propagate them.
      if (!response.ok) throw new Error("speaker cloud request failed");
      return { status: response.status, body: await response.json() };
    } catch {
      throw new Error("speaker cloud request failed");
    }
  };
}

/** D-131/D-141: an explicitly configured pair for suggestions, never an auto-final approval. */
export function createSpeakerSuggestionRouting(
  transport: Transport | undefined, env: SpeakerEnv, context: SpeakerRoutingContext,
): SpeakerSuggestionRouting {
  if (!context?.tenantId?.trim() || typeof context.write !== "function") throw new Error("speaker tenant and job recorder required");
  const { tenantId, write } = context;
  const apiKey = env.OLLAMA_API_KEY?.trim();
  if (!apiKey || /[\r\n]/.test(apiKey)) throw new Error("speaker cloud credentials required");
  const proposer = configuredModel(env.SPEAKERS_PROPOSER_MODEL);
  const verifier = configuredModel(env.SPEAKERS_VERIFIER_MODEL);
  if (identity(proposer) === identity(verifier)) throw new Error("distinct speaker cloud models required");
  const bind = (model: string): SpeakerComplete => {
    const provider = new OllamaProvider(transport ?? createSpeakerCloudTransport(), { baseUrl: CLOUD_ORIGIN, apiKey, model });
    const safeProvider = {
      name: provider.name,
      listModels: () => provider.listModels(),
      complete: async (job: Job) => {
        try { return await provider.complete(job); }
        catch { throw new Error("speaker cloud request failed"); }
      },
    };
    return async (job) => {
      if (job.kind !== "speakers") throw new Error("speaker route accepts speakers jobs only");
      try {
        return await routeComplete("speakers", job, {
          chains: { speakers: ["ollama"] }, providers: { ollama: safeProvider },
          tenantId, write,
        });
      }
      catch { throw new Error("speaker cloud request failed"); }
    };
  };
  return Object.freeze({
    complete: bind(proposer), verifierComplete: bind(verifier), mode: "suggestions-only", autoFinal: false,
    models: Object.freeze({ proposer, verifier }),
  });
}
