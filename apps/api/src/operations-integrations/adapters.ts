import { execFile } from "node:child_process";
import { isAbsolute } from "node:path";
import type { IntegrationAdapter } from "./service.js";
import { contentFingerprint, digestText, operationFingerprint, sheetRows } from "./payload.js";
interface AdapterIo {
  mail(binary: string, args: string[], signal: AbortSignal): Promise<unknown>;
  sheets(url: string, token: string, method: "GET" | "PUT", body: unknown, signal: AbortSignal): Promise<unknown>;
}
const object = (value: unknown): value is Record<string, unknown> => !!value && typeof value === "object" && !Array.isArray(value);
function parseCli(stdout: string): unknown {
  const lines = stdout.split("\n"), start = lines.findIndex(line => /^\s*[\[{]/.test(line));
  if (start < 0) throw new Error("Invalid Google response"); return JSON.parse(lines.slice(start).join("\n"));
}
function sentBody(raw: unknown, id: string, runId: string, recipient: string): string | null {
  if (!object(raw) || raw.id !== id || !Array.isArray(raw.labelIds) || !raw.labelIds.includes("SENT") || !object(raw.payload) || !Array.isArray(raw.payload.headers) || !object(raw.payload.body) || typeof raw.payload.body.data !== "string") return null;
  const header = (name: string) => raw.payload && object(raw.payload) && Array.isArray(raw.payload.headers) ? raw.payload.headers.filter(row => object(row) && typeof row.name === "string" && row.name.toLowerCase() === name) : [];
  const message = header("message-id"), to = header("to");
  if (message.length !== 1 || to.length !== 1 || message[0]?.value !== `<${runId}@knowledgebase.local>` || to[0]?.value !== recipient) return null;
  return Buffer.from(raw.payload.body.data, "base64url").toString("utf8");
}
const actualIo: AdapterIo = {
  mail: (binary, args, signal) => new Promise((resolve, reject) => execFile(binary, args, { signal, timeout: 15000, maxBuffer: 2 * 1024 * 1024, windowsHide: true }, (error, stdout) => {
    if (error) { reject(new Error("Google command failed")); return; }
    try { resolve(parseCli(stdout)); } catch { reject(new Error("Invalid Google response")); }
  })),
  async sheets(url, token, method, body, signal) {
    const response = await fetch(url, { method, signal, redirect: "error", headers: { authorization: `Bearer ${token}`, ...(body !== undefined ? { "content-type": "application/json" } : {}) }, body: body === undefined ? undefined : JSON.stringify(body) });
    if (!response.ok || !response.body || Number(response.headers.get("content-length") ?? 0) > 2 * 1024 * 1024) { await response.body?.cancel(); throw new Error("Google Sheets request failed"); }
    const reader = response.body.getReader(), chunks: Uint8Array[] = []; let bytes = 0;
    try {
      while (true) { const part = await reader.read(); if (part.done) break; bytes += part.value.byteLength; if (bytes > 2 * 1024 * 1024) throw new Error("Google response too large"); chunks.push(part.value); }
      return JSON.parse(Buffer.concat(chunks).toString("utf8"));
    } finally { await reader.cancel().catch(() => undefined); }
  },
};
/** Construction is passive. Exact destinations and tenant are operator-selected, never API/body inputs. */
export function createConfiguredOperationsAdapters(env: NodeJS.ProcessEnv, io: AdapterIo = actualIo): Record<"digest" | "sheets", IntegrationAdapter> {
  const tenant = env.LKB_OPERATIONS_APPROVED_TENANT;
  const active = env.LKB_OPERATIONS_EXTERNAL_ENABLE === "1" && typeof env.LKB_OPERATIONS_APPROVAL_REF === "string" && env.LKB_OPERATIONS_APPROVAL_REF.trim().length > 0 && typeof tenant === "string" && tenant.length > 0 && tenant === tenant.trim() && !/[\u0000-\u001f\u007f]/.test(tenant);
  const recipient = env.LKB_OPERATIONS_DIGEST_RECIPIENT, binary = env.LKB_OPERATIONS_GWS_BINARY;
  const mailReady = active && typeof recipient === "string" && recipient.length <= 254 && /^[A-Za-z0-9.!#$%&'*+/=?^_`{|}~-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}$/.test(recipient) && typeof binary === "string" && isAbsolute(binary) && (process.platform !== "win32" || /\.exe$/i.test(binary));
  const spreadsheet = env.LKB_OPERATIONS_SHEETS_ID, token = env.LKB_OPERATIONS_GOOGLE_ACCESS_TOKEN;
  const sheetsReady = active && typeof spreadsheet === "string" && /^[A-Za-z0-9_-]{20,200}$/.test(spreadsheet) && typeof token === "string" && /^[^\s\u0000-\u001f\u007f]{1,4096}$/.test(token);
  const available = (ready: boolean, caller: string) => ready && caller === tenant;
  const digestBinding = JSON.stringify([env.LKB_OPERATIONS_APPROVAL_REF, binary, recipient]);
  const sheetsBinding = JSON.stringify([env.LKB_OPERATIONS_APPROVAL_REF, spreadsheet, "'Knowledge Bank Export'!A1:E502"]);
  return {
    digest: {
      available: caller => available(mailReady, caller),
      fingerprint: (caller, snapshot) => operationFingerprint("digest", caller, snapshot, digestBinding),
      async execute({ tenant: caller, runId, snapshot, signal }) {
        if (!available(mailReady, caller) || signal.aborted || runId !== operationFingerprint("digest", caller, snapshot, digestBinding)) throw new Error("Digest unavailable");
        const messageId = `<${runId}@knowledgebase.local>`;
        const text = digestText(snapshot, runId);
        const raw = Buffer.from(`To: ${recipient}\r\nSubject: Knowledge Base operations digest\r\nMessage-ID: ${messageId}\r\nMIME-Version: 1.0\r\nContent-Type: text/plain; charset=UTF-8\r\nContent-Transfer-Encoding: base64\r\n\r\n${Buffer.from(text).toString("base64")}\r\n`).toString("base64url");
        const sent = await io.mail(binary!, ["gmail", "users", "messages", "send", "--params", JSON.stringify({ userId: "me" }), "--json", JSON.stringify({ raw })], signal);
        if (!object(sent) || typeof sent.id !== "string" || !/^[A-Za-z0-9_-]{1,200}$/.test(sent.id)) throw new Error("Unverified digest receipt");
        const verified = await io.mail(binary!, ["gmail", "users", "messages", "get", "--params", JSON.stringify({ userId: "me", id: sent.id, format: "full" })], signal);
        if (sentBody(verified, sent.id, runId, recipient!) !== text) throw new Error("Unverified digest receipt");
      },
      async verifyReceipt({ tenant: caller, runId, attemptAt, attemptRevision, signal }) {
        if (!available(mailReady, caller) || signal.aborted) return false;
        const found = await io.mail(binary!, ["gmail", "users", "messages", "list", "--params", JSON.stringify({ userId: "me", q: `rfc822msgid:${runId}@knowledgebase.local`, maxResults: 2 })], signal);
        if (!object(found) || found.nextPageToken !== undefined || !Array.isArray(found.messages) || found.messages.length !== 1 || !object(found.messages[0]) || typeof found.messages[0].id !== "string" || !/^[A-Za-z0-9_-]{1,200}$/.test(found.messages[0].id)) return false;
        const id = found.messages[0].id;
        const value = await io.mail(binary!, ["gmail", "users", "messages", "get", "--params", JSON.stringify({ userId: "me", id, format: "full" })], signal);
        const text = sentBody(value, id, runId, recipient!), line = `Run: ${runId}\n`;
        return text !== null && text.split(line).length === 2 && text.includes(`Attempt: ${attemptAt}\nIntent revision: ${attemptRevision}\n`) && contentFingerprint("digest", caller, text.replace(line, "Run: \n"), digestBinding) === runId;
      },
    },
    sheets: {
      available: caller => available(sheetsReady, caller),
      fingerprint: (caller, snapshot) => operationFingerprint("sheets", caller, snapshot, sheetsBinding),
      async execute({ tenant: caller, runId, snapshot, signal }) {
        if (!available(sheetsReady, caller) || signal.aborted || runId !== operationFingerprint("sheets", caller, snapshot, sheetsBinding)) throw new Error("Sheets unavailable");
        // An operator-approved dedicated tab/range only; RAW prevents formula execution.
        const range = "'Knowledge Bank Export'!A1:E502";
        const expected = sheetRows(snapshot, runId);
        const values = [...expected, ...Array.from({ length: 502 - expected.length }, () => ["", "", "", "", ""])];
        const base = `https://sheets.googleapis.com/v4/spreadsheets/${encodeURIComponent(spreadsheet!)}/values/${encodeURIComponent(range)}`;
        const written = await io.sheets(`${base}?valueInputOption=RAW`, token!, "PUT", { range, majorDimension: "ROWS", values }, signal);
        if (!object(written) || written.spreadsheetId !== spreadsheet || typeof written.updatedRows !== "number" || written.updatedRows < expected.length) throw new Error("Unverified Sheets update");
        const verified = await io.sheets(`${base}?valueRenderOption=UNFORMATTED_VALUE`, token!, "GET", undefined, signal);
        if (!object(verified) || !Array.isArray(verified.values) || verified.values.length !== expected.length || !verified.values.every((row: unknown, index: number) => Array.isArray(row) && row.length <= 5 && Array.from({ length: 5 }, (_, column) => row[column] ?? "").every((cell, column) => typeof cell === "string" && cell === expected[index]?.[column]))) throw new Error("Unverified Sheets receipt");
      },
      async verifyReceipt({ tenant: caller, runId, attemptAt, attemptRevision, signal }) {
        if (!available(sheetsReady, caller) || signal.aborted) return false;
        const range = "'Knowledge Bank Export'!A1:E502", base = `https://sheets.googleapis.com/v4/spreadsheets/${encodeURIComponent(spreadsheet!)}/values/${encodeURIComponent(range)}`;
        const value = await io.sheets(`${base}?valueRenderOption=UNFORMATTED_VALUE`, token!, "GET", undefined, signal);
        if (!object(value) || !Array.isArray(value.values) || value.values.length < 2 || value.values.length > 502 || !value.values.every(row => Array.isArray(row) && row.length <= 5 && row.every(cell => typeof cell === "string"))) return false;
        const rows: string[][] = value.values.map(row => Array.from({ length: 5 }, (_, index) => row[index] ?? ""));
        if (rows[0]?.[0] !== `Operations run #${attemptRevision} at ${attemptAt}` || rows[0]?.[1] !== runId || rows[0]?.[2] !== "Scope" || rows[0]?.[3] !== "session-metadata-only") return false;
        rows[0]![1] = "";
        return contentFingerprint("sheets", caller, JSON.stringify(rows), sheetsBinding) === runId;
      },
    },
  };
}
