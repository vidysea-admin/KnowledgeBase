// FIXTURE API (not the real apps/api, no database): serves real transcript content from data/toc-migrated over the same
// HTTP shapes apps/web consumes, so the browser does genuine cross-origin fetches. /ask is a deterministic stub (no model).
// Join-rules is an in-memory store; PUT validates minimally like the real router (version 1, id, effect, non-empty match).
// Usage: node fixture-api.mjs <repoRoot> <port> <webOrigin>
import http from "node:http"; import fs from "node:fs"; import path from "node:path";
const [repo, port, origin] = process.argv.slice(2);
const IDS = ["2026-08-03-uk-beyond-offer-letters", "2026-08-10-ucas-what-changed-what-matters", "2026-08-27-in-focus-4", "2026-07-15-creative-futures"];
const rd = (id, f) => JSON.parse(fs.readFileSync(path.join(repo, "data/toc-migrated", id, f), "utf8"));
const S = {}; for (const id of IDS) S[id] = { session: rd(id, "session.json"), page: rd(id, "session_page.json"), claims: rd(id, "claims.json"), turns: rd(id, "turns.json") };
const KEYS = { "fixture-ro": ["ask", "search", "sessions", "calendar", "citations"], "fixture-rw": ["ask", "search", "sessions", "calendar", "citations", "join-rules"] };
let rules = { ruleSet: { version: 1, ownDomains: ["vidysea.com"], rules: [{ id: "allow-partner", effect: "allow", match: { domain: "partner.example", subdomains: false } }] }, state: { approvedSenders: [], approvedDomains: [], optedOutEventIds: [] } };
const send = (res, code, body) => { res.writeHead(code, { "content-type": "application/json" }); res.end(JSON.stringify(body)); };
const readBody = (req) => new Promise((r) => { let b = ""; req.on("data", (c) => b += c); req.on("end", () => { try { r(JSON.parse(b || "{}")); } catch { r(null); } }); });
const words = (q) => q.toLowerCase().split(/\W+/).filter((w) => w.length > 2);
http.createServer(async (req, res) => {
  res.setHeader("access-control-allow-origin", origin); res.setHeader("access-control-allow-headers", "authorization,content-type"); res.setHeader("access-control-allow-methods", "GET,POST,PUT,OPTIONS"); res.setHeader("vary", "origin");
  if (req.method === "OPTIONS") { res.writeHead(204); return res.end(); }
  const u = new URL(req.url, "http://x"); const key = (req.headers.authorization ?? "").replace(/^Bearer /, ""); const scopes = KEYS[key];
  if (!scopes) return send(res, 401, { error: "unauthorized" });
  const need = (s) => { if (scopes.includes(s)) return true; send(res, 403, { error: "forbidden", message: `missing scope ${s}` }); return false; };
  const p = u.pathname;
  if (p === "/sessions" && need("sessions")) return send(res, 200, { sessions: IDS.map((id) => ({ ...S[id].session })) });
  let m;
  if ((m = p.match(/^\/sessions\/([^/]+)$/)) && need("sessions")) { const s = S[decodeURIComponent(m[1])]; return s ? send(res, 200, { session: s.session, page: { summary: s.page.summary }, claims: s.claims, turns: s.turns }) : send(res, 404, { error: "not_found" }); }
  if (p === "/search" && need("search")) {
    const q = u.searchParams.get("q") ?? ""; const w = words(q); if (!w.length) return send(res, 400, { error: "bad_request" });
    const hits = []; for (const id of IDS) for (const t of S[id].turns) { const lc = t.text.toLowerCase(); const sc = w.filter((x) => lc.includes(x)).length; if (sc) hits.push({ turnId: t._id, sessionId: id, score: sc / w.length, turn: t, session: S[id].session }); }
    hits.sort((a, b) => b.score - a.score); return send(res, 200, { query: q, hits: hits.slice(0, Number(u.searchParams.get("k") ?? 10)) });
  }
  if (p === "/ask" && req.method === "POST" && need("ask")) {
    const b = await readBody(req); const w = words(b?.query ?? ""); const id = IDS[0]; const claim = S[id].claims[0];
    return send(res, 200, { answer: `Stub answer (fixture): ${claim?.text ?? S[id].page.summary.slice(0, 200)}`, verdict: "correct", reason: "fixture", scored: [{ node_id: `toc/${id}`, score: 0.9 }], web_used: false, insufficient_coverage: false,
      sources: { internal: [{ node_id: `toc/year:2026/month:08/session:${id}`, evidence: { sessionRef: id } }], web: [] }, auditLog: [{ step: "select_nodes", provider: "fixture", model: "stub", costUsd: 0 }], _w: w.length });
  }
  if (p === "/webinar-operations") return send(res, 200, { operations: [
    { id: "op1", title: "Fixture: UK webinar (live now)", status: "recording", attempts: 1, updatedAt: new Date().toISOString(), startTime: new Date(Date.now() - 600e3).toISOString(), endTime: new Date(Date.now() + 3000e3).toISOString() },
    { id: "op2", title: "Fixture: finished webinar", status: "ready", attempts: 1, updatedAt: new Date(Date.now() - 86400e3).toISOString() }], omitted: 0,
    discovery: { calendar: { status: "healthy", checkedAt: new Date().toISOString() }, gmail: { status: "healthy", checkedAt: new Date().toISOString() } } });
  if (p === "/calendar/upcoming" && need("calendar")) { const t = (h) => new Date(Date.now() + h * 3600e3).toISOString(); return send(res, 200, { meetings: [{ id: "fx1", title: "Fixture: admissions webinar", startTime: t(2), endTime: t(3), meetingUrl: "https://meet.google.com/abc-defg-hij", organizer: "fixture@example.com" }] }); }
  if (p === "/calendar/join-rules" && req.method === "GET" && need("calendar")) return send(res, 200, rules);
  if (p === "/calendar/join-rules" && req.method === "PUT" && need("join-rules")) {
    const b = await readBody(req); const rs = b?.ruleSet ?? b;
    const bad = !rs || rs.version !== 1 || !Array.isArray(rs.rules) || rs.rules.some((r) => !r.id || !r.match || Object.keys(r.match).length === 0);
    if (bad) return send(res, 400, { error: "invalid", message: "rule set rejected: every rule needs a name and at least one matcher" });
    rules = { ruleSet: rs, state: rules.state }; return send(res, 200, rules);
  }
  return send(res, 404, { error: "not_found", path: p });
}).listen(Number(port), "127.0.0.1", () => console.log("fixture API on", port));
