import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter, Route, Routes, useNavigate } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import { AuthProvider, useAuth } from "../../auth/AuthContext.js";
import { SearchPage } from "./SearchPage.js";
import { App } from "../../App.js";
import { SessionDetailPage } from "../sessions/SessionDetailPage.js";

const hit = (text = "A class size of 23.") => ({ turnId: "t/1", sessionId: "s/1", score: 1,
  turn: { _id: "t/1", sessionId: "s/1", speakerRef: "spk:0", speakerLabel: "Sandeep", tStart: 516, tEnd: 546, text },
  session: { _id: "s/1", title: "Xavier", date: "2026-08-20", status: { transcribe: "done", index: "pending" } } });
const reply = (query: string, hits: unknown[]) => new Response(JSON.stringify({ query, hits }), { headers: { "content-type": "application/json" } });
function Controls() { const auth = useAuth(); return <button onClick={() => auth.setApiKey("replacement-key")}>Replace key</button>; }
function SourceControls() { const navigate = useNavigate(); return <button onClick={() => navigate("/sessions/new")}>Next session</button>; }
function showSource(route = "/sessions/old") {
  localStorage.setItem("lkbApiKey", "fixture-key");
  return render(<AuthProvider><MemoryRouter initialEntries={[route]}><Controls /><SourceControls /><Routes>
    <Route path="/sessions/:id" element={<SessionDetailPage />} /></Routes></MemoryRouter></AuthProvider>);
}
const detail = (id: string, text: string) => ({ session: { ...hit().session, _id: id, title: id }, page: null, claims: [],
  turns: [{ ...hit(text).turn, _id: `${id}-turn`, sessionId: id }] });
function show(key: string | null = "fixture-key") {
  if (key) localStorage.setItem("lkbApiKey", key);
  return render(<AuthProvider><MemoryRouter initialEntries={["/search"]}><Controls /><Routes><Route path="/search" element={<SearchPage />} /></Routes></MemoryRouter></AuthProvider>);
}
function submit(query: string) { fireEvent.change(screen.getByRole("searchbox"), { target: { value: query } }); fireEvent.submit(screen.getByRole("form", { name: "Search transcripts" })); }
function deferred<T>() { let resolve!: (value: T) => void; const promise = new Promise<T>((done) => { resolve = done; }); return { promise, resolve }; }

