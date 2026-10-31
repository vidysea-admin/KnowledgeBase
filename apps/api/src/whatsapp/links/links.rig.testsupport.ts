/**
 * HTTP rig for the links router (W5): the REAL createServer (so requireAuth, the session guards - CSRF, non-active, viewer
 * read-only - and the integrated-workflow mount all run) over an in-memory store and, optionally, the in-repo fake archiver
 * reached through the real W3 client. Mirrors adminRig in user-accounts/admin.testsupport.ts.
 */
import type { AddressInfo } from "node:net";
import type { Users } from "@lkb/core";
import { buildTestDeps, fakeKeyStore } from "../../fixtures.js";
import type { VerifiedKey } from "../../auth.js";
import { createServer, type ServerDeps } from "../../server.js";
import { COOKIE_NAME_SECURE } from "../../user-accounts/cookie.js";
import { csrfTokenFor } from "../../user-accounts/csrf.js";
import { createSessionAuth } from "../../user-accounts/principal.js";
import { createSessionService } from "../../user-accounts/sessions.js";
import { fakeClock, memorySessionStore, memoryUsers } from "../../user-accounts/sessions.testsupport.js";
import { ORIGIN, SECRET, type Who } from "../../user-accounts/admin.testsupport.js";
import { createArchiverClient } from "../archiver/client.js";
import { loadArchiverConfig } from "../archiver/config.js";
import { startFakeArchiver, type FakeArchiver } from "../archiver/fake-archiver.js";
import type { EventsFeed } from "./events-router.js";
import { createWhatsAppLinksRouter } from "./router.js";
import { createLinksService, type LinksServiceDeps } from "./service.js";
import { memoryLinkData, memoryLinksStore, NOTICE } from "./links.testsupport.js";

export async function linksRig(opts: { users: Users[]; keys?: Record<string, VerifiedKey>; fake?: FakeArchiver; linkDeps?: Partial<LinksServiceDeps>; noLinks?: boolean; events?: EventsFeed; deps?: Partial<ServerDeps> }) {
  const clock = fakeClock(), mem = memorySessionStore(), lookup = memoryUsers(opts.users), store = memoryLinksStore(), data = memoryLinkData();
  const sessions = createSessionService({ store: mem.store, users: lookup, now: clock.now });
  const archiver = opts.fake ? createArchiverClient(loadArchiverConfig({ WHATSAPP_ARCHIVER_API_URL: opts.fake.url, WHATSAPP_ARCHIVER_API_TOKEN: opts.fake.token, WHATSAPP_ARCHIVER_API_ALLOW_PRIVATE_HTTP: "1" })!) : null;
  const logs: string[] = [];
  const log = { warn: (m: string, f?: unknown) => { logs.push(m + JSON.stringify(f ?? {})); }, error: (m: string, f?: unknown) => { logs.push(m + JSON.stringify(f ?? {})); } };
  const service = createLinksService({
    store, archiver, data, notice: () => NOTICE, log, now: clock.now,
    countActiveAdmins: async (t) => opts.users.filter(u => u.tenantId === t && u.status === "active" && u.role === "admin").length,
    userStatus: async (t, id) => { const u = opts.users.find(x => x._id === id && x.tenantId === t); return u ? { status: u.status, ...(u.role ? { role: u.role } : {}) } : null; },
    ...opts.linkDeps,
  });
  const userAccounts = { session: createSessionAuth({ sessions, cookie: { basePath: "", production: true }, csrf: { secret: SECRET, allowedOrigins: [ORIGIN] } }) };
  const app = createServer(buildTestDeps({ keyStore: fakeKeyStore(opts.keys ?? {}), userAccounts, ...(opts.noLinks ? {} : { whatsappLinks: { service, notice: () => NOTICE } }), ...(opts.events ? { whatsappEvents: { feed: opts.events } } : {}), ...opts.deps }));
  const http = app.listen(0, "127.0.0.1"); await new Promise(r => http.once("listening", r));
  const base = `http://127.0.0.1:${(http.address() as AddressInfo).port}`;
  const live = new Map<string, { token: string; sessionId: string }>();
  async function login(userId: string, tenantId: string): Promise<void> { const { token, session } = await sessions.create(tenantId, userId); live.set(userId, { token, sessionId: session._id }); }
  async function call(who: Who, method: string, path: string, body?: unknown, extra: Record<string, string> = {}) {
    const headers: Record<string, string> = { connection: "close", ...extra };
    if (who && "user" in who) {
      const s = live.get(who.user)!; headers.cookie = `${COOKIE_NAME_SECURE}=${s.token}`;
      if (who.origin !== null) headers.origin = who.origin ?? ORIGIN;
      if (who.csrf !== null) headers["x-lkb-csrf"] = who.csrf ?? csrfTokenFor(s.sessionId, SECRET);
    } else if (who && "key" in who) headers.authorization = `Bearer ${who.key}`;
    if (body !== undefined) headers["content-type"] = "application/json";
    const res = await fetch(base + path, { method, headers, ...(body === undefined ? {} : { body: typeof body === "string" ? body : JSON.stringify(body) }) });
    const text = await res.text(); let json: Record<string, any> | null = null;
    try { json = JSON.parse(text) as Record<string, any>; } catch { /* not json */ }
    return { status: res.status, json, text, headers: res.headers };
  }
  return { call, login, store, data, service, logs, clock, close: () => new Promise<void>(r => http.close(() => r())) };
}
export { startFakeArchiver, NOTICE, createWhatsAppLinksRouter };
