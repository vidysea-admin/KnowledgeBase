/**
 * In-repo fake of the archiver service API (contract docs/whatsapp/archiver-service-api.md). A real HTTP server on
 * 127.0.0.1 so the KB client and the contract suite exercise the true wire path; state lives in memory and the
 * `control` handle (NOT part of the contract) puts owners into each status for the wire tests. Test support only:
 * nothing in production imports this file. Behaviour the fake cannot prove is the contract's "archiver-only" list.
 */
import { createServer, type IncomingMessage, type Server, type ServerResponse } from "node:http";
import { createHash, randomBytes, timingSafeEqual } from "node:crypto";
import { IDEMPOTENCY_KEY_RE, JID_RE, OWNER_ID_RE, PERSON_ID_RE, REQUEST_ID_RE } from "./config.js";

type Status = "connecting" | "awaiting_qr" | "connected" | "reconnecting" | "logged_out" | "closed" | "not_started";
export interface GroupSeed { jid: string; subject: string; participantCount?: number; isTracked?: boolean; trackAllSenders?: boolean; membersSyncedAt?: string | null }
export interface PersonSeed { personId?: string; displayName?: string; savedName?: string; pushName?: string; number?: string }
interface Person extends PersonSeed { personId: string }
interface Group { jid: string; subject: string; participantCount: number; isTracked: boolean; trackAllSenders: boolean; membersSyncedAt: string | null }
interface Owner {
  id: string; ref: string | null; service: boolean; unlinkedAt: string | null; status: Status; detail: string | null;
  updatedAt: string | null; hint: string | null; qr: { qr: string; exp: number } | null; groups: Map<string, Group>;
  people: Map<string, Person>; groupPeople: Map<string, string[]>; selected: Map<string, Set<string>>;
  live: GroupSeed[] | null; lastRefresh: number; refreshedAt: string | null;
}
type Reply = [number, unknown, Record<string, string>?];
interface Ctx { o: Owner | null; jid: string; body: Record<string, unknown>; rid: string }
export interface FakeControl {
  setNow(ms: number): void; addUiOwner(): string; setStatus(id: string, s: Status, o?: { hint?: string; detail?: string }): void;
  emitQr(id: string, qr: string): void; seedGroups(id: string, g: GroupSeed[]): void; setLive(id: string, g: GroupSeed[]): void;
  seedPeople(id: string, jid: string, p: PersonSeed[]): string[]; setStoreDown(down: boolean): void; hold(): () => void;
  counters: { handled: number; liveRefreshes: number }; owner(id: string): { state: string; status: Status; tracked: string[] } | null;
}
export interface FakeArchiver { url: string; token: string; tokenNext: string; control: FakeControl; stop(): Promise<void> }

const hex = (n = 12): string => randomBytes(n).toString("hex");
const sha = (s: string): Buffer => createHash("sha256").update(s).digest();
const CTRL = /[\u0000-\u001f\u007f‪-‮⁦-⁯]/g;
const clean = (s: string | undefined, max: number): string => (s ?? "").replace(CTRL, "").trim().slice(0, max);
const LIMITS: Record<string, number> = { qr: 30, session: 60, list: 12, mutate: 60, owners: 30, unlink: 6, token: 600, health: 60, authfail: 20 };

function personLabel(p: PersonSeed): { label: string; hasName: boolean } {
  const name = [p.displayName, p.savedName, p.pushName].map(x => clean(x, 80)).find(Boolean) ?? "";
  if (name && !/[0-9]{7,}/.test(name.replace(/[\s+-]/g, ""))) return { label: name, hasName: true };
  const digits = (p.number ?? "").replace(/\D/g, "");
  return { label: digits.length >= 2 ? `Member ..${digits.slice(-2)}` : "Member", hasName: false };
}

