/**
 * apps/api/src/join-rules/deps.ts — T-037 unit `t037-join-rules-edit-api`.
 * The structural seam for the join-rules edit API. `.dependency-cruiser.cjs` forbids
 * `apps/* -> packages/meeting-bot`, so the engine/store value types are declared STRUCTURALLY here and
 * the real `packages/meeting-bot` store/validator are injected (same reason as routes/health.ts and
 * composition/production.ts's notifier note). `packages/meeting-bot/src/calendar/join-rules{,-store}.ts`
 * satisfy these shapes with no import; PRODUCTION WIRING IS NOT DELIVERED (see the manifest).
 */
export interface JoinRuleMatchValue {
  titleIncludes?: readonly string[]; descriptionIncludes?: readonly string[]; purposeAny?: readonly string[];
  email?: string; domain?: string; subdomains?: boolean; platform?: "meet" | "teams" | "zoom" | "webex" | "zoho" | "cloudonair" | "unknown"; scope?: "internal" | "external";
}
export interface JoinRuleValue { id: string; effect: "allow" | "deny"; match: JoinRuleMatchValue }
export interface JoinRuleSetValue {
  version: 1; ownDomains: readonly string[]; rules: readonly JoinRuleValue[];
  attendanceMode?: "all" | "rules";
  purposeGroups?: readonly {id: string; titleIncludes?: readonly string[]; descriptionIncludes?: readonly string[]}[];
}
export interface JoinRuleStateValue {
  approvedSenders: readonly string[]; approvedDomains: readonly string[]; optedOutEventIds: readonly string[];
  /** Optional: absent in documents written before ISS-T037W1-001; the store derives/validates the entries. */
  optedOutMeetings?: readonly string[];
}
/** Hints about the opted-out record's meeting; the store derives the identity (apps/* cannot import meeting-bot). */
export interface OptOutMeetingHint { meetingUrl?: string; sessionKey?: string }
export interface StoredJoinRulesValue { ruleSet: JoinRuleSetValue; state: JoinRuleStateValue }

/** Mirrors `JoinRulesStoreError.code` in packages/meeting-bot (structural: apps/* may not import it). The router's status table is total over this. */
export type JoinRulesStoreCode = "bad-tenant" | "corrupt" | "too-large" | "invalid" | "tenant-mismatch" | "not-a-file" | "write-failed" | "locked" | "lock-failed" | "precondition-failed";

type MaybePromise<T> = T | Promise<T>;

/**
 * Every method is already tenant-scoped by its first argument; the router only ever passes the
 * authenticated caller's tenant (`req.auth.tenantId`). Store failures are thrown as errors carrying
 * `name === "JoinRulesStoreError"` and a string `code` (what `JoinRulesStoreError` does).
 */
export interface JoinRulesDeps {
  /** Profile PII is readable only with the dedicated join-rules scope. */
  registrationPolicy?: import("./registration-policy-router.js").RegistrationPolicyDeps;
  /** Missing file -> empty value; any defect throws (fail closed). */
  load(tenantId: string): MaybePromise<StoredJoinRulesValue>;
  /** LEGACY unconditional full replace. The join-rules PUT no longer calls it (ISS-UNOPTLOCK-002); kept for seeding and other callers. */
  save(tenantId: string, value: StoredJoinRulesValue): MaybePromise<void>;
  /** Like `load`, plus the validator of the stored rule set (`JOIN_RULES_ABSENT` = "absent" when nothing is stored). Unlocked read. */
  loadWithValidator(tenantId: string): MaybePromise<StoredJoinRulesValue & { validator: string }>;
  /**
   * ATOMIC compare-and-set (the store's `saveJoinRulesIf`): inside the store's per-tenant lock, compares the stored validator with
   * `expected` ("absent" = nothing stored) and writes `ruleSet`, keeping the approval/opt-out state AS LOADED UNDER THE LOCK.
   * Mismatch throws a `JoinRulesStoreError` with `code === "precondition-failed"` and `currentValidator`; nothing is written.
   */
  saveIf(tenantId: string, expected: string, ruleSet: JoinRuleSetValue): MaybePromise<StoredJoinRulesValue & { validator: string }>;
  /** The engine's own `validateJoinRuleSet`; throws on invalid input, returns a normalised copy. */
  validateRuleSet(input: unknown): JoinRuleSetValue;
  recordApproval(tenantId: string, approval: { kind: "sender" | "domain"; value: string }): MaybePromise<JoinRuleStateValue>;
  /** `meeting` is passed ONLY when the client sent a hint; without it the opt-out is by id alone, as before. */
  recordOptOut(tenantId: string, eventId: string, meeting?: OptOutMeetingHint): MaybePromise<JoinRuleStateValue>;
  /** Un-opt: removes exactly `eventId` and exactly the identities the hints derive. Absent = no-op, nothing written. */
  removeOptOut(tenantId: string, eventId: string, meeting?: OptOutMeetingHint): MaybePromise<OptOutRemovalValue>;
}
/** What an un-opt did: `removed` is `{ eventId: false, meetings: [] }` for a no-op. */
export interface OptOutRemovalValue { state: JoinRuleStateValue; removed: { eventId: boolean; meetings: string[] } }
