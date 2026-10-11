import { useCallback, useEffect, useRef, useState } from "react";

export interface Loaded<T> { data: T | undefined; error: unknown; loading: boolean; noKey: boolean; reload(): void }

/**
 * One request per load for one section. `reload` is the manual retry: a click while a request is in flight does nothing,
 * so one click is one fetch. With `pollMs` the same guarded call repeats; a failed refresh keeps the last data. No key, no fetch.
 */
export function useLoad<T>(apiKey: string | null, load: (key: string) => Promise<T>, pollMs = 0): Loaded<T> {
  const [data, setData] = useState<T | undefined>();
  const [error, setError] = useState<unknown>(null);
  const [loading, setLoading] = useState(Boolean(apiKey));
  const loadRef = useRef(load); loadRef.current = load;
  const busy = useRef(false), live = useRef(0);
  const run = useCallback(async () => {
    if (!apiKey || busy.current) return;
    busy.current = true; const mine = live.current;
    try { const result = await loadRef.current(apiKey); if (mine === live.current) { setData(result); setError(null); } }
    catch (e) { if (mine === live.current) setError(e ?? new Error("failed")); }
    finally { if (mine === live.current) { busy.current = false; setLoading(false); } }
  }, [apiKey]);
  useEffect(() => {
    const mine = ++live.current; busy.current = false;
    setData(undefined); setError(null); setLoading(Boolean(apiKey));
    void run();
    const timer = pollMs > 0 ? setInterval(() => void run(), pollMs) : undefined;
    return () => { if (live.current === mine) live.current++; if (timer) clearInterval(timer); };
  }, [apiKey, run, pollMs]);
  return { data, error, loading, noKey: !apiKey, reload: () => void run() };
}
