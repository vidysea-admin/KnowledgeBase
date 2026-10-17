/**
 * packages/ingest/src/sources/whatsapp.ts — T-007 (first slice). Detects a `{ kind: "whatsapp",
 * groupJid, ownerUserId }` hint, pulls real captured messages via an injected `fetcher` (no
 * database access baked in — the real impl reads `sources/whatsapp_msg`'s OWN, separate Mongo
 * database; that submodule keeps its own governance per this repo's CLAUDE.md, so nothing here
 * imports or queries it directly), and maps each real message to one turn.
 *
 * Unlike document/url (one text blob, paragraph-split into synthetic turns), WhatsApp already
 * has real per-message speaker attribution and real timestamps — no synthetic splitting needed.
 * `speakerRef` is the real internal `personId` from `sources/whatsapp_msg` (its own D-002/H1
 * identity model: LID/PN-alias based, never phone-keyed) so a viewer can trace a claim back to
 * exactly who said it, same as an audio turn's `spk:N`. `tStart`/`tEnd` are seconds elapsed
 * since the batch's first message (both equal — a chat message is a point in time, not a
 * duration), which the web UI's existing `speakerRef`-based unit-label switch (`"url"`/
 * `"document"` -> "chars", everything else -> "s") already renders correctly with no frontend
 * change needed.
 *
 * `captureMode` is always `"provided"` for this adapter, never inferred as `"silent"`: the
 * WhatsApp archiver only captures a sender the account owner explicitly selected for tracking
 * (D-002/D-005 in that submodule) — a deliberate, informed choice by the person who owns the
 * linked account, not a background silent capture (D-008's provided-first ordering).
 */
import { tenantSourceId, type Source, type SourceDoc, type MediaDoc, type ConsentContext, type Turn } from "../source.js";

export interface WhatsAppMessage {
  /** The real, upstream-unique WhatsApp message id (`sources/whatsapp_msg`'s own
   * `MessageDoc.messageId`, unique per owner) — the stable key a caller uses to make a re-ingest
   * idempotent instead of re-deriving one from position or count. */
  messageId: string;
  personId: string;
  displayName: string;
  text: string;
  /** ISO datetime — the real WhatsApp message timestamp, not capture time. */
  ts: string;
}

/** Injected content hasher — hashes a stable summary of the batch (no `crypto` call baked in). */
export type WhatsAppHasher = (text: string) => string | Promise<string>;
/** Injected fetcher that returns real captured messages for one group, oldest first — no direct
 * database call baked in; the real impl queries `sources/whatsapp_msg`'s own Mongo. */
export type WhatsAppFetcher = (groupJid: string, ownerUserId: string) => Promise<WhatsAppMessage[]>;

export interface WhatsAppAdapterDeps {
  hasher: WhatsAppHasher;
  fetcher: WhatsAppFetcher;
  now?: () => string;
}

/** The persisted `SourceDoc` shape this adapter writes — `ownerUserId` is a real field (schema
 * `additionalProperties: true`) needed so `toTurns()` can re-fetch without a second identifier
 * being threaded through by the caller. */
export interface WhatsAppSourceDoc extends SourceDoc {
  ownerUserId: string;
}

function isWhatsAppHint(
  input: unknown,
): input is { kind: "whatsapp"; groupJid: string; ownerUserId: string; tenantId?: string } {
  if (typeof input !== "object" || input === null) return false;
  const rec = input as Record<string, unknown>;
  return rec.kind === "whatsapp" && typeof rec.groupJid === "string" && typeof rec.ownerUserId === "string";
}

/** Creates the `whatsapp` `Source` adapter (T-007 first slice). */
export function createWhatsAppSource(deps: WhatsAppAdapterDeps): Source {
  const now = deps.now ?? (() => new Date().toISOString());

  return {
    name: "whatsapp",

    detect(input: unknown): boolean {
      return isWhatsAppHint(input);
    },

    async fetch(
      input: unknown,
      consent: ConsentContext,
    ): Promise<{ source: SourceDoc; media: MediaDoc[] }> {
      if (!isWhatsAppHint(input)) throw new Error("whatsapp adapter: fetch() called with an unrecognized input");
      const tenantId = input.tenantId;
      if (!tenantId) throw new Error("whatsapp adapter: fetch() requires a tenantId");

      // Real bug found in this session's own data-engineer review (2026-09-06): hashing the
      // message COUNT made `_id` change on every new message (duplicating the whole history on
      // re-ingest) and collide back to the same id whenever the count coincidentally repeated
      // (e.g. one deleted + one added), which then made that group permanently un-ingestable via
      // a Mongo duplicate-key error. `_id` is now stable per `(groupJid, ownerUserId)` — the
      // caller upserts by this id, so a re-ingest of the same group always targets the same
      // source/session and only NEW messages (see whatsapp-store.ts's messageId-keyed turn
      // upserts) get added.
      const hash = await deps.hasher(`${input.groupJid}:${input.ownerUserId}`);

      const source: WhatsAppSourceDoc = {
        _id: tenantSourceId(tenantId, hash),
        tenantId,
        kind: "whatsapp-batch",
        captureMode: consent.captureMode,
        path: input.groupJid,
        ownerUserId: input.ownerUserId,
        hash,
        consent: {
          given: consent.given,
          recordedBy: consent.recordedBy,
          note: consent.note,
        },
        createdAt: now(),
      };

      return { source, media: [] };
    },

    async toTurns(source: SourceDoc): Promise<Turn[]> {
      const groupJid = source.path;
      const ownerUserId = (source as Partial<WhatsAppSourceDoc>).ownerUserId;
      if (!groupJid || !ownerUserId) {
        throw new Error("whatsapp adapter: toTurns() requires source.path (groupJid) and source.ownerUserId");
      }

      const messages = await deps.fetcher(groupJid, ownerUserId);
      if (messages.length === 0) return [];

      const firstMs = new Date(messages[0]!.ts).getTime();
      return messages.map((m) => {
        const offsetSeconds = Math.max(0, Math.round((new Date(m.ts).getTime() - firstMs) / 1000));
        return {
          speakerRef: m.personId,
          tStart: offsetSeconds,
          tEnd: offsetSeconds,
          text: m.text,
          // Real bug found live 2026-09-06: this was fetched onto `m.displayName` and then
          // never used anywhere -- every WhatsApp turn showed a raw personId hash in the UI
          // instead of who actually said it.
          ...(m.displayName ? { speakerLabel: m.displayName } : {}),
          // Same session: tStart/tEnd are relative offsets, not real times -- a chat view
          // wanting to show "9:28 AM" needs the actual wall-clock moment.
          occurredAt: m.ts,
        };
      });
    },
  };
}
