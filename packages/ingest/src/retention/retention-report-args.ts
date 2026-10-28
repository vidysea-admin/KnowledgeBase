/**
 * packages/ingest/src/retention/retention-report-args.ts - T-046 dry-run report. Strict argv parser.
 * Every option takes a value; there is NO flag that changes behaviour beyond reporting (no
 * --apply, --force, --yes ...): anything not listed below is a usage error. The two retention
 * thresholds are an owner decision (ARCHITECTURE Q6) and have NO default.
 */
import { parseIsoInstant } from "../strict-record.js";
import { cleanText } from "./retention-report-text.js";

export interface ReportOptions {
  tenant: string;
  dataRoot: string;
  mediaRoot: string;
  minAgeDays: number;
  clipPaddingSeconds: number;
  /** webinar poller operations.json (in-progress signal); required */
  operationsState: string;
  /** operator-confirmed "today" (epoch ms) from --as-of; must match the system clock within a tolerance */
  asOf?: number;
}

export const USAGE = [
  "usage: retention-report --tenant <id> --data-root <dir> --min-age-days <N> --clip-padding-seconds <N> --media-root <dir> --operations-state <operations.json> [--as-of <ISO instant>]",
  "  Report-only dry run: prints what the retention sweep planner WOULD mark purge-eligible. It deletes nothing and has no apply mode.",
  "  --media-root is required: the report only calls a recording purge-eligible after it has located and stat'd the media file under it.",
  "  --operations-state: the webinar poller's data/webinar-release/operations.json. REQUIRED. Recordings the pipeline marks recording/processing/failed/unknown are kept; if the file cannot be read nothing is ELIGIBLE.",
  "  --as-of: the date you believe it is (ISO, e.g. 2026-10-11T12:00:00Z). Required to get any ELIGIBLE verdict when the clock is >90 days past the newest activity; refused if it differs from the system clock by >24 h.",
  "  --min-age-days and --clip-padding-seconds are owner decisions (ARCHITECTURE Q6); there is no default.",
  "  example: retention-report --tenant toc --data-root ./data/upload --min-age-days 30 --clip-padding-seconds 15 --media-root ./data/media",
];

const VALUED = ["--tenant", "--data-root", "--media-root", "--min-age-days", "--clip-padding-seconds", "--operations-state", "--as-of"];
const MAX_DAYS = 36500;
const THRESHOLD_NOTE = "thresholds are an owner decision (ARCHITECTURE Q6) and this command has no default";

/** Ruling 5 (2026-10-17, approver Umesh): purge-mode defaults and floors. The read-only report keeps no default. */
export const PURGE_DEFAULT_MIN_AGE_DAYS = 90;
export const PURGE_DEFAULT_CLIP_PADDING_SECONDS = 15;
export type ArgMode = "report" | "purge";

export type ParsedArgs = { ok: true; opts: ReportOptions } | { ok: false; message: string };

const positive = (raw: string | undefined, max: number): number | null => {
  if (raw === undefined || !/^\d{1,9}(\.\d{1,6})?$/.test(raw)) return null;
  const n = Number(raw);
  return Number.isFinite(n) && n > 0 && n <= max ? n : null;
};

export function parseArgs(argv: readonly string[], mode: ArgMode = "report"): ParsedArgs {
  const given = new Map<string, string>();
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i] ?? "";
    const eq = arg.indexOf("=");
    const name = arg.startsWith("--") && eq > 0 ? arg.slice(0, eq) : arg;
    if (!VALUED.includes(name)) return { ok: false, message: `unknown option or argument: ${cleanText(name, 40)}` };
    let value: string | undefined;
    if (name !== arg) value = arg.slice(eq + 1);
    else { value = argv[i + 1]; i++; }
    if (value === undefined || value === "" || (name === arg && value.startsWith("--"))) {
      return { ok: false, message: `${name} needs a value` };
    }
    if (given.has(name)) return { ok: false, message: `${name} given more than once` };
    given.set(name, value);
  }
  const purge = mode === "purge";
  const minAgeRaw = given.get("--min-age-days") ?? (purge ? String(PURGE_DEFAULT_MIN_AGE_DAYS) : undefined);
  const clipRaw = given.get("--clip-padding-seconds") ?? (purge ? String(PURGE_DEFAULT_CLIP_PADDING_SECONDS) : undefined);
  if (minAgeRaw === undefined || clipRaw === undefined) {
    const missing = [minAgeRaw === undefined ? "--min-age-days" : "", clipRaw === undefined ? "--clip-padding-seconds" : ""].filter(Boolean);
    return { ok: false, message: `${missing.join(" and ")} required: ${THRESHOLD_NOTE}` };
  }
  const minAgeDays = positive(minAgeRaw, MAX_DAYS);
  const clipPaddingSeconds = positive(clipRaw, 3600);
  if (minAgeDays === null) return { ok: false, message: `--min-age-days must be a positive number up to ${MAX_DAYS}` };
  if (clipPaddingSeconds === null) return { ok: false, message: "--clip-padding-seconds must be a positive number up to 3600" };
  if (purge && minAgeDays < PURGE_DEFAULT_MIN_AGE_DAYS) return { ok: false, message: `--min-age-days must be at least ${PURGE_DEFAULT_MIN_AGE_DAYS} for a purge (floor; ruling 5)` };
  if (purge && clipPaddingSeconds < PURGE_DEFAULT_CLIP_PADDING_SECONDS) return { ok: false, message: `--clip-padding-seconds must be at least ${PURGE_DEFAULT_CLIP_PADDING_SECONDS} for a purge (minimum; ruling 5)` };
  const tenant = given.get("--tenant");
  const dataRoot = given.get("--data-root");
  if (!tenant || tenant.length > 200 || /\p{Cc}/u.test(tenant)) return { ok: false, message: "--tenant is required (1-200 characters, no control characters)" };
  if (!dataRoot) return { ok: false, message: "--data-root is required" };
  const asOfRaw = given.get("--as-of");
  const asOf = asOfRaw === undefined ? undefined : parseIsoInstant(asOfRaw);
  if (asOf === null) return { ok: false, message: "--as-of must be an ISO instant like 2026-10-11T12:00:00Z" };
  const operationsState = given.get("--operations-state");
  if (!operationsState) return { ok: false, message: "--operations-state is required: without the pipeline's own state a recording that is still recording or processing cannot be ruled out (pass the webinar poller's data/webinar-release/operations.json)" };
  const mediaRoot = given.get("--media-root");
  if (!mediaRoot) return { ok: false, message: "--media-root is required: a report that cannot see the media files cannot say anything is purgeable" };
  return { ok: true, opts: { tenant, dataRoot, minAgeDays, clipPaddingSeconds, mediaRoot, operationsState, ...(asOf !== undefined ? { asOf } : {}) } };
}
