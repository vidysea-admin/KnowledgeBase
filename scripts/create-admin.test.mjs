// user-accounts A6 (D-206), plan A6 acceptance item 6: scripts/create-admin.mjs.
//  - refusal paths and idempotency run against injected fakes (nothing connects, nothing is hashed for real unless stated);
//  - the end-to-end proof spawns the REAL script against a loopback mongod (opt-in: LKB_UA_ADMIN_MONGO_URI) in a throwaway database.
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { randomBytes } from "node:crypto";
import test from "node:test";
import { fileURLToPath } from "node:url";
import { BOOTSTRAP_ACTOR, main, passwordFromStdinText } from "./create-admin.mjs";

const PW = "correct horse battery staple 42";
const WORK = { MONGO_WORK_DB: "lkb_work_test", MONGODB_URL: "mongodb://127.0.0.1:1/x" };

function fakes(over = {}) {
  const calls = { connect: 0, stdin: 0, insert: [], events: [], find: 0, hash: 0 };
  const store = new Map();
  const d = {
    requireScriptDatabase: (await_env, argv, opts) => over.guard ? over.guard(await_env, argv, opts) : { url: await_env.MONGODB_URL, dbName: await_env.MONGO_WORK_DB },
    assertValidTenantId: (t) => { if (!/^[a-z][a-z0-9_-]{0,31}$/.test(t)) throw new Error(`invalid tenant id`); },
    normalizeEmail: (e) => (typeof e === "string" && /^[^@\s]+@[^@\s]+$/.test(e.trim()) ? e.trim().toLowerCase() : null),
    checkPassword: (p) => (p.length >= 12 ? { ok: true } : { ok: false, reasons: ["too_short"] }),
    hash: async (p) => { calls.hash++; return `$argon2id$v=19$m=19456,t=2,p=1$c29tZXNhbHQ$${Buffer.from(p).toString("base64url").slice(0, 20)}`; },
    readStdin: async () => { calls.stdin++; return over.stdin ?? `${PW}\n`; },
    connect: async () => { calls.connect++; },
    getDb: () => ({}),
    findUserByEmail: async (t, e) => { calls.find++; return store.get(e) ?? null; },
    insertUser: async (t, input) => {
      if (over.insertThrows) throw over.insertThrows;
      const row = { _id: `u${store.size + 1}`, tenantId: t, ...input };
      calls.insert.push(row); store.set(input.emailNormalized, row); return row;
    },
    recordAuthEvent: async (t, ev) => { if (over.eventThrows) throw new Error("boom"); calls.events.push({ t, ...ev }); },
    close: async () => {},
  };
  return { d, calls, store };
}

async function run(argv, env, f) {
  const out = [], err = [];
  const code = await main({ argv, env, deps: f.d, out: (s) => out.push(s), err: (s) => err.push(s) });
  return { code, out: out.join("\n"), err: err.join("\n"), all: [...out, ...err].join("\n") };
}
const ARGS = ["--tenant", "toc", "--email", "Boss@Example.org"];

test("A6-6 creates an active admin once, with one bootstrap audit event, and never prints the password", async () => {
  const f = fakes();
  const r = await run(ARGS, WORK, f);
  assert.equal(r.code, 0, r.err);
  assert.equal(f.calls.insert.length, 1);
  const u = f.calls.insert[0];
  assert.equal(u.emailNormalized, "boss@example.org");
  assert.equal(u.status, "active"); assert.equal(u.role, "admin"); assert.equal(u.statusChangedBy, BOOTSTRAP_ACTOR);
  assert.match(u.passwordHash, /^\$argon2id\$/); assert.ok(!u.passwordHash.includes(PW));
  assert.deepEqual(f.calls.events, [{ t: "toc", type: "admin_bootstrap", outcome: "ok", detail: "bootstrap", actorUserId: BOOTSTRAP_ACTOR, targetUserId: u._id }]);
  assert.ok(!r.all.includes(PW), "the password must never be printed");
  assert.ok(!r.all.includes(u.passwordHash), "the hash must not be printed either");
});

test("A6-6 is idempotent: the same email twice yields one user, one event, and the password is not changed", async () => {
  const f = fakes();
  assert.equal((await run(ARGS, WORK, f)).code, 0);
  const second = await run(ARGS, WORK, { ...f, d: { ...f.d, readStdin: async () => "a completely different pass 99\n" } });
  assert.equal(second.code, 0, second.err);
  assert.match(second.out, /already an active admin/);
  assert.equal(f.calls.insert.length, 1, "no second user");
  assert.equal(f.calls.events.length, 1, "no second audit event");
  assert.equal(f.store.get("boss@example.org").passwordHash.includes(Buffer.from("a completely").toString("base64url").slice(0, 8)), false, "stored hash untouched");
  assert.ok(!second.all.includes("a completely different pass 99"));
});

