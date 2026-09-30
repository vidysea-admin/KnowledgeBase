/** Portable Chromium tab audio/video adapter. Chrome 116+ offscreen tabCapture, not OS audio.
 * Incoming chunks are capped, ordered, fsynced and acknowledged before the next is sent.
 * A controller crash leaves a recoverable WebM and status file; the extension fails closed
 * when its loopback receiver disappears. OBS remains a separate fallback adapter. */
import { spawn, type ChildProcess } from "node:child_process";
import { randomBytes, createHash, timingSafeEqual } from "node:crypto";
import { createServer, type IncomingMessage } from "node:http";
import { closeSync, copyFileSync, existsSync, lstatSync, fsyncSync, mkdirSync, openSync, readFileSync, rmSync, writeFileSync, writeSync } from "node:fs";
import path from "node:path";
import type { BrowserJoinerDeps } from "../joiners/browser-joiner.js";
import { getProcessStartTime } from "./controller-state.js";
import type { BotEvent } from "./obs-windows.js";

const MAX_CHUNK = 8 * 1024 * 1024;
const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

export interface TabBrowserConfig {
  sessionId?: string;
  tenantId?: string;
  python: string;
  joinScript: string;
  profileDir: string;
  recordDir: string;
  extensionDir?: string;
  browserExecutable?: string;
  autoClick?: boolean;
  startupTimeoutMs?: number;
  onEvent?: (handle: string, event: BotEvent) => void;
  log?: (message: string) => void;
}

/** Narrow loopback receiver; exposed to exercise real HTTP authentication/durability in tests. */
export async function createTabCaptureReceiver(output: string, onEvent: (event: BotEvent) => void) {
  const token = randomBytes(32).toString("hex");
  const fd = openSync(output, "wx");
  let nextSequence = 0, previousHash = "", busy = false, stopping = false, closed = false;
  let bytes = 0;
  async function body(req: IncomingMessage, cap: number): Promise<Buffer> {
    const chunks: Buffer[] = []; let size = 0;
    for await (const chunk of req) {
      size += chunk.length;
      if (size > cap) throw new Error("request too large");
      chunks.push(Buffer.from(chunk));
    }
    return Buffer.concat(chunks);
  }
  const server = createServer(async (req, res) => {
    const supplied = req.headers.authorization?.replace(/^Bearer /, "") ?? "";
    const suppliedBytes = Buffer.from(supplied), expectedBytes = Buffer.from(token);
    const origin = req.headers.origin ?? "";
    if (!/^chrome-extension:\/\/[a-p]{32}$/.test(origin) || suppliedBytes.length !== expectedBytes.length ||
      !timingSafeEqual(suppliedBytes, expectedBytes)) { res.writeHead(403).end(); return; }
    const route = new URL(req.url ?? "/", "http://127.0.0.1");
    if ((req.method === "GET" || req.method === "POST") && route.pathname === "/control") {
      if (req.method === "POST") {
        try { JSON.parse((await body(req, 1024)).toString("utf8")); }
        catch { res.writeHead(400).end(); return; }
      }
      res.setHeader("Content-Type", "application/json"); res.end(JSON.stringify({stop: stopping})); return;
    }
    if (req.method !== "POST" || !["/chunk", "/event"].includes(route.pathname)) { res.writeHead(404).end(); return; }
    const chunkRequest = route.pathname === "/chunk";
    if (chunkRequest && busy) { res.writeHead(409).end(); return; }
    if (chunkRequest) busy = true;
    try {
      const data = await body(req, chunkRequest ? MAX_CHUNK : 8192);
      if (chunkRequest) {
        const rawSeq = route.searchParams.get("seq") ?? "";
        if (!/^\d+$/.test(rawSeq) || !data.length) { res.writeHead(400).end(); return; }
        const seq = Number(rawSeq), hash = createHash("sha256").update(data).digest("hex");
        if (seq === nextSequence - 1 && hash === previousHash) { res.end("ok"); return; }
        if (seq !== nextSequence) { res.writeHead(409).end(); return; }
        let offset = 0;
        while (offset < data.length) offset += writeSync(fd, data, offset, data.length - offset);
        fsyncSync(fd); bytes += data.length; previousHash = hash; nextSequence++;
      } else {
        const event = JSON.parse(data.toString("utf8")) as BotEvent;
        event.t = Date.now() / 1000;
        if (!["capture-started", "capture-stopped", "capture-error", "capture-level"].includes(event.event)) {
          res.writeHead(400).end(); return;
        }
        onEvent(event);
      }
      res.end("ok");
    } catch (error) {
      if (!res.destroyed) res.writeHead(400).end();
      onEvent({event: "capture-error", t: Date.now() / 1000, error: error instanceof Error ? error.message : "Receiver failed"});
    } finally { if (chunkRequest) busy = false; }
  });
  server.requestTimeout = 15000;
  server.headersTimeout = 10000;
  try {
    await new Promise<void>((resolve, reject) => {
      server.once("error", reject); server.listen(0, "127.0.0.1", resolve);
    });
  } catch (error) { closeSync(fd); throw error; }
  const port = (server.address() as {port: number}).port;
  return {
    endpoint: `http://127.0.0.1:${port}`, token,
    stop: () => { stopping = true; }, bytes: () => bytes,
    close: async () => {
      if (closed) return; closed = true;
      server.closeIdleConnections();
      await new Promise<void>((resolve) => server.close(() => resolve()));
      fsyncSync(fd); closeSync(fd);
    },
  };
}

