#!/usr/bin/env node
/**
 * scripts/create-admin.mjs -- unit `ua-admin-api` (A6), spec UA-7. The ONLY way the first admin exists: there is no web path to it.
 *
 *   printf '%s' "$PASSWORD" | node scripts/create-admin.mjs --tenant toc --email you@example.org [--display-name "Your Name"]
 *
 *  - Password: STDIN ONLY (one line). It is never an argument (a `--password*` flag is refused), never printed, never logged.
 *  - Database: modelled on scripts/mint-key.mjs. No default. An isolated MONGO_WORK_DB (or lkb_staging with LKB_ALLOW_STAGING) is used
 *    without a flag; `lkb` / `lkb_prod` need --i-know-this-is-production AND MONGODB_DB=lkb|lkb_prod exactly (D-150). Anything else is
 *    refused BEFORE a connection is opened and before stdin is read. Running it against production is still a human-approved act (D-196).
 *  - Idempotent: the same email in the same tenant that is already an active admin is a no-op (exit 0, password NOT changed, no second user,
 *    no second audit row). An existing account in any other state is never touched (exit 3); the email of another tenant is refused (exit 1).
 *  - Creates the user `active`, role `admin`, email verified (buildUser does that for status active), statusChangedBy `bootstrap-script`,
 *    and writes one `admin_bootstrap` audit event with actor `bootstrap-script`.
 * Exit codes: 0 created / already an admin; 1 refused (arguments, database, password policy, tenant); 3 existing account left untouched.
 */
import { pathToFileURL } from "node:url";

export const BOOTSTRAP_ACTOR = "bootstrap-script";
const KNOWN = new Set(["--tenant", "--email", "--display-name", "--i-know-this-is-production"]);

function parseArgs(argv) {
  const opts = {};
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (/^--pass/i.test(a) || a === "-p") throw new Error("a password is never accepted on the command line; pipe it on stdin");
    if (!KNOWN.has(a)) throw new Error(`unknown argument ${a.startsWith("--") ? a.split("=")[0] : "(positional)"}`);
    if (a === "--i-know-this-is-production") continue;
    const v = argv[++i];
    if (typeof v !== "string" || v.startsWith("--")) throw new Error(`${a} needs a value`);
    opts[a.slice(2)] = v;
  }
  if (!opts.tenant) throw new Error("--tenant is required");
  if (!opts.email) throw new Error("--email is required");
  return opts;
}

/** One line from stdin, minus a single trailing newline. Spaces are part of a passphrase and are kept. */
export function passwordFromStdinText(text) {
  if (typeof text !== "string") throw new Error("no password on stdin");
  const line = text.replace(/\r?\n$/, "");
  if (line.length === 0) throw new Error("the password on stdin is empty");
  if (/[\r\n]/.test(line)) throw new Error("stdin must carry exactly one line (the password)");
  return line;
}

async function readProcessStdin() {
  if (process.stdin.isTTY) throw new Error("stdin is a terminal: pipe the password in (printf '%s' \"$PASSWORD\" | node scripts/create-admin.mjs ...)");
  const chunks = [];
  for await (const c of process.stdin) chunks.push(c);
  return Buffer.concat(chunks).toString("utf8");
}

async function loadDefaultDeps() {
  const { register } = await import("tsx/esm/api");
  register();
  const [{ requireScriptDatabase, PRODUCTION_FLAG }, db, email, policy, pw] = await Promise.all([
    import("./lib/transcript-provenance.mjs"),
    import("../packages/db/src/index.ts"),
    import("../apps/api/src/user-accounts/email.ts"),
    import("../apps/api/src/user-accounts/password-policy.ts"),
    import("../apps/api/src/user-accounts/password.ts"),
  ]);
  void PRODUCTION_FLAG;
  return {
    requireScriptDatabase,
    assertValidTenantId: db.assertValidTenantId,
    connect: db.connect,
    getDb: db.getDb,
    findUserByEmail: db.findUserByEmail,
    insertUser: db.insertUser,
    recordAuthEvent: db.recordAuthEvent,
    normalizeEmail: email.normalizeEmail,
    checkPassword: policy.checkPassword,
    hash: pw.hash,
    readStdin: readProcessStdin,
    close: async () => { try { await db.getDb().client?.close?.(); } catch { /* process exits anyway */ } },
  };
}

