/**
 * Autojoin deployment config (Umesh decision 2026-10-14): discovery, webinar auto-join, career priority, test-data routing
 * and alert channels. Defaults come from the committed, non-secret `config/autojoin.json`; every key has an env override
 * (documented in .env.example). No file and no env = `present: false` = the schedule tick behaves exactly as before.
 */
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";

export interface AutojoinConfig {
  /** False when neither the file nor any env var exists: callers must keep pre-autojoin behaviour. */
  present: boolean;
  discovery: boolean;
  webinarAutoJoin: boolean;
  careerPriority: boolean;
  testDataRouting: boolean;
  alerts: { email: boolean; dashboard: boolean; calendar: boolean; emailTo: string; emailTestData: boolean };
  rateLimit: { emailPerHour: number; failureEmailPerHour: number; calendarMinGapSeconds: number };
}

export const AUTOJOIN_OFF: AutojoinConfig = {
  present: false, discovery: false, webinarAutoJoin: false, careerPriority: false, testDataRouting: false,
  alerts: { email: false, dashboard: false, calendar: false, emailTo: "", emailTestData: false },
  rateLimit: { emailPerHour: 6, failureEmailPerHour: 3, calendarMinGapSeconds: 60 },
};

const EMAIL_RE = /^[^\s@<>",;]+@[^\s@<>",;]+\.[^\s@<>",;]+$/;

/** "1/true/on/yes" -> true, "0/false/off/no" -> false, anything else (incl. empty) -> undefined (no override). */
export function parseFlag(value: unknown): boolean | undefined {
  if (typeof value !== "string") return undefined;
  const v = value.trim().toLowerCase();
  if (["1", "true", "on", "yes"].includes(v)) return true;
  if (["0", "false", "off", "no"].includes(v)) return false;
  return undefined;
}

function bool(file: unknown, env: unknown, fallback: boolean): boolean {
  return parseFlag(env) ?? (typeof file === "boolean" ? file : fallback);
}
function posInt(file: unknown, env: unknown, fallback: number): number {
  const n = typeof env === "string" && /^[1-9][0-9]{0,5}$/.test(env.trim()) ? Number(env) : file;
  return typeof n === "number" && Number.isInteger(n) && n > 0 && n <= 100000 ? n : fallback;
}
const obj = (v: unknown): Record<string, unknown> => (typeof v === "object" && v !== null && !Array.isArray(v) ? v as Record<string, unknown> : {});

const ENV_FLAGS = ["LKB_AUTOJOIN_DISCOVERY", "LKB_AUTOJOIN_WEBINARS", "LKB_AUTOJOIN_CAREER_PRIORITY", "LKB_AUTOJOIN_TEST_DATA_ROUTING",
  "LKB_ALERT_EMAIL", "LKB_ALERT_DASHBOARD", "LKB_ALERT_CALENDAR"];

/** Reads the file (default <repoRoot>/config/autojoin.json, or LKB_AUTOJOIN_CONFIG) then applies env overrides. An unreadable file is reported through `warn` and treated as absent. */
export function loadAutojoinConfig(repoRoot: string, env: NodeJS.ProcessEnv = process.env, warn: (m: string) => void = () => undefined): AutojoinConfig {
  const file = env.LKB_AUTOJOIN_CONFIG?.trim() || path.join(repoRoot, "config", "autojoin.json");
  let raw: Record<string, unknown> | undefined;
  if (existsSync(file)) {
    try { raw = obj(JSON.parse(readFileSync(file, "utf8"))); } catch { warn(`autojoin config ${path.basename(file)} is unreadable; ignoring the file`); }
  }
  if (!raw && !ENV_FLAGS.some((k) => parseFlag(env[k]) !== undefined)) return AUTOJOIN_OFF;
  const f = raw ?? {}, a = obj(f.alerts), r = obj(f.rateLimit);
  const to = (env.LKB_ALERT_EMAIL_TO ?? "").trim() || (typeof a.emailTo === "string" ? a.emailTo.trim() : "");
  const emailTo = EMAIL_RE.test(to) ? to : "";
  if (to && !emailTo) warn("alert email address is not a plain address; email alerts disabled");
  return {
    present: true,
    discovery: bool(f.discovery, env.LKB_AUTOJOIN_DISCOVERY, false),
    webinarAutoJoin: bool(f.webinarAutoJoin, env.LKB_AUTOJOIN_WEBINARS, false),
    careerPriority: bool(f.careerPriority, env.LKB_AUTOJOIN_CAREER_PRIORITY, false),
    testDataRouting: bool(f.testDataRouting, env.LKB_AUTOJOIN_TEST_DATA_ROUTING, false),
    alerts: {
      email: bool(a.email, env.LKB_ALERT_EMAIL, false) && emailTo !== "", emailTo,
      dashboard: bool(a.dashboard, env.LKB_ALERT_DASHBOARD, false), calendar: bool(a.calendar, env.LKB_ALERT_CALENDAR, false),
      emailTestData: bool(a.emailTestData, env.LKB_ALERT_EMAIL_TEST_DATA, false),
    },
    rateLimit: { emailPerHour: posInt(r.emailPerHour, env.LKB_ALERT_EMAIL_PER_HOUR, 6), failureEmailPerHour: posInt(r.failureEmailPerHour, env.LKB_ALERT_FAILURE_EMAIL_PER_HOUR, 3), calendarMinGapSeconds: posInt(r.calendarMinGapSeconds, undefined, 60) },
  };
}
