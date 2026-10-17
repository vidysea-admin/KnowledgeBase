import { describe, test, expect, vi, beforeEach } from "vitest";
import { apiFetch } from "../../api/client.js";
import { createChampionship, freezeChampionshipBank, startChampionshipTrial, scoreChampionshipTrial, importChampionshipTrial } from "./client.js";
vi.mock("../../api/client.js", () => ({ apiFetch: vi.fn() }));
const fetchMock = vi.mocked(apiFetch);
beforeEach(() => fetchMock.mockReset());
describe("championship downstream client", () => {
  test("reloads server-authoritative saved event and reuses exact Compete start/score before import", async () => {
    const event = { _id: "event/a", revision: 2, bankDigest: "a".repeat(64), questions: [{ id: "q", text: "Exact question?" }], counsellors: [{ id: "c", name: "Counsellor" }] };
    const report = { status: "incomplete", plannedPairs: 1, recordedPairs: 0, notice: "Internal only", unresolvedGates: ["Real judges"], trials: [], credibility: "internal", publicResult: false };
    fetchMock.mockResolvedValueOnce(event).mockResolvedValueOnce({ event, report });
    const result = await createChampionship("key", { title: "plan" }); expect(result.event).toEqual(event);
    expect(fetchMock.mock.calls[1]).toEqual(["/championship/event%2Fa", "key"]);
    fetchMock.mockResolvedValue({ evalRunId: "run/a", aiAnswer: { text: "Original response" } });
    await startChampionshipTrial("key", "Exact question?", "Counsellor");
    expect(fetchMock).toHaveBeenLastCalledWith("/compete/start", "key", { method: "POST", body: { question: "Exact question?", counsellor: { name: "Counsellor" } } });
    await scoreChampionshipTrial("key", "run/a", "Original human answer", 4, 3);
    expect(fetchMock).toHaveBeenLastCalledWith("/compete/run%2Fa/score", "key", { method: "POST", body: { counsellorAnswer: { text: "Original human answer" }, score: { ai: 4, counsellor: 3 } } });
    fetchMock.mockResolvedValue({ event: { ...event, revision: 3, frozenAt: "2026-10-14T00:01:00Z" }, report });
    await importChampionshipTrial("key", event, "q", "c", "run/a");
    expect(fetchMock).toHaveBeenLastCalledWith("/championship/event%2Fa/trials", "key", { method: "POST", body: { expectedRevision: 2, questionId: "q", counsellorId: "c", evalRunId: "run/a" } });
    await freezeChampionshipBank("key", event);
    expect(fetchMock).toHaveBeenLastCalledWith("/championship/event%2Fa/freeze", "key", { method: "POST", body: { expectedRevision: 2, bankDigest: event.bankDigest } });
  });
  test("malformed downstream view and Compete response refuse", async () => {
    fetchMock.mockResolvedValue({ evalRunId: "", aiAnswer: {} });
    await expect(startChampionshipTrial("key", "question", "name")).rejects.toThrow("Malformed Compete");
    fetchMock.mockResolvedValueOnce({ _id: "e" }).mockResolvedValueOnce({ event: { _id: "e" }, report: {} });
    await expect(createChampionship("key", {})).rejects.toThrow("Malformed championship");
  });
});
