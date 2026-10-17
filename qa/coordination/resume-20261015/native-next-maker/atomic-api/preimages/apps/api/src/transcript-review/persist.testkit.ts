// Test support: boots the transcript-review router (the real scoped store over the in-memory Db) behind the real requireAuth.
import express from "express";
import type { Server } from "node:http";
import { requireAuth } from "../auth.js";
import { fakeKeyStore } from "../fixtures.js";
import { memoryDb } from "./memdb.testsupport.js";
import { createTranscriptReviewRouter } from "./router.js";
import { createMongoReviewStore } from "./store.js";
import type { RefreshExecutor } from "./service.js";

export const SESSION = "session-1";
export const keys = fakeKeyStore({
  "key-a": { tenantId: "tenant-A", scopes: ["sessions"] },
  "key-a-second": { tenantId: "tenant-A", scopes: ["sessions"] },
  "key-b": { tenantId: "tenant-B", scopes: ["sessions"] },
  "key-noscope": { tenantId: "tenant-A", scopes: ["ask"] },
});

export function turn(tenantId: string, sessionId: string, i: number, text: string, speakerRef = "spk:0") {
  return { _id: `${tenantId}-${sessionId}-t${i}`, tenantId, sessionId, tStart: i * 10, tEnd: i * 10 + 9, text, speakerRef, extra: "kept" };
}

export function seed(m: ReturnType<typeof memoryDb>): void {
  for (let i = 0; i < 4; i++) m.seed("turns", turn("tenant-A", SESSION, i, `Alpha original ${i}`, i < 2 ? "spk:0" : "spk:1"));
  for (let i = 0; i < 3; i++) m.seed("turns", turn("tenant-B", SESSION, i, `Bravo original ${i}`));
  m.seed("turns", turn("tenant-A", "only-a", 0, "Only A secret"));
}

export async function boot(opts: { refresh?: RefreshExecutor } = {}) {
  const m = memoryDb();
  seed(m);
  const app = express();
  app.use(express.json());
  app.use(requireAuth(keys));
  let tick = 0;
  app.use(createTranscriptReviewRouter({
    store: createMongoReviewStore(m.db), clock: () => new Date(Date.UTC(2026, 9, 14, 9, 0, tick++)).toISOString(),
    ...(opts.refresh ? { refresh: opts.refresh } : {}),
  }));
  const server: Server = app.listen(0, "127.0.0.1");
  await new Promise<void>((r) => server.once("listening", () => r()));
  const addr = server.address();
  const baseUrl = `http://127.0.0.1:${typeof addr === "object" && addr ? addr.port : 0}`;
  const call = (method: string, path: string, key: string | null, body?: unknown, headers: Record<string, string> = {}) =>
    fetch(`${baseUrl}${path}`, {
      method, headers: { ...(key ? { authorization: `Bearer ${key}` } : {}), ...(body === undefined ? {} : { "content-type": "application/json" }), ...headers },
      ...(body === undefined ? {} : { body: JSON.stringify(body) }),
    });
  const get = async (key: string, session = SESSION) => {
    const res = await call("GET", `/sessions/${session}/transcript-review`, key);
    return { res, body: (await res.json()) as { revision: string; turns: { _id: string; text: string; speakerRef: string; speakerLabel?: string }[]; refresh: string } };
  };
  const post = (key: string | null, revision: string, request: Record<string, unknown>, session = SESSION, ifMatch = `"${revision}"`) =>
    call("POST", `/sessions/${session}/transcript-review`, key, { expectedRevision: revision, ...request }, { "if-match": ifMatch });
  return { m, call, get, post, close: () => new Promise<void>((r) => server.close(() => r())) };
}
