import { render, screen, cleanup, fireEvent } from "@testing-library/react";
import { afterEach, beforeEach, expect, test, vi } from "vitest";
import { MemoryRouter } from "react-router-dom";
import { AuthProvider } from "../auth/AuthContext.js";
import { CuratedCollections } from "../pages/knowledge/CuratedCollections.js";

const fetchMock = vi.fn();
const reply = (body: unknown) => ({ ok: true, status: 200, json: async () => body });
beforeEach(() => {
  fetchMock.mockReset();
  vi.stubGlobal("fetch", fetchMock);
  localStorage.setItem("lkbApiKey", "k");
});
afterEach(() => { cleanup(); vi.unstubAllGlobals(); localStorage.clear(); });

test("checker collection kind identity: removing omitted document preserves topic sharing its ID", async () => {
  const id = "d".repeat(64);
  const savedMembers = [
    { kind: "document", id: "shared-record", available: true },
    { kind: "topic", id: "shared-record", available: true },
  ];
  fetchMock.mockImplementation((url: string, opts: RequestInit) => Promise.resolve(reply(
    opts.method === "PUT"
      ? { ...JSON.parse(opts.body as string), id, revision: 8 }
      : url.endsWith("/members")
        ? { members: [{ kind: "topic", id: "shared-record", title: "Visible topic" }], truncated: true }
        : { collections: [{ id, title: "Saved", revision: 7, updatedAt: "now", members: savedMembers }], truncated: false }
  )));
  render(<MemoryRouter><AuthProvider><CuratedCollections /></AuthProvider></MemoryRouter>);
  await screen.findByRole("heading", { name: "Saved" });
  fireEvent.click(screen.getByRole("button", { name: "Edit collection" }));
  const omittedDocument = screen.getByRole("checkbox", { name: "shared-record · document" });
  const visibleTopic = screen.getByRole("checkbox", { name: "Visible topic · topic" });
  expect(omittedDocument).toBeChecked();
  expect(visibleTopic).toBeChecked();
  fireEvent.click(omittedDocument);
  expect(omittedDocument).not.toBeChecked();
  expect(visibleTopic).toBeChecked();
  fireEvent.change(screen.getByLabelText("Collection title"), { target: { value: "Renamed" } });
  fireEvent.click(screen.getByRole("button", { name: "Save collection" }));
  await vi.waitFor(() => expect(fetchMock.mock.calls.some(([, opts]) => opts.method === "PUT")).toBe(true));
  const puts = fetchMock.mock.calls.filter(([, opts]) => opts.method === "PUT");
  expect(puts).toHaveLength(1);
  expect(puts[0][0]).toBe(`/api/knowledge/collections/${id}`);
  expect(JSON.parse(puts[0][1].body)).toEqual({
    title: "Renamed", expectedRevision: 7,
    members: [{ kind: "topic", id: "shared-record" }],
  });
});