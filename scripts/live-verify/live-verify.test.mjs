// golive-launch-prep L1: scripts/live-verify.mjs `--base` + signed-in mode (LKB_LIVE_EMAIL / LKB_LIVE_PASSWORD).
// The script is spawned as a real child process against a local stub HTTP server that enforces what the real API enforces on the
// routes in play: the session cookie, the CSRF proof on unsafe methods, the role -> scope table (roles.ts) and the viewer read-only
// guard (viewer-guard.ts). Nothing here reaches a deployed URL, a database or `lkb_prod`.
// Run: node --test --import tsx scripts/live-verify/live-verify.test.mjs
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { randomUUID } from "node:crypto";
import { once } from "node:events";
import { mkdtempSync, readdirSync, readFileSync, rmSync, statSync } from "node:fs";
import http from "node:http";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";
import { csrfTokenFor } from "../../apps/api/src/user-accounts/csrf.ts";
import { ROLE_SCOPES } from "../../apps/api/src/user-accounts/roles.ts";
import { isReadLikePost } from "../../apps/api/src/user-accounts/viewer-guard.ts";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..", "..");
const SCRIPT = join(ROOT, "scripts", "live-verify.mjs");
const API_PATH = "/knowledgebase/api";
const UC_SESSION = "2026-07-03-inside-the-uc-session";
const PASSWORD = "Zq7-correct-horse-9318"; // a throwaway value that exists only in this test file
const SECRET = "x".repeat(40);
const OPERATOR_KEY = "test-operator-key-5521"; // stands in for the operator key used only for route-existence controls

const ROUTE_SCOPE = {
  "GET /admin/users": "user-admin",
  "POST /ingest": "ingest",
  "GET /whatsapp/groups": "whatsapp",
  "GET /meeting-bot/privacy": "jobs", // an operator-only scope no role holds
  "POST /ask": "ask",
};