export function createTabBrowserDeps(cfg: TabBrowserConfig) {
  const log = cfg.log ?? ((message: string) => console.log(`[tab-bot] ${message}`));
  const levels = new Set<(db: number) => void>();
  const runs = new Map<string, {child: ChildProcess; exited: Promise<number | null>; output: string;
    receiver: Awaited<ReturnType<typeof createTabCaptureReceiver>>; stopFile: string;
    reloadFile: string; lock: string; done: boolean; failure?: string; stopped?: boolean}>();
  let active = false;
  const deps: BrowserJoinerDeps = {
    async launch(url) {
      if (active) throw new Error("A tab capture is already active; overlapping webinar requires review");
      active = true;
      const handle = `tab-${Date.now()}-${randomBytes(4).toString("hex")}`;
      mkdirSync(cfg.recordDir, {recursive: true}); mkdirSync(cfg.profileDir, {recursive: true});
      const lock = path.join(cfg.profileDir, ".lkb-tab-capture.lock");
      const recoveryLock = path.join(cfg.profileDir, ".lkb-recovery.lock");
      let locked = false;
      let receiver: Awaited<ReturnType<typeof createTabCaptureReceiver>> | undefined;
      const extension = path.join(cfg.recordDir, `.extension-${handle}`);
      const output = path.join(cfg.recordDir, `${handle}.webm`);
      const statusPath = `${output}.status.json`;
      const controllerStartedAt = getProcessStartTime(process.pid);
      let captureStartedAt: string | undefined;
      const status = (state: string, error?: string) => writeFileSync(statusPath,
        JSON.stringify({state, output, pid: process.pid, handle, sessionId: cfg.sessionId, tenantId: cfg.tenantId, profileDir: path.resolve(cfg.profileDir), recordDir: path.resolve(cfg.recordDir), controllerStartedAt, captureStartedAt, updatedAt: new Date().toISOString(), error}) + "\n");
      try {
        if (existsSync(recoveryLock)) throw new Error("Profile recovery active or requires inspection");
        if (existsSync(lock)) {
          if (lstatSync(lock).isSymbolicLink()) throw new Error("Capture lock symlink refused");
          const previousPid = Number(readFileSync(lock, "utf8"));
          if (!Number.isInteger(previousPid) || previousPid <= 0) throw new Error("Invalid capture lock; inspect before retrying");
          let alive = true;
          try { process.kill(previousPid, 0); } catch (error) { if ((error as NodeJS.ErrnoException).code === "ESRCH") alive = false; }
          if (alive) throw new Error("Persistent browser profile already has an active capture controller");
          if (readFileSync(lock, "utf8") !== String(previousPid)) throw new Error("Capture lock changed during stale inspection");
          rmSync(lock);
        }
        const lockFd = openSync(lock, "wx"); writeSync(lockFd, String(process.pid)); closeSync(lockFd); locked = true;
        if (existsSync(recoveryLock)) throw new Error("Profile recovery claimed during capture startup");
        let ready = false, failure: string | undefined;
        receiver = await createTabCaptureReceiver(output, (event) => {
          if (event.event === "capture-started") { ready = true; captureStartedAt = new Date().toISOString(); status("recording"); }
          if (event.event === "capture-error") { failure = String(event.error ?? "Capture failed"); status("failed", failure); }
          const run = runs.get(handle);
          if (run && event.event === "capture-stopped") run.stopped = true;
          if (run && failure) run.failure = failure;
          if (event.event === "capture-level" && typeof event.db === "number" && Number.isFinite(event.db)) {
            for (const listener of levels) listener(event.db);
          }
          cfg.onEvent?.(handle, event);
        });
        mkdirSync(extension);
        const assets = cfg.extensionDir ?? path.resolve(path.dirname(cfg.joinScript), "tab-capture");
        for (const file of ["manifest.json", "background.js", "recorder.html", "recorder.js"]) copyFileSync(path.join(assets, file), path.join(extension, file));
        writeFileSync(path.join(extension, "config.json"), JSON.stringify({endpoint: receiver.endpoint, token: receiver.token}), {mode: 0o600});
        const stopFile = path.join(cfg.recordDir, `.stop-${handle}`), reloadFile = path.join(cfg.recordDir, `.reload-${handle}`);
        const args = [cfg.joinScript, url, "--profile", cfg.profileDir, "--title", `LKB-BOT ${handle}`,
          "--stop-file", stopFile, "--reload-file", reloadFile, "--capture-extension", extension];
        if (cfg.browserExecutable) args.push("--browser-executable", cfg.browserExecutable);
        if (cfg.autoClick === false) args.push("--no-click");
        const child = spawn(cfg.python, args, {stdio: ["ignore", "pipe", "pipe"], windowsHide: true});
        let done = false;
        const exited = new Promise<number | null>((resolve) => {
          child.once("exit", (code) => { done = true; const run = runs.get(handle); if (run) run.done = true; resolve(code); });
          child.once("error", (error) => { done = true; failure = error.message; resolve(null); });
        });
        let pending = "";
        child.stdout?.on("data", (data: Buffer) => {
          pending += data.toString();
          if (pending.length > 65536) { failure = "Browser event line too large"; pending = ""; return; }
          const lines = pending.split("\n"); pending = lines.pop() ?? "";
          for (const line of lines) {
            try { const event = JSON.parse(line) as BotEvent; if (event.event === "fatal") failure = String(event.error); cfg.onEvent?.(handle, event); }
            catch { /* non-JSON Selenium diagnostics are not protocol events */ }
          }
        });
        child.stderr?.on("data", () => {}); // drain without exposing invite tokens or browser credentials
        runs.set(handle, {child, exited, output, receiver, stopFile, reloadFile, lock, done: false});
        status("starting");
        const deadline = Date.now() + (cfg.startupTimeoutMs ?? 180000);
        while (!ready && !failure && !done && Date.now() < deadline) await sleep(250);
        if (!ready || failure || done) throw new Error(failure ?? "Tab recorder did not start; check managed Chrome, extension action and owned browser endpoint");
        log(`audio/video recording started: ${output}`);
        return {sessionHandle: handle, mediaStream: output};
      } catch (error) {
        status("failed", error instanceof Error ? error.message : "Capture startup failed");
        const run = runs.get(handle);
        if (run) { writeFileSync(run.stopFile, "stop"); await Promise.race([run.exited, sleep(5000)]); if (!run.done) run.child.kill(); }
        await receiver?.close(); if (locked && existsSync(lock) && !lstatSync(lock).isSymbolicLink() && readFileSync(lock, "utf8") === String(process.pid)) rmSync(lock);
        rmSync(extension, {recursive: true, force: true}); active = false; throw error;
      }
    },
    async stop(handle) {
      const run = runs.get(handle); if (!run) return;
      run.receiver.stop();
      const deadline = Date.now() + 20000;
      while (!run.stopped && !run.done && Date.now() < deadline) await sleep(100);
      if (!run.stopped) run.failure ??= "Recorder did not acknowledge final flush; media requires recovery";
      writeFileSync(run.stopFile, "stop");
      await Promise.race([run.exited, sleep(5000)]); if (!run.done) run.child.kill();
      await run.receiver.close();
      if (existsSync(run.lock) && !lstatSync(run.lock).isSymbolicLink() && readFileSync(run.lock, "utf8") === String(process.pid)) rmSync(run.lock);
      rmSync(run.stopFile, {force: true}); rmSync(run.reloadFile, {force: true});
      rmSync(path.join(cfg.recordDir, `.extension-${handle}`), {recursive: true, force: true});
      writeFileSync(`${run.output}.status.json`, JSON.stringify({...JSON.parse(readFileSync(`${run.output}.status.json`, "utf8")), state: run.failure ? "failed" : "stopped", output: run.output, error: run.failure, bytes: run.receiver.bytes(), updatedAt: new Date().toISOString()}) + "\n");
      active = false;
      if (run.failure || !run.receiver.bytes()) throw new Error(run.failure ?? "Tab capture produced no media bytes");
    },
  };
  return {
    deps, outputPath: (handle: string) => runs.get(handle)?.output,
    browserExited: (handle: string) => runs.get(handle)?.exited,
    triggerReload: (handle: string) => { const run = runs.get(handle); if (run) writeFileSync(run.reloadFile, "reload"); },
    subscribeLevel: (listener: (db: number) => void) => { levels.add(listener); return () => { levels.delete(listener); }; },
    disconnect: async () => { for (const [handle, run] of runs) if (!run.stopped && !run.done) await deps.stop?.(handle); },
  };
}
