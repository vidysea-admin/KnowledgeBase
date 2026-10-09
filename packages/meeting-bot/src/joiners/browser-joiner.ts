/**
 * packages/meeting-bot/src/joiners/browser-joiner.ts — T-024 C3. Browser-profile join joiner
 * (for platforms without native Vexa support — webex, zoho, cloudonair; see strategy.ts).
 *
 * `launch`/`stop` are injected as a Playwright-shaped interface
 * (`(url, opts) => Promise<{sessionHandle, mediaStream}>`) so this file never imports a browser
 * driver directly. As of T-024b (2026-09-24, D-027/D-028) the real implementation satisfying
 * that interface is `createObsBrowserDeps` in `../capture/obs-windows.ts`: it spawns
 * `py/sb_join.py` (a headed SeleniumBase-UC Chrome on a persistent profile) for the actual
 * join-page automation, then drives OBS over obs-websocket v5 (window_capture +
 * wasapi_process_output_capture matched by window title) for per-process audio/video capture —
 * not an in-browser audio track, which is why `mediaStream` isn't a literal browser MediaStream.
 * See `qa/contracts/meeting-bot-live-capture.md` (T-024b, DRAFT) for the criteria this now meets.
 * `vexa-joiner.ts` and `system-audio-joiner.ts` remain stubs; this file's own interface is
 * unchanged by T-024b — only what satisfies it changed.
 */
import type { Joiner, JoinOpts, JoinResult } from "../joiner.js";
import { spawn, execFile } from "node:child_process";
import { isAbsolute, join } from "node:path";

/** Playwright-shaped launcher, injected — never a direct `playwright` import in this file. */
export type BrowserLauncher = (url: string, opts: JoinOpts) => Promise<JoinResult>;
/** Injected stop hook — closes whatever the launcher opened for `sessionHandle`. */
export type BrowserStopper = (sessionHandle: string) => Promise<void>;

export interface BrowserJoinerDeps {
  launch: BrowserLauncher;
  stop?: BrowserStopper;
}

export function createBrowserJoiner(deps: BrowserJoinerDeps): Joiner {
  return {
    name: "browser",

    async join(url: string, opts: JoinOpts): Promise<JoinResult> {
      return deps.launch(url, opts);
    },

    async stop(sessionHandle: string): Promise<void> {
      if (deps.stop) await deps.stop(sessionHandle);
    },
  };
}

export interface RegistrationInput {
  url: string;
  allowedHosts: string[];
  operator: { firstName: string; lastName: string; email: string; organization?: string };
  form: { mode: "native-html"; formSelector: string; submitSelector: string; fields: {
    firstName: string; lastName: string; email: string; organization?: string;
  } };
  /** Test-only opt-in; production requires HTTPS. */
  localFixture?: boolean;
}
export interface RegistrationResult {
  status: "submitted" | "uncertain" | "action_required";
  reason: string;
}
export interface RegistrationBrowserConfig {
  python: string; joinScript: string; profileDir: string;
  browserExecutable?: string;
  timeoutMs?: number;
  execute?: (args: string[], input: string, timeoutMs: number) => Promise<RegistrationResult>;
}

export function createBrowserRegistrationExecutor(env: NodeJS.ProcessEnv, root: string) {
  return {
    registrationConfig: () => {
      if (!env.LKB_WEBINAR_REGISTRATION_CONFIG) return undefined;
      try { return JSON.parse(env.LKB_WEBINAR_REGISTRATION_CONFIG); } catch { throw new Error("Invalid explicit registration configuration"); }
    },
    registerWebinar: async (input: RegistrationInput, config: RegistrationBrowserConfig | undefined): Promise<RegistrationResult> => {
      if (!config?.python || !config.profileDir) return {status: "action_required", reason: "missing-profile"};
      return registerInBrowser(input, {python: config.python, profileDir: config.profileDir,
        joinScript: join(root, "packages/meeting-bot/py/sb_join.py"), browserExecutable: config.browserExecutable, timeoutMs: config.timeoutMs});
    },
  };
}

