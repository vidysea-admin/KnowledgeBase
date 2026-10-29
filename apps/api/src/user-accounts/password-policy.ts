/**
 * apps/api/src/user-accounts/password-policy.ts -- unit `ua-credentials`, spec UA-3.
 *
 * 12..128 characters (code points, after NFKC), any characters allowed (spaces, Unicode), NO composition
 * rules. Rejected when it is on the bundled deny list, when it is a deny-list word plus a trailing run of
 * digits/symbols ("password2026!!"), or when it contains the email local part. The password is never logged
 * or echoed: the result carries closed-vocabulary reason codes only.
 *
 * The deny list is the checked-in data file `common-passwords.txt` (lowercase, NFKC, one entry per line,
 * `#` comments). It is read once, synchronously, on first use and FAILS CLOSED: a missing or truncated file
 * throws instead of silently disabling the check. The `new URL("./common-passwords.txt", import.meta.url)`
 * form is the one apps/api/scripts/build.mjs rewrites for runtime assets in the production bundle.
 */
import { readFileSync } from "node:fs";
import { normalizeEmail, emailLocalPart, hasLoneSurrogate } from "./email.js";

export const PASSWORD_MIN = 12;
export const PASSWORD_MAX = 128;
const LOCAL_PART_MIN = 3;
const BASE_MIN = 6;
const MIN_LIST_SIZE = 400;

export type PasswordRejectReason = "invalid" | "too_short" | "too_long" | "common" | "contains_email";
export type PasswordCheck = { ok: true } | { ok: false; reasons: PasswordRejectReason[] };

/** NFKC so composed/decomposed and fullwidth spellings of one passphrase are one password. Shared with password.ts. */
export function normalizePassword(password: string): string {
  return password.normalize("NFKC");
}

export function passwordLength(normalized: string): number {
  let n = 0;
  for (const _ of normalized) n += 1;
  return n;
}

let denyList: Set<string> | null = null;
function loadDenyList(): Set<string> {
  if (denyList) return denyList;
  const raw = readFileSync(new URL("./common-passwords.txt", import.meta.url), "utf8");
  const set = new Set<string>();
  for (const line of raw.split(/\r?\n/)) {
    const entry = line.trim();
    if (entry !== "" && !entry.startsWith("#")) set.add(entry.normalize("NFKC").toLowerCase());
  }
  if (set.size < MIN_LIST_SIZE) throw new Error(`password deny list has ${set.size} entries (expected at least ${MIN_LIST_SIZE})`);
  denyList = set;
  return set;
}

export function commonPasswordCount(): number {
  return loadDenyList().size;
}

function isCommon(normalized: string): boolean {
  const list = loadDenyList();
  const lower = normalized.toLowerCase();
  if (list.has(lower)) return true;
  const base = lower.replace(/[0-9!@#$%^&*._+=?-]+$/u, "");
  return base !== lower && base.length >= BASE_MIN && list.has(base);
}

function containsLocalPart(normalized: string, email: string): boolean {
  const canonical = normalizeEmail(email);
  if (canonical === null) return false;
  const local = emailLocalPart(canonical);
  const lower = normalized.toLowerCase();
  const plusAt = local.indexOf("+");
  const candidates = plusAt > 0 ? [local, local.slice(0, plusAt)] : [local];
  return candidates.some((c) => c.length >= LOCAL_PART_MIN && lower.includes(c));
}

export function checkPassword(password: unknown, opts: { email?: string } = {}): PasswordCheck {
  if (typeof password !== "string" || hasLoneSurrogate(password)) return { ok: false, reasons: ["invalid"] };
  // Bound the work before normalising an arbitrarily large string.
  if (password.length > PASSWORD_MAX * 4) return { ok: false, reasons: ["too_long"] };
  const normalized = normalizePassword(password);
  const length = passwordLength(normalized);
  const reasons: PasswordRejectReason[] = [];
  if (length < PASSWORD_MIN) reasons.push("too_short");
  if (length > PASSWORD_MAX) reasons.push("too_long");
  if (isCommon(normalized)) reasons.push("common");
  if (opts.email !== undefined && containsLocalPart(normalized, opts.email)) reasons.push("contains_email");
  return reasons.length === 0 ? { ok: true } : { ok: false, reasons };
}
