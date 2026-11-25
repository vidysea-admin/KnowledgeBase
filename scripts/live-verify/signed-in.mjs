// scripts/live-verify/signed-in.mjs — the signed-in viewer walk (launch row 1) and the keyed API truth pass, moved out of
// scripts/live-verify.mjs to keep it inside the structure budget (D-237). The code is unchanged; what it used to read from
// the entry script's top level arrives in one context object.

// ---------------------------------------------------------------- layer 1b: signed-in viewer walk (launch row 1, scripted half)
// Everything below runs as the user named by LKB_LIVE_EMAIL. The password goes into one request body and nowhere else: it is
// never put in a record() line, a file, an error message or argv. Response bodies are not written to disk here (the login
// body carries the CSRF proof), only the verdict lines are.
const num = (v) => typeof v === "number" && Number.isFinite(v);
const nonEmpty = (v) => typeof v === "string" && v.trim() !== "";
const REFUSED = [401, 403];

export async function signedInRow1(ctx) {
  const { API, KEY, QUESTION, EXPECT_SESSION, LIVE_EMAIL, LIVE_PASSWORD, record } = ctx;
  const origin = new URL(API).origin;
  let cookie = "";
  let csrf = "";
  let role = "";
  const call = async (method, path, body, { authed = true, timeoutMs = 60_000, key = "" } = {}) => {
    const unsafe = method !== "GET";
    try {
      const res = await fetch(`${API}${path}`, {
        method,
        headers: {
          ...(authed && cookie ? { Cookie: cookie } : {}),
          ...(key ? { Authorization: `Bearer ${key}` } : {}),
          // The server's CSRF check wants an allowed Origin and the proof on every unsafe method of a cookie session.
          ...(unsafe ? { Origin: origin } : {}),
          ...(unsafe && authed && csrf ? { "X-LKB-CSRF": csrf } : {}),
          ...(body !== undefined ? { "Content-Type": "application/json" } : {}),
        },
        ...(body !== undefined ? { body: JSON.stringify(body) } : {}),
        signal: AbortSignal.timeout(timeoutMs),
      });
      const text = await res.text();
      let json = null;
      try {
        json = JSON.parse(text);
      } catch {
        /* a non-JSON body is only a fact about the status */
      }
      return { status: res.status, json, res };
    } catch (err) {
      return { status: 0, json: null, res: null, error: String(err?.name ?? "error") };
    }
  };
  const step = (name, pass, detail) => record(name, pass ? "PASS" : "FAIL", detail);
  const seen200 = new Set(); // authenticated GETs that answered 200 before sign-out: each must answer 401 afterwards

  // 1. sign in through the real session login route.
  const login = await call("POST", "/auth/login", { email: LIVE_EMAIL, password: LIVE_PASSWORD }, { authed: false });
  const setCookies = login.res?.headers.getSetCookie?.() ?? [];
  const session = setCookies.map((c) => c.split(";")[0]).find((c) => /lkb_sid=./.test(c));
  const signedIn = login.status === 200 && login.json?.state === "active" && Boolean(session) && nonEmpty(login.json?.csrfToken);
  step(
    "sign-in: POST /auth/login as the configured user",
    signedIn,
    signedIn
      ? "HTTP 200, active session cookie issued"
      : `HTTP ${login.status}${login.error ? ` (${login.error})` : ""}${login.json?.error ? ` ${login.json.error}` : ""}${login.status === 200 ? " — no active session cookie or CSRF proof in the reply" : ""}`,
  );
  if (!signedIn) {
    record("remaining steps: not run", "FAIL", "sign-in failed, so no ask, citation, refusal or sign-out step could run");
    return;
  }
  cookie = session;
  csrf = login.json.csrfToken;
  role = String(login.json?.user?.role ?? "");

  // 2. the session is real and the role is the one row 1 is about.
  const me = await call("GET", "/auth/session");
  const meOk = me.status === 200 && me.json?.state === "active";
  if (meOk && nonEmpty(me.json?.csrfToken)) csrf = me.json.csrfToken;
  step("session: GET /auth/session reports an active session", meOk, `HTTP ${me.status}${meOk ? ` · role=${me.json?.user?.role ?? role}` : ""}`);
  if (meOk) seen200.add("/auth/session");
  if (meOk && nonEmpty(me.json?.user?.role)) role = me.json.user.role;

  // 3. ask the pinned question; every cited passage must carry a session, a turn, a speaker and a start/end time.
  const ask = await call("POST", "/ask", { query: QUESTION }, { timeoutMs: 180_000 });
  step("ask: POST /ask the pinned UC question", ask.status === 200 && ask.json !== null, `HTTP ${ask.status}${ask.error ? ` (${ask.error})` : ""} · verdict=${ask.json?.verdict ?? "n/a"}`);
  const internal = Array.isArray(ask.json?.sources?.internal) ? ask.json.sources.internal : [];
  const quotes = internal.flatMap((src) => {
    const ev = src?.evidence ?? {};
    const list = Array.isArray(ev.sourceQuotes) ? ev.sourceQuotes : [];
    return list.map((q) => ({ sessionRef: q?.sessionRef ?? ev.sessionRef, turnId: q?.turnId, speakerRef: q?.speakerRef, speakerLabel: q?.speakerLabel, tStart: q?.tStart, tEnd: q?.tEnd }));
  });
  const complete = quotes.filter(
    (q) => nonEmpty(q.sessionRef) && nonEmpty(q.turnId) && (nonEmpty(q.speakerRef) || nonEmpty(q.speakerLabel)) && num(q.tStart) && num(q.tEnd) && q.tEnd > q.tStart,
  );
  step(
    "ask: citation carries speaker and start/end time",
    quotes.length > 0 && complete.length === quotes.length,
    quotes.length === 0 ? `no cited passage (${internal.length} internal source(s))` : `${complete.length}/${quotes.length} cited passage(s) have session, turn, speaker and start/end`,
  );
  const pinned = complete.find((q) => q.sessionRef === EXPECT_SESSION);
  step("ask: a citation points at the pinned UC session", Boolean(pinned), pinned ? EXPECT_SESSION : `none of ${complete.length} complete citation(s) is in ${EXPECT_SESSION}`);

  // 4. open the cited turn the way the transcript page does.
  const cited = pinned ?? complete[0];
  if (!cited) {
    record("open cited turn: GET /sessions/:id", "FAIL", "no complete citation to open");
  } else {
    const detail = await call("GET", `/sessions/${encodeURIComponent(cited.sessionRef)}`);
    const turn = Array.isArray(detail.json?.turns) ? detail.json.turns.find((t) => t?._id === cited.turnId) : undefined;
    const sameSpeaker = Boolean(turn) && (turn.speakerRef === cited.speakerRef || (nonEmpty(cited.speakerLabel) && turn.speakerLabel === cited.speakerLabel));
    const sameRange = Boolean(turn) && num(turn.tStart) && num(turn.tEnd) && Math.abs(turn.tStart - cited.tStart) < 0.001 && Math.abs(turn.tEnd - cited.tEnd) < 0.001;
    step(
      "open cited turn: GET /sessions/:id contains the cited turn",
      detail.status === 200 && sameSpeaker && sameRange,
      detail.status !== 200
        ? `HTTP ${detail.status}`
        : !turn
          ? `turn ${cited.turnId} is not in session ${cited.sessionRef}`
          : `turn ${cited.turnId} found${sameSpeaker ? "" : ", but its speaker differs from the citation"}${sameRange ? "" : `, but its time range ${turn.tStart}-${turn.tEnd} differs from the citation ${cited.tStart}-${cited.tEnd}`}`,
    );
    if (detail.status === 200) seen200.add(`/sessions/${encodeURIComponent(cited.sessionRef)}`);
  }

  // 5. a viewer must be refused everywhere an operator or member works. Unsafe routes carry Origin + CSRF, so a refusal here is
  //    an authorization refusal, not a missing-CSRF one.
  step("viewer: the signed-in role is viewer", role === "viewer", `role=${role || "unknown"}${role === "viewer" ? "" : " — row 1 is about a viewer account; sign in as one"}`);
  const surfaces = [
    ["admin", "GET", "/admin/users", undefined],
    ["ingest", "POST", "/ingest", {}],
    ["whatsapp", "GET", "/whatsapp/groups", undefined],
    ["meeting-bot", "GET", "/meeting-bot/privacy", undefined],
  ];
  for (const [label, method, path, body] of surfaces) {
    const r = await call(method, path, body);
    // Refused means 401 or 403 and nothing else: a 404, a 5xx, a 200 or a network failure is a FAIL.
    const refused = REFUSED.includes(r.status);
    // A refusal only counts if the route is real: a viewer's POST to a typo'd path is also 403 (the read-only guard runs before
    // routing). The control is an operator key asking the same route with an empty body: the route must answer anything but 404
    // (a POST gets 400 from its own validation, so nothing is ingested).
    let exists = false;
    let control = "no operator key (LKB_API_KEY / --key) for the existence control";
    if (KEY) {
      const c = await call(method, path, body, { authed: false, key: KEY });
      exists = c.status !== 0 && c.status !== 404;
      control = `control with an operator key: HTTP ${c.status}${exists ? " (route exists)" : " — route NOT proven to exist"}`;
    }
    step(`viewer refused: ${label} (${method} ${path})`, refused && exists, `HTTP ${r.status}${r.error ? ` (${r.error})` : ""}${refused ? "" : " — expected 401/403"} · ${control}`);
  }

  // 6. sign out; the same cookie must be dead afterwards.
  const out = await call("POST", "/auth/logout", {});
  step("sign-out: POST /auth/logout", out.status === 200, `HTTP ${out.status}`);
  const paths = [...seen200];
  const statuses = [];
  for (const path of paths) statuses.push([path, (await call("GET", path)).status]);
  step(
    "sign-out: the old session cookie is rejected",
    paths.length > 0 && statuses.every(([, st]) => st === 401),
    paths.length === 0 ? "no route had answered 200 before sign-out, so there is nothing to compare" : `${statuses.map(([path, st]) => `GET ${path} → ${st}`).join(", ")} (each answered 200 before sign-out and must now be 401)`,
  );
}

