/**
 * packages/index/src/pipeline/speakers.ts — U2.4 (catalogue B3/B10), the DETERMINISTIC half.
 *
 * Sibling of `claims.ts`, and it enforces the same provenance rule for a different object: a
 * speaker identity only survives if it is backed by a real turn that really says the name. Plan
 * §10's binding rule for this unit is "zero speaker name that does not appear verbatim in a cited
 * turn", and "leave low-confidence speakers unresolved rather than guessing".
 *
 * Why deterministic-only, and why that is not the whole unit. Measured over the real TOC corpus
 * (23 sessions, 1950 turns, 494 of them positional `spk:N`):
 *
 *   explicit self-naming ("my name is X")   78/494 turns (15.8%), 2 speakers
 *   broadening to "I'm X" / "I am X"        no additional genuine matches
 *   direct-address handover                 5 candidates, 4 of them junk (Plus/Like/Yeah/But)
 *
 * So this pass is a floor, not a solution: it is the part that can be proven without a model. The
 * remaining ~84% needs the LLM `extractFn` seam (§10 budgets a full cycle for it), and this module
 * is deliberately shaped to be its degradation fallback — same return type, same evidence shape,
 * so the LLM extractor can layer on top and its output can be filtered by the same verbatim rule.
 *
 * What this module will NOT do, on purpose:
 *   - read `session_page.json`. The summary for 2026-08-24-uniaccess-leeds-arts-university says
 *     "Juben Thakur"; the transcript says "Jubin Thakkar". The summarizer normalised a real
 *     person's name. Seeding identities from summaries would have written that wrong name into the
 *     knowledge base and cited it as evidence.
 *   - infer a speaker from someone else's name being spoken. "Prasanti, what do you think?" tells
 *     us Prasanti exists, never that Prasanti is the one speaking.
 *   - break a tie. A label that self-declares two different names is left unresolved.
 */
import type { Turns } from "@lkb/core";

/** A positional diarization label, e.g. `spk:0` — the thing this module tries to replace. */
const POSITIONAL = /^spk:\d+$/;

/**
 * An explicit self-naming, and only that. `my name is` carries the claim on its own; `I'm` and
 * `I am` are overwhelmingly followed by a verb phrase ("I'm going to...", "I am really excited"),
 * which is why the broader forms measured no better and are not used.
 *
 * Case variants are spelled out rather than using the `i` flag: the flag would also relax
 * `[A-Z][a-z]+`, and the capitalisation IS the name signal.
 */