export async function startFakeArchiver(): Promise<FakeArchiver> {
  const token = hex(32), tokenNext = hex(32);
  const digests = [sha(token), sha(tokenNext)];
  const owners = new Map<string, Owner>();
  const byRef = new Map<string, string>();
  const idem = new Map<string, { fp: string; reply: Reply | null }>();
  const windows = new Map<string, { start: number; n: number }>();
  const counters = { handled: 0, liveRefreshes: 0 };
  let now = Date.now(), storeDown = false, gate: Promise<void> | null = null;
  const iso = (ms = now): string => new Date(ms).toISOString();

  const err = (status: number, code: string, rid: string, extra: Record<string, unknown> = {}, h: Record<string, string> = {}): Reply =>
    [status, { error: { code, requestId: rid, ...extra } }, h];
  const limited = (rid: string, windowSec = 60): Reply => err(429, "rate_limited", rid, { retryAfterSec: windowSec }, { "retry-after": String(windowSec) });
  function over(scope: string, key: string, max = LIMITS[scope]!): boolean {
    const k = `${scope}:${key}`;
    const w = windows.get(k);
    if (!w || now - w.start >= 60_000) {
      if (windows.size >= 10_000) windows.delete(windows.keys().next().value as string);
      windows.set(k, { start: now, n: 1 }); return false;
    }
    return ++w.n > max;
  }
  const newOwner = (ref: string | null, service: boolean): Owner => {
    const o: Owner = { id: hex(), ref, service, unlinkedAt: null, status: "not_started", detail: null, updatedAt: null, hint: null, qr: null,
      groups: new Map(), people: new Map(), groupPeople: new Map(), selected: new Map(), live: null, lastRefresh: -Infinity, refreshedAt: null };
    owners.set(o.id, o); return o;
  };
  const setStatus = (o: Owner, s: Status, x: { hint?: string; detail?: string } = {}): void => {
    o.status = s; o.detail = x.detail ?? null; o.hint = s === "connected" ? x.hint ?? null : null; o.updatedAt = iso();
    if (s !== "awaiting_qr") o.qr = null;
  };
  const toGroup = (g: GroupSeed, old?: Group): Group => ({ jid: g.jid, subject: clean(g.subject, 200), participantCount: g.participantCount ?? old?.participantCount ?? 0,
    isTracked: old?.isTracked ?? g.isTracked ?? false, trackAllSenders: old?.trackAllSenders ?? g.trackAllSenders ?? false, membersSyncedAt: g.membersSyncedAt ?? old?.membersSyncedAt ?? null });
  const capture = (o: Owner, g: Group): string =>
    !g.isTracked ? "none" : g.trackAllSenders ? "all" : (o.selected.get(g.jid)?.size ?? 0) > 0 ? "selected" : "none";
  const strict = (b: Record<string, unknown>, req: string[], opt: string[] = []): boolean =>
    req.every(k => k in b) && Object.keys(b).every(k => req.includes(k) || opt.includes(k));

  type H = (c: Ctx) => Reply | Promise<Reply>;
  const need = (c: Ctx): Owner => c.o!;
  const active = (c: Ctx): Reply | null => (need(c).unlinkedAt ? err(409, "owner_unlinked", c.rid) : null);
  const grp = (c: Ctx): Group | Reply => need(c).groups.get(c.jid) ?? err(404, "group_not_found", c.rid);
  const isReply = (x: Group | Reply): x is Reply => Array.isArray(x);

  const routes: Record<string, Record<string, { scope: string; run: H }>> = {
    owners: { POST: { scope: "owners", run: c => {
      if (!strict(c.body, ["ownerRef"]) || typeof c.body.ownerRef !== "string" || !OWNER_ID_RE.test(c.body.ownerRef)) return err(400, "invalid_request", c.rid);
      const ref = c.body.ownerRef;
      const existing = owners.get(byRef.get(ref) ?? "");
      const o = existing ?? (() => { const n = newOwner(ref, true); byRef.set(ref, n.id); return n; })();
      const created = !existing;
      return [200, { ownerId: o.id, ownerRef: ref, created, state: o.unlinkedAt ? "unlinked" : "active" }];
    } } },
    health: { GET: { scope: "health", run: c => {
      const list = [...owners.values()].filter(o => o.service);
      const sessions: Record<string, number> = { connected: 0, awaiting_qr: 0, reconnecting: 0, logged_out: 0, connecting: 0, closed: 0 };
      for (const o of list) { const s = o.unlinkedAt ? "closed" : o.status; if (s in sessions) sessions[s]!++; }
      return [200, { service: "whatsapp-archiver", apiVersion: "1", status: storeDown ? "degraded" : "ok", time: iso(), store: storeDown ? "down" : "ok",
        owners: { active: list.filter(o => !o.unlinkedAt).length, unlinked: list.filter(o => o.unlinkedAt).length }, sessions }];
    } } },
    session: {
      GET: { scope: "session", run: c => { const o = need(c); const st = o.unlinkedAt ? "closed" : o.status;
        return [200, { status: st, detail: o.detail, updatedAt: st === "not_started" ? null : o.updatedAt, accountHint: st === "connected" ? o.hint : null }]; } },
      POST: { scope: "session", run: c => {
        if (Object.keys(c.body).length) return err(400, "invalid_request", c.rid);
        const o = need(c); const u = active(c); if (u) return u;
        if (o.status === "not_started" || o.status === "logged_out") setStatus(o, "connecting");
        return [200, { status: o.status, updatedAt: o.updatedAt }];
      } },
    },
    qr: { GET: { scope: "qr", run: c => {
      const o = need(c); const h = { "cache-control": "no-store", pragma: "no-cache" };
      if (o.unlinkedAt) return [200, { status: "closed", qr: null, qrDataUrl: null, expiresAt: null }, h];
      if (o.status === "not_started") return err(409, "session_not_started", c.rid);
      const live = o.status === "awaiting_qr" && o.qr && now < o.qr.exp ? o.qr : null;
      return [200, { status: o.status, qr: live?.qr ?? null, qrDataUrl: live ? `data:image/png;base64,${Buffer.from(live.qr).toString("base64")}` : null, expiresAt: live ? iso(live.exp) : null }, h];
    } } },
    groups: { GET: { scope: "list", run: c => {
      const o = need(c); let source = "cache";
      if (o.status === "connected" && o.live && now - o.lastRefresh >= 30_000) {
        for (const g of o.live) o.groups.set(g.jid, toGroup(g, o.groups.get(g.jid)));
        o.lastRefresh = now; o.refreshedAt = iso(); counters.liveRefreshes++; source = "live";
      }
      const all = [...o.groups.values()].sort((a, b) => Number(b.isTracked) - Number(a.isTracked) || a.subject.localeCompare(b.subject) || a.jid.localeCompare(b.jid));
      return [200, { source, refreshedAt: o.refreshedAt, truncated: all.length > 2000, groups: all.slice(0, 2000) }];
    } } },
    tracking: { PUT: { scope: "mutate", run: c => {
      if (!strict(c.body, ["isTracked"], ["trackAllSenders"]) || typeof c.body.isTracked !== "boolean" || (c.body.trackAllSenders !== undefined && typeof c.body.trackAllSenders !== "boolean")) return err(400, "invalid_request", c.rid);
      const u = active(c); if (u) return u;
      const g = grp(c); if (isReply(g)) return g;
      const o = need(c); const before = JSON.stringify(g);
      g.isTracked = c.body.isTracked;
      if (c.body.trackAllSenders !== undefined) g.trackAllSenders = c.body.trackAllSenders;
      else if (g.isTracked && !g.trackAllSenders && !(o.groupPeople.get(g.jid)?.length)) g.trackAllSenders = true;
      return [200, { jid: g.jid, isTracked: g.isTracked, trackAllSenders: g.trackAllSenders, capture: capture(o, g), changed: JSON.stringify(g) !== before }];
    } } },
    people: {
      GET: { scope: "list", run: c => {
        const o = need(c); const g = grp(c); if (isReply(g)) return g;
        const sel = o.selected.get(g.jid) ?? new Set<string>();
        const people = (o.groupPeople.get(g.jid) ?? []).map(id => { const p = o.people.get(id)!; return { personId: id, ...personLabel(p), isSelected: sel.has(id) }; })
          .sort((a, b) => Number(b.isSelected) - Number(a.isSelected) || Number(b.hasName) - Number(a.hasName) || a.label.localeCompare(b.label))
          .map(p => ({ personId: p.personId, label: p.label, isSelected: p.isSelected, hasName: p.hasName }));
        return [200, { source: "cache", people }];
      } },
      PUT: { scope: "mutate", run: c => {
        const ids = c.body.personIds;
        if (!strict(c.body, ["personIds"]) || !Array.isArray(ids) || ids.length > 1000 || new Set(ids).size !== ids.length || !ids.every(i => typeof i === "string" && PERSON_ID_RE.test(i))) return err(400, "invalid_request", c.rid);
        const u = active(c); if (u) return u;
        const g = grp(c); if (isReply(g)) return g;
        const o = need(c);
        if (!(ids as string[]).every(i => o.people.has(i))) return err(404, "person_not_found", c.rid);
        const prev = [...(o.selected.get(g.jid) ?? [])].sort().join();
        o.selected.set(g.jid, new Set(ids as string[]));
        return [200, { jid: g.jid, count: ids.length, capture: capture(o, g), changed: prev !== [...ids as string[]].sort().join() }];
      } },
    },
    unlink: { POST: { scope: "unlink", run: c => {
      if (!strict(c.body, [], ["confirm"])) return err(400, "invalid_request", c.rid);
      if (c.body.confirm !== "UNLINK") return err(400, "confirm_required", c.rid);
      const o = need(c);
      o.unlinkedAt ??= iso();
      for (const g of o.groups.values()) g.isTracked = false;
      setStatus(o, "closed");
      return [200, { ownerId: o.id, state: "unlinked", status: "closed", captureDisabled: true, unlinkedAt: o.unlinkedAt }];
    } } },
  };

  function route(parts: string[]): { key: string; ownerId?: string; jid?: string } | null {
    if (parts[0] !== "svc" || parts[1] !== "v1") return null;
    const [, , a, id, b, c2, d] = parts;
    if (a === "health" && parts.length === 3) return { key: "health" };
    if (a !== "owners") return null;
    if (parts.length === 3) return { key: "owners" };
    const m: Record<string, string> = { "session": "session", "session/qr": "qr", "groups": "groups", "unlink": "unlink" };
    const tail = parts.slice(4).join("/");
    if (m[tail]) return { key: m[tail]!, ownerId: id };
    if (b === "groups" && parts.length === 7 && (d === "tracking" || d === "people")) return { key: d, ownerId: id, jid: c2 };
    return null;
  }

  async function handle(req: IncomingMessage, res: ServerResponse): Promise<void> {
    const rid = REQUEST_ID_RE.test(String(req.headers["x-request-id"] ?? "")) ? String(req.headers["x-request-id"]) : hex(8);
    const send = ([status, body, h = {}]: Reply): void => {
      res.writeHead(status, { "content-type": "application/json", "x-archiver-api-version": "1", "x-request-id": rid, ...h });
      res.end(JSON.stringify(body));
    };
    const chunks: Buffer[] = []; let size = 0; let tooBig = false;
    for await (const ch of req) { size += (ch as Buffer).length; if (size > 64 * 1024) tooBig = true; else chunks.push(ch as Buffer); }
    const supplied = /^Bearer (.+)$/.exec(String(req.headers.authorization ?? ""))?.[1] ?? "";
    const d = sha(supplied);
    if (!digests.map(x => timingSafeEqual(x, d)).includes(true)) {
      return send(over("authfail", req.socket.remoteAddress ?? "?") ? limited(rid) : err(401, "unauthorized", rid));
    }
    counters.handled++;
    if (over("token", "all")) return send(limited(rid));
    const url = new URL(req.url ?? "/", "http://fake");
    const found = route(url.pathname.split("/").filter(Boolean));
    if (!found) return send(err(404, "not_found", rid));
    const entry = routes[found.key]![req.method ?? ""];
    if (!entry) return send(err(405, "method_not_allowed", rid));
    if (tooBig) return send(err(413, "payload_too_large", rid));
    const raw = Buffer.concat(chunks).toString("utf8");
    if (raw && !String(req.headers["content-type"] ?? "").startsWith("application/json")) return send(err(415, "unsupported_media_type", rid));
    let body: unknown = {};
    if (raw) { try { body = JSON.parse(raw); } catch { return send(err(400, "invalid_request", rid)); } }
    if (!body || typeof body !== "object" || Array.isArray(body)) return send(err(400, "invalid_request", rid));
    let jid = "";
    try { jid = found.jid === undefined ? "" : decodeURIComponent(found.jid); } catch { return send(err(400, "invalid_request", rid)); }
    if ((found.ownerId !== undefined && !OWNER_ID_RE.test(found.ownerId)) || (found.jid !== undefined && !JID_RE.test(jid))) return send(err(400, "invalid_request", rid));
    const mutating = req.method === "POST" || req.method === "PUT";
    const key = mutating ? String(req.headers["idempotency-key"] ?? "") : "";
    if (mutating && req.headers["idempotency-key"] !== undefined && !IDEMPOTENCY_KEY_RE.test(key)) return send(err(400, "invalid_request", rid));
    const fp = `${req.method} ${url.pathname} ${sha(raw).toString("hex")}`;
    const seen = key ? idem.get(key) : undefined;
    if (seen) {
      if (seen.fp !== fp) return send(err(409, "idempotency_key_reused", rid));
      if (!seen.reply) return send(err(409, "request_in_progress", rid, {}, { "retry-after": "1" }));
      return send([seen.reply[0], seen.reply[1], { ...seen.reply[2], "idempotency-replayed": "true" }]);
    }
    if (found.ownerId !== undefined && over(entry.scope, found.ownerId)) return send(limited(rid));
    if (found.ownerId === undefined && over(entry.scope, "all")) return send(limited(rid));
    if (storeDown && found.key !== "health") return send(err(503, "store_unavailable", rid, { retryAfterSec: 1 }, { "retry-after": "1" }));
    const o = found.ownerId === undefined ? null : owners.get(found.ownerId) ?? null;
    if (found.ownerId !== undefined && (!o || !o.service)) return send(err(404, "owner_not_found", rid));
    if (key) idem.set(key, { fp, reply: null });
    if (mutating && gate) { const g = gate; gate = null; await g; }
    const reply = await entry.run({ o, jid, body: body as Record<string, unknown>, rid });
    if (key) { if (reply[0] === 200) idem.set(key, { fp, reply }); else idem.delete(key); }
    send(reply);
  }

  const server: Server = createServer((req, res) => { handle(req, res).catch(() => { res.writeHead(500).end(); }); });
  await new Promise<void>(r => server.listen(0, "127.0.0.1", r));
  const addr = server.address() as { port: number };
  const control: FakeControl = {
    counters,
    setNow: ms => { now = ms; },
    addUiOwner: () => newOwner(null, false).id,
    setStatus: (id, s, x) => setStatus(owners.get(id)!, s, x),
    emitQr: (id, qr) => { const o = owners.get(id)!; setStatus(o, "awaiting_qr"); o.qr = { qr, exp: now + 20_000 }; },
    seedGroups: (id, gs) => { const o = owners.get(id)!; for (const g of gs) o.groups.set(g.jid, toGroup(g)); },
    setLive: (id, gs) => { owners.get(id)!.live = gs; },
    seedPeople: (id, jid, ps) => {
      const o = owners.get(id)!; const ids: string[] = [];
      for (const p of ps) { const personId = p.personId ?? hex(); o.people.set(personId, { ...p, personId }); ids.push(personId); }
      o.groupPeople.set(jid, [...(o.groupPeople.get(jid) ?? []), ...ids]); return ids;
    },
    setStoreDown: d => { storeDown = d; },
    hold: () => { let release = (): void => {}; gate = new Promise<void>(r => { release = r; }); return release; },
    owner: id => { const o = owners.get(id); return o ? { state: o.unlinkedAt ? "unlinked" : "active", status: o.status, tracked: [...o.groups.values()].filter(g => g.isTracked).map(g => g.jid) } : null; },
  };
  return { url: `http://127.0.0.1:${addr.port}`, token, tokenNext, control, stop: () => new Promise<void>(r => { server.closeAllConnections(); server.close(() => r()); }) };
}

/** Contract targets for the wire suites: the fake always; a real archiver only behind LKB_ARCHIVER_CONTRACT_URL + _TOKEN (staging only: the suite creates owners). */
export function realTargetFromEnv(env: Record<string, string | undefined> = process.env): { baseUrl: string; token: string } | null {
  const baseUrl = env.LKB_ARCHIVER_CONTRACT_URL, token = env.LKB_ARCHIVER_CONTRACT_TOKEN;
  return baseUrl && token ? { baseUrl, token } : null;
}
