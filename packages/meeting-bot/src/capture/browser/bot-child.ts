/**
 * packages/meeting-bot/src/capture/browser/bot-child.ts — the bot child process of obs-windows.ts: spawn
 * py/sb_join.py, turn its stdout/stderr into events, and wait for the startup handshake ("opened")
 * under the ISS-324 stall/cap budget. Extracted verbatim from obs-windows.ts `launch()` (gate
 * qa/gates/obs-windows-loc-split.md, option (a)) so that file returns under its C1 LOC budget.
 * OBS scene/record concerns stay in obs-windows.ts.
 */
import { spawn, type ChildProcess } from "node:child_process";
import { createInterface } from "node:readline";

export interface BotEvent {
  event: string;
  t: number;
  [k: string]: unknown;
}

/** The slice of `ObsBrowserConfig` the child handshake reads. */
export interface BotChildConfig {
  python: string;
  /** Called for every JSON line sb_join.py prints. */
  onEvent?: (handle: string, ev: BotEvent) => void;
  /** ISS-324: give up only after the child has been SILENT this long (default 90s). Not a total
   * budget — sb_join.py ticks "bootstrapping" every 10s while SB() brings the browser up. */
  openStallMs?: number;
  /** ISS-324: absolute ceiling on reaching "opened", however chatty the child is (default 480s). */
  openCapMs?: number;
}

const sleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

/** Spawns the bot child and resolves once it reports "opened"; kills it and throws otherwise. */
export async function startBotChild(
  cfg: BotChildConfig,
  pyArgs: string[],
  handle: string,
  log: (msg: string) => void,
): Promise<{ child: ChildProcess; exited: Promise<number | null> }> {
  // ISS-324: PYTHONUNBUFFERED so the child's own diagnostics arrive line-by-line instead of
  // sitting in a block-buffered pipe until exit — where child.kill() below destroyed them.
  const child = spawn(cfg.python, pyArgs, {
    stdio: ["ignore", "pipe", "pipe"], windowsHide: false,
    env: { ...process.env, PYTHONUNBUFFERED: "1" },
  });
  const exited = new Promise<number | null>((r) => child.on("exit", (code) => r(code)));
  // ISS-324: a spawn failure emits "error" and NEVER "exit". Without this the race below fell
  // through to the timeout branch and blamed the page for a child that never ran at all.
  const spawnFailed = new Promise<Error>((r) => child.on("error", (e) => r(e)));

  // ISS-324: keep what the child actually said, so a failure can report it instead of guessing.
  const tail: string[] = [];
  const remember = (l: string): void => { tail.push(l); if (tail.length > 20) tail.shift(); };

  // ISS-324: any output is liveness; the last event names how far the bring-up actually got.
  let lastStage = "spawned";
  let lastProgressAt = Date.now();
  const progress = (stage: string): void => { lastStage = stage; lastProgressAt = Date.now(); };

  let opened: (() => void) | undefined;
  const openedP = new Promise<void>((r) => (opened = r));
  createInterface({ input: child.stdout! }).on("line", (line) => {
    remember(line);
    let ev: BotEvent;
    try {
      ev = JSON.parse(line) as BotEvent;
    } catch {
      progress("stdout");
      log(`sb_join: ${line}`);
      return;
    }
    progress(ev.event); // starting → bootstrapping… → driver-ready → navigating → opened
    if (ev.event === "opened") opened?.();
    if (ev.event !== "heartbeat") log(`${ev.event} ${JSON.stringify({ ...ev, event: undefined, t: undefined })}`);
    cfg.onEvent?.(handle, ev);
  });
  createInterface({ input: child.stderr! }).on("line", (l) => {
    if (!l.trim()) return;
    remember(`stderr: ${l}`);
    progress("stderr");
    log(`sb_join stderr: ${l}`);
  });

  // ISS-324 root cause: the old fixed 120 s budget covered the ENTIRE opaque SB() browser
  // bring-up (chromedriver fetch/patch + large signed-in profile load), which emits nothing —
  // so a slow cold start was reported as "did not open the page", naming a page never reached.
  // The budget now resets on every progress event and fires only when progress itself stalls.
  const stallMs = cfg.openStallMs ?? 90_000;
  const capMs = cfg.openCapMs ?? 480_000;
  const startedAt = Date.now();
  let settled = false;
  const stalled = (async () => {
    const poll = Math.max(25, Math.min(1000, Math.floor(stallMs / 4)));
    for (;;) {
      await sleep(poll);
      if (settled) return "opened" as const; // race already decided; stop polling
      if (Date.now() - lastProgressAt >= stallMs) return "stalled" as const;
      if (Date.now() - startedAt >= capMs) return "cap" as const;
    }
  })();

  const outcome = await Promise.race([
    openedP.then(() => "opened" as const),
    exited.then(() => "exited" as const),
    spawnFailed.then((e) => e),
    stalled,
  ]);
  settled = true;
  if (outcome !== "opened") {
    child.kill();
    const said = tail.length ? ` last output: ${tail.slice(-5).join(" | ")}` : " child produced NO output";
    if (outcome instanceof Error) {
      throw new Error(`bot browser failed to start: could not spawn '${cfg.python}' (${outcome.message}).${said}`);
    }
    const why = outcome === "exited" ? "child exited"
      : outcome === "cap" ? `no page within the ${Math.round(capMs / 1000)}s cap`
        : `no progress for ${Math.round(stallMs / 1000)}s`;
    throw new Error(`bot browser did not open the page (${why}; last stage: ${lastStage}).${said}`);
  }
  return { child, exited };
}
