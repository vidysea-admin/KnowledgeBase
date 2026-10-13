// Bounded, ordered chunk delivery. A failed receiver ends capture instead of buffering hours.
let recorder, stream, context, meterTimer, controlTimer, config;
let queuedBytes = 0, sequence = 0, queue = Promise.resolve(), failed = false, finishing = false, starting = false;
const MAX_QUEUE = 16 * 1024 * 1024;
async function request(route, body, contentType = "application/json") {
  const response = await fetch(`${config.endpoint}${route}`, {method: "POST", body,
    headers: {Authorization: `Bearer ${config.token}`, "Content-Type": contentType},
    signal: AbortSignal.timeout(10000)});
  if (!response.ok) throw new Error(`Capture receiver returned ${response.status}`);
  return response;
}
async function event(data) { await request("/event", JSON.stringify(data)); }
async function stop() {
  if (finishing) return;
  finishing = true;
  clearInterval(meterTimer); clearInterval(controlTimer);
  if (recorder?.state !== "inactive") recorder?.stop();
}
async function fail(error) {
  if (failed) return;
  failed = true;
  await event({event: "capture-error", error: String(error.message || error)}).catch(() => {});
  await stop();
}
// The receiver binds 127.0.0.1 only and the manifest host scope is 127.0.0.1 only: no other form can work,
// so no other form is accepted. Strict raw-string match (no URL normalisation, no userinfo, no path).
const LOOPBACK = /^http:\/\/127\.0\.0\.1:([1-9]\d{0,4})$/;
function validConfig(c) {
  const m = typeof c?.endpoint === "string" && LOOPBACK.exec(c.endpoint);
  return !!m && Number(m[1]) <= 65535 && typeof c.token === "string" && c.token.length > 0;
}
// Only this extension's own contexts (background worker, offscreen pages): never a content script (sender.tab) or another id.
// Fails closed: no sender, no runtime id of our own to compare with, a non-string id/url, or a tab all mean "not ours".
const ownSender = (s) => {
  const own = chrome.runtime?.id;
  return !!s && typeof own === "string" && own.length > 0 && s.id === own && !s.tab
    && (s.url === undefined || (typeof s.url === "string" && s.url.startsWith(`chrome-extension://${own}/`)));
};
async function start(message) {
  if (!validConfig(message.config)) throw new Error("Capture endpoint must be http://127.0.0.1:<port>; refusing to start");
  if (recorder || starting) throw new Error("A capture is already active");
  starting = true;
  try { await open(message); } catch (error) { if (!recorder) starting = false; throw error; }
}
// T-035 lean budget: 500 kbps video + 64 kbps audio = 564 kbps = 253.8 MB/h (decimal), under the 400 MB/h contract.
async function open(message) {
  config = message.config;
  const media = {mandatory: {chromeMediaSource: "tab", chromeMediaSourceId: message.streamId}};
  stream = await navigator.mediaDevices.getUserMedia({audio: media, video: {
    mandatory: {...media.mandatory, maxWidth: 1280, maxHeight: 720, maxFrameRate: 5}
  }});
  if (!stream.getAudioTracks().length || !stream.getVideoTracks().length) throw new Error("Audio and video tracks are required");
  context = new AudioContext();
  const audio = context.createMediaStreamSource(stream), analyser = context.createAnalyser();
  audio.connect(analyser); audio.connect(context.destination);
  await context.resume();
  const samples = new Float32Array(analyser.fftSize);
  const mimeType = ["video/webm;codecs=vp8,opus", "video/webm"].find((m) => MediaRecorder.isTypeSupported(m));
  if (!mimeType) throw new Error("This browser cannot record WebM audio/video");
  recorder = new MediaRecorder(stream, {mimeType, videoBitsPerSecond: 500000, audioBitsPerSecond: 64000});
  recorder.ondataavailable = ({data}) => {
    if (!data.size || failed) return;
    queuedBytes += data.size;
    if (queuedBytes > MAX_QUEUE || data.size > 8 * 1024 * 1024) { void fail(new Error("Recorder upload backlog exceeded its limit")); return; }
    const seq = sequence++;
    queue = queue.then(async () => {
      if (failed) return; // a lost chunk ends the capture: never send later chunks past the gap
      for (let attempt = 0; attempt < 3; attempt++) {
        try { await request(`/chunk?seq=${seq}`, data, "video/webm"); return; }
        catch (error) { if (attempt === 2) throw error; }
      }
    }).catch(fail).finally(() => { queuedBytes -= data.size; });
  };
  recorder.onerror = ({error}) => { void fail(error); };
  recorder.onstop = async () => {
    await queue;
    stream.getTracks().forEach((track) => track.stop());
    await context.close();
    await event({event: "capture-stopped", failed}).catch(() => {});
  };
  // A track ending while no stop was requested means audio/video was lost mid-recording: a failed recording.
  stream.getTracks().forEach((track) => track.addEventListener("ended", () => {
    if (!finishing) void fail(new Error(`${track.kind} track ended unexpectedly`));
  }));
  recorder.start(2000);
  await event({event: "capture-started", mimeType});
  meterTimer = setInterval(() => {
    analyser.getFloatTimeDomainData(samples);
    const peak = samples.reduce((max, value) => Math.max(max, Math.abs(value)), 0);
    void event({event: "capture-level", db: peak > 0 ? 20 * Math.log10(peak) : -120}).catch(fail);
  }, 1000);
  controlTimer = setInterval(async () => {
    try {
      const response = await fetch(`${config.endpoint}/control`, {
        method: "POST", body: "{}", headers: {Authorization: `Bearer ${config.token}`, "Content-Type": "application/json"},
        signal: AbortSignal.timeout(5000)});
      if (!response.ok) throw new Error(`Capture control returned ${response.status}`);
      if ((await response.json()).stop) await stop();
    } catch (error) { await fail(error); }
  }, 1000);
}
chrome.runtime.onMessage.addListener((message, sender, respond) => {
  if (message?.target !== "recorder" || message.type !== "start") return;
  if (!ownSender(sender)) { respond({ok: false, error: "Sender refused"}); return; }
  start(message).then(() => respond({ok: true})).catch(async (error) => {
    stream?.getTracks().forEach((track) => track.stop());
    await context?.close(); respond({ok: false, error: error.message});
  });
  return true;
});
