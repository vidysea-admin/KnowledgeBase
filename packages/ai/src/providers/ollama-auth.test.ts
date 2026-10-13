import { test } from "node:test";
import assert from "node:assert/strict";
import { OllamaProvider } from "./ollama.js";
import { fakeTransport } from "../testUtils.js";

const chat = { status: 200, body: { message: { content: "ok" } } };
const embed = { status: 200, body: { embeddings: [[1, 2]] } };
const job = { kind: "evaluator", messages: [{ role: "user" as const, content: "hi" }] };

test("U0.10: no apiKey -> complete/embed headers are exactly the original content-type pair", async () => {
  for (const cfg of [{}, { apiKey: undefined }, { apiKey: "" }, { apiKey: "   " }]) {
    const t = fakeTransport(chat);
    await new OllamaProvider(t, cfg).complete(job);
    assert.deepEqual(t.calls[0]!.headers, { "content-type": "application/json" });
    const e = fakeTransport(embed);
    await new OllamaProvider(e, cfg).embed({ kind: "embedding", texts: ["a"] });
    assert.deepEqual(e.calls[0]!.headers, { "content-type": "application/json" });
  }
});

test("U0.10: apiKey set -> authorization Bearer header on complete and embed, localhost default kept", async () => {
  const t = fakeTransport(chat);
  await new OllamaProvider(t, { apiKey: "k-test" }).complete(job);
  assert.deepEqual(t.calls[0]!.headers, { "content-type": "application/json", authorization: "Bearer k-test" });
  assert.equal(t.calls[0]!.url, "http://localhost:11434/api/chat");
  const e = fakeTransport(embed);
  await new OllamaProvider(e, { apiKey: "k-test" }).embed({ kind: "embedding", texts: ["a"] });
  assert.equal((e.calls[0]!.headers as Record<string, string>).authorization, "Bearer k-test");
});

test("U0.10: the key is never read from the environment implicitly", async () => {
  const prev = process.env.OLLAMA_API_KEY;
  process.env.OLLAMA_API_KEY = "env-key";
  try {
    const t = fakeTransport(chat);
    await new OllamaProvider(t).complete(job);
    assert.deepEqual(t.calls[0]!.headers, { "content-type": "application/json" });
  } finally { if (prev === undefined) delete process.env.OLLAMA_API_KEY; else process.env.OLLAMA_API_KEY = prev; }
});
