/**
 * packages/ai/src/providers/claude-code.ts — T-019 C2/C3. Claude via the `claude` CLI under
 * the Max subscription OAuth login (D-005: "Claude is used through the same OAuth login flow
 * as the claude CLI ... not API keys"). No HTTP call — the injected `transport` spawns
 * `claude -p --model <alias>` (kind: "cli") so tests never launch a real process.
 *
 * `anthropic.ts`'s OAuth mode delegates here (`runClaudeCodePrompt`) so the CLI-invocation
 * logic exists exactly once (contract C2: "may delegate ... one implementation, not two").
 */
import type { CompleteResult, Job, ModelInfo, Provider, Transport } from "../provider.js";

/** Static manifest of Claude model aliases usable via `claude -p --model <alias>` (C3). */
export const CLAUDE_CODE_MODELS: ModelInfo[] = [
  { id: "sonnet", label: "Claude Sonnet (alias: sonnet)" },
  { id: "opus", label: "Claude Opus (alias: opus)" },
  { id: "haiku", label: "Claude Haiku (alias: haiku)" },
];

const DEFAULT_MODEL = "sonnet";

function promptFromMessages(messages: Job["messages"]): string {
  return messages.map((m) => `[${m.role}] ${m.content}`).join("\n\n");
}

/**
 * Runs one prompt through the `claude` CLI via `transport` and normalizes the result to
 * `CompleteResult` shape. Shared by `ClaudeCodeProvider.complete` and by `anthropic.ts`'s OAuth
 * mode — the one place the CLI invocation + response parsing is written.
 */
export async function runClaudeCodePrompt(
  transport: Transport,
  job: Job,
  model: string = DEFAULT_MODEL,
  providerName: string = "claude-code",
): Promise<CompleteResult> {
  const prompt = promptFromMessages(job.messages);
  const res = await transport({
    kind: "cli",
    command: "claude",
    args: ["-p", "--model", model, "--output-format", "json",
      "--safe-mode", "--restricted", "--no-chrome", "--tools", "",
      "--disable-slash-commands", "--strict-mcp-config", "--mcp-config", '{"mcpServers":{}}',
      "--setting-sources", "", "--no-session-persistence", "--permission-prompts", "none"],
    stdin: prompt,
  });

  if (res.status !== 0) {
    throw new Error(`claude-code CLI exited ${res.status}`);
  }

  const body = (res.body ?? {}) as {
    is_error?: boolean;
    subtype?: string;
    result?: string;
    text?: string;
    usage?: { input_tokens?: number; output_tokens?: number };
    total_cost_usd?: number;
  };
  if (body.is_error || (body.subtype && body.subtype !== "success")) {
    throw new Error("claude-code CLI reported an unsuccessful result");
  }
  const text = body.result ?? body.text;
  if (typeof text !== "string" || !text.trim()) throw new Error("claude-code CLI returned no valid result");

  return {
    text,
    usage: {
      inputTokens: body.usage?.input_tokens ?? 0,
      outputTokens: body.usage?.output_tokens ?? 0,
    },
    provider: providerName,
    model,
    costUsd: body.total_cost_usd ?? 0,
  };
}

export class ClaudeCodeProvider implements Provider {
  readonly name = "claude-code";

  constructor(
    private readonly transport: Transport,
    private readonly model: string = DEFAULT_MODEL,
  ) {}

  async complete(job: Job): Promise<CompleteResult> {
    return runClaudeCodePrompt(this.transport, job, this.model, this.name);
  }

  async listModels(): Promise<ModelInfo[]> {
    return CLAUDE_CODE_MODELS;
  }
}