/** The keyed (non signed-in) layer-1 pass. Returns the measured `jobs` delta of the /ask call, or null. */
export async function apiPass(ctx) {
  const { KEY, SKIP_ASK, hit, record, mongoOk, preflight } = ctx;
  let askJobsDelta = null;
  if (!KEY) {
    record("api: credential", "INCONCLUSIVE", "no LKB_API_KEY / --key — run `node scripts/mint-key.mjs` first");
  } else {
    const sessions = await hit("GET", "/sessions", { scope: "sessions" });
    await hit("GET", "/sources", { scope: "sources" });
    await hit("GET", "/gaps", { scope: "gaps" });
    await hit("GET", "/graph", { scope: "graph" });
    await hit("GET", "/calendar/upcoming", { scope: "calendar" });
    await hit("GET", "/meeting-candidates", { scope: "gmail" });
    await hit("GET", "/whatsapp/groups", { scope: "whatsapp" });
    await hit("GET", "/keys", { scope: "keys" });
    await hit("GET", "/search", { scope: "search", expect: 501 });
    await hit("GET", "/citations/none", { scope: "citations", expect: 501 });
    await hit("GET", "/health", { expect: 404 });

    // Reconcile the list route against the raw Mongo count — the check that makes a UI screenshot
    // meaningful later, because both must agree with this same number.
    const listed = Array.isArray(sessions?.sessions) ? sessions.sessions.length : null;
    if (listed !== null && mongoOk) {
      const inMongo = preflight.collections.sessions;
      record(
        "reconcile: GET /sessions length == sessions in Mongo",
        listed === inMongo ? "PASS" : "FAIL",
        `api=${listed} mongo=${inMongo}`,
      );
      const first = sessions.sessions[0]?._id;
      if (first) await hit("GET", `/sessions/${encodeURIComponent(first)}`, { scope: "sessions" });
    } else if (listed === null) {
      record("reconcile: GET /sessions length == sessions in Mongo", "INCONCLUSIVE", "no session list to compare");
    }

    if (!SKIP_ASK) {
      // Measure this run's own side effect instead of asserting a constant for it. The first
      // version of this file claimed `/ask` "appends one real jobs ledger row"; the real figure is
      // 20-30 and non-deterministic (one row per evaluator/score call), and that false constant was
      // being written into every evidence artifact — an unmeasured claim inside the very tool built
      // to eliminate unmeasured claims (ISS-024, checker, 2026-09-07).
      const jobsBefore = mongoOk ? await (await import("../../packages/db/src/index.ts")).getDb().collection("jobs").countDocuments() : null;
      const ask = await hit("POST", "/ask", { scope: "ask", body: { query: "What did speakers say about student visas?" } });
      if (mongoOk) {
        const { getDb } = await import("../../packages/db/src/index.ts");
        askJobsDelta = (await getDb().collection("jobs").countDocuments()) - jobsBefore;
        record("POST /ask side effect measured", "PASS", `appended ${askJobsDelta} real \`jobs\` ledger row(s)`);
      }
      // The product's whole promise is a cited answer: an answer with no citation is a real FAIL,
      // not a soft warning. `sources` is `{internal: [...], web: [...]}` (askV2's real shape — the
      // first version of this check assumed a flat array and produced a FALSE FAIL against a
      // perfectly good answer, 2026-09-07; assert against the shape the server actually sends).
      if (ask) {
        const internal = ask.sources?.internal ?? [];
        const web = ask.sources?.web ?? [];
        const n = internal.length + web.length;
        record(
          "POST /ask returns at least one citation",
          n > 0 ? "PASS" : "FAIL",
          `${internal.length} internal + ${web.length} web · verdict=${ask.verdict}`,
        );
        // Every cited internal node must resolve to a session that really exists in Mongo —
        // this is what separates a real citation from a plausible-looking hallucinated id.
        // EVERY cited source must yield a ref, not just the subset that happened to have one:
        // otherwise a response whose sources all lack `evidence.sessionRef` gives refs=[] and
        // 0 === 0 records a vacuous PASS (ISS-025, checker, 2026-09-07).
        if (mongoOk && internal.length > 0) {
          const { getDb } = await import("../../packages/db/src/index.ts");
          const refs = [...new Set(internal.map((s) => s.evidence?.sessionRef).filter(Boolean))];
          const unref = internal.length - internal.filter((s) => s.evidence?.sessionRef).length;
          const found = refs.length === 0 ? -1 : await getDb().collection("sessions").countDocuments({ _id: { $in: refs } });
          record(
            "POST /ask citations resolve to real sessions",
            unref === 0 && refs.length > 0 && found === refs.length ? "PASS" : "FAIL",
            unref > 0
              ? `${unref}/${internal.length} cited source(s) carried no evidence.sessionRef — unverifiable`
              : `${found}/${refs.length} cited sessionRef(s) exist in Mongo`,
          );
        }
      }
    }
  }
  return askJobsDelta;
}