/**
 * Pure of process state: everything it touches arrives in `deps`, so the refusal and idempotency rules are tested with fakes
 * and only the real-database proof needs a mongod. Returns the exit code; never throws.
 */
export async function main({ argv, env, deps, out = (s) => console.log(s), err = (s) => console.error(s) }) {
  const refuse = (message, code = 1) => { err(`create-admin: ${message}`); return code; };
  let opts;
  try { opts = parseArgs(argv); } catch (e) { return refuse(e.message); }
  const d = deps ?? (await loadDefaultDeps());

  let target;
  try { target = d.requireScriptDatabase(env, argv, { allowProduction: true }); } catch (e) { return refuse(e.message); }
  try { d.assertValidTenantId(opts.tenant, "create-admin --tenant"); } catch (e) { return refuse(e.message); }
  const email = d.normalizeEmail(opts.email);
  if (email === null) return refuse("--email is not a valid address");
  const displayName = (opts["display-name"] ?? email.slice(0, email.indexOf("@"))).slice(0, 100);
  if (displayName.length < 1) return refuse("--display-name is empty");

  let password;
  try { password = passwordFromStdinText(await d.readStdin()); } catch (e) { return refuse(e.message); }

  try {
    await d.connect(target.url, target.dbName);
    const db = d.getDb();
    const same = (u) => u && u.status === "active" && u.role === "admin";
    const existing = await d.findUserByEmail(opts.tenant, email, db);
    if (existing) {
      if (same(existing)) { out(`create-admin: ${email} is already an active admin of tenant ${opts.tenant} (user ${existing._id}); nothing changed, password unchanged`); return 0; }
      return refuse(`${email} already has an account in tenant ${opts.tenant} (status ${existing.status}); it was left untouched. Use the admin screen, or another address`, 3);
    }
    const check = d.checkPassword(password, { email });
    if (!check.ok) return refuse(`the password is not acceptable (${check.reasons.join(", ")})`);
    const passwordHash = await d.hash(password);
    let row;
    try {
      row = await d.insertUser(opts.tenant, { emailNormalized: email, displayName, passwordHash, status: "active", role: "admin", statusChangedBy: BOOTSTRAP_ACTOR }, db);
    } catch (e) {
      if (e?.code === 11000) {
        const again = await d.findUserByEmail(opts.tenant, email, db);
        if (same(again)) { out(`create-admin: ${email} is already an active admin of tenant ${opts.tenant} (user ${again._id}); nothing changed, password unchanged`); return 0; }
        return refuse(`${email} is already registered (in another tenant, or as another kind of account); nothing was created`);
      }
      throw e;
    }
    try {
      await d.recordAuthEvent(opts.tenant, { type: "admin_bootstrap", outcome: "ok", detail: "bootstrap", actorUserId: BOOTSTRAP_ACTOR, targetUserId: row._id }, db);
    } catch {
      return refuse(`user ${row._id} WAS created but its audit event could not be written; record it by hand`, 1);
    }
    out(`create-admin: created admin ${email} (user ${row._id}) in tenant ${opts.tenant} on database ${target.dbName}`);
    return 0;
  } catch (e) {
    return refuse(`failed: ${e?.name ?? "error"}${e?.code ? ` (${e.code})` : ""}`);
  } finally {
    try { await d.close?.(); } catch { /* ignore */ }
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  await import("dotenv/config");
  const code = await main({ argv: process.argv.slice(2), env: process.env });
  process.exit(code);
}
