import { render, screen, cleanup, fireEvent } from "@testing-library/react";
import { beforeEach, afterEach, expect, test, vi } from "vitest";
import { MemoryRouter } from "react-router-dom";
import { AuthProvider } from "../../auth/AuthContext.js";
import { CuratedCollections } from "./CuratedCollections.js";
const fetchMock = vi.fn(); const reply = (body: unknown, status = 200) => ({ ok: status < 400, status, json: async () => body });
beforeEach(() => { fetchMock.mockReset(); vi.stubGlobal("fetch", fetchMock); localStorage.setItem("lkbApiKey", "k"); });
afterEach(() => { cleanup(); vi.unstubAllGlobals(); localStorage.clear(); });
const mount = () => render(<MemoryRouter><AuthProvider><CuratedCollections /></AuthProvider></MemoryRouter>);
test("saved server collection and member links survive reload; create uses member choice data", async () => {
  const saved = { id: "c", title: "My collection", revision: 1, updatedAt: "2026-10-14T00:00:00.000Z", members: [{ kind: "document", id: "a:doc", available: true }] };
  fetchMock.mockImplementation((url: string, opts: RequestInit) => Promise.resolve(reply(opts.method === "PUT" ? { ...JSON.parse(opts.body as string), id: "a".repeat(64), revision: 1 } : url.endsWith("/members") ? { members: [{ kind: "document", id: "a:doc", title: "Admissions" }], truncated: false } : { collections: [saved], truncated: false })));
  mount(); expect(await screen.findByRole("heading", { name: "My collection" })).toBeInTheDocument(); expect(screen.getByRole("link", { name: "Admissions" })).toHaveAttribute("href", "/knowledge/documents/a%3Adoc");
  fireEvent.click(screen.getByRole("button", { name: "Reload saved collections" })); expect(await screen.findByRole("heading", { name: "My collection" })).toBeInTheDocument();
  fireEvent.change(screen.getByLabelText("Collection title"), { target: { value: "New" } }); fireEvent.click(screen.getByRole("checkbox")); fireEvent.click(screen.getByRole("button", { name: "Save collection" }));
  await vi.waitFor(() => expect(fetchMock.mock.calls.some(([, opts]) => opts.method === "PUT")).toBe(true));
  const [, opts] = fetchMock.mock.calls.find(([, opts]) => opts.method === "PUT")!; expect(JSON.parse(opts.body).members).toEqual([{ kind: "document", id: "a:doc" }]);
});
test("unauthenticated collection view makes no requests", () => { localStorage.clear(); mount(); expect(screen.getByText("Sign in to view collections.")).toBeInTheDocument(); expect(fetchMock).not.toHaveBeenCalled(); });
test("server member unavailable remains inert and never becomes a guessed profile link", async () => {
  fetchMock.mockImplementation((url: string) => Promise.resolve(reply(url.endsWith("/members") ? { members: [], truncated: false } : { collections: [{ id: "c", title: "Missing", revision: 1, updatedAt: "now", members: [{ kind: "speaker", id: "foreign", available: false }] }], truncated: false })));
  mount(); expect(await screen.findByText(/Some saved records are unavailable/)).toBeInTheDocument(); expect(screen.queryByRole("link")).toBeNull();
  expect(screen.queryByText(/foreign/)).toBeNull(); expect(screen.getByRole("button", { name: "Edit collection" })).toBeDisabled();
});
test("lost create response retries the same stable draft id instead of creating a duplicate", async () => {
  let writes = 0; const paths: string[] = [];
  fetchMock.mockImplementation((url: string, opts: RequestInit) => {
    if (opts.method === "PUT") { paths.push(url); writes++; if (writes === 1) throw new Error("response lost"); return Promise.resolve(reply({ id: "a".repeat(64), title: "Draft", members: [], revision: 1 })); }
    return Promise.resolve(reply(url.endsWith("/members") ? { members: [], truncated: false } : { collections: [], truncated: false }));
  });
  mount(); expect(await screen.findByText("No saved collections yet.")).toBeInTheDocument();
  fireEvent.change(screen.getByLabelText("Collection title"), { target: { value: "Draft" } }); fireEvent.click(screen.getByRole("button", { name: "Save collection" }));
  expect(await screen.findByRole("alert")).toHaveTextContent("response lost"); fireEvent.click(screen.getByRole("button", { name: "Save collection" }));
  await vi.waitFor(() => expect(paths.length).toBe(2)); expect(paths[0]).toBe(paths[1]);
});

test.each([false, true])("editing preserves saved members outside bounded choices unless explicitly removed (remove=%s)", async remove => {
  const id = "b".repeat(64);
  const members = [{ kind: "document", id: "outside-window", available: true }, { kind: "topic", id: "visible-topic", available: true }];
  fetchMock.mockImplementation((url: string, opts: RequestInit) => Promise.resolve(reply(opts.method === "PUT"
    ? { ...JSON.parse(opts.body as string), id, revision: 5 }
    : url.endsWith("/members") ? { members: [{ kind: "topic", id: "visible-topic", title: "Visible topic" }], truncated: true }
      : { collections: [{ id, title: "Saved", revision: 4, updatedAt: "now", members }], truncated: false })));
  mount(); await screen.findByRole("heading", { name: "Saved" });
  fireEvent.click(screen.getByRole("button", { name: "Edit collection" }));
  const outside = screen.getByRole("checkbox", { name: "outside-window · document" });
  expect(outside).toBeChecked(); expect(screen.getByRole("checkbox", { name: "Visible topic · topic" })).toBeChecked();
  expect(screen.getByText(/They remain selected unless you remove them/)).toBeInTheDocument();
  if (remove) fireEvent.click(outside);
  fireEvent.change(screen.getByLabelText("Collection title"), { target: { value: "Renamed" } });
  fireEvent.click(screen.getByRole("button", { name: "Save collection" }));
  await vi.waitFor(() => expect(fetchMock.mock.calls.some(([, opts]) => opts.method === "PUT")).toBe(true));
  const [path, opts] = fetchMock.mock.calls.find(([, opts]) => opts.method === "PUT")!;
  expect(path).toContain(`/knowledge/collections/${id}`);
  expect(JSON.parse(opts.body)).toEqual({ title: "Renamed", expectedRevision: 4, members: remove
    ? [{ kind: "topic", id: "visible-topic" }]
    : [{ kind: "document", id: "outside-window" }, { kind: "topic", id: "visible-topic" }] });
});
