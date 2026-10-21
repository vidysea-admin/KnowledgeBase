/**
 * apps/api/src/youtube-import/quota.ts - YouTube Data API v3 quota ledger. The default daily budget is 9000 of the
 * 10000 free units. Quota resets at midnight Pacific time, so the day key is the Pacific calendar date; the persisted
 * ledger lets a second run on the same day continue from what the first one used.
 */
export const QUOTA_COST = { channelsList: 1, playlistItemsList: 1, captionsList: 50, captionsDownload: 200 } as const;
export const DEFAULT_DAILY_BUDGET = 9000;

export class QuotaStop extends Error {
  constructor(readonly why: "budget" | "api-quota", message: string) { super(message); this.name = "QuotaStop"; }
}

export interface QuotaState { day: string; used: number }
export interface QuotaStore { load(): Promise<QuotaState | undefined>; save(state: QuotaState): Promise<void> }
export interface QuotaLedger { used(): number; remaining(): number; charge(cost: number): Promise<void>; exhaust(): Promise<void> }

export function pacificDay(now: Date): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "America/Los_Angeles", year: "numeric", month: "2-digit", day: "2-digit" }).format(now);
}

export async function createQuotaLedger(opts: { budget?: number; now?: () => Date; store?: QuotaStore }): Promise<QuotaLedger> {
  const budget = opts.budget ?? DEFAULT_DAILY_BUDGET;
  if (!Number.isFinite(budget) || budget <= 0) throw new Error("youtube-import: quota budget must be a positive number");
  const day = pacificDay((opts.now ?? (() => new Date()))());
  const stored = await opts.store?.load();
  let used = stored && stored.day === day && Number.isFinite(stored.used) ? stored.used : 0;
  const persist = () => opts.store?.save({ day, used }) ?? Promise.resolve();
  return {
    used: () => used,
    remaining: () => Math.max(0, budget - used),
    async charge(cost) {
      if (used + cost > budget) throw new QuotaStop("budget", `daily quota budget ${budget} would be exceeded (${used} used, next call ${cost})`);
      used += cost; await persist();
    },
    async exhaust() { used = Math.max(used, budget); await persist(); },
  };
}