describe("SearchPage actual client/fake HTTP workflow", () => {
  beforeEach(() => { localStorage.clear(); });
  afterEach(() => { cleanup(); vi.restoreAllMocks(); vi.unstubAllGlobals(); });
  test("mount, input editing, blank submit and unauthenticated render never query", () => {
    const fetcher = vi.fn(); vi.stubGlobal("fetch", fetcher); const page = show();
    fireEvent.change(screen.getByRole("searchbox"), { target: { value: "size" } }); expect(fetcher).not.toHaveBeenCalled();
    submit("  "); expect(screen.getByRole("alert")).toHaveTextContent("Enter a search query."); expect(fetcher).not.toHaveBeenCalled();
    page.unmount(); localStorage.clear(); show(null); expect(screen.getByText("Sign in to search transcripts.")).toBeInTheDocument(); expect(screen.queryByRole("form")).toBeNull();
  });
  test("explicit submit loads a literal passage, exact speaker/time and encoded transcript anchor", async () => {
    const pending = deferred<Response>(), fetcher = vi.fn().mockReturnValue(pending.promise); vi.stubGlobal("fetch", fetcher); show(); submit("size");
    expect(screen.getByRole("status")).toHaveTextContent("Searching transcripts"); expect(fetcher).toHaveBeenCalledTimes(1);
    await act(async () => { pending.resolve(reply("size", [hit("<script>literal 世界 😀</script>")])); });
    expect(await screen.findByText("Speaker: Sandeep")).toBeInTheDocument(); expect(screen.getByText("516–546 s")).toBeInTheDocument();
    expect(screen.getByText("<script>literal 世界 😀</script>")).toBeInTheDocument(); expect(document.querySelector("script")).toBeNull();
    expect(screen.getByRole("link", { name: "Open transcript" })).toHaveAttribute("href", "/sessions/s%2F1#turn-t%2F1");
  });
  test("empty response and API scope failure are clear states and clear prior evidence", async () => {
    const fetcher = vi.fn().mockResolvedValueOnce(reply("first", [hit()])).mockResolvedValueOnce(reply("absent", [])).mockResolvedValueOnce(new Response("{}", { status: 403 }));
    vi.stubGlobal("fetch", fetcher); show(); submit("first"); await screen.findByRole("link", { name: "Open transcript" });
    submit("absent"); expect(await screen.findByText("No passages found for “absent”.")).toBeInTheDocument(); expect(screen.queryByRole("link")).toBeNull();
    submit("restricted"); expect(await screen.findByRole("alert")).toHaveTextContent("This API key needs search access."); expect(screen.queryByRole("link")).toBeNull();
  });
  test("network or malformed evidence never displays an unsupported result", async () => {
    vi.stubGlobal("fetch", vi.fn().mockRejectedValueOnce(new Error("offline")).mockResolvedValueOnce(reply("wrong", [hit()]))); show(); submit("network");
    expect(await screen.findByRole("alert")).toHaveTextContent("Search is unavailable."); submit("query");
    await waitFor(() => expect(screen.getByRole("alert")).toHaveTextContent("Search is unavailable.")); expect(screen.queryByRole("link")).toBeNull();
  });
  test("a superseded query response cannot replace newer results", async () => {
    const old = deferred<Response>(), fetcher = vi.fn().mockReturnValueOnce(old.promise).mockResolvedValueOnce(reply("new", [hit("New response")])); vi.stubGlobal("fetch", fetcher); show();
    submit("old"); submit("new"); await screen.findByText("New response");
    await act(async () => { old.resolve(reply("old", [hit("Old response")])); });
    expect(screen.queryByText("Old response")).toBeNull(); expect(screen.getByText("Results for “new”")).toBeInTheDocument();
  });
  test("key change immediately hides old results and ignores pending old-key evidence", async () => {
    const pending = deferred<Response>(), fetcher = vi.fn().mockResolvedValueOnce(reply("first", [hit()])).mockReturnValueOnce(pending.promise).mockResolvedValueOnce(reply("replacement", []));
    vi.stubGlobal("fetch", fetcher); show(); submit("first"); await screen.findByRole("link", { name: "Open transcript" }); submit("pending");
    fireEvent.click(screen.getByRole("button", { name: "Replace key" })); expect(screen.queryByRole("link")).toBeNull(); expect(screen.getByRole("searchbox")).toHaveValue("");
    await act(async () => { pending.resolve(reply("pending", [hit("Private old-key response")])); }); expect(screen.queryByText("Private old-key response")).toBeNull();
    submit("replacement"); await screen.findByText("No passages found for “replacement”."); expect(fetcher.mock.calls[2]?.[1].headers.authorization).toBe("Bearer replacement-key");
  });
  test("document offsets are characters, unknown speaker identity stays literal and missing joins do not link", async () => {
    const raw = hit("Paragraph text"); const documentHit = { ...raw, turn: { ...raw.turn, speakerRef: "document", speakerLabel: undefined, tStart: 10, tEnd: 24 } };
    vi.stubGlobal("fetch", vi.fn().mockResolvedValueOnce(reply("paragraph", [documentHit])).mockResolvedValueOnce(reply("missing", [{ ...hit(), turn: null, session: null }]))); show(); submit("paragraph");
    expect(await screen.findByText("Characters 10–24")).toBeInTheDocument(); expect(screen.getByText("Speaker: document")).toBeInTheDocument();
    submit("missing"); expect(await screen.findByText("Passage unavailable.")).toBeInTheDocument(); expect(screen.queryByRole("link")).toBeNull();
  });
  test("401 invalidation removes the authenticated form without automatic resubmission", async () => {
    const fetcher = vi.fn().mockResolvedValue(new Response("{}", { status: 401 })); vi.stubGlobal("fetch", fetcher); show(); submit("expired");
    expect(await screen.findByText("Sign in to search transcripts.")).toBeInTheDocument(); expect(screen.queryByRole("form")).toBeNull(); expect(fetcher).toHaveBeenCalledTimes(1);
  });
  test("proposed real App/Nav seam mounts Search without querying and opens the actual transcript consumer", async () => {
    window.history.replaceState({}, "", "/search"); localStorage.setItem("lkbApiKey", "fixture-key");
    const raw = hit("Downstream literal passage"), scroll = vi.fn();
    const previous = HTMLElement.prototype.scrollIntoView;
    HTMLElement.prototype.scrollIntoView = scroll;
    const fetcher = vi.fn().mockResolvedValueOnce(reply("size", [raw])).mockResolvedValueOnce(new Response(JSON.stringify({
      session: raw.session, page: null, claims: [], turns: [raw.turn],
    }), { headers: { "content-type": "application/json" } }));
    vi.stubGlobal("fetch", fetcher);
    try {
      render(<App />); expect(screen.getByRole("link", { name: "Search" })).toHaveAttribute("href", "/search");
      expect(screen.getByRole("heading", { name: "Search" })).toBeInTheDocument(); expect(fetcher).not.toHaveBeenCalled();
      submit("size"); fireEvent.click(await screen.findByRole("link", { name: "Open transcript" }));
      await waitFor(() => expect(document.getElementById("turn-t/1")).toHaveTextContent("Downstream literal passage"));
      expect(scroll).toHaveBeenCalled(); expect(fetcher).toHaveBeenCalledTimes(2);
      expect(new URL(String(fetcher.mock.calls[1]?.[0]), "http://local.invalid").pathname).toBe("/sessions/s%2F1");
    } finally { HTMLElement.prototype.scrollIntoView = previous; }
  });
  test("proposed real route remains behind the existing login gate", () => {
    window.history.replaceState({}, "", "/search"); const fetcher = vi.fn(); vi.stubGlobal("fetch", fetcher);
    render(<App />); expect(screen.getByLabelText("API key")).toBeInTheDocument();
    expect(screen.queryByRole("searchbox")).toBeNull(); expect(fetcher).not.toHaveBeenCalled();
  });
  test("actual Search → SessionDetail finds a late UUID target and renders at most 200 exact source rows", async () => {
    window.history.replaceState({}, "", "/search"); localStorage.setItem("lkbApiKey", "fixture-key");
    const target = { ...hit("Grade 8: percentages, ratios and rates.").turn, _id: "uuid:late/%", speakerLabel: undefined, tStart: 3435, tEnd: 3502 };
    const turns = Array.from({ length: 450 }, (_, i) => ({ ...target, _id: `turn-${i}`, text: `Context row ${i}`, tStart: i * 10, tEnd: i * 10 + 5 })); turns[310] = target;
    const selected = { ...hit(), turnId: target._id, turn: target }, scroll = vi.fn(), previous = HTMLElement.prototype.scrollIntoView;
    HTMLElement.prototype.scrollIntoView = scroll;
    vi.stubGlobal("fetch", vi.fn().mockResolvedValueOnce(reply("grade 8", [selected])).mockResolvedValueOnce(new Response(JSON.stringify({
      session: selected.session, page: null, claims: [], turns,
    }), { headers: { "content-type": "application/json" } })));
    try {
      render(<App />); submit("grade 8"); expect(await screen.findByText("3435–3502 s")).toBeInTheDocument();
      fireEvent.click(screen.getByRole("link", { name: "Open transcript" }));
      await waitFor(() => expect(document.getElementById(`turn-${target._id}`)).toHaveTextContent(target.text));
      expect(document.getElementById(`turn-${target._id}`)).toHaveTextContent("spk:0 · 3435s–3502s");
      expect(document.querySelectorAll("[data-turn-id]")).toHaveLength(200); expect(document.getElementById("turn-turn-0")).toBeNull();
      expect(screen.getByText("Showing turns 211–410 of 450.")).toBeInTheDocument(); expect(scroll).toHaveBeenCalled();
    } finally { HTMLElement.prototype.scrollIntoView = previous; }
  });
  test("unanchored transcript keeps its first 200 rows and unknown/malformed anchors remain safe", async () => {
    const base = detail("old", "first"), turns = Array.from({ length: 350 }, (_, i) => ({ ...base.turns[0]!, _id: `row-${i}`, text: `Row ${i}` }));
    const fetcher = vi.fn().mockImplementation(async () => new Response(JSON.stringify({ ...base, turns }), { headers: { "content-type": "application/json" } })); vi.stubGlobal("fetch", fetcher);
    const page = showSource(); await screen.findByText("Row 0"); expect(document.querySelectorAll("[data-turn-id]")).toHaveLength(200); expect(screen.queryByText("Row 209")).toBeNull(); page.unmount();
    for (const fragment of ["unknown-turn", "%E0%A4%A"]) {
      const source = showSource(`/sessions/old#turn-${fragment}`);
      expect(await screen.findByText("This cited passage was not found in this session.")).toBeInTheDocument();
      expect(document.querySelectorAll("[data-turn-id]")).toHaveLength(200); source.unmount();
    }
  });
  test("session navigation hides the old loaded transcript during the next source read", async () => {
    const pending = deferred<Response>(); vi.stubGlobal("fetch", vi.fn().mockResolvedValueOnce(new Response(JSON.stringify(detail("old", "Private previous source"))))
      .mockReturnValueOnce(pending.promise)); showSource(); await screen.findByText("Private previous source");
    fireEvent.click(screen.getByRole("button", { name: "Next session" })); expect(screen.queryByText("Private previous source")).toBeNull();
    await act(async () => { pending.resolve(new Response(JSON.stringify(detail("new", "New session source")))); });
    expect(await screen.findByText("New session source")).toBeInTheDocument();
  });
  test("a delayed old session read cannot replace the requested new session", async () => {
    const pending = deferred<Response>(); vi.stubGlobal("fetch", vi.fn().mockReturnValueOnce(pending.promise)
      .mockResolvedValueOnce(new Response(JSON.stringify(detail("new", "New session source"))))); showSource();
    fireEvent.click(screen.getByRole("button", { name: "Next session" })); await screen.findByText("New session source");
    await act(async () => { pending.resolve(new Response(JSON.stringify(detail("old", "Delayed old source")))); });
    expect(screen.queryByText("Delayed old source")).toBeNull(); expect(screen.getByText("New session source")).toBeInTheDocument();
  });
  test("a delayed old-key source read cannot overwrite the new-key source view", async () => {
    const pending = deferred<Response>(), fetcher = vi.fn().mockReturnValueOnce(pending.promise)
      .mockResolvedValueOnce(new Response(JSON.stringify(detail("old", "Replacement-key source")))); vi.stubGlobal("fetch", fetcher); showSource();
    fireEvent.click(screen.getByRole("button", { name: "Replace key" })); await screen.findByText("Replacement-key source");
    await act(async () => { pending.resolve(new Response(JSON.stringify(detail("old", "Delayed private old-key source")))); });
    expect(screen.queryByText("Delayed private old-key source")).toBeNull(); expect(fetcher.mock.calls[1]?.[1].headers.authorization).toBe("Bearer replacement-key");
  });
});
