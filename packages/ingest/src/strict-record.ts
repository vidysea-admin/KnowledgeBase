/**
 * packages/ingest/src/strict-record.ts — T-046 fix cycle 1. The ONE strict reader for untrusted
 * records. A record is accepted only if it is a plain object (prototype Object.prototype or null,
 * not a Proxy, not an array, not a class instance) and every declared field is an OWN, ENUMERABLE
 * DATA property (never an accessor, never inherited) of exactly the expected type. Each field is
 * read ONCE, from its property descriptor, into a null-prototype copy; callers use only the copy,
 * so a getter or a later mutation cannot return a different value on a second read.
 * Undeclared fields are neither read nor copied (the generated schemas allow extras, e.g. Mongo
 * bookkeeping fields, and none of them may influence a decision).
 */
import { types } from "node:util";

export const BAD: unique symbol = Symbol("bad");
export type Bad = typeof BAD;
export type Reader = (v: unknown) => unknown | Bad;
export interface FieldSpec { read: Reader; required: boolean }
export type Spec = Record<string, FieldSpec>;
/** `vals` holds only fields that passed; `bad` names every declared field that failed. */
export interface Read { vals: Record<string, unknown>; bad: string[] }

export function isPlain(v: unknown): v is object {
  if (typeof v !== "object" || v === null || Array.isArray(v) || types.isProxy(v)) return false;
  const p = Object.getPrototypeOf(v) as unknown;
  return p === Object.prototype || p === null;
}

/** Copies an array through own data descriptors; holes/accessors become BAD elements. */
export function readArray(v: unknown): unknown[] | Bad {
  if (!Array.isArray(v) || types.isProxy(v) || Object.getPrototypeOf(v) !== Array.prototype) return BAD;
  const len = (Object.getOwnPropertyDescriptor(v, "length")?.value as unknown);
  if (typeof len !== "number" || !Number.isSafeInteger(len) || len < 0) return BAD;
  const out: unknown[] = [];
  for (let i = 0; i < len; i++) {
    const d = Object.getOwnPropertyDescriptor(v, String(i));
    out.push(d && "value" in d && d.enumerable ? d.value : BAD);
  }
  return out;
}

export function readFields(raw: unknown, spec: Spec): Read | null {
  if (!isPlain(raw)) return null;
  const vals: Record<string, unknown> = Object.create(null) as Record<string, unknown>;
  const bad: string[] = [];
  for (const [key, { read, required }] of Object.entries(spec)) {
    const d = Object.getOwnPropertyDescriptor(raw, key);
    if (d === undefined) { if (required) bad.push(key); continue; }
    if (!("value" in d) || !d.enumerable) { bad.push(key); continue; } // accessor or hidden
    const r = read(d.value);
    if (r === BAD) bad.push(key); else vals[key] = r;
  }
  return { vals, bad };
}

export const str: Reader = (v) => (typeof v === "string" && v.length > 0 ? v : BAD);
export const num: Reader = (v) => (typeof v === "number" && Number.isFinite(v) ? v : BAD);
export const posNum: Reader = (v) => (typeof v === "number" && Number.isFinite(v) && v > 0 ? v : BAD);
export const bool: Reader = (v) => (typeof v === "boolean" ? v : BAD);
export const oneOf = (allowed: ReadonlySet<string>): Reader => (v) =>
  (typeof v === "string" && allowed.has(v) ? v : BAD);
export const strList: Reader = (v) => {
  const a = readArray(v);
  return a !== BAD && a.every((x) => typeof x === "string" && x.length > 0) ? a : BAD;
};
export const arrayOf = (inner: Reader, nonEmpty = false): Reader => (v) => {
  const a = readArray(v);
  if (a === BAD || (nonEmpty && a.length === 0)) return BAD;
  const out = a.map(inner);
  return out.includes(BAD) ? BAD : out;
};
export const record = (spec: Spec): Reader => (v) => {
  const r = readFields(v, spec);
  return r === null || r.bad.length > 0 ? BAD : r.vals;
};

/**
 * Timestamps: ONLY a full ISO 8601 UTC instant, `YYYY-MM-DDTHH:MM:SS(.sss)?Z`, the form
 * `Date.prototype.toISOString` writes (and so the form this codebase stores). Offset forms
 * (`+05:30`) are deliberately REJECTED: one canonical spelling, no zone arithmetic on a path that
 * decides deletion. The parsed instant must round-trip to the same text, which also rejects
 * month 13, 30 February, 24:00:00 and leap seconds. Numbers, numeric strings and date-only
 * strings never match.
 */
const ISO = /^(\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2})(\.\d{3})?Z$/;
export function parseIsoInstant(v: unknown): number | null {
  if (typeof v !== "string") return null;
  const m = ISO.exec(v);
  if (!m) return null;
  const ms = Date.parse(v);
  if (!Number.isFinite(ms)) return null;
  return new Date(ms).toISOString() === `${m[1]}${m[2] ?? ".000"}Z` ? ms : null;
}
export const isoInstant: Reader = (v) => (parseIsoInstant(v) === null ? BAD : (v as string));
