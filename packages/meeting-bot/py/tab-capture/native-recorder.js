import {NativeVideoProducer} from './native-video.js';
const VP8 = {codec: 'vp8', width: 1280, height: 720, framerate: 5, bitrate: 500000};
export async function preflightNative(scope = globalThis) {
  if (!scope.isSecureContext || !scope.OffscreenCanvas || !scope.VideoFrame || !scope.VideoEncoder || !scope.AudioWorkletNode
    || !scope.AudioContext?.prototype.getOutputTimestamp) throw new Error('Native capture APIs unavailable');
  if (!(await scope.VideoEncoder.isConfigSupported(VP8)).supported) throw new Error('Native VP8 unavailable');
}
function base64(bytes) {
  let text = ''; for (const byte of new Uint8Array(bytes)) text += String.fromCharCode(byte);
  return btoa(text);
}
export async function openNativeRecorder({stream, context, config, request, fail}) {
  await preflightNative();
  if (context.sampleRate !== 48000 || context.state !== 'running' || !context.audioWorklet)
    throw new Error('Native audio context unavailable');
  const identity = config.native.identity;
  let sequence = 0, pendingBytes = 0, queue = Promise.resolve(), dead = false, stopping = false, hostPending = Promise.resolve();
  const reportFailure = fail;
  fail = error => { dead = true; void reportFailure(error); };
  const send = (op, payload = {}, bytes) => {
    if (dead) throw new Error('Native recorder poisoned');
    const envelope = {op, identity, sequence: sequence++, ...payload, ...(bytes ? {bytes: base64(bytes)} : {})};
    const body = JSON.stringify(envelope); pendingBytes += body.length;
    if (pendingBytes > 16 * 1024 * 1024) { dead = true; throw new Error('Native transport backpressure'); }
    queue = queue.then(async () => {
      if (dead) throw new Error('Native recorder poisoned');
      for (let attempt = 0; attempt < 3; attempt++) {
        try { await request('/native', body); return; }
        catch (error) { if (attempt === 2) throw error; }
      }
    }).catch(error => { dead = true; void fail(error); }).finally(() => { pendingBytes -= body.length; });
  };
  const clock = () => {
    const beforePerformanceUs = Math.floor(performance.now() * 1000), pair = context.getOutputTimestamp();
    const afterPerformanceUs = Math.ceil(performance.now() * 1000);
    if (context.state !== 'running' || !Number.isFinite(pair.contextTime) || !Number.isFinite(pair.performanceTime)
      || pair.contextTime <= 0 || pair.performanceTime <= 0) throw new Error('Native output clock unavailable');
    send('clock', {kind: 'audio', pair: {clockInstanceId: identity.clockInstanceId, beforePerformanceUs,
      contextTime: pair.contextTime, performanceTime: pair.performanceTime, afterPerformanceUs,
      state: context.state, sampleRate: context.sampleRate}});
  };
  const hostClock = async () => {
    const beforeMonotonicUs = Math.floor(performance.now() * 1000), epochUs = Date.now() * 1000;
    const response = await request('/native-clock', '{}');
    const server = await response.json();
    const afterMonotonicUs = Math.ceil(performance.now() * 1000);
    send('clock', {kind: 'host', pair: {browser: {clockInstanceId: identity.clockInstanceId,
      beforeMonotonicUs, epochUs, afterMonotonicUs}, ...server}});
  };
  // Clock qualification is separate: API estimates carry no invented error bound.
  const clockDeadline = performance.now() + 1000;
  for (;;) {
    try { clock(); break; }
    catch (error) { if (performance.now() >= clockDeadline) throw error; await new Promise(resolve => setTimeout(resolve, 20)); }
  }
  await hostClock();
  let encoder, video, node, source, sampleTimer, clockTimer;
  try {
  const canvas = new OffscreenCanvas(VP8.width, VP8.height);
  video = document.createElement('video'); video.muted = true; video.srcObject = stream; await video.play();
  let producer;
  encoder = new VideoEncoder({output(chunk) {
    try { const output = producer.output(chunk); send('video', {observation: output.observation}, output.bytes); }
    catch (error) { void fail(error); }
  }, error: fail});
  encoder.configure(VP8);
  producer = new NativeVideoProducer({encoder, canvas, now: () => performance.now(), VideoFrame,
    observe: observation => send('observe-video', {observation}), fail});
  await context.audioWorklet.addModule(chrome.runtime.getURL('native-audio-worklet.js'));
  node = new AudioWorkletNode(context, 'native-pcm'); source = context.createMediaStreamSource(stream);
  let audioStopped;
  node.port.onmessage = ({data}) => {
    if (data.stopped) { audioStopped?.(); return; }
    try { if (data.error) throw new Error(data.error); send('audio', {observation: data.observation}, data.bytes); }
    catch (error) { void fail(error); }
  };
  source.connect(node); node.connect(context.destination);
  const stateListener = () => { if (!stopping && context.state !== 'running') void fail(new Error('Native audio context suspended')); };
  context.addEventListener('statechange', stateListener);
  sampleTimer = setInterval(() => { try { producer.sample(video); } catch (error) { void fail(error); } }, 200);
  clockTimer = setInterval(() => {
    try { clock(); hostPending = hostPending.then(hostClock).catch(fail); } catch (error) { void fail(error); }
  }, 1000);
  return {async stop({failed = false} = {}) {
    if (stopping) return; stopping = true; clearInterval(sampleTimer); clearInterval(clockTimer);
    if (failed) dead = true;
    context.removeEventListener('statechange', stateListener);
    let drainTimeout;
    try {
      await new Promise((resolve, reject) => { audioStopped = resolve; drainTimeout = setTimeout(() => reject(new Error('Native audio flush timed out')), 2000); node.port.postMessage({op:'stop'}); });
      await encoder.flush(); producer.finish(); await hostPending; await queue; if (dead) throw new Error('Native upload incomplete');
      send('close'); await queue; if (dead) throw new Error('Native close incomplete'); }
    finally { clearTimeout(drainTimeout); source.disconnect(); node.disconnect(); node.port.close(); encoder.close(); video.pause(); video.srcObject = null; }
  }};
  } catch (error) {
    clearInterval(sampleTimer); clearInterval(clockTimer); source?.disconnect(); node?.disconnect(); node?.port.close();
    if (encoder && encoder.state !== 'closed') encoder.close(); if (video) {video.pause();video.srcObject = null;}
    throw error;
  }
}
