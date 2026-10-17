import { describe, expect, test, vi } from "vitest";
import { BrowserVoice } from "./voice.js";

function environment() {
  const states: string[] = [], errors: string[] = [];
  let recognition: any, utterance: any;
  class Recognizer {
    onresult: any; onend: any; onerror: any;
    start = vi.fn(); abort = vi.fn();
    constructor() { recognition = this; }
  }
  const host: any = { isSecureContext: true, SpeechRecognition: Recognizer,
    SpeechSynthesisUtterance: class { constructor(public text: string) { utterance = this; } },
    speechSynthesis: { cancel: vi.fn(), getVoices: vi.fn(() => [{ lang: "en-IN" }]), speak: vi.fn() } };
  const voice = new BrowserVoice((state, error) => { states.push(state); if (error) errors.push(error); }, host);
  return { voice, host, states, errors, recognition: () => recognition, utterance: () => utterance };
}
describe("browser voice lifecycle", () => {
  test("only delivers final nonblank transcript once; stop retires captured callbacks", () => {
    const env = environment(), receive = vi.fn(); env.voice.listen(receive, "en-IN");
    const recognition = env.recognition(), stale = recognition.onresult;
    stale({ results: [{ isFinal: false, 0: { transcript: "interim" } }] }); expect(receive).not.toHaveBeenCalled();
    stale({ results: [{ isFinal: true, 0: { transcript: "  student visa  " } }] });
    expect(receive).toHaveBeenCalledTimes(1); expect(receive).toHaveBeenCalledWith("student visa"); expect(recognition.abort).toHaveBeenCalledOnce();
    stale({ results: [{ isFinal: true, 0: { transcript: "stale question" } }] }); expect(receive).toHaveBeenCalledTimes(1);
  });
  test("denied recognition and blank completion remain explicit", () => {
    const env = environment(); env.voice.listen(vi.fn(), "en-IN"); env.recognition().onerror({ error: "not-allowed" });
    expect(env.errors.at(-1)).toContain("permission was denied");
    env.voice.listen(vi.fn(), "en-IN"); env.recognition().onend(); expect(env.errors.at(-1)).toContain("No speech");
  });
  test("unavailable or insecure recognition does not start", () => {
    const env = environment(); env.host.isSecureContext = false; env.voice.listen(vi.fn(), "en-IN");
    expect(env.recognition()).toBeUndefined(); expect(env.errors.at(-1)).toContain("HTTPS or localhost");
  });
  test("avatar speaking lifecycle waits for actual utterance start and retires end callbacks", () => {
    const env = environment(); env.voice.speak("Cited answer", "en-IN");
    expect(env.utterance().text).toBe("Cited answer"); expect(env.states.at(-1)).toBe("idle");
    const lateStart = env.utterance().onstart; lateStart(); expect(env.states.at(-1)).toBe("speaking");
    env.utterance().onend(); lateStart(); expect(env.states.at(-1)).toBe("idle");
  });
  test("completion is emitted once only by the current successful synthesis end", () => {
    const env = environment(), complete = vi.fn(); env.voice.speak("answer", "en-IN", complete);
    const end = env.utterance().onend; expect(complete).not.toHaveBeenCalled();
    env.utterance().onstart(); expect(complete).not.toHaveBeenCalled();
    end(); end(); expect(complete).toHaveBeenCalledOnce();
  });
  test.each(["stop", "replacement", "error", "no voice", "unavailable", "throw"])("%s cannot emit a successful completion", (action) => {
    const env = environment(), complete = vi.fn();
    if (action === "no voice") env.host.speechSynthesis.getVoices.mockReturnValue([]);
    if (action === "unavailable") delete env.host.SpeechSynthesisUtterance;
    if (action === "throw") env.host.speechSynthesis.speak.mockImplementation(() => { throw new Error("failed"); });
    env.voice.speak("answer", "en-IN", complete); const oldEnd = env.utterance()?.onend;
    if (action === "stop") env.voice.stop();
    if (action === "replacement") env.voice.speak("new answer", "en-IN");
    if (action === "error") env.utterance().onerror();
    oldEnd?.(); expect(complete).not.toHaveBeenCalled();
  });
  test("stop cancels synthesis and ignores old start/error events", () => {
    const env = environment(); env.voice.speak("answer", "en-IN");
    const old = env.utterance(), start = old.onstart, error = old.onerror; env.voice.stop();
    start(); error(); expect(env.states.at(-1)).toBe("idle"); expect(env.errors).toEqual([]); expect(env.host.speechSynthesis.cancel).toHaveBeenCalled();
  });
  test("missing voices and unavailable synthesis do not report success", () => {
    const env = environment(); env.host.speechSynthesis.getVoices.mockReturnValue([]); env.voice.speak("answer", "en-IN");
    expect(env.errors.at(-1)).toContain("No voice"); expect(env.host.speechSynthesis.speak).not.toHaveBeenCalled();
    delete env.host.SpeechSynthesisUtterance; env.voice.speak("answer", "en-IN"); expect(env.errors.at(-1)).toContain("unavailable");
  });
  test("recognition network and start errors are explicit", () => {
    const env = environment(); env.voice.listen(vi.fn(), "en-IN"); env.recognition().onerror({ error: "network" });
    expect(env.errors.at(-1)).toContain("network");
    const broken: any = { isSecureContext: true, SpeechRecognition: class { start() { throw new Error("failed"); } abort() {} } };
    const notify = vi.fn(); new BrowserVoice(notify, broken).listen(vi.fn(), "en-IN"); expect(notify).toHaveBeenLastCalledWith("error", expect.stringContaining("could not start"));
  });
  test("synthesis throws and error events never claim successful playback", () => {
    const env = environment(); env.host.speechSynthesis.speak.mockImplementation(() => { throw new Error("failed"); }); env.voice.speak("answer", "en-IN");
    expect(env.errors.at(-1)).toContain("could not start");
    env.host.speechSynthesis.speak.mockReset(); env.voice.speak("answer", "en-IN"); env.utterance().onerror();
    expect(env.errors.at(-1)).toContain("Spoken output failed"); expect(env.states.at(-1)).toBe("error");
  });
});
