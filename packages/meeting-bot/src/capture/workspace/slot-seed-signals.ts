import type { EventEmitter } from "node:events";

export const SEED_CLEANUP_SIGNALS = ["SIGINT", "SIGTERM", "SIGBREAK"] as const;

/**
 * Removes seeded session files when the process is interrupted or exits, not just on the normal path.
 * After cleanup the signal is re-raised if nothing else listens for it, so Ctrl+C / kill still terminate.
 * Returns an uninstaller; call it once the normal cleanup has run.
 */
export function installSeedCleanup(cleanup: () => void, proc: Pick<EventEmitter, "on" | "off" | "listenerCount"> & { pid?: number } = process,
  kill: (pid: number, signal: string) => void = (pid, signal) => { process.kill(pid, signal); }): () => void {
  const handlers = new Map<string, () => void>();
  const onExit = () => { try { cleanup(); } catch { /* best effort at exit */ } };
  function uninstall(): void {
    for (const [signal, handler] of handlers) proc.off(signal, handler);
    handlers.clear();
    proc.off("exit", onExit);
  }
  for (const signal of SEED_CLEANUP_SIGNALS) {
    const handler = () => {
      onExit();
      uninstall();
      if (proc.listenerCount(signal) === 0) kill(proc.pid ?? process.pid, signal);
    };
    handlers.set(signal, handler);
    proc.on(signal, handler);
  }
  proc.on("exit", onExit);
  return uninstall;
}
