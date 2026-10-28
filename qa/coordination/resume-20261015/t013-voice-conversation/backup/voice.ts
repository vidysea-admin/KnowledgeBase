/** Browser voice adapter: microphone access occurs only after a user's start action. */
export type VoiceState = "idle" | "listening" | "speaking" | "error";
interface Recognition {
  lang: string; continuous: boolean; interimResults: boolean;
  onresult: ((event: { results: ArrayLike<{ isFinal: boolean; 0: { transcript: string } }> }) => void) | null;
  onerror: ((event: { error: string }) => void) | null;
  onend: (() => void) | null; start(): void; abort(): void;
}
type RecognitionConstructor = new () => Recognition;
type VoiceWindow = Window & { SpeechRecognition?: RecognitionConstructor; webkitSpeechRecognition?: RecognitionConstructor; SpeechSynthesisUtterance: typeof SpeechSynthesisUtterance };

export class BrowserVoice {
  private generation = 0;
  private recognition: Recognition | null = null;
  private utterance: SpeechSynthesisUtterance | null = null;
  private recognitionConstructor: RecognitionConstructor | undefined;
  constructor(private notify: (state: VoiceState, error?: string) => void, private host: VoiceWindow = window) {
    this.recognitionConstructor = host.SpeechRecognition ?? host.webkitSpeechRecognition;
    // Some browsers load their voice list asynchronously on the first enumeration.
    // Prime that list without starting playback, so the first answered turn can use it.
    try { host.speechSynthesis?.getVoices(); } catch { /* capability errors are surfaced on a read action */ }
  }
  get canListen(): boolean { return Boolean(this.recognitionConstructor && this.host.isSecureContext); }
  get canSpeak(): boolean { return Boolean(this.host.speechSynthesis && this.host.SpeechSynthesisUtterance); }
  stop(): void {
    this.generation++;
    if (this.recognition) {
      this.recognition.onresult = null; this.recognition.onerror = null; this.recognition.onend = null;
      try { this.recognition.abort(); } catch { /* already stopped */ }
      this.recognition = null;
    }
    if (this.utterance) { this.utterance.onstart = null; this.utterance.onend = null; this.utterance.onerror = null; this.utterance = null; }
    try { this.host.speechSynthesis?.cancel(); } catch { /* callback retirement still takes effect */ }
    this.notify("idle");
  }
  listen(onTranscript: (text: string) => void, lang: string): void {
    this.stop();
    if (!this.canListen || !this.recognitionConstructor) {
      this.notify("error", "Microphone recognition is unavailable. Use a supported browser on HTTPS or localhost, or type your question."); return;
    }
    const generation = this.generation;
    let recognition: Recognition;
    try { recognition = new this.recognitionConstructor(); }
    catch { this.notify("error", "The microphone could not start. Try again or type your question."); return; }
    this.recognition = recognition;
    recognition.lang = lang; recognition.continuous = false; recognition.interimResults = false;
    let delivered = false;
    recognition.onresult = (event) => {
      if (generation !== this.generation || delivered) return;
      const text = Array.from(event.results).filter((result) => result.isFinal).map((result) => result[0].transcript).join(" ").trim();
      if (!text) return;
      delivered = true;
      this.stop();
      onTranscript(text);
    };
    recognition.onerror = (event) => {
      if (generation !== this.generation) return;
      this.stop();
      this.notify("error", event.error === "not-allowed" || event.error === "service-not-allowed"
        ? "Microphone permission was denied. Allow microphone access or type your question."
        : `Speech recognition failed (${event.error}). Try again or type your question.`);
    };
    recognition.onend = () => {
      if (generation !== this.generation) return;
      this.stop();
      if (!delivered) this.notify("error", "No speech was recognized. Try again or type your question.");
    };
    try { recognition.start(); this.notify("listening"); }
    catch { this.stop(); this.notify("error", "The microphone could not start. Try again or type your question."); }
  }
  speak(text: string, lang: string): void {
    this.stop();
    if (!this.canSpeak) { this.notify("error", "Spoken output is unavailable in this browser. The answer remains readable."); return; }
    const synthesis = this.host.speechSynthesis;
    try {
    const voices = synthesis.getVoices();
    const voice = voices.find((candidate) => candidate.lang.toLowerCase() === lang.toLowerCase())
      ?? voices.find((candidate) => candidate.lang.split("-")[0] === lang.split("-")[0]);
    if (!voice) { this.notify("error", "No voice for this language is available yet. Wait for browser voices to load, choose another language, or read the answer."); return; }
    const generation = this.generation;
    const utterance = new this.host.SpeechSynthesisUtterance(text);
    this.utterance = utterance; utterance.lang = lang; utterance.voice = voice;
    utterance.onstart = () => { if (generation === this.generation) this.notify("speaking"); };
    utterance.onend = () => { if (generation === this.generation) { this.generation++; this.utterance = null; this.notify("idle"); } };
    utterance.onerror = () => { if (generation === this.generation) { this.generation++; this.utterance = null; this.notify("error", "Spoken output failed. The answer remains readable."); } };
    synthesis.speak(utterance);
    }
    catch { this.stop(); this.notify("error", "Spoken output could not start. The answer remains readable."); }
  }
}
