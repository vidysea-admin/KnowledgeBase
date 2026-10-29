/** Real Chrome adapter for assisted recording: a plain Chrome started with ONLY --remote-debugging-port
 * and its own user-data-dir (Chrome refuses the port on the default profile). No automation flags, no
 * stealth, no UA changes. Read-only page inspection plus an in-page MediaRecorder on the <video>
 * element; it never dispatches input events. */
import { spawn } from "node:child_process";
import { existsSync, readdirSync, rmSync } from "node:fs";
import path from "node:path";
import type { AssistedPage, AssistedMediaState } from "./assisted-record.js";

const CHROME_CANDIDATES = ["C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe", "C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe"];
const LINUX_CHROME_CANDIDATES = ["/usr/bin/google-chrome", "/usr/bin/google-chrome-stable", "/usr/bin/chromium", "/usr/bin/chromium-browser"];
const CHROME_HELP = "Chrome not found; set LKB_BROWSER_EXECUTABLE to a Chrome binary";

/** Chrome for --assisted. An explicit executable wins ("cft" means the SeleniumBase managed Chrome for Testing build, found beside
 * LKB_PYTHON's venv on Linux); otherwise Windows Chrome paths, or on Linux the managed build then system Chrome/Chromium. Refuses with a clear message. */
export function resolveAssistedChrome(o: { platform?: NodeJS.Platform; executable?: string; env?: NodeJS.ProcessEnv;
  exists?: (file: string) => boolean; listDir?: (dir: string) => string[] }): string {
  const platform = o.platform ?? process.platform, env = o.env ?? process.env, exists = o.exists ?? existsSync;
  const listDir = o.listDir ?? ((dir: string) => { try { return readdirSync(dir); } catch { return []; } });
  const managed = (): string | undefined => {
    if (!env.LKB_PYTHON) return undefined;
    const lib = path.posix.join(path.posix.dirname(path.posix.dirname(env.LKB_PYTHON.replaceAll("\\", "/"))), "lib");
    return listDir(lib).filter((d) => /^python3(?:\.\d+)?$/.test(d)).map((d) => path.posix.join(lib, d, "site-packages", "seleniumbase", "drivers", "cft_drivers", "chrome-linux64", "chrome")).find(exists);
  };
  if (o.executable && !(o.executable === "cft" && platform !== "win32")) return o.executable;
  if (platform === "win32") {
    const found = CHROME_CANDIDATES.find(exists);
    if (!found) throw new Error(CHROME_HELP);
    return found;
  }
  const found = managed() ?? (o.executable === "cft" ? undefined : LINUX_CHROME_CANDIDATES.find(exists));
  if (!found) throw new Error(o.executable === "cft" ? "LKB_BROWSER_EXECUTABLE=cft but the managed Chrome for Testing build was not found beside LKB_PYTHON; run setup. " + CHROME_HELP : CHROME_HELP);
  return found;
}
const STATE_JS = `(()=>{const v=document.querySelector('video');return v?{hasVideo:true,paused:v.paused,ended:v.ended,currentTime:v.currentTime,duration:v.duration,readyState:v.readyState}:{hasVideo:false,paused:true,ended:false,currentTime:0,duration:0,readyState:0}})()`;
const START_JS = `(()=>{const v=document.querySelector('video');if(!v||!v.captureStream)throw new Error('no capturable video');
const mr=new MediaRecorder(v.captureStream(),{mimeType:'video/webm;codecs=vp8,opus'});window.__lkbMr=mr;
mr.ondataavailable=async e=>{const u=new Uint8Array(await e.data.arrayBuffer());let s='';for(let i=0;i<u.length;i+=32768)s+=String.fromCharCode.apply(null,u.subarray(i,i+32768));window.lkbChunk(btoa(s));};
mr.onstop=()=>setTimeout(()=>window.lkbChunk('END'),500);mr.start(1000);return true})()`;
const STOP_JS = `(()=>{const m=window.__lkbMr;if(m&&m.state!=='inactive')m.stop();else window.lkbChunk('END');return true})()`;
const GONE: AssistedMediaState = { hasVideo: false, paused: true, ended: false, currentTime: 0, duration: 0, readyState: 0 };

