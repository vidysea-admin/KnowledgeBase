/**
 * apps/api/src/youtube-import/oauth.ts - Google OAuth installed-app flow (PKCE + loopback redirect) for the channel
 * owner. The owner approves consent in their own browser; this code only prints the URL and listens on 127.0.0.1.
 * Scope: youtube.force-ssl (required by captions.list / captions.download). The refresh token goes to a gitignored
 * local file (mode 0600) and is never printed or logged.
 */
import { createHash, randomBytes } from "node:crypto";
import { createServer, type Server } from "node:http";
import type { AddressInfo } from "node:net";
import type { Http } from "./http.js";

export const YT_SCOPE = "https://www.googleapis.com/auth/youtube.force-ssl";
const AUTH_ENDPOINT = "https://accounts.google.com/o/oauth2/v2/auth";
const TOKEN_ENDPOINT = "https://oauth2.googleapis.com/token";

export interface OAuthClient { clientId: string; clientSecret: string }
export interface TokenStore { load(): Promise<{ refreshToken: string } | undefined>; save(t: { refreshToken: string; scope: string; obtainedAt: string }): Promise<void> }

/** LKB_YT_CLIENT_ID + LKB_YT_CLIENT_SECRET, else a Google "client_secret.json" (installed or web) named by LKB_YT_CLIENT_FILE or `defaultFile`. */
export function loadClient(env: Record<string, string | undefined>, readFile: (path: string) => string | undefined, defaultFile: string): OAuthClient {
  if (env.LKB_YT_CLIENT_ID && env.LKB_YT_CLIENT_SECRET) return { clientId: env.LKB_YT_CLIENT_ID, clientSecret: env.LKB_YT_CLIENT_SECRET };
  const raw = readFile(env.LKB_YT_CLIENT_FILE || defaultFile);
  if (raw) {
    const j = JSON.parse(raw) as Record<string, { client_id?: string; client_secret?: string } | undefined>;
    const c = j.installed ?? j.web;
    if (c?.client_id && c.client_secret) return { clientId: c.client_id, clientSecret: c.client_secret };
  }
  throw new Error("youtube-import: no OAuth client. Set LKB_YT_CLIENT_ID and LKB_YT_CLIENT_SECRET, or LKB_YT_CLIENT_FILE (see docs/youtube-owner-captions.md)");
}

const b64url = (b: Buffer) => b.toString("base64url");
export function pkcePair(): { verifier: string; challenge: string } {
  const verifier = b64url(randomBytes(48));
  return { verifier, challenge: b64url(createHash("sha256").update(verifier).digest()) };
}
export function buildAuthUrl(p: { clientId: string; redirectUri: string; state: string; challenge: string }): string {
  const q = new URLSearchParams({ client_id: p.clientId, redirect_uri: p.redirectUri, response_type: "code", scope: YT_SCOPE, access_type: "offline",
    prompt: "consent", state: p.state, code_challenge: p.challenge, code_challenge_method: "S256" });
  return `${AUTH_ENDPOINT}?${q.toString()}`;
}

async function tokenCall(http: Http, form: Record<string, string>): Promise<Record<string, unknown>> {
  const res = await http({ url: TOKEN_ENDPOINT, method: "POST", headers: { "content-type": "application/x-www-form-urlencoded" }, body: new URLSearchParams(form).toString() });
  let body: Record<string, unknown> = {};
  try { body = JSON.parse(res.body) as Record<string, unknown>; } catch { /* non-JSON error page */ }
  // The message names only Google's error code, never the response body (which can carry token material).
  if (res.status !== 200) throw new Error(`youtube-import: Google token endpoint refused the request (HTTP ${res.status} ${String(body.error ?? "unknown")})`);
  return body;
}

export function createTokenProvider(deps: { client: OAuthClient; store: TokenStore; http: Http; now?: () => number }): () => Promise<string> {
  const now = deps.now ?? Date.now;
  let cached: { token: string; expiresAt: number } | undefined;
  return async () => {
    if (cached && cached.expiresAt - 60_000 > now()) return cached.token;
    const saved = await deps.store.load();
    if (!saved) throw new Error("youtube-import: not authorised yet. Run the `login` command first");
    const body = await tokenCall(deps.http, { client_id: deps.client.clientId, client_secret: deps.client.clientSecret, refresh_token: saved.refreshToken, grant_type: "refresh_token" });
    const token = body.access_token;
    if (typeof token !== "string" || !token) throw new Error("youtube-import: token refresh returned no access token");
    cached = { token, expiresAt: now() + Number(body.expires_in ?? 3600) * 1000 };
    return token;
  };
}

/** Listens on 127.0.0.1 (random port) for the single OAuth redirect; resolves with the code after the state check. */
export function listenForCode(state: string, timeoutMs = 300_000): { server: Server; ready: Promise<string>; result: Promise<string> } {
  const server = createServer();
  let finish!: (r: { code?: string; error?: Error }) => void;
  const done = new Promise<{ code?: string; error?: Error }>((r) => { finish = r; });
  const timer = setTimeout(() => finish({ error: new Error("youtube-import: consent timed out") }), timeoutMs);
  server.on("request", (req, res) => {
    const u = new URL(req.url ?? "/", "http://127.0.0.1");
    if (u.pathname !== "/callback") { res.writeHead(404).end(); return; }
    const ok = u.searchParams.get("state") === state && !!u.searchParams.get("code") && !u.searchParams.get("error");
    res.writeHead(ok ? 200 : 400, { "content-type": "text/plain" }).end(ok ? "Authorised. You can close this tab and return to the terminal." : "Authorisation failed. Return to the terminal.");
    finish(ok ? { code: u.searchParams.get("code")! } : { error: new Error("youtube-import: consent was denied or the state did not match") });
  });
  const ready = new Promise<string>((resolve, reject) => {
    server.once("error", reject);
    server.listen(0, "127.0.0.1", () => resolve(`http://127.0.0.1:${(server.address() as AddressInfo).port}/callback`));
  });
  const result = done.then((r) => { clearTimeout(timer); server.close(); if (r.error) throw r.error; return r.code!; });
  return { server, ready, result };
}

export async function runLogin(deps: { client: OAuthClient; store: TokenStore; http: Http; print: (line: string) => void; timeoutMs?: number }): Promise<void> {
  const state = b64url(randomBytes(16)); const { verifier, challenge } = pkcePair();
  const listener = listenForCode(state, deps.timeoutMs);
  const redirectUri = await listener.ready;
  deps.print("Open this URL in your browser, sign in as the channel owner and approve the YouTube access request:");
  deps.print(buildAuthUrl({ clientId: deps.client.clientId, redirectUri, state, challenge }));
  const code = await listener.result;
  const body = await tokenCall(deps.http, { code, client_id: deps.client.clientId, client_secret: deps.client.clientSecret, redirect_uri: redirectUri, grant_type: "authorization_code", code_verifier: verifier });
  if (typeof body.refresh_token !== "string" || !body.refresh_token) throw new Error("youtube-import: Google returned no refresh token; remove the app under your Google account permissions and run login again");
  await deps.store.save({ refreshToken: body.refresh_token, scope: YT_SCOPE, obtainedAt: new Date().toISOString() });
  deps.print("Authorised. Refresh token stored locally (not shown).");
}
