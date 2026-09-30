import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { vi, describe, test, expect } from "vitest";
import { AuthProvider } from "../../auth/AuthContext.js";
import { SessionDetailPage } from "./SessionDetailPage.js";
import * as sessionsApi from "../../api/sessions.js";

function renderAt(id: string) {
  localStorage.setItem("lkbApiKey", "test-key");
  return render(
    <AuthProvider>
      <MemoryRouter initialEntries={[`/sessions/${id}`]}>
        <Routes>
          <Route path="/sessions/:id" element={<SessionDetailPage />} />
        </Routes>
      </MemoryRouter>
    </AuthProvider>,
  );
}

describe("SessionDetailPage", () => {
  test("stream citation seeks restart for forward-unbuffered and backward-evicted targets", async () => {
    const sources: Source[] = [];
    class Buffer extends EventTarget {
      startTime = 0; endTime = 0;
      buffered = { get length() { return 1; }, start: () => this.startTime, end: () => this.endTime };
      appendBuffer(bytes: ArrayBuffer) { this.endTime = new Uint8Array(bytes)[0]! * 10; queueMicrotask(() => this.dispatchEvent(new Event("updateend"))); }
      remove(_start: number, end: number) { this.startTime = end; queueMicrotask(() => this.dispatchEvent(new Event("updateend"))); }
    }
    class Source extends EventTarget {
      static isTypeSupported() { return true; }
      buffer = new Buffer(); readyState = "open";
      constructor() { super(); sources.push(this); }
      addSourceBuffer() { return this.buffer; }
      endOfStream() { this.readyState = "ended"; }
    }
    vi.stubGlobal("MediaSource", Source);
    URL.createObjectURL = vi.fn((source: unknown) => { queueMicrotask(() => (source as Source).dispatchEvent(new Event("sourceopen"))); return `blob:seek-${sources.length}`; });
    URL.revokeObjectURL = vi.fn();
    const signals: AbortSignal[] = [];
    const fetchMock = vi.spyOn(globalThis, "fetch").mockImplementation(async (_url, options) => {
      signals.push(options!.signal as AbortSignal);
      return new Response(new ReadableStream({ start(controller) { for (let i = 1; i <= 30; i++) controller.enqueue(new Uint8Array([i])); controller.close(); } }));
    });
    const video = document.createElement("video"); video.load = vi.fn();
    const error = vi.fn(), stop = sessionsApi.streamSessionMedia("seek-key", "webinar", "video/webm", video, error)!;
    try {
      await waitFor(() => expect(sources[0]!.buffer.endTime).toBeGreaterThan(60));
      stop.seek(200);
      await waitFor(() => expect(video.currentTime).toBe(200));
      expect(sources).toHaveLength(2); expect(signals[0]!.aborted).toBe(true);
      expect(sources[1]!.buffer.startTime).toBeGreaterThanOrEqual(140);
      video.currentTime = 20;
      video.dispatchEvent(new Event("seeking"));
      video.dispatchEvent(new Event("seeking")); // A pending recovery must not create duplicate generations.
      await waitFor(() => expect(video.currentTime).toBe(20));
      await waitFor(() => expect(sources[2]!.buffer.endTime).toBeGreaterThanOrEqual(20));
      expect(sources).toHaveLength(3); expect(signals[1]!.aborted).toBe(true);
      video.dispatchEvent(new Event("seeking"));
      expect(sources).toHaveLength(3);
      stop.seek(250);
      await waitFor(() => expect(video.currentTime).toBe(250));
      expect(sources).toHaveLength(4);
      for (const call of fetchMock.mock.calls) expect(call[1]!.headers).toEqual({ authorization: "Bearer seek-key" });
      expect(error).not.toHaveBeenCalled(); stop();
      expect(signals.every((signal) => signal.aborted)).toBe(true);
      expect(URL.revokeObjectURL).toHaveBeenCalledTimes(4);
      expect(video.hasAttribute("src")).toBe(false);
      video.currentTime = 10; video.dispatchEvent(new Event("seeking"));
      expect(sources).toHaveLength(4);
    } finally { stop(); fetchMock.mockRestore(); vi.unstubAllGlobals(); }
  });
  test("authenticated WebM streaming appends chunks sequentially and cleans up", async () => {
    const appended: number[] = [];
    class Buffer extends EventTarget {
      buffered = { length: 0 };
      appendBuffer(data: ArrayBuffer) { appended.push(new Uint8Array(data)[0]!); queueMicrotask(() => this.dispatchEvent(new Event("updateend"))); }
    }
    const buffer = new Buffer(), ended = vi.fn();
    class Source extends EventTarget {
      static isTypeSupported() { return true; }
      readyState = "open";
      addSourceBuffer() { return buffer; }
      endOfStream = ended;
    }
    vi.stubGlobal("MediaSource", Source);
    URL.createObjectURL = vi.fn((source: unknown) => {
      queueMicrotask(() => (source as Source).dispatchEvent(new Event("sourceopen")));
      return "blob:streaming";
    });
    URL.revokeObjectURL = vi.fn();
    const fetchMock = vi.spyOn(globalThis, "fetch").mockResolvedValue(new Response(new ReadableStream({
      start(controller) { controller.enqueue(new Uint8Array([1])); controller.enqueue(new Uint8Array([2])); controller.close(); },
    })));
    const video = document.createElement("video"); video.load = vi.fn();
    const onError = vi.fn();
    const stop = sessionsApi.streamSessionMedia("secret-key", "stream", "video/webm", video, onError);
    try {
      await waitFor(() => expect(ended).toHaveBeenCalledOnce());
      expect(appended).toEqual([1, 2]); expect(onError).not.toHaveBeenCalled();
      expect(fetchMock).toHaveBeenCalledWith(expect.stringContaining("/sessions/stream/media"),
        expect.objectContaining({ headers: { authorization: "Bearer secret-key" } }));
      expect(video.src).not.toContain("secret-key");
      stop!(); expect(URL.revokeObjectURL).toHaveBeenCalledWith("blob:streaming");
    } finally { fetchMock.mockRestore(); vi.unstubAllGlobals(); }
  });
  test("renders evidence notes and seeks authorized recording to cited timestamp", async () => {
    vi.spyOn(sessionsApi, "getSession").mockResolvedValue({
      session: { _id: "s3", title: "Recorded", date: "2026-09-30", status: { transcribe: "done", index: "done" } },
      page: null, claims: [], turns: [], media: { available: true, bytes: 1024, mime: "video/mp4" },
      notes: [{ text: "Evidence-backed useful note", kind: "speaker-statement", tStart: 12 }],
    });
    vi.spyOn(sessionsApi, "getSessionMedia").mockResolvedValue(new Blob(["media"], { type: "video/mp4" }));
    URL.createObjectURL = vi.fn(() => "blob:protected-recording");
    URL.revokeObjectURL = vi.fn();
    const result = renderAt("s3");
    await screen.findByText("Evidence-backed useful note");
    fireEvent.click(screen.getByText("Load recording"));
    await waitFor(() => expect(result.container.querySelector("video")?.getAttribute("src")).toBe("blob:protected-recording"));
    fireEvent.click(screen.getByText("Seek to 12s"));
    expect(result.container.querySelector("video")!.currentTime).toBe(12);
    expect(sessionsApi.getSessionMedia).toHaveBeenCalledWith("test-key", "s3", undefined);
  });
  test("citation selected before loading preserves initial target through Blob metadata", async () => {
    vi.spyOn(sessionsApi, "getSession").mockResolvedValue({
      session: { _id: "initial", title: "Initial", date: "2026-09-30", status: { transcribe: "done", index: "done" } },
      page: null, claims: [], turns: [], media: { available: true, bytes: 10, mime: "video/webm" },
      notes: [{ text: "Initial citation", kind: "speaker-statement", tStart: 45 }],
    });
    vi.spyOn(sessionsApi, "getSessionMedia").mockResolvedValue(new Blob(["media"]));
    URL.createObjectURL = vi.fn(() => "blob:initial"); URL.revokeObjectURL = vi.fn();
    vi.stubGlobal("MediaSource", { isTypeSupported: () => true });
    const stream = vi.spyOn(sessionsApi, "streamSessionMedia");
    const result = renderAt("initial");
    fireEvent.click(await screen.findByText("Seek to 45s"));
    await waitFor(() => expect(result.container.querySelector("video")?.getAttribute("src")).toBe("blob:initial"));
    const video = result.container.querySelector("video")!;
    fireEvent.loadedMetadata(video); expect(video.currentTime).toBe(45);
    expect(sessionsApi.getSessionMedia).toHaveBeenCalledWith("test-key", "initial", undefined);
    expect(stream).not.toHaveBeenCalled();
    result.unmount(); stream.mockRestore(); vi.unstubAllGlobals();
  });
  test("initial WebM citation and subsequent note seek route through stream controller", async () => {
    vi.spyOn(sessionsApi, "getSession").mockResolvedValue({
      session: { _id: "initial-stream", title: "Stream", date: "2026-09-30", status: { transcribe: "done", index: "done" } },
      page: null, claims: [], turns: [], media: { available: true, bytes: 500_000_000, mime: "video/webm" },
      notes: [{ text: "Stream citation", kind: "speaker-statement", tStart: 80 }],
    });
    const stop = Object.assign(vi.fn(), { seek: vi.fn() });
    const stream = vi.spyOn(sessionsApi, "streamSessionMedia").mockReturnValue(stop);
    vi.stubGlobal("MediaSource", { isTypeSupported: () => true });
    try {
      const result = renderAt("initial-stream");
      fireEvent.click(await screen.findByText("Seek to 80s"));
      await waitFor(() => expect(stop.seek).toHaveBeenCalledWith(80));
      fireEvent.click(screen.getByText("Seek to 80s"));
      expect(stop.seek).toHaveBeenCalledTimes(2); expect(stream).toHaveBeenCalledTimes(1);
      result.unmount(); expect(stop).toHaveBeenCalledOnce();
    } finally { stream.mockRestore(); vi.unstubAllGlobals(); }
  });
  test("labels an audio turn's tStart/tEnd in seconds", async () => {
    vi.spyOn(sessionsApi, "getSession").mockResolvedValue({
      session: { _id: "s1", title: "Real Session", date: "2026-04-21", status: { transcribe: "done", index: "done" } },
      page: null,
      claims: [],
      turns: [{ _id: "t1", speakerRef: "spk:0", tStart: 0, tEnd: 28, text: "Hello." }],
    });
    renderAt("s1");
    await waitFor(() => expect(screen.getByText("spk:0 · 0s–28s")).toBeInTheDocument());
  });

  test("real bug fix: labels an ingested URL turn's tStart/tEnd in characters, not seconds", async () => {
    // tStart/tEnd for a url-ingested turn are character offsets (packages/ingest's
    // splitIntoParagraphTurns), not real time -- a real UI bug found live 2026-09-04 labeled
    // these as seconds, which was factually wrong for ingested content.
    vi.spyOn(sessionsApi, "getSession").mockResolvedValue({
      session: { _id: "s2", title: "https://example.com/article", date: "2026-09-04", status: { transcribe: "done", index: "pending" } },
      page: null,
      claims: [],
      turns: [{ _id: "t1", speakerRef: "url", tStart: 0, tEnd: 28, text: "Title: Example" }],
    });
    renderAt("s2");
    await waitFor(() => expect(screen.getByText("url · 0chars–28chars")).toBeInTheDocument());
  });
});
