/** Real Chrome adapter for assisted recording: a plain Chrome started with ONLY --remote-debugging-port
 * and its own user-data-dir (Chrome refuses the port on the default profile). No automation flags, no
 * stealth, no UA changes. Read-only page inspection plus an in-page MediaRecorder on the <video>
 * element; it never dispatches input events. */
import { spawn } from "node:child_process";
import { existsSync } from "node:fs";
import type { AssistedPage, AssistedMediaState } from "./assisted-record.js";

const CHROME_CANDIDATES = ["C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe", "C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe"];
const STATE_JS = `(()=>{const v=document.querySelector('video');return v?{hasVideo:true,paused:v.paused,ended:v.ended,currentTime:v.currentTime,duration:v.duration,readyState:v.readyState}:{hasVideo:false,paused:true,ended:false,currentTime:0,duration:0,readyState:0}})()`;
const START_JS = `(()=>{const v=document.querySelector('video');if(!v||!v.captureStream)throw new Error('no capturable video');
const mr=new MediaRecorder(v.captureStream(),{mimeType:'video/webm;codecs=vp8,opus'});window.__lkbMr=mr;
mr.ondataavailable=async e=>{const u=new Uint8Array(await e.data.arrayBuffer());let s='';for(let i=0;i<u.length;i+=32768)s+=String.fromCharCode.apply(null,u.subarray(i,i+32768));window.lkbChunk(btoa(s));};
mr.onstop=()=>setTimeout(()=>window.lkbChunk('END'),500);mr.start(1000);return true})()`;
const STOP_JS = `(()=>{const m=window.__lkbMr;if(m&&m.state!=='inactive')m.stop();else window.lkbChunk('END');return true})()`;
const GONE: AssistedMediaState = { hasVideo: false, paused: true, ended: false, currentTime: 0, duration: 0, readyState: 0 };

export async function connectAssistedChrome(url: string, o: { port: number; userDataDir: string; executable?: string }): Promise<AssistedPage> {
  const base = `http://127.0.0.1:${o.port}`;
  const list = async (): Promise<Array<{ url: string; type: string; webSocketDebuggerUrl?: string }>> => {
    try { return await (await fetch(`${base}/json/list`)).json() as never; } catch { return []; }
  };
  const key = (u: string) => { try { const x = new URL(u); return x.host + (x.searchParams.get("v") ?? x.pathname); } catch { return u; } };
  const find = async () => (await list()).find((t) => t.type === "page" && key(t.url) === key(url));
  let tab = await find();
  if (!tab && !(await list()).length) {
    const exe = o.executable ?? CHROME_CANDIDATES.find(existsSync);
    if (!exe) throw new Error("Chrome not found; set LKB_BROWSER_EXECUTABLE");
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
  };
}
