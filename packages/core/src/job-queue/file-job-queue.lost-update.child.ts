/** Child process for file-job-queue.lost-update.test.ts: argv = dir, prefix, count. Enqueues `count` jobs, claiming+completing between. Prints JSON. */
import { FileJobQueue } from "./file-job-queue.js";
const [dir, prefix, count] = [process.argv[2]!, process.argv[3]!, Number(process.argv[4])];
const q = new FileJobQueue({ dir, now: () => Date.now(), lockWaitMs: 20_000 });
const enq: string[] = []; const bad: string[] = [];
for (let i = 0; i < count; i++) {
  const r = q.enqueue({ id: `${prefix}-${i}`, tenantId: "t", payload: { prefix, i } });
  if (r.ok) enq.push(`${prefix}-${i}`); else bad.push(r.error.code);
  const c = q.claim(`w-${prefix}`, { tenantId: "t" });
  if (c.ok && c.value) { const d = q.complete({ id: c.value.id, workerId: `w-${prefix}`, attempt: c.value.attempt, tenantId: "t" }); if (!d.ok) bad.push("complete:" + d.error.code); } else if (!c.ok) bad.push("claim:" + c.error.code);
}
process.stdout.write(JSON.stringify({ enq, bad }));
