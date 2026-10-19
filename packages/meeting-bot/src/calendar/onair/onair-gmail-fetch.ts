/** Reads recent Google Cloud event mails over the gws CLI (read-only list/get). Tests inject a fake runner; nothing here sends or modifies mail. */
import type { AutojoinGwsRunner } from "../../autojoin/gws-channels.js";
import type { OnairMail } from "./onair-mail-source.js";

const QUERY = "from:google.com (cloudplatformonline.com OR cloudonair.withgoogle.com) newer_than:14d";
const MAX_MESSAGES = 50, MAX_BODY = 512 * 1024;

interface Part { mimeType?: string; headers?: { name: string; value: string }[]; body?: { data?: string }; parts?: Part[] }
const json = (out: string): any => { const i = out.indexOf("{"); if (i < 0) throw new Error("gws produced no JSON output"); return JSON.parse(out.slice(i)); };
const decode = (data?: string) => data ? Buffer.from(data.replace(/-/g, "+").replace(/_/g, "/"), "base64").toString("utf8").slice(0, MAX_BODY) : "";

function bodies(part: Part | undefined, acc = { html: "", text: "" }): { html: string; text: string } {
  if (!part) return acc;
  if (part.mimeType === "text/html") acc.html += decode(part.body?.data);
  else if (part.mimeType === "text/plain") acc.text += decode(part.body?.data);
  for (const p of part.parts ?? []) bodies(p, acc);
  return acc;
}
const header = (part: Part | undefined, name: string) => part?.headers?.find(h => h.name.toLowerCase() === name)?.value ?? "";

/** Authenticated = the receiving server recorded dmarc=pass for a google.com From domain (the first Authentication-Results header). */
export function headerAuthenticated(authResults: string): boolean {
  return /\bdmarc=pass\b/i.test(authResults) && /\bheader\.from=google\.com\b/i.test(authResults);
}

export function createOnairGmailLoader(gws: AutojoinGwsRunner): () => Promise<OnairMail[]> {
  return async () => {
    const list = json(await gws(["gmail", "users", "messages", "list", "--params", JSON.stringify({ userId: "me", q: QUERY, maxResults: MAX_MESSAGES })]));
    const mails: OnairMail[] = [];
    for (const ref of (Array.isArray(list.messages) ? list.messages : []).slice(0, MAX_MESSAGES)) {
      if (typeof ref?.id !== "string" || !/^[A-Za-z0-9_-]{1,64}$/.test(ref.id)) continue;
      const msg = json(await gws(["gmail", "users", "messages", "get", "--params", JSON.stringify({ userId: "me", id: ref.id, format: "full" })]));
      const ms = Number(msg.internalDate);
      if (!Number.isFinite(ms)) continue;
      const { html, text } = bodies(msg.payload);
      mails.push({ messageId: ref.id, threadId: typeof msg.threadId === "string" ? msg.threadId : undefined, subject: header(msg.payload, "subject"),
        date: new Date(ms).toISOString(), from: header(msg.payload, "from"),
        senderAuthenticated: headerAuthenticated(header(msg.payload, "authentication-results")), html, text });
    }
    return mails;
  };
}