/** A stub of the deployed API. `opts` flips one behaviour at a time so each test names the thing that is wrong. */
async function startStub(opts = {}) {
  const o = { role: "viewer", ask: "good", leak: null, logoutWorks: true, cookieName: "lkb_sid", turn: "present", turnTimes: "same", missingRoute: null, ...opts };
  const secrets = []; // every session token and CSRF proof the stub issued: none may ever show up in output or files
  const sessions = new Map();
  const requests = [];
  let lastAsk = null;
  const server = http.createServer(async (req, res) => {
    const url = new URL(req.url, "http://stub");
    const chunks = [];
    for await (const c of req) chunks.push(c);
    const raw = Buffer.concat(chunks).toString("utf8");
    const json = (status, body, headers = {}) => { res.writeHead(status, { "content-type": "application/json", ...headers }); res.end(JSON.stringify(body)); };
    if (!url.pathname.startsWith(API_PATH)) { json(404, { error: "not_found" }); return; }
    const rest = url.pathname.slice(API_PATH.length);
    const key = `${req.method} ${rest}`;
    const bearer = /^Bearer (.+)$/.exec(String(req.headers.authorization ?? ""));
    requests.push(bearer ? `KEY ${key}` : key);
    let body = {};
    try { body = raw ? JSON.parse(raw) : {}; } catch { /* leave empty */ }

    if (bearer) { // the operator-key control: does the route exist at all? (a POST with an empty body is the route's own 400)
      if (bearer[1] !== OPERATOR_KEY) { json(401, { error: "unauthorized" }); return; }
      if (o.missingRoute === key || ROUTE_SCOPE[key] === undefined) { json(404, { error: "not_found" }); return; }
      json(key === "POST /ingest" ? 400 : 200, key === "POST /ingest" ? { error: "bad_request" } : { ok: true });
      return;
    }
    if (key === "POST /auth/login") {
      if (body.email !== "viewer@example.test" || body.password !== PASSWORD) { json(401, { error: "invalid_credentials", message: "invalid email or password" }); return; }
      const token = randomUUID();
      const sid = `sid-${sessions.size + 1}`;
      sessions.set(token, { sid, role: o.role });
      secrets.push(token, csrfTokenFor(sid, SECRET));
      json(200, { state: "active", user: { id: "u-1", role: o.role, displayName: "Test Viewer" }, csrfToken: csrfTokenFor(sid, SECRET) },
        { "set-cookie": `${o.cookieName}=${token}; Path=/; HttpOnly; SameSite=Lax` });
      return;
    }

    const cookie = (req.headers.cookie ?? "").split(/;\s*/).find((c) => c.startsWith(`${o.cookieName}=`));
    const session = cookie ? sessions.get(cookie.slice(o.cookieName.length + 1)) : undefined;
    if (!session) { json(401, { error: "unauthorized", message: "sign in required" }); return; }

    if (req.method !== "GET") {
      const origin = req.headers.origin;
      const okCsrf = origin === `http://127.0.0.1:${server.address().port}` && req.headers["x-lkb-csrf"] === csrfTokenFor(session.sid, SECRET);
      if (!okCsrf) { json(403, { error: "csrf", message: "missing or invalid CSRF proof" }); return; }
    }
    if (key === "GET /auth/session") { json(200, { state: "active", user: { id: "u-1", role: session.role }, csrfToken: csrfTokenFor(session.sid, SECRET) }); return; }
    if (key === "POST /auth/logout") {
      if (o.logoutWorks) { sessions.delete(cookie.slice(o.cookieName.length + 1)); }
      json(200, { ok: true }, { "set-cookie": `${o.cookieName}=; Max-Age=0; Path=/` });
      return;
    }
    if (o.leak === key) { json(200, { leaked: true }); return; }
    if (session.role === "viewer" && req.method !== "GET" && !isReadLikePost(req.method, rest)) { json(403, { error: "read_only_role", message: "viewers have read-only access" }); return; }
    const need = ROUTE_SCOPE[key] ?? (rest.startsWith("/sessions/") ? "sessions" : undefined);
    if (need === undefined) { json(404, { error: "not_found" }); return; }
    if (!ROLE_SCOPES[session.role].includes(need)) { json(403, { error: "forbidden", message: `this key is missing the required "${need}" scope` }); return; }

    if (key === "POST /ask") {
      lastAsk = body;
      const quote = { turnId: "t042", speakerRef: "Vaishnavi Kotiyal", tStart: 2124, tEnd: 2297, quote: "we did not review SAT or ACT" };
      if (o.ask === "nospeaker") quote.speakerRef = "";
      if (o.ask === "notimes") delete quote.tEnd;
      if (o.ask === "zerolength") quote.tEnd = quote.tStart;
      const internal = o.ask === "nocitation" ? [] : [{ nodeId: "n1", evidence: { sessionRef: UC_SESSION, sourceQuotes: [quote] } }];
      json(200, { answer: "The panel said test scores were not reviewed.", verdict: "supported", sources: { internal, web: [] } });
      return;
    }
    if (rest.startsWith("/sessions/")) {
      const turns = [{ _id: "t041", speakerRef: "Host", tStart: 2100, tEnd: 2123, text: "next question" }];
      if (o.turn === "present") turns.push({ _id: "t042", speakerRef: "Vaishnavi Kotiyal", tStart: o.turnTimes === "shifted" ? 2125 : 2124, tEnd: o.ask === "zerolength" ? 2124 : 2297, text: "we did not review SAT or ACT" }); // a zero-length turn keeps the cited-turn step green, so only the citation step can catch it
      json(200, { session: { _id: decodeURIComponent(rest.slice("/sessions/".length)) }, page: null, claims: [], turns });
      return;
    }
    json(200, { ok: true, route: key }); // an admin / member reaching a route its role holds
  });
  server.listen(0, "127.0.0.1");
  await once(server, "listening");
  const origin = `http://127.0.0.1:${server.address().port}`;
  return { origin, base: `${origin}/knowledgebase`, requests, secrets, get lastAsk() { return lastAsk; }, close: () => new Promise((r) => server.close(r)) };
}

const SAFE_ENV = Object.fromEntries(["PATH", "Path", "SystemRoot", "SYSTEMROOT", "TEMP", "TMP", "HOME", "USERPROFILE", "ComSpec"].filter((k) => process.env[k]).map((k) => [k, process.env[k]]));

/** Runs the real script as a child; resolves with its exit code and everything it printed. */
async function runScript(args, env = {}) {
  const out = mkdtempSync(join(tmpdir(), "lkb-live-verify-"));
  const child = spawn(process.execPath, [SCRIPT, "--out", out, ...args], { cwd: ROOT, env: { ...SAFE_ENV, ...env }, stdio: ["ignore", "pipe", "pipe"] });
  let stdout = "", stderr = "";
  child.stdout.on("data", (d) => { stdout += d; });
  child.stderr.on("data", (d) => { stderr += d; });
  const timer = setTimeout(() => child.kill(), 90_000);
  const [code] = await once(child, "close");
  clearTimeout(timer);
  return { code, stdout, stderr, out, dispose: () => rmSync(out, { recursive: true, force: true }) };
}

