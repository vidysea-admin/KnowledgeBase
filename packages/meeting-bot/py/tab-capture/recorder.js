// Bounded, ordered chunk delivery. A failed receiver ends capture instead of buffering hours.
let recorder, stream, context, meterTimer, controlTimer, config;
let queuedBytes = 0, sequence = 0, queue = Promise.resolve(), failed = false, finishing = false;
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
async function start(message) {
  if (recorder) throw new Error("A capture is already active");
  config = message.config;
  const media = {mandatory: {chromeMediaSource: "tab", chromeMediaSourceId: message.streamId}};
  stream = await navigator.mediaDevices.getUserMedia({audio: media, video: {
    mandatory: {...media.mandatory, maxWidth: 1280, maxHeight: 720, maxFrameRate: 20}
  }});
  if (!stream.getAudioTracks().length || !stream.getVideoTracks().length) throw new Error("Audio and video tracks are required");
  context = new AudioContext();
  const audio = context.createMediaStreamSource(stream), analyser = context.createAnalyser();
  audio.connect(analyser); audio.connect(context.destination);
  await context.resume();
  const samples = new Float32Array(analyser.fftSize);
  const mimeType = ["video/webm;codecs=vp8,opus", "video/webm"].find((m) => MediaRecorder.isTypeSupported(m));
  if (!mimeType) throw new Error("This browser cannot record WebM audio/video");
  recorder = new MediaRecorder(stream, {mimeType, videoBitsPerSecond: 1500000, audioBitsPerSecond: 96000});
  recorder.ondataavailable = ({data}) => {
    if (!data.size || failed) return;
    queuedBytes += data.size;
    if (queuedBytes > MAX_QUEUE || data.size > 8 * 1024 * 1024) { void fail(new Error("Recorder upload backlog exceeded its limit")); return; }
    const seq = sequence++;
    queue = queue.then(async () => {
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
  stream.getTracks().forEach((track) => track.addEventListener("ended", () => { void stop(); }));
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
chrome.runtime.onMessage.addListener((message, _sender, respond) => {
  if (message.target !== "recorder" || message.type !== "start") return;
  start(message).then(() => respond({ok: true})).catch(async (error) => {
    stream?.getTracks().forEach((track) => track.stop());
    await context?.close(); respond({ok: false, error: error.message});
  });
  return true;
});
