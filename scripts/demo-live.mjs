#!/usr/bin/env node
/**
 * scripts/demo-live.mjs — the HUMAN half of the plan §9 Phase-0 validation protocol.
 *
 * `live-verify.mjs` proves the bytes; this proves them to a person. It opens the operator's OWN
 * installed browser (not an automation-controlled one) on every page of the running app and
 * prints the reconcile checklist, so "it works" is something Umesh sees himself in ~3 minutes
 * rather than something he has to take on trust from a transcript or an agent's screenshot.
 *
 * Deliberately does NOT start the servers DETACHED: spawning detached cross-platform servers from
 * a throwaway script leaves orphans behind, which is worse than one printed instruction. If they
 * are not up, this says exactly how to start them and exits non-zero.
 *
 * `--up` (D-024) starts them in the FOREGROUND instead and stops there. That is not a reversal of
 * the rule above — the objection was orphans, and foreground children die with Ctrl-C. It exists
 * because D-024 makes the browser check MANDATORY, and a mandatory step that is a research task
 * every time ("which port? what CORS origin?") is a step that gets switched off. Measured in this
 * repo one day earlier: tree-cleanliness-sensitive tests were wired into `lint:structure`, went
 * red for every lane, and had to be backed out within the hour.
 *
 * Folded in here rather than added as `scripts/demo-up.mjs` because `scripts/` sits at its D-018
 * directory cap and that entry records that a THIRD raise must consolidate rather than widen.
 *
 * Usage: pnpm demo:up      -> start both servers (foreground; Ctrl-C stops both)
 *        pnpm demo:live    -> open the operator's own browser on every page
 *        (or: node scripts/demo-live.mjs [--up] [--web http://localhost:5173])
 */
import { execFile } from "node:child_process";
import { platform } from "node:process";

const argOf = (n, d) => {
  const i = process.argv.indexOf(`--${n}`);
  return i >= 0 && process.argv[i + 1] ? process.argv[i + 1] : d;
};
const WEB = argOf("web", "http://localhost:5173");
const API = argOf("api", "http://localhost:3300");

export const PAGES = [
  ["/", "Dashboard — stat tiles must equal the collection counts in live-verify's summary.md"],
  ["/sessions", "Sessions — list length must equal the `sessions` count"],
  ["/ask", "Ask — page loads and whitespace stays disabled; real submission needs the external-data gate"],
  ["/brain", "Brain — graph renders from tree_index; topics/speakers/decisions are EMPTY by design today"],
  ["/calendar", "Calendar — real past sessions; upcoming is honestly empty without a connected calendar"],
  ["/sources", "Sources — rows must match GET /sources"],
  ["/ingest", "Ingest — URL-only today; no file/recording upload path exists yet"],
  ["/whatsapp", "WhatsApp — real tracked group(s); 'View it' opens the real chat transcript"],
  ["/meeting-bot", "Meeting Bot — MUST self-label as not real; every joiner is still a stub"],
  ["/settings", "Settings — real API keys, masked"],
];

// ---- `--up`: start both servers in the foreground, then stop (D-024) ---------------------------
if (process.argv.includes("--up")) {
  const { spawn } = await import("node:child_process");
  const { dirname, join, resolve } = await import("node:path");
  const { fileURLToPath } = await import("node:url");
  const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
  const apiPort = new URL(API).port || "3300";
  const webPort = new URL(WEB).port || "5173";
  const workDb = process.env.MONGO_WORK_DB?.trim();
  if (!workDb) {
    console.error("Refusing to start the live demo without MONGO_WORK_DB; production/default Mongo is read-only.");
    process.exit(2);
  }

  console.log(`starting api on :${apiPort} and web on :${webPort} (foreground; Ctrl-C stops both)`);
  console.log("then, in another terminal: pnpm demo:live");

  const kids = [
    // CORS_ORIGINS is REQUIRED, not a nicety: server.ts documents that it has no default, so
    // without it every browser call is blocked by the browser rather than by the server — which
    // looks exactly like a broken app.
    spawn("node", ["--import", "tsx", "src/index.ts"], {
      cwd: join(ROOT, "apps", "api"), stdio: "inherit", shell: true,
      env: { ...process.env, MONGODB_DB: workDb, PORT: apiPort, CORS_ORIGINS: WEB },
    }),
    spawn("npx", ["vite", "--port", webPort], {
      cwd: join(ROOT, "apps", "web"), stdio: "inherit", shell: true,
      env: { ...process.env, VITE_API_BASE_URL: API },
    }),
  ];
  for (const sig of ["SIGINT", "SIGTERM"]) {
    process.on(sig, () => { for (const k of kids) k.kill(); process.exit(0); });
  }
  await new Promise(() => {}); // hold the foreground until Ctrl-C
}

async function isUp(url) {
  try {
    await fetch(url, { method: "GET" });
    return true;
  } catch {
    return false;
  }
}

export async function openPages(pages, baseUrl, { staggerMs = 350, execFileFn = execFile, timeoutMs = 10000 } = {}) {
  const [cmd, baseArgs] = opener;
  const failures = [];
  for (const [path] of pages) {
    const url = `${baseUrl}${path}`;
    try {
      await new Promise((resolve, reject) => {
        execFileFn(cmd, [...baseArgs, url], { timeout: timeoutMs }, (err) => (err ? reject(err) : resolve()));
      });
    } catch (err) {
      failures.push({ path, url, error: err instanceof Error ? err.message : String(err) });
    }
    if (staggerMs > 0) await new Promise((r) => setTimeout(r, staggerMs)); // keep browser tab order
  }
  return failures;
}

export function printChecklist(pages) {
  console.log("Check each page against the live-verify evidence (qa/evidence/live-*/summary.md):\n");
  for (const [path, expect] of pages) console.log(`  ${path.padEnd(14)} ${expect}`);
  console.log(`A page is only PASS if its numbers reconcile with that summary.md.
A blank panel whose collection is genuinely empty is a MISSING feature, not a bug —
a blank panel whose collection has documents is a real FAIL.`);
}

const opener = platform === "win32" ? ["cmd", ["/c", "start", ""]] : platform === "darwin" ? ["open", []] : ["xdg-open", []];

const RUNNING_AS_CLI = process.argv[1] &&
  (await import("node:url")).pathToFileURL(process.argv[1]).href === import.meta.url;

if (RUNNING_AS_CLI) {
  const webUp = await isUp(WEB);
  const apiUp = await isUp(`${API}/sessions`); // 401 without a key is still "up"

  if (!webUp || !apiUp) {
    console.error(`Not running: ${!apiUp ? `api (${API}) ` : ""}${!webUp ? `web (${WEB})` : ""}\n`);
    console.error("Start them in two terminals, then re-run:");
    console.error("  pnpm demo:up                       (both, foreground)");
    console.error("  — or, in two terminals —");
    console.error("  cd apps/api && PORT=3300 CORS_ORIGINS=http://localhost:5173 pnpm dev");
    console.error("  cd apps/web && pnpm dev");
    process.exit(1);
  }

  console.log(`Opening ${PAGES.length} pages in your default browser…\n`);
  const failures = await openPages(PAGES, WEB);
  if (failures.length > 0) {
    for (const f of failures) {
      console.error(`FAILED to open ${f.url}: ${f.error}`);
    }
    console.error(`\n${failures.length} of ${PAGES.length} page(s) failed to open in the browser. Fix the opener error above and re-run.`);
    process.exit(1);
  }
  printChecklist(PAGES);
}
