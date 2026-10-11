/**
 * ISS-T037UI-001 (web half): optimistic-concurrency preconditions, tested through the REAL shared apiFetch with a stubbed global fetch,
 * so the exact request headers and response-header handling are what the browser would see. Contract: GET ETag -> PUT If-Match (verbatim)
 * or If-None-Match: * when the GET had none; 412 / 428 / missing-ETag handling as in the manifest.
 */
import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, beforeEach, expect, test, vi } from "vitest";
import { AuthProvider } from "../../auth/AuthContext.js";
import { JoinRulesPage } from "./JoinRulesPage.js";

const RULES = { version: 1, ownDomains: ["corp.example.com"], rules: [{ id: "allow-asha", effect: "allow", match: { email: "asha@example.com" } }] };
const EMPTY = { version: 1, ownDomains: [], rules: [] };
const STATE = { approvedSenders: [], approvedDomains: [], optedOutEventIds: [] };
const HEX = (c: string) => `"${c.repeat(64)}"`;
interface Req { method: string; headers: Record<string, string>; body: unknown }
let reqs: Req[];
let getResponses: { status?: number; etag: string | null; ruleSet: unknown }[];
let putResponses: { status: number; etag?: string | null; json?: unknown }[];
const putReqs = () => reqs.filter(r => r.method === "PUT");

const jsonRes = (status: number, json: unknown, etag?: string | null) => new Response(JSON.stringify(json), { status, headers: { "content-type": "application/json", ...(etag ? { etag } : {}) } });

beforeEach(() => {
  reqs = []; getResponses = []; putResponses = [];
  vi.stubGlobal("fetch", vi.fn(async (_url: string, init: RequestInit) => {
    const method = init.method ?? "GET";
    reqs.push({ method, headers: Object.fromEntries(Object.entries((init.headers ?? {}) as Record<string, string>)), body: init.body ? JSON.parse(init.body as string) : undefined });
    if (method === "PUT") { const r = putResponses.shift() ?? { status: 200, etag: HEX("f") }; return jsonRes(r.status, r.json ?? { ruleSet: RULES, state: STATE }, r.etag); }
    const g = getResponses.length > 1 ? getResponses.shift()! : getResponses[0]!;
    return jsonRes(g.status ?? 200, { ruleSet: g.ruleSet, state: STATE }, g.etag);
  }));
  localStorage.setItem("lkbApiKey", "sample-key");
});
afterEach(() => { cleanup(); localStorage.clear(); vi.unstubAllGlobals(); });
const mount = () => render(<AuthProvider><JoinRulesPage /></AuthProvider>);
const edit = (v: string) => fireEvent.change(screen.getByLabelText("Rule 1 name"), { target: { value: v } });
const save = () => fireEvent.click(screen.getByRole("button", { name: "Save rules" }));
const alertText = () => screen.getAllByRole("alert").map(a => a.textContent).join("|");

test("PUT carries If-Match equal to the GET's ETag byte for byte, quotes included, and no If-None-Match", async () => {
  getResponses = [{ etag: HEX("a"), ruleSet: RULES }];
  mount(); await screen.findByLabelText("Rule 1 name");
  edit("renamed"); save(); await screen.findByText(/Saved\./);
  expect(putReqs()).toHaveLength(1);
  expect(putReqs()[0]!.headers["If-Match"]).toBe(HEX("a"));
  expect(putReqs()[0]!.headers["If-Match"]).toMatch(/^"[0-9a-f]{64}"$/);
  expect(putReqs()[0]!.headers["If-None-Match"]).toBeUndefined();
  expect(putReqs()[0]!.headers.authorization).toBe("Bearer sample-key");
});

test("no ETag on an empty (unstored) rule set: first save sends If-None-Match: * and no If-Match", async () => {
  getResponses = [{ etag: null, ruleSet: EMPTY }, { etag: HEX("b"), ruleSet: RULES }];
  mount(); await screen.findByText(/There are no rules/);
  fireEvent.click(screen.getByRole("button", { name: "Add rule" }));
  fireEvent.change(screen.getByLabelText("Rule 1 platform"), { target: { value: "zoom" } });
  save(); await screen.findByText(/Saved\./);
  expect(putReqs()).toHaveLength(1);
  expect(putReqs()[0]!.headers["If-None-Match"]).toBe("*");
  expect(putReqs()[0]!.headers["If-Match"]).toBeUndefined();
});

test("a second save uses the ETag from the first PUT response, not the stale GET one", async () => {
  getResponses = [{ etag: HEX("a"), ruleSet: RULES }]; // every re-fetch is deliberately stale
  putResponses = [{ status: 200, etag: HEX("c") }, { status: 200, etag: HEX("d") }];
  mount(); await screen.findByLabelText("Rule 1 name");
  edit("one"); save(); await screen.findByText(/Saved\./);
  edit("two"); save(); await waitFor(() => expect(putReqs()).toHaveLength(2));
  expect(putReqs().map(r => r.headers["If-Match"])).toEqual([HEX("a"), HEX("c")]);
});

