/** Bounded public-text acquisition; the caller must apply the existing URL/DNS guard first. */
export const SOURCE_READ_TIMEOUT_MS = 10_000;
export const SOURCE_READ_MAX_BYTES = 1_000_000;

export function createSourceReader(options: { apiKey?: string; fetcher?: typeof fetch; timeoutMs?: number; maxBytes?: number } = {}) {
  const timeoutMs = options.timeoutMs ?? SOURCE_READ_TIMEOUT_MS;
  const maxBytes = options.maxBytes ?? SOURCE_READ_MAX_BYTES;
  if (!Number.isSafeInteger(timeoutMs) || timeoutMs < 1 || timeoutMs > SOURCE_READ_TIMEOUT_MS ||
      !Number.isSafeInteger(maxBytes) || maxBytes < 1 || maxBytes > SOURCE_READ_MAX_BYTES) throw new Error("invalid source reader limits");
  return async (url: string): Promise<string> => {
    const controller = new AbortController();
    let reader: ReadableStreamDefaultReader<Uint8Array> | undefined;
    let expired = false;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const deadline = new Promise<never>((_, reject) => {
      timer = setTimeout(() => {
        expired = true; controller.abort();
        void reader?.cancel().catch(() => {});
        reject(new Error("source reader deadline exceeded"));
      }, timeoutMs);
    });
    const acquire = async () => {
      const response = await (options.fetcher ?? fetch)(`https://r.jina.ai/${url}`, {
        headers: options.apiKey ? { authorization: `Bearer ${options.apiKey}` } : {},
        redirect: "manual", signal: controller.signal,
      });
      if (expired) { void response.body?.cancel().catch(() => {}); throw new Error("source reader deadline exceeded"); }
      if (!response.ok || !response.body) {
        void response.body?.cancel().catch(() => {});
        throw new Error("source reader request refused");
      }
      reader = response.body.getReader();
      const declared = response.headers.get("content-length");
      if (declared && /^\d+$/.test(declared) && Number(declared) > maxBytes) throw new Error("source reader size exceeded");
      const decoder = new TextDecoder();
      let bytes = 0, text = "";
      while (true) {
        const next = await reader.read();
        if (expired) throw new Error("source reader deadline exceeded");
        if (next.done) break;
        bytes += next.value.byteLength;
        if (bytes > maxBytes) throw new Error("source reader size exceeded");
        text += decoder.decode(next.value, { stream: true });
      }
      return text + decoder.decode();
    };
    try { return await Promise.race([acquire(), deadline]); }
    catch { throw new Error("source reader acquisition failed"); }
    finally {
      clearTimeout(timer); controller.abort();
      void reader?.cancel().catch(() => {});
    }
  };
}
