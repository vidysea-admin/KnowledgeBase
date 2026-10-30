/**
 * Email and Google Calendar alert transports over the gws CLI (win32 default <repo>/.cache/tools/gws-0.22.5/gws.exe; elsewhere `gws` on PATH; LKB_GWS_PATH overrides on every platform).
 * `AutojoinGwsRunner` is the single seam: tests inject a fake and never start the real binary. No credential is ever read, passed or logged
 * here (gws authenticates from its own keyring); a failure surfaces only the exit code and a short, URL-free stderr line.
 */
import { execFile } from "node:child_process";
import path from "node:path";
import { cleanBotText } from "./bot-events.js";

export type AutojoinGwsRunner = (args: string[]) => Promise<string>;

export function resolveGwsBinary(repoRoot: string, env: NodeJS.ProcessEnv = process.env, platform: NodeJS.Platform = process.platform): string {
  const override = env.LKB_GWS_PATH?.trim();
  if (override) return override;
  return platform === "win32" ? path.join(repoRoot, ".cache", "tools", "gws-0.22.5", "gws.exe") : "gws";
}

export function createGwsRunner(repoRoot: string, env: NodeJS.ProcessEnv = process.env): AutojoinGwsRunner {
  const bin = resolveGwsBinary(repoRoot, env);
  return (args) => new Promise((resolve, reject) => {
    execFile(bin, args, { timeout: 30_000, maxBuffer: 2 * 1024 * 1024, windowsHide: true }, (err, stdout, stderr) => {
      if (!err) { resolve(stdout); return; }
      const code = (err as { code?: unknown }).code;
      reject(new Error(`gws failed (${typeof code === "number" || typeof code === "string" ? code : "error"}): ${cleanBotText(stderr, 160)}`));
    });
  });
}

const b64url = (buf: Buffer): string => buf.toString("base64").replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");

/** RFC 5322 message for `gmail users messages send` (UTF-8 subject via RFC 2047, plain-text body). */
export function buildRawEmail(to: string, subject: string, body: string): string {
  const head = [`To: ${to}`, `Subject: =?UTF-8?B?${Buffer.from(cleanBotText(subject, 200), "utf8").toString("base64")}?=`,
    "MIME-Version: 1.0", "Content-Type: text/plain; charset=UTF-8", "Content-Transfer-Encoding: base64"].join("\r\n");
  const wrapped = Buffer.from(body, "utf8").toString("base64").replace(/(.{76})/g, "$1\r\n");
  return b64url(Buffer.from(`${head}\r\n\r\n${wrapped}\r\n`, "utf8"));
}

export async function sendAlertEmail(gws: AutojoinGwsRunner, to: string, subject: string, body: string): Promise<void> {
  await gws(["gmail", "users", "messages", "send", "--params", JSON.stringify({ userId: "me" }), "--json", JSON.stringify({ raw: buildRawEmail(to, subject, body) })]);
}

export interface BotCalendarEvent {
  summary: string; description: string; startTime: string; endTime: string; colorId: string;
}
const calendarBody = (e: BotCalendarEvent) => ({
  summary: e.summary, description: e.description, colorId: e.colorId,
  start: { dateTime: e.startTime }, end: { dateTime: e.endTime },
  // Private + free + no attendees + no notifications: a personal marker nobody else sees and that blocks no time.
  visibility: "private", transparency: "transparent", reminders: { useDefault: false }, guestsCanModify: false,
});

function firstJsonObject(stdout: string): Record<string, unknown> {
  const i = stdout.indexOf("{");
  if (i < 0) throw new Error("gws produced no JSON output");
  return JSON.parse(stdout.slice(i)) as Record<string, unknown>;
}

/** Creates Umesh's own private marker event and returns its id. Never touches another calendar event. */
export async function createBotCalendarEvent(gws: AutojoinGwsRunner, e: BotCalendarEvent): Promise<string> {
  const out = firstJsonObject(await gws(["calendar", "events", "insert", "--params", JSON.stringify({ calendarId: "primary", sendUpdates: "none" }), "--json", JSON.stringify(calendarBody(e))]));
  if (typeof out.id !== "string" || !/^[A-Za-z0-9_-]{5,1024}$/.test(out.id)) throw new Error("gws calendar insert returned no usable event id");
  return out.id;
}

/** Updates ONLY an event this module created (its id comes from our own state file): description and colour. */
export async function updateBotCalendarEvent(gws: AutojoinGwsRunner, eventId: string, e: Pick<BotCalendarEvent, "description" | "colorId">): Promise<void> {
  if (!/^[A-Za-z0-9_-]{5,1024}$/.test(eventId)) throw new Error("refusing to patch a calendar event with an unusable id");
  await gws(["calendar", "events", "patch", "--params", JSON.stringify({ calendarId: "primary", eventId, sendUpdates: "none" }), "--json", JSON.stringify({ description: e.description, colorId: e.colorId })]);
}