test("a success response with no ETag: the ETag comes from the re-fetch, never guessed", async () => {
  getResponses = [{ etag: HEX("a"), ruleSet: RULES }, { etag: HEX("e"), ruleSet: RULES }];
  putResponses = [{ status: 200, etag: null }];
  mount(); await screen.findByLabelText("Rule 1 name");
  edit("one"); save(); await screen.findByText(/Saved\./);
  edit("two"); save(); await waitFor(() => expect(putReqs()).toHaveLength(2));
  expect(putReqs()[1]!.headers["If-Match"]).toBe(HEX("e"));
});

test("412: refused once, never retried, edits kept, plain message; reload fetches again and adopts the new ETag", async () => {
  const theirs = { ...RULES, rules: [{ id: "theirs", effect: "deny", match: { platform: "zoom" } }] };
  getResponses = [{ etag: HEX("a"), ruleSet: RULES }, { etag: HEX("9"), ruleSet: theirs }];
  putResponses = [{ status: 412, json: { error: "precondition-failed", currentEtag: HEX("9") }, etag: HEX("9") }];
  mount(); await screen.findByLabelText("Rule 1 name");
  edit("my-unsaved-edit"); save();
  const dialog = await screen.findByRole("alertdialog", { name: "Rules changed on the server" });
  expect(dialog).toHaveTextContent("The rules were changed by someone else since you opened them");
  await new Promise(r => setTimeout(r, 60));
  expect(putReqs()).toHaveLength(1);
  expect(screen.getByLabelText("Rule 1 name")).toHaveValue("my-unsaved-edit");
  expect(reqs.filter(r => r.method === "GET")).toHaveLength(1);
  fireEvent.click(within(dialog).getByRole("button", { name: /Reload latest rules/ }));
  await waitFor(() => expect(screen.getByLabelText("Rule 1 name")).toHaveValue("theirs"));
  edit("re-applied"); save(); await screen.findByText(/Saved\./);
  expect(putReqs().map(r => r.headers["If-Match"])).toEqual([HEX("a"), HEX("9")]);
});

test("412 when creating (If-None-Match: * lost the race) is handled the same way", async () => {
  getResponses = [{ etag: null, ruleSet: EMPTY }];
  putResponses = [{ status: 412, json: { error: "precondition-failed", currentEtag: HEX("9") }, etag: HEX("9") }];
  mount(); await screen.findByText(/There are no rules/);
  fireEvent.click(screen.getByRole("button", { name: "Add rule" }));
  fireEvent.change(screen.getByLabelText("Rule 1 platform"), { target: { value: "zoom" } });
  save(); await screen.findByRole("alertdialog", { name: "Rules changed on the server" });
  expect(putReqs()).toHaveLength(1); expect(putReqs()[0]!.headers["If-None-Match"]).toBe("*");
});

test("428: a clear error, edits kept, exactly one PUT, no retry loop", async () => {
  getResponses = [{ etag: HEX("a"), ruleSet: RULES }];
  putResponses = [{ status: 428, json: { error: "precondition-required" } }];
  mount(); await screen.findByLabelText("Rule 1 name");
  edit("kept"); save();
  await waitFor(() => expect(alertText()).toContain("without a version check"));
  await new Promise(r => setTimeout(r, 60));
  expect(putReqs()).toHaveLength(1);
  expect(screen.getByLabelText("Rule 1 name")).toHaveValue("kept");
  expect(screen.queryByRole("alertdialog")).toBeNull();
});

test("stored rule set but no ETag header (old API / CORS not exposing it): saving is unavailable, no PUT is ever sent", async () => {
  getResponses = [{ etag: null, ruleSet: RULES }];
  mount(); await screen.findByLabelText("Rule 1 name");
  edit("changed");
  expect(alertText()).toContain("Saving is unavailable");
  expect(screen.getByRole("button", { name: "Save rules" })).toBeDisabled();
  save(); await new Promise(r => setTimeout(r, 60));
  expect(putReqs()).toHaveLength(0);
});

test.each([[401, "Sign in with an API key"], [403, "cannot change them"], [503, "Rule editing is not available"], [500, "could not be saved"]])("PUT status %i keeps its existing handling (no precondition message)", async (status, text) => {
  getResponses = [{ etag: HEX("a"), ruleSet: RULES }];
  putResponses = [{ status, json: { error: "x" } }];
  mount(); await screen.findByLabelText("Rule 1 name");
  edit("kept"); save();
  await waitFor(() => expect(document.body.textContent).toContain(text));
  expect(screen.queryByRole("alertdialog")).toBeNull();
  expect(putReqs()).toHaveLength(1);
});
