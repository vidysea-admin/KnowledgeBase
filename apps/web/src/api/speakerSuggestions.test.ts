import { afterEach, describe, expect, test, vi } from "vitest";
import { decideSpeakerSuggestion, listSpeakerSuggestions } from "./speakerSuggestions.js";

const row = { id: "i1", sessionId: "s 1", speakerRef: "spk:1", suggestedName: "Priya Nair", status: "suggested", quotes: [{ turnId: "t0", quote: "q q q", kind: "address" }] };
const reply = (body: unknown, status = 200) => vi.spyOn(globalThis, "fetch").mockResolvedValue(new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } }));
afterEach(() => vi.restoreAllMocks());

describe("speaker suggestions client", () => {
  test("list: authenticated GET on the encoded session path; a valid body parses", async () => {
    const f = reply({ suggestions: [row] });
    const out = await listSpeakerSuggestions("key", "s 1");
    expect(out[0]!.suggestedName).toBe("Priya Nair");
    const [url, init] = f.mock.calls[0]!;
    expect(String(url)).toContain("/sessions/s%201/speaker-suggestions");
    expect((init!.headers as Record<string, string>).authorization).toBe("Bearer key");
  });
  test("list: a malformed or inconsistently-final row is an error, never a name", async () => {
    reply({ suggestions: [{ ...row, status: "confirmed" }] });
    await expect(listSpeakerSuggestions("key", "s1")).rejects.toThrow();
    reply({ suggestions: [{ ...row, status: "suggested", finalProvenance: "human-confirmed" }] });
    await expect(listSpeakerSuggestions("key", "s1")).rejects.toThrow();
    reply({ suggestions: [{ ...row, quotes: [{}] }] });
    await expect(listSpeakerSuggestions("key", "s1")).rejects.toThrow();
    reply({ nope: 1 });
    await expect(listSpeakerSuggestions("key", "s1")).rejects.toThrow();
  });
  test("decide: POSTs to confirm/reject and checks the server reports the expected state", async () => {
    const f = reply({ suggestion: { ...row, id: "i1", status: "confirmed", finalProvenance: "human-confirmed" }, changed: true });
    await expect(decideSpeakerSuggestion("key", "s1", "i1", "confirm")).resolves.toBe("confirmed");
    expect(f.mock.calls[0]![1]!.method).toBe("POST");
    expect(String(f.mock.calls[0]![0])).toContain("/sessions/s1/speaker-suggestions/i1/confirm");
    reply({ suggestion: { ...row, status: "rejected" }, changed: true });
    await expect(decideSpeakerSuggestion("key", "s1", "i1", "reject")).resolves.toBe("rejected");
    reply({ suggestion: { ...row, status: "suggested" }, changed: false });
    await expect(decideSpeakerSuggestion("key", "s1", "i1", "confirm")).rejects.toThrow();
  });
  test("decide: a 409 surfaces as an ApiError with that status", async () => {
    reply({ error: "conflict" }, 409);
    await expect(decideSpeakerSuggestion("key", "s1", "i1", "confirm")).rejects.toMatchObject({ status: 409 });
  });
});
