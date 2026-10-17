/** Portable Chromium tab audio/video adapter. Chrome 116+ offscreen tabCapture, not OS audio.
 * Incoming chunks are capped, ordered, fsynced and acknowledged before the next is sent.
 * A controller crash leaves a recoverable WebM and status file; the extension fails closed
 * when its loopback receiver disappears. OBS remains a separate fallback adapter. */
import { spawn, type ChildProcess } from "node:child_process";
import { randomBytes, randomUUID, createHash, timingSafeEqual } from "node:crypto";
import { createServer, type IncomingMessage } from "node:http";
import { closeSync, copyFileSync, existsSync, lstatSync, fsyncSync, mkdirSync, openSync, readFileSync, rmSync, writeFileSync, writeSync, statSync, renameSync } from "node:fs";
import path from "node:path";
import type { BrowserJoinerDeps } from "../joiners/browser-joiner.js";
import { getProcessStartTime } from "./controller-state.js";
import { browserProfileArgs } from "./browser/browser-profile.js";
import type { BotEvent } from "./obs/obs-windows.js";
import { assertInsideDir, assertSafeCaptureFileName, assertSafeCaptureId, type TabReceiverGuard } from "./tab-receiver-guard.js";
import {createSilenceHealth, silenceHealthEnabled} from "./tab-silence-health.js";
import {remuxRecoveryEnabled, remuxWebmInPlace} from "./tab-remux.js";
import {validateCaptureControlGaps, validateCaptureStatusIdentity, type GapWindow} from "./reconnect-gaps.js";
import {createNativeSpoolReceiver} from "./native-spool.js";
import type {ClosedNativeSpool, NativeCaptureIdentity} from "./native-media-types.js";

const MAX_CHUNK = 8 * 1024 * 1024;
const TAB_ASSETS = ["manifest.json", "background.js", "recorder.html", "recorder.js", "native-recorder.js", "native-video.js", "native-audio-worklet.js"];
/** Byte-bound installed producer inventory, including framing to avoid concatenation ambiguity. */
export function tabCaptureAssetSha256(directory: string) {
  const hash = createHash('sha256');
  for (const file of TAB_ASSETS) {
    const bytes = readFileSync(path.join(directory, file));
    hash.update(`${file}\0${bytes.length}\0`); hash.update(bytes);
  }
  return hash.digest('hex');
}
const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

/** All writes retain the exact private controller identity and verified managed tail. */
export function writeOwnedTabStatus(file: string, identity: Record<string, any>, changes: Record<string, any>) {
  validateCaptureStatusIdentity(identity, validateCaptureControlGaps(changes.controlGaps).length > 0);
  if (file !== `${identity.output}.status.json` || Object.keys(changes).some(key => key in identity)) throw new Error("Capture status identity override refused");
  for (let current=path.resolve(file); ; current=path.dirname(current)) {
    try { if (lstatSync(current).isSymbolicLink()) throw new Error("Capture status symlink refused"); }
    catch (error) { if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error; }
    if (path.dirname(current) === current) break;
  }
  let prior: Record<string, any> = {};
  if (existsSync(file)) {
    if (!statSync(file).isFile() || statSync(file).size > 8192) throw new Error("Capture status exceeds bounds");
    prior=JSON.parse(readFileSync(file,"utf8"));
    if (!prior || typeof prior !== "object" || Array.isArray(prior) || Object.entries(identity).some(([key,value])=>prior[key] !== value)) throw new Error("Capture status ownership changed");
  }
  const controlGaps=validateCaptureControlGaps([...validateCaptureControlGaps(prior.controlGaps),...validateCaptureControlGaps(changes.controlGaps)], "combined-control");
  validateCaptureStatusIdentity(identity, controlGaps.length > 0);
  const bytes=JSON.stringify({...prior,...identity,...changes,controlGaps,updatedAt:new Date().toISOString()})+"\n";
  if (Buffer.byteLength(bytes)>8192) throw new Error("Capture status exceeds bounds");
  const temporary=`${file}.${randomUUID()}.tmp`; let fd: number | undefined, created=false;
  try {
    fd=openSync(temporary,"wx",0o600); created=true; writeFileSync(fd,bytes); fsyncSync(fd); closeSync(fd); fd=undefined;
    renameSync(temporary,file);
  } finally {if(fd !== undefined)closeSync(fd);if(created && existsSync(temporary))rmSync(temporary);}
}