/** Exact operator values and exact form selectors; never infer identity or consent. */
export async function registerInBrowser(input: RegistrationInput,
  cfg: RegistrationBrowserConfig): Promise<RegistrationResult> {
  const bounded = (v: unknown, max: number) => typeof v === "string" && v.trim().length > 0
    && v.length <= max && !/[\x00-\x1f\x7f]/.test(v);
  const url = new URL(input.url);
  if (url.username || url.password || url.hash || !Array.isArray(input.allowedHosts)
    || input.allowedHosts.length < 1 || input.allowedHosts.length > 20
    || input.allowedHosts.some(h => !bounded(h, 253) || !/^[a-z0-9.-]+$/.test(h))
    || !input.allowedHosts.includes(url.hostname)
    || !(url.protocol === "https:" || (input.localFixture === true && url.protocol === "http:"
      && ["127.0.0.1", "localhost"].includes(url.hostname)))) throw new Error("Registration URL refused");
  const keys = ["firstName", "lastName", "email", "organization"] as const;
  const operator = input.operator; const form = input.form;
  if (!operator || !form || form.mode !== "native-html" || !form.fields || !bounded(form.formSelector, 256)
    || !bounded(form.submitSelector, 256) || Object.keys(operator).some(k => !keys.includes(k as typeof keys[number]))
    || Object.keys(form.fields).some(k => !keys.includes(k as typeof keys[number]))
    || keys.some(k => k === "organization" && operator[k] === undefined && form.fields[k] === undefined
      ? false : !bounded(operator[k], 256) || !bounded(form.fields[k], 256))
    || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(operator.email)
    || new Set(Object.values(form.fields)).size !== Object.values(form.fields).length)
    throw new Error("Registration operator or form refused");
  const timeoutMs = cfg.timeoutMs ?? 120_000;
  if (![cfg.python, cfg.joinScript, cfg.profileDir].every(isAbsolute)
    || !Number.isInteger(timeoutMs) || timeoutMs < 1000 || timeoutMs > 300_000)
    throw new Error("Registration browser configuration refused");
  const args = [cfg.joinScript, "about:blank", "--profile", cfg.profileDir, "--title", "LKB registration",
    "--stop-file", `${cfg.profileDir}/registration-stop`, "--registration-stdin"];
  if (cfg.browserExecutable) args.push("--browser-executable", cfg.browserExecutable);
  const execute = cfg.execute ?? ((argv, payload, budget) => new Promise<RegistrationResult>(resolve => {
    const child = spawn(cfg.python, argv, { stdio: ["pipe", "pipe", "pipe"], windowsHide: true });
    let output = ""; let finished = false; let aborting = false; let closed = false;
    const finish = (result: RegistrationResult) => {
      if (finished) return; finished = true; clearTimeout(timer); resolve(result);
    };
    const abort = async (reason: string) => {
      if (finished || aborting) return; aborting = true;
      const stopped = await new Promise<boolean>(done => {
        if (closed) return done(true);
        const deadline = setTimeout(() => done(false), 5_000);
        child.once("close", () => {clearTimeout(deadline); done(true);});
        child.kill();
      });
      execFile(cfg.python, [cfg.joinScript, "about:blank", "--profile", cfg.profileDir,
        "--title", "LKB registration", "--stop-file", `${cfg.profileDir}/registration-stop`, "--cleanup-only"],
      {timeout: 20_000, windowsHide: true, maxBuffer: 65_536}, error =>
        finish({status: "uncertain", reason: error || !stopped ? "owned_cleanup_failed" : reason}));
    };
    const timer = setTimeout(() => abort("browser_timeout"), budget);
    child.on("error", () => abort("browser_failure"));
    child.stdin.on("error", () => abort("browser_failure"));
    child.stdout.on("data", chunk => {
      if (finished || aborting) return;
      output += chunk.toString();
      if (output.length > 65_536) abort("output_limit");
    });
    child.stderr.resume(); // Never propagate browser diagnostics containing private URLs or values.
    child.on("close", () => {
      closed = true;
      if (aborting) return;
      for (const line of output.split(/\r?\n/).reverse()) {
        try {
          const ev = JSON.parse(line);
          if (ev.event === "registration-result" && ["submitted", "uncertain", "action_required"].includes(ev.status)
            && typeof ev.reason === "string" && /^[a-z_]{1,64}$/.test(ev.reason)) return finish({status: ev.status, reason: ev.reason});
        } catch { /* ordinary browser progress */ }
      }
      finish({ status: "uncertain", reason: "missing_result" });
    });
    child.stdin.end(payload);
  }));
  return execute(args, JSON.stringify(input), timeoutMs);
}
