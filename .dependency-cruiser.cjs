/**
 * .dependency-cruiser.cjs — ARCHITECTURE §5 dependency rules (downward only), T-017 C6.
 *   apps         → packages/{ask,ingest,index,ai,db,core}
 *   ask|index|ingest → ai | db | core
 *   ai|db        → core
 *   core         → nothing (no workspace imports)
 *   meeting-bot  → ingest | core
 *   workers      → nothing
 * Run: npx depcruise --config .dependency-cruiser.cjs packages apps workers
 *   (the bare "--validate packages apps workers" form is mis-parsed by depcruise's CLI --
 *    commander treats "packages" as --validate's config-file argument, cruising 2 modules
 *    instead of the real graph. Use --config explicitly, or `pnpm lint:structure`.)
 * Workspace packages (@lkb/*) resolve through pnpm symlinks to their real packages/<name>/ path,
 * so every rule is expressed on real paths. `$1` = the importing package's own name (self-imports ok).
 */
const OTHER = (allowed) => `^packages/(?!(?:${allowed}|$1)/)|^apps/(?!$1/)|^workers/`;

module.exports = {
  forbidden: [
    {
      name: "no-circular",
      severity: "error",
      from: {},
      to: { circular: true },
    },
    {
      name: "apps-only-ask-ingest-index-ai-db-core",
      comment: "apps → packages/{ask,ingest,index,ai,db,core} only",
      severity: "error",
      from: { path: "^apps/([^/]+)/" },
      to: { path: "^packages/(?!(?:ask|ingest|index|ai|db|core)/)|^apps/(?!$1/)|^workers/" },
    },
    {
      name: "ask-index-ingest-only-ai-db-core",
      comment: "ask|index|ingest → ai|db|core only",
      severity: "error",
      from: { path: "^packages/(ask|index|ingest)/" },
      to: { path: OTHER("ai|db|core") },
    },
    {
      name: "ai-db-only-core",
      comment: "ai|db → core only",
      severity: "error",
      from: { path: "^packages/(ai|db)/" },
      to: { path: OTHER("core") },
    },
    {
      name: "core-imports-nothing",
      comment: "core → nothing (no workspace imports)",
      severity: "error",
      from: { path: "^packages/(core)/" },
      to: { path: "^packages/(?!core/)|^apps/|^workers/" },
    },
    {
      name: "meeting-bot-only-ingest-core",
      comment: "meeting-bot → ingest|core only",
      severity: "error",
      from: { path: "^packages/(meeting-bot)/" },
      to: { path: OTHER("ingest|core") },
    },
    {
      name: "workers-import-nothing",
      comment: "workers → nothing (queue contract only)",
      severity: "error",
      from: { path: "^workers/([^/]+)/" },
      to: { path: "^packages/|^apps/|^workers/(?!$1/)" },
    },
    {
      name: "no-unresolvable-workspace-import",
      comment: "an @lkb/* import that does not resolve is still a workspace import — never silently ok. Sole exemption: the declared devDependency esbuild (apps/api/package.json), imported by the tooling script apps/api/scripts/build.mjs, which has its own fallback loader for checkouts whose node_modules predate it.",
      severity: "error",
      from: {},
      to: { couldNotResolve: true, pathNot: "^esbuild$" },
    },
  ],
  options: {
    doNotFollow: { path: "node_modules" },
    exclude: { path: "node_modules|/dist/" },
    tsPreCompilationDeps: true,
    tsConfig: { fileName: "tsconfig.base.json" },
    enhancedResolveOptions: {
      exportsFields: ["exports"],
      conditionNames: ["import", "require", "node", "default", "types"],
      mainFields: ["main", "types"],
      // .tsx added for apps/web (T-010/§8b) -- the first .tsx-containing package in the
      // monorepo; every import here is written with a ".js" extension per TS/ESM convention
      // even though the real source file is .tsx (e.g. "./LoginGate.js" -> LoginGate.tsx),
      // and depcruise's resolver needs .tsx in its own extension list to find it, independent
      // of what extension the import string itself uses.
      extensions: [".ts", ".tsx", ".mts", ".cts", ".js", ".mjs", ".cjs", ".json"],
    },
    reporterOptions: { text: { highlightFocused: true } },
  },
};
