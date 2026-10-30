/**
 * The WhatsApp archiving notice (whatsapp-multiuser W5, R-3). There is no attestation form: the request screen shows this
 * fixed notice and the link stores its version and the time it was shown. The text lives in ONE file (docs/whatsapp/notice.md);
 * its version is the SHA-256 of that file's content with line endings normalised to LF and a leading BOM removed, so a
 * Windows checkout and a Linux image agree. A missing, empty or oversized file makes the notice unavailable and requests
 * fail closed (503); nothing falls back to built-in text.
 */
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

export const NOTICE_PATH_ENV = "WHATSAPP_NOTICE_PATH";
export const NOTICE_MAX_BYTES = 8 * 1024;

export interface Notice { readonly version: string; readonly text: string }

export class NoticeUnavailableError extends Error {
  constructor() { super("notice_unavailable"); this.name = "NoticeUnavailableError"; }
}

/** docs/whatsapp/notice.md of the checkout this module runs from (apps/api/src/whatsapp/links -> repo root). */
export function defaultNoticePath(): string {
  return fileURLToPath(new URL("../../../../../docs/whatsapp/notice.md", import.meta.url));
}

export function parseNotice(raw: Buffer | string): Notice {
  const bytes = typeof raw === "string" ? Buffer.byteLength(raw, "utf8") : raw.byteLength;
  if (bytes === 0 || bytes > NOTICE_MAX_BYTES) throw new NoticeUnavailableError();
  const text = (typeof raw === "string" ? raw : raw.toString("utf8")).replace(/^﻿/, "").replace(/\r\n?/g, "\n");
  if (text.trim().length === 0) throw new NoticeUnavailableError();
  return Object.freeze({ version: createHash("sha256").update(text, "utf8").digest("hex"), text });
}

/** Reads the notice file once. `path` defaults to WHATSAPP_NOTICE_PATH, then to the repo copy. */
export function loadNotice(path?: string, env: Record<string, string | undefined> = process.env): Notice {
  const file = path ?? ((env[NOTICE_PATH_ENV] ?? "").trim() || defaultNoticePath());
  let raw: Buffer;
  try { raw = readFileSync(file); } catch { throw new NoticeUnavailableError(); }
  return parseNotice(raw);
}

/** Null when the notice cannot be read (the caller answers 503 `notice_unavailable`). */
export function tryLoadNotice(path?: string, env?: Record<string, string | undefined>): Notice | null {
  try { return loadNotice(path, env); } catch { return null; }
}