test("A6-6 a lost insert race (duplicate key) that left an active admin is treated as the idempotent case", async () => {
  const f = fakes({ insertThrows: Object.assign(new Error("E11000 dup"), { code: 11000 }) });
  f.store.set("late@example.org", undefined);
  let first = true;
  f.d.findUserByEmail = async () => { if (first) { first = false; return null; } return { _id: "u9", status: "active", role: "admin" }; };
  const r = await run(["--tenant", "toc", "--email", "late@example.org"], WORK, f);
  assert.equal(r.code, 0, r.err);
  assert.equal(f.calls.events.length, 0);
});

test("A6-6 an existing account in another state is never touched (exit 3) and nothing is written", async () => {
  const f = fakes();
  f.store.set("boss@example.org", { _id: "u0", status: "pending", role: null });
  const r = await run(ARGS, WORK, f);
  assert.equal(r.code, 3);
  assert.match(r.err, /left untouched/);
  assert.equal(f.calls.insert.length, 0); assert.equal(f.calls.events.length, 0);
  f.store.set("boss@example.org", { _id: "u0", status: "active", role: "member" });
  assert.equal((await run(ARGS, WORK, f)).code, 3, "an active MEMBER is not silently promoted");
});

test("A6-6 refuses without a work/staging DB: no connection, no stdin read, no write (default guard)", async () => {
  for (const env of [{}, { MONGODB_URL: "mongodb://127.0.0.1:1/x" }, { MONGODB_DB: "lkb", MONGODB_URL: "mongodb://127.0.0.1:1/x" }, { MONGO_WORK_DB: "lkb", MONGODB_URL: "mongodb://127.0.0.1:1/x" }]) {
    const f = fakes({ guard: (...a) => guardReal(...a) });
    const r = await run(ARGS, env, f);
    assert.equal(r.code, 1, JSON.stringify(env));
    assert.equal(f.calls.connect, 0); assert.equal(f.calls.stdin, 0); assert.equal(f.calls.insert.length, 0);
  }
});

test("A6-6 production needs the opt-in flag AND an explicit MONGODB_DB; the flag alone is refused", async () => {
  const prodEnv = { MONGODB_DB: "lkb", MONGODB_URL: "mongodb://127.0.0.1:1/x" };
  let f = fakes({ guard: (...a) => guardReal(...a) });
  assert.equal((await run([...ARGS, "--i-know-this-is-production"], { MONGODB_URL: prodEnv.MONGODB_URL }, f)).code, 1);
  assert.equal(f.calls.connect, 0);
  f = fakes({ guard: (...a) => guardReal(...a) });
  assert.equal((await run([...ARGS, "--i-know-this-is-production"], { ...prodEnv, MONGODB_DB: "other" }, f)).code, 1);
  f = fakes({ guard: (e, a, o) => { const t = guardReal(e, a, o); return { ...t, dbName: t.dbName }; } });
  assert.equal((await run([...ARGS, "--i-know-this-is-production"], prodEnv, f)).code, 0, "explicit opt-in + MONGODB_DB=lkb is the one route");
});

let guardReal;
test.before(async () => { ({ requireScriptDatabase: guardReal } = await import("./lib/transcript-provenance.mjs")); });

test("A6-6 the password is accepted only through stdin: any --password flag, empty or multi-line stdin is refused before any write", async () => {
  for (const extra of [["--password", PW], ["--password=" + PW], ["--passwd", PW], ["-p", PW]]) {
    const f = fakes();
    const r = await run([...ARGS, ...extra], WORK, f);
    assert.equal(r.code, 1);
    assert.match(r.err, /never accepted on the command line/);
    assert.ok(!r.all.includes(PW), "a refused password argument must not be echoed");
    assert.equal(f.calls.connect + f.calls.stdin + f.calls.insert.length, 0);
  }
  for (const stdin of ["", "\n", "line one is long enough\nline two\n", "x\ny"]) {
    const f = fakes({ stdin });
    const r = await run(ARGS, WORK, f);
    assert.equal(r.code, 1, JSON.stringify(stdin));
    assert.equal(f.calls.insert.length, 0);
  }
  assert.equal(passwordFromStdinText("secret pass phrase\n"), "secret pass phrase");
  assert.equal(passwordFromStdinText("  pad  \r\n"), "  pad  ", "only one trailing newline is stripped; spaces belong to a passphrase");
});

test("A6-6 a policy-failing password, a bad email, a bad tenant and unknown arguments are refused with nothing written", async () => {
  const cases = [
    [{ stdin: "short\n" }, ARGS],
    [{}, ["--tenant", "toc", "--email", "not-an-email"]],
    [{}, ["--tenant", "Bad Tenant!", "--email", "a@b.org"]],
    [{}, ["--tenant", "toc"]],
    [{}, ["--email", "a@b.org"]],
    [{}, [...ARGS, "--role", "member"]],
    [{}, [...ARGS, "stray"]],
  ];
  for (const [over, argv] of cases) {
    const f = fakes(over);
    const r = await run(argv, WORK, f);
    assert.equal(r.code, 1, JSON.stringify(argv));
    assert.equal(f.calls.insert.length, 0); assert.equal(f.calls.events.length, 0);
    assert.ok(!r.all.includes("short\n"));
  }
});