export interface TabBrowserConfig {
  /** Server composition only; explicit opt-in. No native qualification is implied. */
  native?: {identity: NativeCaptureIdentity; maxBytes: number; onClosed: (spool: ClosedNativeSpool, output: string) => Promise<void>};
  sessionId?: string;
  tenantId?: string;
  python: string;
  joinScript: string;
  profileDir: string;
  recordDir: string;
  extensionDir?: string;
  browserExecutable?: string;
  profileDirectory?: string;
  autoClick?: boolean;
  /** T-034 hardening (id/filename validation + size caps). Undefined = unchanged behaviour. */
  guard?: TabReceiverGuard;
  startupTimeoutMs?: number;
  onEvent?: (handle: string, event: BotEvent) => void;
  log?: (message: string) => void;
}

/** Narrow loopback receiver; exposed to exercise real HTTP authentication/durability in tests. */
export async function createTabCaptureReceiver(output: string, onEvent: (event: BotEvent) => void, guard?: TabReceiverGuard, native?: TabBrowserConfig['native']) {
  const chunkCap = guard ? Math.min(MAX_CHUNK, guard.maxChunkBytes) : MAX_CHUNK;
  const token = randomBytes(32).toString("hex");
  const fd = native ? undefined : openSync(output, "wx");
  const spool = native ? await createNativeSpoolReceiver({directory: `${output}.native`, identity: native.identity,
    width: 1280, height: 720, sampleRate: 48000, maxBytes: native.maxBytes, maxChunkBytes: MAX_CHUNK, maxPendingBytes: 16 * 1024 * 1024}) : undefined;
  let transportSequence = 0, persistedSequence = 0, nativeClosed = false, nativePoisoned = false;
  let lastTransportHash = '';
  const serverClockId = randomUUID();
  const bracket = () => { const beforeMonotonicUs = Number(process.hrtime.bigint() / 1000n), epochUs = Date.now() * 1000;
    return {clockInstanceId: serverClockId, beforeMonotonicUs, epochUs, afterMonotonicUs: Number(process.hrtime.bigint() / 1000n)}; };
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
    if (req.method === 'POST' && route.pathname === '/native-clock' && spool) {
      const serverRequest = bracket();
      try { await body(req, 1024); res.setHeader('Content-Type', 'application/json'); res.end(JSON.stringify({serverRequest, serverResponse: bracket()})); }
      catch { res.writeHead(400).end(); } return;
    }
    if (req.method === 'POST' && route.pathname === '/native' && spool && native) {
      if (busy) { res.writeHead(409).end(); return; } busy = true;
      try {
        const data = await body(req, 12 * 1024 * 1024), hash = createHash('sha256').update(data).digest('hex');
        const message = JSON.parse(data.toString('utf8'));
        if (!message.identity || Object.keys(message.identity).length !== Object.keys(native.identity).length
          || Object.entries(native.identity).some(([key,value]) => message.identity[key] !== value)) throw new Error('Native capture identity mismatch');
        if (nativePoisoned) throw new Error('Native capture poisoned');
        if (message.sequence === transportSequence - 1 && hash === lastTransportHash) { res.end('ok'); return; }
        if (!Number.isSafeInteger(message.sequence) || message.sequence !== transportSequence || nativeClosed) throw new Error('Native sequence mismatch');
        if (message.op === 'observe-video') await spool.observeVideo(message.observation);
        else if (message.op === 'clock') await spool.appendClockPair({sequence: persistedSequence++, identity: native.identity, kind: message.kind, pair: message.pair});
        else if (message.op === 'video' || message.op === 'audio') {
          if (typeof message.bytes !== 'string' || !/^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/.test(message.bytes)) throw new Error('Invalid native bytes');
          const payload = {sequence: persistedSequence++, identity: native.identity, observation: message.observation, bytes: Buffer.from(message.bytes, 'base64')};
          if (message.op === 'video') await spool.appendVideo(payload); else await spool.appendAudio(payload);
          bytes += payload.bytes.length;
        } else if (message.op === 'close') {
          const closedSpool = await spool.close();
          if (nativePoisoned) throw new Error('Native generation failed while closing');
          await native.onClosed(closedSpool, output);
          if (!existsSync(output) || !statSync(output).isFile() || !statSync(output).size) throw new Error('Native finalizer produced no media');
          nativeClosed = true;
        } else throw new Error('Unknown native operation');
        transportSequence++; lastTransportHash = hash; res.end('ok');
      } catch (error) {
        nativePoisoned = true; await spool.poison('Native transport failed').catch(() => {});
        onEvent({event: 'capture-error', t: Date.now()/1000, error: 'Native capture receiver failed'});
        if (!res.destroyed) res.writeHead(400).end();
      } finally { busy = false; } return;
    }
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
      const data = await body(req, chunkRequest ? chunkCap : 8192);
      if (chunkRequest) {
        if (spool) throw new Error('Legacy chunks refused during native capture');
        const rawSeq = route.searchParams.get("seq") ?? "";
        if (!/^\d+$/.test(rawSeq) || !data.length) { res.writeHead(400).end(); return; }
        const seq = Number(rawSeq), hash = createHash("sha256").update(data).digest("hex");
        if (seq === nextSequence - 1 && hash === previousHash) { res.end("ok"); return; }
        if (seq !== nextSequence) { res.writeHead(409).end(); return; }
        if (guard && bytes + data.length > guard.maxTotalBytes) {
          res.writeHead(413).end();
          onEvent({event: "capture-error", t: Date.now() / 1000, error: "Capture total size cap exceeded"}); return;
        }
        let offset = 0;
        while (offset < data.length) offset += writeSync(fd!, data, offset, data.length - offset);
        fsyncSync(fd!); bytes += data.length; previousHash = hash; nextSequence++;
      } else {
        const event = JSON.parse(data.toString("utf8")) as BotEvent;
        event.t = Date.now() / 1000;
        if (!["capture-started", "capture-stopped", "capture-error", "capture-level"].includes(event.event)) {
          res.writeHead(400).end(); return;
        }
        if (spool && (event.event === 'capture-error' || (event.event === 'capture-stopped' && (event as {failed?:unknown}).failed !== false))) {
          nativePoisoned = true; await spool.poison('Recorder reported incomplete native capture');
        }
        onEvent(event);
      }
      res.end("ok");
    } catch (error) {
      if (!res.destroyed) res.writeHead(guard && error instanceof Error && error.message === "request too large" ? 413 : 400).end();
      onEvent({event: "capture-error", t: Date.now() / 1000, error: error instanceof Error ? error.message : "Receiver failed"});
    } finally { if (chunkRequest) busy = false; }
  });
  server.requestTimeout = 15000;
  server.headersTimeout = 10000;
  try {
    await new Promise<void>((resolve, reject) => {
      server.once("error", reject); server.listen(0, "127.0.0.1", resolve);
    });
  } catch (error) { if (fd !== undefined) closeSync(fd); await spool?.poison('Receiver startup failed'); throw error; }
  const port = (server.address() as {port: number}).port;
  return {
    endpoint: `http://127.0.0.1:${port}`, token,
    stop: () => { stopping = true; }, bytes: () => bytes,
    close: async () => {
      if (closed) return; closed = true;
      server.closeIdleConnections();
      await new Promise<void>((resolve) => server.close(() => resolve()));
      if (fd !== undefined) { fsyncSync(fd); closeSync(fd); }
      if (spool && !nativeClosed) await spool.poison('Receiver closed before complete native publication');
    },
  };
}

