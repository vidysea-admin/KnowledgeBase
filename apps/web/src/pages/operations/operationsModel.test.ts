import { expect, test } from "vitest";
import { explorerUrl, readOperationSessions, readOperationView, sessionsForView } from "./operationsModel.js";
import { loadSavedViews, persistSavedViews } from "./savedViews.js";
const row = (id: string, transcribe?: string, index?: string) => ({ _id: id, title: id, date: "", status: { transcribe, index } });
test("worklist readiness requires both stages and preserves pending/unknown/failed rows", () => {
  const rows = readOperationSessions({ sessions: [row("ready", "done", "done"), row("pending", "done", "pending"), row("running", "processing", "pending"), row("unknown", "processing", "alien"), row("failed", "failed", "done"), row("missing")] });
  expect(sessionsForView(rows, "ready").map(r => r.id)).toEqual(["ready"]);
  expect(sessionsForView(rows, "processing").map(r => r.id)).toEqual(["running"]);
  expect(sessionsForView(rows, "attention").map(r => r.id)).toEqual(["unknown", "failed", "missing"]);
  expect(sessionsForView(rows, "all")).toHaveLength(6);
  expect(readOperationSessions({ sessions: [] })).toEqual([]);
});
test.each([null, {}, { sessions: [null] }, { sessions: [row("same"), row("same")] }, { sessions: [{ _id: "a", title: "a" }] }])("refuses malformed sessions without successful empty substitution", raw => {
  expect(() => readOperationSessions(raw)).toThrow();
});
test("query parser allowlists one enum; raw IDs are encoded exactly once", () => {
  expect(readOperationView(new URLSearchParams("view=attention"))).toEqual({ view: "attention", invalid: false });
  for (const query of ["view=ready&view=all", "view=bogus", "tenant=other", "view=all&key=secret"]) expect(readOperationView(new URLSearchParams(query))).toEqual({ view: "all", invalid: true });
  const id = "a/%2F?<& x";
  expect(new URL(explorerUrl(id), "https://local.example").searchParams.get("session")).toBe(id);
});
test("saved storage accepts only unique enum codes and persists no context fields", () => {
  localStorage.clear(); expect(loadSavedViews().views).toEqual([]);
  expect(persistSavedViews(["attention", "ready"])).toBeNull();
  expect(loadSavedViews().views).toEqual(["attention", "ready"]);
  for (const value of ['["attention","attention"]', '["other"]', '{"tenant":"private"}', '[{"session":"private"}]', "bad-json"]) {
    localStorage.setItem("lkbOperationViewPresets.v1", value); expect(loadSavedViews().views).toEqual([]); expect(loadSavedViews().notice).not.toBeNull();
  }
  localStorage.clear();
});