test("A6-6 if the audit event cannot be written the script exits non-zero and says the user exists", async () => {
  const f = fakes({ eventThrows: true });
  const r = await run(ARGS, WORK, f);
  assert.equal(r.code, 1);
  assert.match(r.err, /WAS created but its audit event/);
});

// --- the real script, as a child process, against a real loopback mongod ---------------------------------------------------------------
const uri = process.env.LKB_UA_ADMIN_MONGO_URI;
test("A6-6 the real script end to end on a throwaway database: creates the admin, is idempotent, argon2id hash, never prints the password", { skip: !uri, timeout: 120_000 }, async () => {
  assert.ok(["127.0.0.1", "localhost", "[::1]"].includes(new URL(uri).hostname), "loopback mongod only");
  const { MongoClient } = await import("mongodb");
  const dbName = `lkb_ua_createadmin_test_${randomBytes(6).toString("hex")}`;
  const script = fileURLToPath(new URL("./create-admin.mjs", import.meta.url));
  const cwd = fileURLToPath(new URL("..", import.meta.url));
  const env = { ...process.env, MONGO_WORK_DB: dbName, MONGODB_URL: uri };
  delete env.MONGODB_DB; delete env.LKB_ALLOW_STAGING;
  const client = new MongoClient(uri, { serverSelectionTimeoutMS: 5000 });
  await client.connect();
  try {
    // The script does not migrate; the A1 migration (unique email index, TTLs) is applied first, exactly as a deployment would.
    const { createRequire } = await import("node:module");
    const migration = createRequire(import.meta.url)("../migrations/20261029100000-user-accounts.cjs");
    const keep = { w: process.env.MONGO_WORK_DB, u: process.env.MONGODB_URL, d: process.env.MONGODB_DB };
    process.env.MONGO_WORK_DB = dbName; process.env.MONGODB_URL = uri; delete process.env.MONGODB_DB;
    try { await migration.up(client.db(dbName)); } finally { for (const [k, v] of [["MONGO_WORK_DB", keep.w], ["MONGODB_URL", keep.u], ["MONGODB_DB", keep.d]]) { if (v === undefined) delete process.env[k]; else process.env[k] = v; } }
    const spawn = (args, input, e = env) => spawnSync(process.execPath, [script, ...args], { cwd, env: e, input, encoding: "utf8", timeout: 60_000 });
    const a = spawn(["--tenant", "toc", "--email", "Root@Example.org", "--display-name", "Root Admin"], `${PW}\n`);
    assert.equal(a.status, 0, a.stderr);
    const b = spawn(["--tenant", "toc", "--email", "root@example.org"], `${PW}\n`);
    assert.equal(b.status, 0, b.stderr);
    assert.match(b.stdout, /already an active admin/);
    const db = client.db(dbName);
    const rows = await db.collection("users").find({}).toArray();
    assert.equal(rows.length, 1, "exactly one user after two runs");
    const [u] = rows;
    assert.equal(u.tenantId, "toc"); assert.equal(u.emailNormalized, "root@example.org"); assert.equal(u.displayName, "Root Admin");
    assert.equal(u.status, "active"); assert.equal(u.role, "admin"); assert.equal(u.statusChangedBy, BOOTSTRAP_ACTOR);
    assert.match(u.passwordHash, /^\$argon2id\$/); assert.ok(!JSON.stringify(u).includes(PW));
    const events = await db.collection("auth_events").find({}).toArray();
    assert.equal(events.length, 1);
    assert.equal(events[0].type, "admin_bootstrap"); assert.equal(events[0].actorUserId, BOOTSTRAP_ACTOR); assert.equal(events[0].targetUserId, u._id);
    for (const r of [a, b]) assert.ok(!(r.stdout + r.stderr).includes(PW), "the password never reaches stdout/stderr");
    const another = spawn(["--tenant", "other", "--email", "root@example.org"], `${PW}\n`);
    assert.equal(another.status, 1, "an address registered in another tenant is refused, not duplicated");
    assert.equal(await db.collection("users").countDocuments(), 1);
    const noDb = spawn(["--tenant", "toc", "--email", "x@example.org"], `${PW}\n`, { ...process.env, MONGO_WORK_DB: "", MONGODB_DB: "", MONGODB_URL: uri });
    assert.equal(noDb.status, 1);
    const viaArg = spawn(["--tenant", "toc", "--email", "y@example.org", "--password", PW], "");
    assert.equal(viaArg.status, 1);
    assert.ok(!(viaArg.stdout + viaArg.stderr).includes(PW));
    assert.equal(await db.collection("users").countDocuments(), 1);
  } finally {
    await client.db(dbName).dropDatabase();
    await client.close();
  }
});