export function createTabBrowserDeps(cfg: TabBrowserConfig) {
  const profileArgs = browserProfileArgs(cfg.profileDir, cfg.profileDirectory);
  const log = cfg.log ?? ((message: string) => console.log(`[tab-bot] ${message}`));
  const levels = new Set<(db: number) => void>();
  const runs = new Map<string, {child: ChildProcess; exited: Promise<number | null>; output: string;
    receiver: Awaited<ReturnType<typeof createTabCaptureReceiver>>; stopFile: string;
    reloadFile: string; lock: string; done: boolean; failure?: string; recovered?: string; stopped?: boolean; controlGaps: GapWindow[]; identity: Record<string, any>}>();
  let active = false, nativeClaimed = false;
  const deps: BrowserJoinerDeps = {
    async launch(url) {
      if (cfg.guard) { assertSafeCaptureId("tenant id", cfg.tenantId); assertSafeCaptureId("session id", cfg.sessionId); }
      if (cfg.native && (cfg.native.identity.tenantId !== cfg.tenantId || cfg.native.identity.sessionId !== cfg.sessionId)) throw new Error('Native invocation ownership mismatch');
      if (active) throw new Error("A tab capture is already active; overlapping webinar requires review");
      if (cfg.native && nativeClaimed) throw new Error('Native capture generation already used; create a new server invocation');
      if (cfg.native) nativeClaimed = true;
      active = true;
      const handle = `tab-${Date.now()}-${randomBytes(4).toString("hex")}`;
      mkdirSync(cfg.recordDir, {recursive: true}); mkdirSync(cfg.profileDir, {recursive: true});
      const lock = path.join(cfg.profileDir, ".lkb-tab-capture.lock");
      const recoveryLock = path.join(cfg.profileDir, ".lkb-recovery.lock");
      let locked = false;
      let receiver: Awaited<ReturnType<typeof createTabCaptureReceiver>> | undefined;
      const extension = path.join(cfg.recordDir, `.extension-${handle}`);
      const output = path.join(cfg.recordDir, `${handle}.webm`);
      if (cfg.guard) { assertSafeCaptureFileName(path.basename(output)); assertInsideDir(cfg.recordDir, output); }
      const statusPath = `${output}.status.json`;
      const controllerStartedAt = getProcessStartTime(process.pid);
      let captureStartedAt: string | undefined;
      const identity={output,pid:process.pid,handle,sessionId:cfg.sessionId,tenantId:cfg.tenantId,profileDir:path.resolve(cfg.profileDir),recordDir:path.resolve(cfg.recordDir),controllerStartedAt};
      const status = (state: string, error?: string) => writeOwnedTabStatus(statusPath, identity,
        {state,captureStartedAt,error,controlGaps:runs.get(handle)?.controlGaps ?? []});
      const health = silenceHealthEnabled() ? createSilenceHealth({onChange: (h) => {
        log(`audio-health: ${h.note}`);
        try {writeOwnedTabStatus(statusPath, identity, {audioHealth: h});} catch {}
      }}) : undefined;
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
        let admittedSeen = false; // ISS-CAPTUREFIX-001: status says "recording" only once the bot is admitted (the recorder starts in the lobby)
        receiver = await createTabCaptureReceiver(output, (event) => {
          if (event.event === "capture-started") { ready = true; captureStartedAt = new Date().toISOString(); status(admittedSeen ? "recording" : "starting"); }
          if (event.event === "capture-error") { failure = String(event.error ?? "Capture failed"); status("failed", failure); }
          // A stop that is not failed:false is a failure by itself: the capture-error POST may have been lost.
          // The partial .webm stays on disk, status "failed" (never "stopped"); stop() throws so nothing finalizes it.
          // Fail closed (ISS-T034FIX-003): a stop is clean ONLY when failed is exactly boolean false. A missing or
          // non-boolean field (e.g. an old extension build) is a malformed stop and counts as a failure.
          const stopFailed = event.event === "capture-stopped" ? (event as {failed?: unknown}).failed : false;
          if (stopFailed !== false && !failure) {
            failure = stopFailed === true ? "Recorder reported a failed stop; media is incomplete"
              : "Malformed capture-stopped message (failed is not boolean false); media treated as incomplete";
            status("failed", failure);
          }
          const run = runs.get(handle);
          if (run && event.event === "capture-stopped") run.stopped = true;
          if (run && failure) run.failure = failure;
          if (event.event === "capture-level" && typeof event.db === "number" && Number.isFinite(event.db)) {
            for (const listener of levels) listener(event.db);
            health?.onLevel(event.db);
          }
          cfg.onEvent?.(handle, event);
        }, cfg.guard, cfg.native);
        mkdirSync(extension);
        const assets = cfg.extensionDir ?? path.resolve(path.dirname(cfg.joinScript), "tab-capture");
        for (const file of TAB_ASSETS) copyFileSync(path.join(assets, file), path.join(extension, file));
        if (cfg.native && tabCaptureAssetSha256(extension) !== cfg.native.identity.extensionAssetSha256) throw new Error('Native installed producer asset identity mismatch');
        writeFileSync(path.join(extension, "config.json"), JSON.stringify({endpoint: receiver.endpoint, token: receiver.token,
          ...(cfg.native ? {native: {identity: cfg.native.identity}} : {})}), {mode: 0o600});
        const stopFile = path.join(cfg.recordDir, `.stop-${handle}`), reloadFile = path.join(cfg.recordDir, `.reload-${handle}`);
        const args = [cfg.joinScript, url, "--profile", cfg.profileDir, "--title", `LKB-BOT ${handle}`,
          "--stop-file", stopFile, "--reload-file", reloadFile, "--capture-extension", extension];
        if (cfg.browserExecutable) args.push("--browser-executable", cfg.browserExecutable);
        args.push(...profileArgs);
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
            try { const event = JSON.parse(line) as BotEvent; if (event.event === "fatal") failure = String(event.error);
              if (event.event === "admitted") { admittedSeen = true; if (captureStartedAt && !failure && !runs.get(handle)?.stopped) status("recording"); }
              cfg.onEvent?.(handle, event); }
            catch { /* non-JSON Selenium diagnostics are not protocol events */ }
          }
        });
        child.stderr?.on("data", () => {}); // drain without exposing invite tokens or browser credentials
        runs.set(handle, {child, exited, output, receiver, stopFile, reloadFile, lock, done: false, controlGaps:[], identity});
        status("starting");
        const deadline = Date.now() + (cfg.startupTimeoutMs ?? 180000);
        while (!ready && !failure && !done && Date.now() < deadline) await sleep(250);
        if (!ready || failure || done) throw new Error(failure ?? "Tab recorder did not start; check managed Chrome, extension action and owned browser endpoint");
        log(`audio/video recording started: ${output}`);
        return {sessionHandle: handle, mediaStream: output};
      } catch (error) {
        // Status evidence can itself be corrupt or foreign. Its refusal must never
        // bypass shutdown of the child/receiver holding capture credentials.
        try { status("failed", error instanceof Error ? error.message : "Capture startup failed"); }
        catch { log("Capture failure status could not be persisted; ownership retained for inspection"); }
        const run = runs.get(handle);
        const cleanup = [
          async () => {
            if (!run) return;
            try { writeFileSync(run.stopFile, "stop"); await Promise.race([run.exited, sleep(5000)]); }
            finally { if (!run.done) run.child.kill(); }
          },
          async () => { await receiver?.close(); },
          async () => { if (locked && existsSync(lock) && !lstatSync(lock).isSymbolicLink() && readFileSync(lock, "utf8") === String(process.pid)) rmSync(lock); },
          async () => { rmSync(extension, {recursive: true, force: true}); },
        ];
        for (const action of cleanup) {
          try { await action(); } catch { log("Capture startup cleanup incomplete; inspection required"); }
        }
        active = false; throw error;
      }
    },
    async stop(handle) {
      const run = runs.get(handle); if (!run) return;
      let firstError: unknown, failed = false;
      const remember = (error: unknown) => {
        if (!failed) { firstError = error; failed = true; }
        run.failure ??= "Capture stop cleanup failed; media requires inspection";
        try { log("Capture stop cleanup incomplete; inspection required"); } catch { /* diagnostics must not skip shutdown */ }
      };
      const attempt = async (action: () => void | Promise<void>) => { try { await action(); } catch (error) { remember(error); } };
      try {
        run.receiver.stop();
        const deadline = Date.now() + 20000;
        while (!run.stopped && !run.done && Date.now() < deadline) await sleep(100);
        if (!run.stopped) run.failure ??= "Recorder did not acknowledge final flush; media requires recovery";
        writeFileSync(run.stopFile, "stop");
        await Promise.race([run.exited, sleep(5000)]);
      } catch (error) { remember(error); }
      finally {
        await attempt(async () => {
          if (!run.done) {
            if (!run.child.kill()) throw new Error("Owned capture child shutdown refused; lock retained");
            await Promise.race([run.exited, sleep(1000)]);
            if (!run.done) throw new Error("Owned capture child shutdown unconfirmed; lock retained");
          }
        });
        await attempt(() => run.receiver.close());
        if (!cfg.native && !failed && run.failure?.startsWith("Recorder did not acknowledge") && run.receiver.bytes() && remuxRecoveryEnabled()) {
          await attempt(() => {
            const r = remuxWebmInPlace(run.output);
            if (r.ok) { log("final flush not acknowledged; recovered media with ffmpeg -c copy (raw kept as .raw)"); run.failure = undefined; run.recovered = "final flush not acknowledged; media recovered by ffmpeg -c copy remux (tail after the last delivered chunk is lost)"; }
            else log(`remux recovery failed: ${r.error}`);
          });
        }
        await attempt(() => {
          if (!run.done) throw new Error("Owned capture child shutdown unconfirmed; lock retained");
          if (existsSync(run.lock) && !lstatSync(run.lock).isSymbolicLink() && readFileSync(run.lock, "utf8") === String(process.pid)) rmSync(run.lock);
        });
        await attempt(() => { rmSync(run.stopFile, {force: true}); });
        await attempt(() => { rmSync(run.reloadFile, {force: true}); });
        await attempt(() => { rmSync(path.join(cfg.recordDir, `.extension-${handle}`), {recursive: true, force: true}); });
        await attempt(() => writeOwnedTabStatus(`${run.output}.status.json`,run.identity,{state:run.failure ? "failed" : "stopped",error:run.failure ?? run.recovered,bytes:run.receiver.bytes(),controlGaps:run.controlGaps}));
        active = false;
      }
      if (failed) throw firstError;
      if (run.failure || !run.receiver.bytes()) throw new Error(run.failure ?? "Tab capture produced no media bytes");
    },
  };
  return {
    persistControlGap: (handle: string, gap: GapWindow) => {
      const run=runs.get(handle); if(!run || !run.identity.tenantId || !run.identity.sessionId || !run.identity.controllerStartedAt) throw new Error("Managed capture identity unavailable");
      run.controlGaps=validateCaptureControlGaps([...run.controlGaps,gap]);
      try {writeOwnedTabStatus(`${run.output}.status.json`,run.identity,{controlGaps:run.controlGaps});}
      catch(error){run.failure="Capture control evidence could not be persisted";throw error;}
    },
    deps, outputPath: (handle: string) => runs.get(handle)?.output,
    browserExited: (handle: string) => runs.get(handle)?.exited,
    triggerReload: (handle: string) => { const run = runs.get(handle); if (run) writeFileSync(run.reloadFile, "reload"); },
    subscribeLevel: (listener: (db: number) => void) => { levels.add(listener); return () => { levels.delete(listener); }; },
    disconnect: async () => { for (const [handle, run] of runs) if (!run.stopped && !run.done) await deps.stop?.(handle); },
  };
}
