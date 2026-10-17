import { runAutonomousCycles } from "../webinar/scheduler/service.mjs";
import { createWatchedSourceTickHost, type WatchedHostOptions } from "./host.js";

/** Passive on import. The trusted API host starts this after listening and drains it on shutdown. */
export async function runWatchedSourceSupervisor(options: WatchedHostOptions & {
  signal: AbortSignal;
  log?: (message: string) => void;
}): Promise<void> {
  if (options.env.LKB_WATCHED_WORKER_ENABLED !== "1" || options.signal.aborted) return;
  const tick = createWatchedSourceTickHost(options);
  const log = (message: string) => { try { options.log?.(message); } catch { /* Logging cannot cancel acquisition. */ } };
  await runAutonomousCycles({
    signal: options.signal,
    async cycle() {
      if (options.signal.aborted) return;
      try {
        const result = await tick();
        log(result.status === "disabled" ? "Watched worker disabled." :
          result.status === "attention" ? "Watched worker requires attention." :
          result.status === "queued" ? "Watched worker queued source jobs; consumption pending." :
          result.status === "busy" ? "Watched worker already active." : "Watched worker checked due sources.");
      } catch { log("Watched worker unavailable or unauthorized; no successful cycle established."); }
    },
    // The existing five-minute cadence backs off failed acquisition and awaits each complete tick.
    // Abort stops later ticks; an initialized guarded fetch is drained, never detached or replayed.
    drain: async () => undefined,
  });
}
