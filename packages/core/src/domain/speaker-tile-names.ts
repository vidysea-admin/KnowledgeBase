/**
 * packages/core/src/domain/speaker-tile-names.ts — T-042 slice 1 (cycle 1). Name normalisation and the
 * non-person predicate for `speaker-tile-alignment.ts`. Pure; no I/O.
 *
 * THREE comparisons, deliberately different:
 *  - `normalizeDisplayName` (NFC + whitespace collapse + trim): the string RETURNED in a claim and the
 *    equality used to pool seconds inside one label. No case-folding: "Priya" and "priya" stay distinct
 *    candidates within a label (which refuses both as two strong names).
 *  - `foldKey` (NFKC + full case-fold + whitespace collapse): used for EXCLUSION ONLY (the bot's own name)
 *    and for the cross-label REFUSAL ONLY ("Priya" on one label, "priya" or fullwidth "Priya" on another
 *    count as the same name and both labels are refused). Merging more is the safe direction in both uses:
 *    it can only add refusals; it never causes a name to be proposed.
 *  - the non-person regex is applied to the NFC form AND the NFKC form (fullwidth "Admin" is excluded).
 */
export const MAX_NAME_LENGTH = 100;
export const normalizeDisplayName = (s: string): string => s.normalize("NFC").replace(/\s+/gu, " ").trim();
export const foldKey = (s: string): string =>
  s.normalize("NFKC").toUpperCase().toLowerCase().normalize("NFKC").replace(/\s+/gu, " ").trim();

/** Small documented set (NOT a full list; extend through `isNonPersonName`, which can only add refusals). */
const NON_PERSON_WORDS = /(?:^|[^\p{L}\p{N}])(?:iphone|ipad|android|galaxy|pixel|macbook|laptop|room|guest|host|co-host|presenter|panelist|attendee|participant|notetaker|recorder|bot|dial-in|phone|unknown|speaker|moderator|admin|zoom|webex)(?![\p{L}\p{N}])/iu;
const UNSAFE_CHARS = /[\p{Cc}\u{200B}\u{200E}\u{200F}\u{061C}\u{202A}-\u{202E}\u{2066}-\u{2069}\u{FEFF}\u{2028}\u{2029}]/u;

export function nonPerson(name: string, extra?: (n: string) => boolean): boolean {
  if (name.length > MAX_NAME_LENGTH || UNSAFE_CHARS.test(name) || !/\p{L}/u.test(name)) return true;
  if (NON_PERSON_WORDS.test(name) || NON_PERSON_WORDS.test(name.normalize("NFKC"))) return true;
  if (extra) { try { return extra(name) !== false; } catch { return true; } }
  return false;
}
