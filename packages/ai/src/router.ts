/**
 * packages/ai/src/router.ts — T-019 C4. `route(jobKind, config)` resolves the ordered provider
 * chain for a jobKind (from `config/ai-routing.yaml`, D-005 Gemini-first) to adapter instances;
 * `complete(jobKind, job, config)` tries each in order, first success wins, and records a `jobs`
 * ledger entry (C5) for every attempt via the injected `write`.
 */
import type { CompleteResult, EmbedJob, EmbedResult, Job, Provider } from "./provider.js";
import { canEmbed } from "./provider.js";
import { recordJob, type WriteJobFn } from "./jobs.js";
import { withTracing } from "./trace-registry.js";

export interface RoutingConfig {
  /** jobKind -> ordered provider names, e.g. { transcribe: ["gemini", "ollama"] }. */
  chains: Record<string, string[]>;
  /** provider name -> instantiated Provider (transport already injected by the caller). */
  providers: Record<string, Provider>;
  write: WriteJobFn;
  tenantId: string;
}

export class AllProvidersFailedError extends Error {
  constructor(
    public readonly jobKind: string,
    public readonly attempts: { provider: string; error: string }[],
  ) {
    super(
      `all providers failed for jobKind "${jobKind}": ` +
        attempts.map((a) => `${a.provider} (${a.error})`).join("; "),
    );
    this.name = "AllProvidersFailedError";
  }
}

/** Resolves the ordered chain for `jobKind` to `Provider` instances, in order. */
export function route(jobKind: string, config: Pick<RoutingConfig, "chains" | "providers">): Provider[] {
  const names = config.chains[jobKind];
  if (!names || names.length === 0) {
    throw new Error(`router.route: no chain configured for jobKind "${jobKind}"`);
  }
  return names.map((name) => {
    const provider = config.providers[name];
    if (!provider) throw new Error(`router.route: unknown provider "${name}" in chain "${jobKind}"`);
    // T-049: the single point every routed model call passes through. Identity when tracing is off.
    return withTracing(provider);
  });
}

/**
 * Tries each provider in the resolved chain in order; returns the first success. Every attempt
 * (success or failure) writes exactly one `jobs` ledger entry via `config.write` (C5, C7).
 * Throws `AllProvidersFailedError` if every provider in the chain fails — never a silent empty
 * result.
 */
export async function complete(jobKind: string, job: Job, config: RoutingConfig): Promise<CompleteResult> {
  const providers = route(jobKind, config);
  const attempts: { provider: string; error: string }[] = [];

  for (const provider of providers) {
    try {
      const result = await provider.complete(job);
      await recordJob(
        {
          tenantId: config.tenantId,
          kind: jobKind,
          status: "done",
          provider: result.provider,
          model: result.model,
          costUsd: result.costUsd,
        },
        config.write,
      );
      return result;
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      attempts.push({ provider: provider.name, error: message });
      await recordJob(
        {
          tenantId: config.tenantId,
          kind: jobKind,
          status: "failed",
          provider: provider.name,
          error: message,
        },
        config.write,
      );
    }
  }

  throw new AllProvidersFailedError(jobKind, attempts);
}

/**
 * Embedding counterpart of `complete` (plan §10 U1.1). Same chain, same ledger, same
 * first-success-wins rule — deliberately the same shape, so there is one fallback behaviour in
 * this codebase rather than two that can drift.
 *
 * ONE difference, and it is the reason `embed` is optional on `Provider`: a chain member without
 * an `embed()` is **skipped, not failed**. `claude-code` runs a CLI and Anthropic ships no
 * embedding API, so a chain listing them for other jobKinds would otherwise die on its first
 * member. Skipping is recorded as an attempt so the ledger still explains where a request went;
 * a chain with NO capable member is an error rather than an empty result, because silently
 * returning no vectors would look like a corpus with nothing in it.
 */
export async function embed(jobKind: string, job: EmbedJob, config: RoutingConfig): Promise<EmbedResult> {
  const providers = route(jobKind, config);
  const attempts: { provider: string; error: string }[] = [];

  for (const provider of providers) {
    if (!canEmbed(provider)) {
      attempts.push({ provider: provider.name, error: "provider has no embed() — skipped" });
      continue;
    }
    try {
      const result = await provider.embed(job);
      await recordJob(
        {
          tenantId: config.tenantId,
          kind: jobKind,
          status: "done",
          provider: result.provider,
          model: result.model,
          costUsd: 0,
        },
        config.write,
      );
      return result;
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      attempts.push({ provider: provider.name, error: message });
      await recordJob(
        { tenantId: config.tenantId, kind: jobKind, status: "failed", provider: provider.name, error: message },
        config.write,
      );
    }
  }

  throw new AllProvidersFailedError(jobKind, attempts);
}