const SELF_NAMING = /\b[Mm]y name(?:'s| is)\s+([A-Z][a-z]{1,})(?:\s+([A-Z][a-z]{1,}))?(?=[\s,.!?]|$)/g;

export interface ResolvedSpeaker {
  /** The positional label this identity replaces. */
  speakerRef: string;
  /** Exactly as spoken in the transcript — never normalised, never re-spelled. */
  displayName: string;
  /** Stable identity, never a bare display name (speakers.schema.json, H4). */
  personId: string;
  /** Real turn ids, each verified to contain `displayName` verbatim. */
  evidence: { turnId: string; sessionId: string }[];
  /**
   * Segment-aware scope (speaker-segment-identity gate, Option A): the [tStart, tEnd] turn-index
   * window of the CONTIGUOUS speaker block(s) in which this label's self-naming evidence was
   * found. A session-wide `spk:N -> person` mapping is UNSAFE — measured over the real corpus,
   * 494 positional turns form 240 contiguous blocks but only 29 session/label pairs, so one
   * label can cover multiple people (in the visa session, spk:0/spk:1 recur around four named
   * participants). Identity evidence therefore applies to the block, never to the label as a
   * whole. Turn indexes are positions in the `turns` array passed to `resolveSpeakers`.
   */
  blocks: { startTurnIndex: number; endTurnIndex: number }[];
  /** Model-judged identities only (D-132, pending append): verbatim quote + kind per grounding turn. */
  provenance?: { turnId: string; evidenceQuote: string; evidenceKind: string }[];
}

export interface SpeakerResolution {
  resolved: ResolvedSpeaker[];
  /** Positional labels this pass could not honestly name. Reported, never guessed at. */
  unresolved: string[];
}

/** `Jubin Thakkar` -> `person:jubin-thakkar`. Stable for the same spoken name. */
export function personIdFor(displayName: string): string {
  return `person:${displayName.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "")}`;
}

/**
 * Speaker identities for the positional labels in one session's turns.
 *
 * Pure and synchronous — no provider call, so it cannot fail partway and cannot fabricate. Turns
 * that already carry a real name are untouched: this only ever fills in `spk:N`.
 *
 * Segment-aware (speaker-segment-identity gate, Option A): the resolved identity carries the
 * turn-index windows of the contiguous block(s) containing its self-naming evidence, so a
 * downstream consumer can scope the identity to those blocks instead of treating every turn with
 * the same label in the session as the same person.
 */
export function resolveSpeakers(turns: Turns[]): SpeakerResolution {
  const positional = turns.filter((t) => POSITIONAL.test(t.speakerRef ?? ""));
  if (positional.length === 0) return { resolved: [], unresolved: [] };

  // Contiguous speaker blocks over the FULL turn list: a block ends when the positional label
  // changes (including via a named turn, which breaks contiguity). Turn indexes refer to `turns`.
  const blocks = new Map<string, { startTurnIndex: number; endTurnIndex: number }[]>();
  let current: { label: string; start: number; end: number } | null = null;
  for (let i = 0; i < turns.length; i++) {
    const ref = turns[i]?.speakerRef ?? "";
    if (POSITIONAL.test(ref)) {
      if (current && current.label === ref) {
        current.end = i;
      } else {
        if (current) {
          const list = blocks.get(current.label) ?? [];
          list.push({ startTurnIndex: current.start, endTurnIndex: current.end });
          blocks.set(current.label, list);
        }
        current = { label: ref, start: i, end: i };
      }
    } else {
      if (current) {
        const list = blocks.get(current.label) ?? [];
        list.push({ startTurnIndex: current.start, endTurnIndex: current.end });
        blocks.set(current.label, list);
        current = null;
      }
    }
  }
  if (current) {
    const list = blocks.get(current.label) ?? [];
    list.push({ startTurnIndex: current.start, endTurnIndex: current.end });
    blocks.set(current.label, list);
  }

  // label -> spoken name -> the turns that say it, in transcript order.
  const claims = new Map<string, Map<string, { turnId: string; sessionId: string }[]>>();

  for (const t of positional) {
    SELF_NAMING.lastIndex = 0;
    for (let m = SELF_NAMING.exec(t.text ?? ""); m !== null; m = SELF_NAMING.exec(t.text ?? "")) {
      const name = [m[1], m[2]].filter(Boolean).join(" ");
      // Belt and braces: the name must be present verbatim in the very turn we will cite.
      if (!(t.text ?? "").includes(name)) continue;
      const byName = claims.get(t.speakerRef) ?? new Map<string, { turnId: string; sessionId: string }[]>();
      const cites = byName.get(name) ?? [];
      if (!cites.some((c) => c.turnId === t._id)) cites.push({ turnId: t._id, sessionId: t.sessionId });
      byName.set(name, cites);
      claims.set(t.speakerRef, byName);
    }
  }

  const resolved: ResolvedSpeaker[] = [];
  for (const [speakerRef, byName] of claims) {
    // One label, two different self-declared names = a contradiction we are not entitled to settle.
    if (byName.size !== 1) continue;
    const entry = [...byName.entries()][0];
    if (!entry) continue;
    const [displayName, evidence] = entry;
    // Scope the identity to the block(s) that actually contain the citing turns (segment-aware,
    // not label-wide). A citing turn index is located via its id; labels recur across the
    // session, so only the blocks that hold evidence are claimed.
    const indexById = new Map(turns.map((t, i) => [t._id, i]));
    const ownBlocks = (blocks.get(speakerRef) ?? []).filter((b) =>
      evidence.some((e) => {
        const idx = indexById.get(e.turnId);
        return idx !== undefined && idx >= b.startTurnIndex && idx <= b.endTurnIndex;
      }),
    );
    resolved.push({
      speakerRef,
      displayName,
      personId: personIdFor(displayName),
      evidence,
      blocks: ownBlocks,
    });
  }
  resolved.sort((a, b) => a.speakerRef.localeCompare(b.speakerRef));

  const named = new Set(resolved.map((r) => r.speakerRef));
  const unresolved = [...new Set(positional.map((t) => t.speakerRef))].filter((l) => !named.has(l)).sort();

  return { resolved, unresolved };
}
