// migrate-mongo-config.cjs — T-018 C5. CommonJS (repo package.json is "type": "module";
// migrate-mongo's CLI loads this file directly with require(), so it must stay .cjs).
// MONGODB_URL / MONGODB_DB come from .env (see .env.example) — never hard-coded here.
//
// ISS-SCRIPTGUARDS-001: `migrate-mongo up` is a data writer, so there is NO default database and NO default URL.
// `lkb` (production) is reachable only with BOTH the explicit production opt-in (argv `--i-know-this-is-production`
// or env LKB_I_KNOW_THIS_IS_PRODUCTION=1) AND MONGODB_DB exactly "lkb": a flag alone or an env alone is refused, and
// the opt-in with any other database is refused too. This is the same rule as requireScriptDatabase
// (scripts/lib/transcript-provenance.mjs); it is inlined because compose bind-mounts only this file into the container.
require("dotenv/config");

const PRODUCTION_FLAG = "--i-know-this-is-production";

function resolveMigrateTarget(env, argv) {
  const url = (env.MONGODB_URL || "").trim();
  const name = (env.MONGODB_DB || "").trim();
  if (!/^mongodb(\+srv)?:\/\/\S+$/.test(url)) throw new Error("migrate: MONGODB_URL is required (no default)");
  if (!name) throw new Error("migrate: MONGODB_DB is required (no default); set the database explicitly");
  const production = argv.includes(PRODUCTION_FLAG) || env.LKB_I_KNOW_THIS_IS_PRODUCTION === "1";
  if (production) {
    if (name !== "lkb") throw new Error(`migrate: ${PRODUCTION_FLAG} requires MONGODB_DB=lkb exactly`);
    return { url, databaseName: "lkb" };
  }
  const lower = name.toLowerCase();
  if (lower === "lkb" || lower === "global_university_db")
    throw new Error(`migrate: database "${name}" refused; production needs ${PRODUCTION_FLAG} (or LKB_I_KNOW_THIS_IS_PRODUCTION=1) AND MONGODB_DB=lkb`);
  if (lower === "lkb_staging" && !(name === "lkb_staging" && env.LKB_ALLOW_STAGING === "lkb_staging"))
    throw new Error("migrate: lkb_staging requires LKB_ALLOW_STAGING=lkb_staging; refused");
  if (!/^[a-zA-Z0-9_-]{1,64}$/.test(name)) throw new Error("migrate: invalid MONGODB_DB name");
  return { url, databaseName: name };
}

const { url, databaseName } = resolveMigrateTarget(process.env, process.argv);

module.exports = {
  mongodb: {
    url,
    databaseName,
    options: {
      connectTimeoutMS: 5000,
      serverSelectionTimeoutMS: 5000,
    },
  },
  migrationsDir: "migrations",
  changelogCollectionName: "migrations_changelog",
  migrationFileExtension: ".cjs",
  useFileHash: false,
  moduleSystem: "commonjs",
  resolveMigrateTarget,
};
