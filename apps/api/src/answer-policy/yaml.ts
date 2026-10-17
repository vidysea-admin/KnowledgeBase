/** Bounded flat scalar YAML. Tags, aliases, nesting, duplicate keys and arbitrary objects are refused. */
import { parseSave, PolicyInputError, type ParsedSave } from "./rules.js";
import type { PolicyRevision } from "./types.js";

export function parsePolicyYaml(value: unknown): ParsedSave {
  if (typeof value !== "string" || !value.trim() || Buffer.byteLength(value, "utf8") > 8192)
    throw new PolicyInputError("invalid_policy", "Policy YAML must contain 1-8192 bytes.");
  const fields: Record<string, unknown> = Object.create(null) as Record<string, unknown>;
  for (const line of value.split(/\r?\n/)) {
    if (!line.trim() || /^\s*#/.test(line)) continue;
    const match = /^([a-zA-Z][a-zA-Z0-9]*):[ \t]+(.+?)[ \t]*$/.exec(line);
    if (!match || Object.hasOwn(fields, match[1]!))
      throw new PolicyInputError("invalid_policy", "Use one unique scalar key per unindented YAML line.");
    const key = match[1]!, raw = match[2]!;
    let scalar: unknown;
    if (raw.startsWith('"')) {
      try { scalar = JSON.parse(raw); } catch { throw new PolicyInputError("invalid_policy", "Invalid quoted YAML scalar."); }
      if (typeof scalar !== "string") throw new PolicyInputError("invalid_policy", "YAML values must be strings.");
    } else if (raw.startsWith("'")) {
      if (!/^'(?:[^']|'')*'$/.test(raw)) throw new PolicyInputError("invalid_policy", "Invalid quoted YAML scalar.");
      scalar = raw.slice(1, -1).replaceAll("''", "'");
    } else {
      if (/^[!&*\[\]{|>]/.test(raw) || /[:\[\]{}]|\s#/.test(raw))
        throw new PolicyInputError("invalid_policy", "Quote scalars containing YAML punctuation; structures and tags are unsupported.");
      scalar = key === "expectedVersion" && /^[1-9]\d*$/.test(raw) ? Number(raw) : raw;
    }
    fields[key] = scalar;
  }
  return parseSave(fields);
}

export function policyYaml(revision: PolicyRevision): string {
  return ["# Flat scalar YAML; citations are mandatory.",
    ...(["questionClass", "mode", "style", "onInsufficient", "citations", "note"] as const)
      .map((key) => `${key}: ${JSON.stringify(revision[key])}`), `expectedVersion: ${revision.version}`].join("\n") + "\n";
}

export function yamlSaveInput(yaml: unknown): Record<string, unknown> {
  const parsed = parsePolicyYaml(yaml);
  return { ...parsed.body, note: parsed.note,
    ...(parsed.expectedVersion === null ? {} : { expectedVersion: parsed.expectedVersion }),
    ...(parsed.claimedBy === undefined ? {} : { claimedBy: parsed.claimedBy }) };
}
