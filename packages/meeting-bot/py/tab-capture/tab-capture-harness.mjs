// Test harness: evaluates the UNMODIFIED extension sources inside a vm context with fakes.
import vm from "node:vm";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";

export const DIR = path.dirname(fileURLToPath(import.meta.url));
export const flush = async (n = 25) => { for (let i = 0; i < n; i++) await new Promise((r) => setImmediate(r)); };
export const deferred = () => { let resolve, reject; const promise = new Promise((a, b) => { resolve = a; reject = b; }); return { promise, resolve, reject }; };
export const okResponse = (json = {}) => ({ ok: true, status: 200, json: async () => json });
export const badResponse = (status) => ({ ok: false, status, json: async () => ({}) });

export function makeFakeFetch(handler) {
  const calls = [];
  const fetch = (url, init = {}) => {
    const call = { url, method: init.method, headers: init.headers, body: init.body, signal: init.signal, n: calls.length };
    calls.push(call);
    if (calls.length > 200) return new Promise(() => {}); // runaway guard: an unbounded retry loop must not starve the event loop
    try { return Promise.resolve(handler(call)); } catch (e) { return Promise.reject(e); }
  };
  return { fetch, calls };
}

export function makeTimers() {
  const live = new Map(); let id = 0;
  return {
    setInterval: (fn, ms) => { live.set(++id, { fn, ms }); return id; },
    clearInterval: (i) => { live.delete(i); },
    live, tick: async () => { for (const t of [...live.values()]) await t.fn(); await flush(); },
  };
}

export function loadScript(file, globals) {
  const ctx = vm.createContext({ ...globals });
  vm.runInContext(readFileSync(path.join(DIR, file), "utf8"), ctx, { filename: file });
  return ctx;
}

export const defaultConfig = { endpoint: "http://127.0.0.1:4321", token: "tok-abc" };

export function makeRecorderWorld({ handler, config = defaultConfig, extra } = {}) {
  const f = makeFakeFetch(handler ?? ((c) => (c.url.endsWith("/control") ? okResponse({ stop: false }) : okResponse())));
  const timers = makeTimers();
  const listeners = [];
  const tracks = ["audio", "video"].map((kind) => {
    const t = { kind, stopped: false, ended: [], stop() { t.stopped = true; }, addEventListener: (_e, fn) => t.ended.push(fn), end: () => t.ended.forEach((fn) => fn()) };
    return t;
  });
  const world = { fetch: f, calls: f.calls, timers, tracks, recorders: [], getUserMediaCalls: 0, contexts: [], config };
  world.stream = { getAudioTracks: () => [tracks[0]], getVideoTracks: () => [tracks[1]], getTracks: () => tracks };
  class FakeRecorder {
    constructor(stream, opts) { this.stream = stream; this.opts = opts; this.state = "inactive"; this.stopCalls = 0; this.finalSize = 0; world.recorders.push(this); }
    static isTypeSupported(m) { return m === "video/webm;codecs=vp8,opus"; }
    start(ms) { this.state = "recording"; this.timeslice = ms; }
    stop() {
      this.stopCalls++; if (this.state === "inactive") return; this.state = "inactive";
      if (this.finalSize) this.ondataavailable({ data: { size: this.finalSize, final: true } });
      setImmediate(() => this.onstop());
    }
    emit(size, tag) { this.ondataavailable({ data: { size, tag } }); }
  }
  class FakeAudioContext {
    constructor() { this.closed = false; this.destination = {}; world.contexts.push(this); }
    createMediaStreamSource() { return { connect() {} }; }
    createAnalyser() { return { fftSize: 8, connect() {}, getFloatTimeDomainData(a) { a.fill(0.5); } }; }
    async resume() {} async close() { this.closed = true; }
  }
  const chrome = { runtime: { id: "ext-id", onMessage: { addListener: (fn) => listeners.push(fn) } } };
  const ctx = loadScript("recorder.js", {
    chrome, fetch: f.fetch, MediaRecorder: FakeRecorder, AudioContext: FakeAudioContext,
    setInterval: timers.setInterval, clearInterval: timers.clearInterval,
    AbortSignal: { timeout: (ms) => ({ timeoutMs: ms }) },
    navigator: { mediaDevices: { getUserMedia: async () => { world.getUserMediaCalls++; return world.stream; } } }, ...extra,
  });
  world.ctx = ctx; world.handler = listeners[0];
  world.state = () => vm.runInContext("({sequence, queuedBytes, failed, finishing, hasRecorder: !!recorder})", ctx);
  world.send = (msg, sender = { id: "ext-id" }) => { const d = deferred(); const ret = world.handler(msg, sender, d.resolve); return { ret, reply: d.promise }; };
  world.startMsg = { target: "recorder", type: "start", streamId: "sid-1", config };
  world.begin = async () => { const r = world.send(world.startMsg); const reply = await r.reply; await flush(); return reply; };
  world.recorder = () => world.recorders[0];
  world.events = () => world.calls.filter((c) => c.url.endsWith("/event")).map((c) => JSON.parse(c.body));
  world.chunkCalls = () => world.calls.filter((c) => c.url.includes("/chunk"));
  return world;
}
