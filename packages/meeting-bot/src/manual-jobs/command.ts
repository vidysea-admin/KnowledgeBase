/** Immediate CLI consumer of the same authenticated durable host service as the API. */
import { MANUAL_JOB_ID, MANUAL_STATES, type ManualSummary } from "./store.js";
export interface ManualCommandDeps {
  send(meetingUrl: string, until: string): Promise<unknown>;
  list(): unknown | Promise<unknown>;
  detail(jobId: string): unknown | Promise<unknown>;
  cancel(jobId: string): unknown | Promise<unknown>;
  write(line: string): void;
}
export function createHttpManualCommandDeps(env: NodeJS.ProcessEnv = process.env, fetcher: typeof fetch = fetch): ManualCommandDeps {
  const raw = env.LKB_API_URL ?? "http://127.0.0.1:3300";
  let base: URL;
  try { base = new URL(raw); } catch { throw new Error("LKB_API_URL is invalid"); }
  if (base.username || base.password || base.search || base.hash || base.pathname !== "/" ||
    !(base.protocol === "https:" || base.protocol === "http:" && ["localhost", "127.0.0.1", "[::1]"].includes(base.hostname))) throw new Error("LKB_API_URL must be an HTTPS origin or loopback HTTP origin");
  const key = env.LKB_API_KEY;
  if (!key || /[\r\n]/.test(key)) throw new Error("LKB_API_KEY is required");
  const summary = (v: unknown): ManualSummary => {
    const x = v as ManualSummary;
    if (!x || !MANUAL_JOB_ID.test(x.jobId) || !MANUAL_STATES.includes(x.state) || x.joined !== "unknown" || !/^[a-z-]{1,32}$/.test(x.platform) ||
      typeof x.requestedAt !== "string" || typeof x.updatedAt !== "string" || !Number.isFinite(Date.parse(x.requestedAt)) || !Number.isFinite(Date.parse(x.updatedAt))) throw new Error("manual job response invalid");
    return { jobId: x.jobId, platform: x.platform, state: x.state, requestedAt: x.requestedAt, updatedAt: x.updatedAt, joined: "unknown" };
  };
  async function request(route: string, body?: unknown): Promise<any> {
    let response: Response;
    try {
      response = await fetcher(new URL(route, base), { method: body === undefined ? "GET" : "POST", redirect: "error", signal: AbortSignal.timeout(10_000),
        headers: { authorization: `Bearer ${key}`, "content-type": "application/json" }, ...(body === undefined ? {} : { body: JSON.stringify(body) }) });
    } catch { throw new Error("manual job request failed; acceptance is unknown"); }
    if (!response.ok) throw new Error(`manual job API returned HTTP ${response.status}`);
    try { return await response.json(); } catch { throw new Error("manual job response invalid"); }
  }
  const jobRoute = (jobId: string) => { if (!MANUAL_JOB_ID.test(jobId)) throw new Error("invalid manual job id"); return `/calendar/send-now/jobs/${jobId}`; };
  return {
    async send(meetingUrl, until) {
      const v = await request("/calendar/send-now", { meetingUrl, until });
      if (!v || !MANUAL_JOB_ID.test(v.jobId) || v.status !== "launching") throw new Error("manual dispatch response invalid");
      return { jobId: v.jobId, status: "launching", joined: "unknown" };
    },
    async list() { const v = await request("/calendar/send-now/jobs"); if (!v || !Array.isArray(v.jobs) || v.jobs.length > 100) throw new Error("manual jobs response invalid"); return { jobs: v.jobs.map(summary) }; },
    async detail(jobId) { return summary(await request(jobRoute(jobId))); },
    async cancel(jobId) { return summary(await request(`${jobRoute(jobId)}/cancel`, {})); },
    write: line => console.log(line),
  };
}
export async function runManualJobsCommand(args: string[], deps: ManualCommandDeps): Promise<void> {
  const [action, value, until] = args;
  let result: unknown;
  if (action === "send" && value && until && args.length === 3) result = await deps.send(value, until);
  else if (action === "list" && args.length === 1) result = await deps.list();
  else if ((action === "status" || action === "cancel") && value && args.length === 2) result = await deps[action === "status" ? "detail" : "cancel"](value);
  else throw new Error("usage: lkb manual-jobs send <url> <until> | list | status <job-id> | cancel <job-id>");
  deps.write(JSON.stringify(result));
}
