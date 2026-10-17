import { lstatSync, mkdirSync, readFileSync, realpathSync, renameSync, rmSync, writeFileSync, existsSync, openSync, fsyncSync, closeSync } from "node:fs";
import { randomUUID } from "node:crypto";
import path from "node:path";
import { validateRecordConsent, type RecordConsentReceipt } from "./context.js";

function physicalDirectory(directory: string): void {
  const canonical = (value: string) => process.platform === "win32" ? value.toLowerCase() : value;
  for (let current = path.resolve(directory); ; current = path.dirname(current)) {
    if (existsSync(current) && (lstatSync(current).isSymbolicLink() || !lstatSync(current).isDirectory() ||
      canonical(realpathSync(current)) !== canonical(current))) throw new Error("Redirected capture consent directory refused");
    if (path.dirname(current) === current) break;
  }
}
function receiptPath(recordDir: string, tenantId: string, sessionId: string): string {
  // Reject network/device roots before any lstat/realpath can access an external surface.
  if (typeof recordDir !== "string" || !path.isAbsolute(recordDir) || /^[/\\]{2}/.test(recordDir) ||
    (process.platform === "win32" && !/^[A-Za-z]:[/\\]/.test(recordDir))) throw new Error("Local absolute capture consent directory required");
  if (!/^[A-Za-z0-9][A-Za-z0-9._-]{0,99}$/.test(tenantId) || !/^[A-Za-z0-9][A-Za-z0-9._-]{0,149}$/.test(sessionId)) {
    throw new Error("Invalid capture consent owner");
  }
  const directory = path.join(path.resolve(recordDir), "record-consent", tenantId);
  physicalDirectory(directory);
  return path.join(directory, `${sessionId}.json`);
}
export function readRecordConsent(recordDir: string, owner: {tenantId: string; sessionId: string; meetingHash?: string}): RecordConsentReceipt {
  const file = receiptPath(recordDir, owner.tenantId, owner.sessionId);
  const stat = lstatSync(file);
  if (!stat.isFile() || stat.isSymbolicLink() || stat.nlink !== 1 || stat.size > 65536) throw new Error("Unsafe capture consent receipt refused");
  let value: unknown;
  try { value = JSON.parse(readFileSync(file, "utf8")); } catch { throw new Error("Unreadable capture consent receipt"); }
  return validateRecordConsent(value, owner);
}
/** Durable BEFORE join; recovery reads these same facts rather than inventing approval. */
export function writeRecordConsent(recordDir: string, input: RecordConsentReceipt): void {
  const receipt = validateRecordConsent(input, input);
  const file = receiptPath(recordDir, receipt.tenantId, receipt.sessionId);
  if (existsSync(file)) {
    const prior = readRecordConsent(recordDir, receipt);
    if(prior.generation!==receipt.generation)throw new Error("Capture attempt generation cannot be replaced during recovery");
    if (JSON.stringify(prior.operationalApproval) !== JSON.stringify(receipt.operationalApproval) ||
      JSON.stringify(prior.consent) !== JSON.stringify(receipt.consent) || prior.organizerConsent !== receipt.organizerConsent) {
      throw new Error("Capture consent provenance cannot be replaced during recovery");
    }
    if (prior.mediaStartedAt !== undefined && prior.mediaStartedAt !== receipt.mediaStartedAt) throw new Error("Capture media origin cannot be replaced during recovery");
  }
  mkdirSync(path.dirname(file), {recursive: true, mode: 0o700});
  physicalDirectory(path.dirname(file));
  const temporary = path.join(path.dirname(file), `.receipt-${randomUUID()}`);
  try {
    const fd = openSync(temporary, "wx", 0o600);
    try {writeFileSync(fd, JSON.stringify(receipt, null, 2) + "\n"); fsyncSync(fd);} finally {closeSync(fd);}
    renameSync(temporary, file);
  } finally { rmSync(temporary, {force: true}); }
}
