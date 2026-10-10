/**
 * apps/api/src/join-rules/deps.ts — T-037 unit `t037-join-rules-edit-api`.
 * The structural seam for the join-rules edit API. `.dependency-cruiser.cjs` forbids
 * `apps/* -> packages/meeting-bot`, so the engine/store value types are declared STRUCTURALLY here and
 * the real `packages/meeting-bot` store/validator are injected (same reason as routes/health.ts and
 * composition/production.ts's notifier note). `packages/meeting-bot/src/calendar/join-rules{,-store}.ts`
 * satisfy these shapes with no import; PRODUCTION WIRING IS NOT DELIVERED (see the manifest).
 */
export interface JoinRuleMatchValue {
  email?: string; domain?: string; subdomains?: boolean; platform?: "meet" | "teams" | "zoom" | "webex" | "zoho" | "cloudonair" | "unknown"; scope?: "internal" | "external";
}
export interface JoinRuleValue { id: string; effect: "allow" | "deny"; match: JoinRuleMatchValue }
export interface JoinRuleSetValue { version: 1; ownDomains: readonly string[]; rules: readonly JoinRuleValue[] }
export interface JoinRuleStateValue {
  approvedSenders: readonly string[]; approvedDomains: readonly string[]; optedOutEventIds: readonly string[];
}
export interface StoredJoinRulesValue { ruleSet: JoinRuleSetValue; state: JoinRuleStateValue }

type MaybePromise<T> = T | Promise<T>;

/**
 * Every method is already tenant-scoped by its first argument; the router only ever passes the
 * authenticated caller's tenant (`req.auth.tenantId`). Store failures are thrown as errors carrying
 * `name === "JoinRulesStoreError"` and a string `code` (what `JoinRulesStoreError` does).
 */
export interface JoinRulesDeps {
  /** Missing file -> empty value; any defect throws (fail closed). */
  load(tenantId: string): MaybePromise<StoredJoinRulesValue>;
  /** Overwrites with exactly what it is handed: callers MUST load first and preserve state. */
  save(tenantId: string, value: StoredJoinRulesValue): MaybePromise<void>;
  /** The engine's own `validateJoinRuleSet`; throws on invalid input, returns a normalised copy. */
  validateRuleSet(input: unknown): JoinRuleSetValue;
  recordApproval(tenantId: string, approval: { kind: "sender" | "domain"; value: string }): MaybePromise<JoinRuleStateValue>;
  recordOptOut(tenantId: string, eventId: string): MaybePromise<JoinRuleStateValue>;
}
