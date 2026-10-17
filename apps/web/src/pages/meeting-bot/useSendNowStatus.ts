import { useEffect, useState } from "react";
import { ApiError } from "../../api/client.js";
import { getSendNowStatus, SEND_NOW_JOB_ID } from "../../api/send-now.js";

export const STATUS_POLL_MS = 2000;
export const STATUS_MAX_POLLS = 60;
export const STATUS_REQUEST_MS = 10_000;
type Progress = { apiKey: string; jobId: string; text: string } | null;
const messages = {
  launching: "Launching. The recorder has not reported running. Meeting admission is unknown.",
  running: "Running. The recorder process is alive. Meeting admission is unknown.",
  "not-running": "Not running. This does not establish whether the recording finished or failed. Meeting admission is unknown.",
};

/** Sequential, bounded polling. Cleanup cancels timers and ignores outstanding HTTP results. */
export function useSendNowStatus(apiKey: string | null, jobId: string | null): string | null {
  const [progress, setProgress] = useState<Progress>(null);
  useEffect(() => {
    if (!apiKey || !jobId || !SEND_NOW_JOB_ID.test(jobId)) return;
    let cancelled = false, count = 0;
    let timer: ReturnType<typeof setTimeout> | undefined;
    let deadline: ReturnType<typeof setTimeout> | undefined;
    const show = (text: string) => { if (!cancelled) setProgress({ apiKey, jobId, text }); };
    async function poll(): Promise<void> {
      count++;
      try {
        const value = await Promise.race([
          getSendNowStatus(apiKey, jobId!),
          new Promise<never>((_, reject) => { deadline = setTimeout(() => reject(new Error("status request timed out")), STATUS_REQUEST_MS); }),
        ]);
        clearTimeout(deadline);
        if (cancelled) return;
        show(messages[value.status]);
        if (value.status === "not-running") return;
        if (count >= STATUS_MAX_POLLS) { show(`${messages[value.status]} Automatic status checks stopped after ${STATUS_MAX_POLLS} requests.`); return; }
        timer = setTimeout(() => { void poll(); }, STATUS_POLL_MS);
      } catch (e) {
        clearTimeout(deadline);
        const unavailable = e instanceof ApiError && [404, 503].includes(e.status);
        show(unavailable
          ? "Status is unavailable on this server. The launch remains unconfirmed; meeting admission is unknown."
          : "Status could not be checked. Automatic checks stopped; meeting admission is unknown.");
      }
    }
    void poll();
    return () => { cancelled = true; clearTimeout(timer); clearTimeout(deadline); };
  }, [apiKey, jobId]);
  return progress?.apiKey === apiKey && progress.jobId === jobId ? progress.text : null;
}
