/** Worker for file-job-queue.pid-reuse.test.ts (ISS-JOBQSTALL-002): takes the queue lock, then blocks forever exactly at the tmp->queue rename, so the parent can terminate it. */
import { parentPort, workerData } from "node:worker_threads";
import { FileJobQueue } from "./file-job-queue.js";
import { realQueueFs, type QueueFs } from "./queue-store.js";

const blocked: QueueFs = new Proxy(realQueueFs, { get(t, p: keyof QueueFs) { return (...a: any[]) => {
  if (p === "rename" && String(a[0]).endsWith(".tmp")) { parentPort!.postMessage("at-rename"); Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0); } // never returns
  return (t[p] as any)(...a);
}; } });
const r = new FileJobQueue({ dir: workerData.dir, now: () => 1, lockWaitMs: 0, fs: blocked }).enqueue({ id: "fromWorker", tenantId: "t", payload: "w" });
parentPort!.postMessage("returned:" + JSON.stringify(r));