const creds = { LKB_LIVE_EMAIL: "viewer@example.test", LKB_LIVE_PASSWORD: PASSWORD, LKB_API_KEY: OPERATOR_KEY };
const lines = (r) => r.stdout.split("\n").filter((l) => /^\[(PASS|FAIL|INCONCLUSIVE|DIRTY-TREE|STUB|MISSING)/.test(l));
const stepLines = (r) => lines(r).filter((l) => !l.includes("preflight:"));
const failing = (r) => stepLines(r).filter((l) => l.startsWith("[FAIL"));
const ok = (r) => [0, 4].includes(r.code); // 4 only means "PASS, but the tree is dirty": it is a property of the checkout, not of the run
const allFiles = (dir) => readdirSync(dir, { recursive: true }).map((f) => join(dir, String(f))).filter((f) => statSync(f).isFile());

test("a viewer signs in, asks the pinned UC question, opens the cited turn, is refused on admin/ingest/WhatsApp/meeting-bot, signs out [L1-C1][L1-C2][L1-C3][L1-C4][L1-C5][L1-C6]", async () => {
  const stub = await startStub();
  const r = await runScript(["--base", stub.base + "/"], creds);
  try {
    assert.ok(ok(r), `exit ${r.code}\n${r.stdout}\n${r.stderr}`);
    assert.deepEqual(failing(r), []);
    const steps = stepLines(r);
    for (const needle of ["sign-in", "ask", "citation", "cited turn", "admin", "ingest", "whatsapp", "meeting-bot", "sign-out"]) {
      assert.ok(steps.some((l) => l.toLowerCase().includes(needle) && l.startsWith("[PASS")), `a PASS line mentions "${needle}"\n${steps.join("\n")}`);
    }
    // --base is the origin plus base path: every request went to <base>/api/..., and the sign-in happened first.
    assert.equal(stub.requests[0], "POST /auth/login");
    assert.match(String(stub.lastAsk?.query), /Inside the UC session.*SAT or ACT/);
    assert.ok(stub.requests.includes("POST /ingest") && stub.requests.includes("GET /admin/users") && stub.requests.includes("GET /whatsapp/groups") && stub.requests.includes("GET /meeting-bot/privacy"));
    const pre = JSON.parse(readFileSync(join(r.out, "preflight.json"), "utf8"));
    assert.equal(pre.api, `${stub.base}/api`, "the trailing slash is dropped and the API lives under <base>/api");
    assert.equal(pre.web, stub.base);
  } finally { r.dispose(); await stub.close(); }
});

test("a deployment that sets the Secure session cookie name is handled the same way [L1-C2]", async () => {
  const stub = await startStub({ cookieName: "__Secure-lkb_sid" });
  const r = await runScript(["--base", stub.base], creds);
  try {
    assert.ok(ok(r), `exit ${r.code}\n${r.stdout}`);
    assert.deepEqual(failing(r), []);
  } finally { r.dispose(); await stub.close(); }
});

test("a wrong password stops at sign-in with a non-zero exit and nothing else is called [L1-C2]", async () => {
  const stub = await startStub();
  const r = await runScript(["--base", stub.base], { ...creds, LKB_LIVE_PASSWORD: "not-the-password" });
  try {
    assert.equal(r.code, 2);
    assert.ok(failing(r).some((l) => l.toLowerCase().includes("sign-in")));
    assert.deepEqual(stub.requests, ["POST /auth/login"]);
  } finally { r.dispose(); await stub.close(); }
});

test("missing credentials when sign-in is needed: clear message, exit 5, no request made [L1-C2]", async () => {
  for (const env of [{ LKB_LIVE_EMAIL: "viewer@example.test" }, { LKB_LIVE_PASSWORD: PASSWORD }, {}]) {
    const stub = await startStub();
    const r = await runScript(["--base", stub.base, "--signed-in"], env);
    try {
      assert.equal(r.code, 5, r.stdout + r.stderr);
      const text = r.stdout + r.stderr;
      assert.match(text, /LKB_LIVE_EMAIL|LKB_LIVE_PASSWORD/);
      assert.ok(!text.includes(PASSWORD));
      assert.deepEqual(stub.requests, []);
    } finally { r.dispose(); await stub.close(); }
  }
});

test("no secret (password, operator key, session cookie, CSRF proof) appears in stdout, stderr or any written file; a password flag on argv is refused [L1-C2]", async () => {
  const stub = await startStub();
  const r = await runScript(["--base", stub.base], creds);
  const refused = await runScript(["--base", stub.base, "--password", PASSWORD], { LKB_LIVE_EMAIL: creds.LKB_LIVE_EMAIL });
  try {
    assert.ok(stub.secrets.length >= 2, "the stub issued a cookie token and a CSRF proof to look for");
    const sentinels = [PASSWORD, OPERATOR_KEY, ...stub.secrets];
    for (const run of [r, refused]) {
      for (const secret of sentinels) {
        assert.ok(!run.stdout.includes(secret) && !run.stderr.includes(secret), `${secret.slice(0, 6)}... is not on the console`);
        for (const f of allFiles(run.out)) assert.ok(!readFileSync(f, "utf8").includes(secret), `${secret.slice(0, 6)}... is not in ${f}`);
      }
    }
    assert.ok(allFiles(r.out).length > 0, "the run did write evidence (so the scan above is not vacuous)");
    assert.equal(refused.code, 5);
    assert.match(refused.stdout + refused.stderr, /LKB_LIVE_PASSWORD/);
    assert.equal(stub.requests.filter((q) => q === "POST /auth/login").length, 1, "only the first run signed in");
  } finally { r.dispose(); refused.dispose(); await stub.close(); }
});

test("a viewer who can reach an admin route is a FAIL, one line per surface [L1-C4]", async () => {
  for (const [leak, needle] of [["GET /admin/users", "admin"], ["POST /ingest", "ingest"], ["GET /whatsapp/groups", "whatsapp"], ["GET /meeting-bot/privacy", "meeting-bot"]]) {
    const stub = await startStub({ leak });
    const r = await runScript(["--base", stub.base], creds);
    try {
      assert.equal(r.code, 2, `${leak}\n${r.stdout}`);
      const bad = failing(r);
      assert.equal(bad.length, 1, `only the leaking surface fails (${leak})\n${bad.join("\n")}`);
      assert.ok(bad[0].toLowerCase().includes(needle));
    } finally { r.dispose(); await stub.close(); }
  }
});

test("an answer whose citation has no speaker, no end time or no citation at all is a FAIL [L1-C3]", async () => {
  for (const ask of ["nospeaker", "notimes", "nocitation"]) {
    const stub = await startStub({ ask });
    const r = await runScript(["--base", stub.base], creds);
    try {
      assert.equal(r.code, 2, `${ask}\n${r.stdout}`);
      assert.ok(failing(r).some((l) => l.toLowerCase().includes("citation") || l.toLowerCase().includes("ask")), ask);
    } finally { r.dispose(); await stub.close(); }
  }
});

test("a cited turn that does not exist in the session is a FAIL [L1-C3]", async () => {
  const stub = await startStub({ turn: "missing" });
  const r = await runScript(["--base", stub.base], creds);
  try {
    assert.equal(r.code, 2, r.stdout);
    assert.ok(failing(r).some((l) => l.toLowerCase().includes("cited turn")));
  } finally { r.dispose(); await stub.close(); }
});

test("a sign-out that leaves the session alive is a FAIL [L1-C5]", async () => {
  const stub = await startStub({ logoutWorks: false });
  const r = await runScript(["--base", stub.base], creds);
  try {
    assert.equal(r.code, 2, r.stdout);
    assert.ok(failing(r).some((l) => l.toLowerCase().includes("sign-out")));
  } finally { r.dispose(); await stub.close(); }
});

test("an admin account cannot stand in for the viewer: the refusal steps FAIL instead of passing vacuously [L1-C4][L1-I2]", async () => {
  const stub = await startStub({ role: "admin" });
  const r = await runScript(["--base", stub.base], creds);
  try {
    assert.equal(r.code, 2, r.stdout);
    assert.ok(failing(r).some((l) => l.toLowerCase().includes("viewer")));
  } finally { r.dispose(); await stub.close(); }
});

test("without --base and without credentials the script behaves as before: local default target, no sign-in, INCONCLUSIVE exit 3 [L1-C1][L1-I1]", async () => {
  const r = await runScript(["--skip-ask"], { MONGODB_URL: "mongodb://127.0.0.1:1/x" });
  try {
    assert.equal(r.code, 3, r.stdout + r.stderr);
    assert.match(r.stdout, /api: credential/);
    assert.equal(JSON.parse(readFileSync(join(r.out, "preflight.json"), "utf8")).api, "http://localhost:3300");
    assert.ok(!r.stdout.includes("sign-in"));
  } finally { r.dispose(); }
});

test("a base that is not an http(s) URL exits non-zero with a clear message and sends nothing [L1-C1]", async () => {
  for (const bad of ["ftp://example.test/knowledgebase", "not a url", "file:///etc/passwd"]) {
    const r = await runScript(["--base", bad], creds);
    try {
      assert.equal(r.code, 5, `${bad}\n${r.stdout}${r.stderr}`);
      assert.match(r.stderr, /--base must be an http\(s\) URL/);
      assert.ok(!(r.stdout + r.stderr).includes(PASSWORD));
    } finally { r.dispose(); }
  }
});

test("the pinned question is read from the committed file, not written inline in the script [L1-C3]", async () => {
  const pinned = JSON.parse(readFileSync(join(ROOT, "scripts", "live-verify", "live-verify.pinned-question.json"), "utf8"));
  const stub = await startStub();
  const r = await runScript(["--base", stub.base], creds);
  try {
    assert.equal(stub.lastAsk?.query, pinned.question);
    assert.ok(!readFileSync(SCRIPT, "utf8").includes(pinned.question), "the question text is not duplicated inline");
  } finally { r.dispose(); await stub.close(); }
});

test("a citation whose end is not after its start, or a cited turn whose time range differs, is a FAIL [L1-C3]", async () => {
  for (const [opts, needle] of [[{ ask: "zerolength" }, "ask: citation"], [{ turnTimes: "shifted" }, "open cited turn"]]) {
    const stub = await startStub(opts);
    const r = await runScript(["--base", stub.base], creds);
    try {
      assert.equal(r.code, 2, r.stdout);
      assert.ok(failing(r).some((l) => l.toLowerCase().includes(needle)), `${needle}\n${failing(r).join("\n")}`);
    } finally { r.dispose(); await stub.close(); }
  }
});

test("a refusal on a route that does not exist (typo'd path) is not a pass: the operator-key control must find the route [L1-C4]", async () => {
  const stub = await startStub({ missingRoute: "GET /whatsapp/groups" });
  const r = await runScript(["--base", stub.base], creds);
  try {
    assert.equal(r.code, 2, r.stdout);
    const bad = failing(r);
    assert.equal(bad.length, 1, bad.join("\n"));
    assert.match(bad[0], /whatsapp/);
    assert.match(bad[0], /NOT proven to exist/);
  } finally { r.dispose(); await stub.close(); }
});

test("without an operator key the four refusal steps FAIL instead of passing without proof the routes exist [L1-C4]", async () => {
  const stub = await startStub();
  const { LKB_API_KEY: _drop, ...noKey } = creds;
  const r = await runScript(["--base", stub.base], noKey);
  try {
    assert.equal(r.code, 2, r.stdout);
    assert.equal(failing(r).filter((l) => l.includes("viewer refused")).length, 4);
    assert.ok(stub.requests.every((q) => !q.startsWith("KEY ")));
  } finally { r.dispose(); await stub.close(); }
});

test("a refusal must be exactly 401 or 403: a 200 on the viewer's own request is a FAIL [L1-C4]", async () => {
  const stub = await startStub({ leak: "GET /whatsapp/groups" }); // leak => 200; 200 is not a refusal
  const r = await runScript(["--base", stub.base], creds);
  try {
    assert.equal(r.code, 2);
    assert.ok(failing(r).some((l) => l.includes("whatsapp") && l.includes("expected 401/403")));
  } finally { r.dispose(); await stub.close(); }
});

test("sign-out is shown on a route that answered 200 before it, and the run lists the row steps it did not cover [L1-C5][L1-C6]", async () => {
  const stub = await startStub();
  const r = await runScript(["--base", stub.base], creds);
  try {
    assert.ok(ok(r), r.stdout);
    const line = stepLines(r).find((l) => l.includes("old session cookie is rejected"));
    assert.ok(line?.startsWith("[PASS") && line.includes("/auth/session") && line.includes("/sessions/"), line);
    assert.match(r.stdout, /NOT covered by this script/);
    for (const needle of ["mobile data", "sign-up", "admin approval"]) assert.ok(r.stdout.includes(needle), needle);
    assert.ok(readFileSync(join(r.out, "summary.md"), "utf8").includes("does NOT cover"));
    assert.deepEqual(stub.requests.filter((q) => /^(POST|PUT|PATCH|DELETE) /.test(q)), ["POST /auth/login", "POST /ask", "POST /ingest", "POST /auth/logout"],
      "the only unsafe calls: login, ask, the refused ingest probe, logout");
  } finally { r.dispose(); await stub.close(); }
});
