/**
 * packages/meeting-bot/src/capture/obs-guard.ts — T-032 OBS guard (docs/meeting-bot-roadmap.md:47).
 * "A killed OBS is recovered before recording starts."
 *
 * Split out of obs-windows.ts (same reason watchdog.ts/controller-state.ts/record-commands.ts are
 * already split out of it: lint:structure's 300-LOC budget, and this is a genuinely separate,
 * OS-agnostic decision surface). obs-windows.ts's `connectObs` wires the real OS-touching probes
 * (process list, launch, graceful close, websocket connect, sentinel file) and calls
 * `ensureObsReady` here; this file has no idea OBS is even an .exe.
 *
 * The 2026-09-24 incident (D-027 / docs/DECISIONS.md:361): a force-killed OBS relaunches in Safe
 * Mode, where obs-websocket is never loaded — so a plain "launch if not running" guard is not
 * enough, and OBS 32 removed `--disable-shutdown-check` (obsproject/obs-studio#12650/#12674), so
 * the old flag-only launch in this codebase was already a silent no-op on the machine this runs
 * on. The fix that actually works on OBS 32 is clearing the unclean-shutdown sentinel file
 * (`%APPDATA%\obs-studio\.sentinel`) before relaunch — confirmed via the OBS forum thread on that
 * removal (obsproject.com/forum/threads/obs-version-32-0-0-removed-disable-shutdown-check.190590).
 *
 * Hard rule, load-bearing for the whole design: NEVER force-kill OBS. A force-kill is what put a
 * Safe-Mode OBS in front of us in the first place — recovering by force-killing it again would
 * just re-arm the same trap. `forceKillObs` exists on the probes only so a test can prove
 * `ensureObsReady` never reaches for it.
 */

export interface ObsGuardProbes {
  /** True if an obs64.exe process is currently running, whatever its state. */
  isObsRunning: () => boolean;
  /** One websocket connect attempt. Resolves once connected; rejects if unreachable. */
  connectWebsocket: () => Promise<void>;
  /** Ask a running OBS to close itself gracefully (CloseMainWindow / WM_CLOSE). Never force-kill. */
  requestGracefulClose: () => Promise<void>;
  /** Clears the OBS unclean-shutdown sentinel so the next launch boots normally instead of
   * offering Safe Mode (the documented replacement for OBS 32's removed --disable-shutdown-check). */
  clearShutdownSentinel: () => void;
  /** Launches OBS as a normal (non-Safe-Mode) process. */
  launchObs: () => void;
  /** MUST NEVER be called by ensureObsReady — present only so a test can assert it stays uninvoked. */
  forceKillObs: () => void;
  sleep: (ms: number) => Promise<void>;
  log: (msg: string) => void;
}

const sleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

/** Post-(re)launch websocket connect retries: 10 x 3s ≈ 30s total, per T-032's "bounded backoff
 * (e.g. 30 s total)". */
const CONNECT_BACKOFF_MS = Array.from({ length: 10 }, () => 3000);
/** Bounded wait after a graceful-close request before giving up on it and launching anyway. */
const CLOSE_WAIT_MS = Array.from({ length: 10 }, () => 1000);

async function connectWithBackoff(probes: ObsGuardProbes): Promise<boolean> {
  for (const delay of CONNECT_BACKOFF_MS) {
    try {
      await probes.connectWebsocket();
      return true;
    } catch {
      await probes.sleep(delay);
    }
  }
  try {
    await probes.connectWebsocket();
    return true;
  } catch {
    return false;
  }
}

async function waitUntilStopped(probes: ObsGuardProbes): Promise<void> {
  // CloseMainWindow is a request, not instant — give it a beat before the first poll rather than
  // checking immediately (which would almost always still see the process mid-exit).
  for (const delay of CLOSE_WAIT_MS) {
    await probes.sleep(delay);
    if (!probes.isObsRunning()) return;
  }
  probes.log("OBS still shows as running after the graceful-close wait — launching anyway");
}

/**
 * Recovers a killed/Safe-Mode OBS before recording starts. Two failure shapes, both ending the
 * same way — start OBS NORMALLY, never force-kill:
 *   (a) OBS not running at all → launch it.
 *   (b) OBS running but the websocket is unreachable → the Safe-Mode symptom → close it
 *       gracefully, wait, clear the sentinel, relaunch.
 * Throws a clear, loud error if OBS still isn't reachable after the bounded backoff; callers must
 * not swallow this into a silent recording-never-started state.
 */
export async function ensureObsReady(probes: ObsGuardProbes): Promise<void> {
  try {
    await probes.connectWebsocket();
    return; // already up and reachable — nothing to recover
  } catch {
    /* fall through to recovery */
  }

  if (probes.isObsRunning()) {
    probes.log("OBS is running but its websocket is unreachable (Safe Mode?) — closing it gracefully");
    await probes.requestGracefulClose();
    await waitUntilStopped(probes);
  } else {
    probes.log("OBS is not running — starting it");
  }
  probes.clearShutdownSentinel();
  probes.launchObs();

  const ok = await connectWithBackoff(probes);
  if (!ok) {
    throw new Error(
      "OBS websocket never came up after a guarded restart — check Tools -> WebSocket Server " +
        "Settings is enabled and the port/password match OBS_WS_URL/OBS_WS_PASSWORD " +
        "(no force-kill was attempted).",
    );
  }
  probes.log("OBS recovered and websocket connected");
}