export async function connectAssistedChrome(url: string, o: { port: number; userDataDir: string; executable?: string; keepBrowser?: boolean }): Promise<AssistedPage> {
  const base = `http://127.0.0.1:${o.port}`;
  const list = async (): Promise<Array<{ url: string; type: string; webSocketDebuggerUrl?: string }>> => {
    try { return await (await fetch(`${base}/json/list`)).json() as never; } catch { return []; }
  };
  const key = (u: string) => { try { const x = new URL(u); return x.host + (x.searchParams.get("v") ?? x.pathname); } catch { return u; } };
  const find = async () => (await list()).find((t) => t.type === "page" && key(t.url) === key(url));
  let tab = await find(), launched = false;
  if (!tab && !(await list()).length) {
    launched = true;
    const exe = resolveAssistedChrome({ executable: o.executable });
    spawn(exe, [`--remote-debugging-port=${o.port}`, `--user-data-dir=${o.userDataDir}`, url], { detached: true, stdio: "ignore" }).unref();
    for (let i = 0; i < 40 && !(await list()).length; i++) await new Promise((r) => setTimeout(r, 500));
  }
  for (let i = 0; i < 6 && !tab; i++) { tab = await find(); if (!tab) await new Promise((r) => setTimeout(r, 500)); } // a fresh profile may show its intro page instead of the URL argument
  if (!tab) { // open the URL in a new tab; the human still does everything inside the page
    await fetch(`${base}/json/new?${encodeURIComponent(url)}`, { method: "PUT" }).catch(() => {});
    for (let i = 0; i < 20 && !tab; i++) { await new Promise((r) => setTimeout(r, 500)); tab = await find(); }
  }
  if (!tab?.webSocketDebuggerUrl) throw new Error(`assisted: no Chrome tab matching ${url} on debug port ${o.port}`);
  const ws = new WebSocket(tab.webSocketDebuggerUrl);
  await new Promise<void>((res, rej) => { ws.onopen = () => res(); ws.onerror = () => rej(new Error("CDP connect failed")); });
  let id = 0, onChunk: ((b: Buffer) => void) | undefined, endWaiter: (() => void) | undefined, open = true;
  const pending = new Map<number, (m: any) => void>();
  ws.onclose = () => { open = false; for (const p of pending.values()) p({ error: { message: "closed" } }); endWaiter?.(); };
  ws.onmessage = (ev) => {
    const m = JSON.parse(String(ev.data));
    if (m.id && pending.has(m.id)) { pending.get(m.id)!(m); pending.delete(m.id); }
    else if (m.method === "Runtime.bindingCalled" && m.params?.name === "lkbChunk") {
      if (m.params.payload === "END") endWaiter?.(); else onChunk?.(Buffer.from(m.params.payload, "base64"));
    }
  };
  const send = (method: string, params: object = {}) => new Promise<any>((res, rej) => {
    if (!open) return rej(new Error("closed"));
    const n = ++id; pending.set(n, (m) => (m.error ? rej(new Error(m.error.message)) : res(m.result))); ws.send(JSON.stringify({ id: n, method, params }));
  });
  const evalJs = async (expression: string) => {
    const r = await send("Runtime.evaluate", { expression, returnByValue: true });
    if (r.exceptionDetails) throw new Error(r.exceptionDetails.exception?.description ?? "page error");
    return r.result.value;
  };
  await send("Runtime.enable");
  return {
    snapshot: async () => { try { return await evalJs(STATE_JS) as AssistedMediaState; } catch { return open ? GONE : null; } },
    async startRecording(cb) { onChunk = cb; await send("Runtime.addBinding", { name: "lkbChunk" }); await evalJs(START_JS); },
    async stopRecording() { const done = new Promise<void>((r) => { endWaiter = r; setTimeout(r, 10_000); }); await evalJs(STOP_JS).catch(() => {}); await done; },
    async close() { if (open) ws.close(); },
    async dispose() { // only a Chrome this run launched; a browser the human already had open is never touched
      if (!launched || o.keepBrowser) return;
      try {
        const v = await (await fetch(`${base}/json/version`)).json() as { webSocketDebuggerUrl: string };
        const b = new WebSocket(v.webSocketDebuggerUrl);
        await new Promise<void>((res) => { b.onopen = () => { b.send(JSON.stringify({ id: 1, method: "Browser.close" })); res(); }; b.onerror = () => res(); });
      } catch { /* already gone */ }
      for (let i = 0; i < 20 && (await list()).length; i++) await new Promise((r) => setTimeout(r, 250));
      rmSync(o.userDataDir, { recursive: true, force: true, maxRetries: 10, retryDelay: 300 });
    },
  };
}
