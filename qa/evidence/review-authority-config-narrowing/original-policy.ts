import { isValidTenantId } from "../auth.js";
import type { AnswerReviewAuthority, HumanReviewAction } from "../answer-policy/answer-router.js";
import type { SpeakerRelationsRouterDeps } from "../speaker-relations/router.js";

export interface VerifiedReviewPrincipal {
  readonly tenantId: string;
  readonly keyId: string;
  readonly scopes: readonly string[];
}
export interface TrustedReviewPolicy {
  readonly tenantId: string;
  readonly subject: string;
  readonly reviewerKind: "human" | "automation";
  readonly canPropose: boolean;
  readonly canReview: boolean;
  readonly answerActions: readonly HumanReviewAction[];
}
export interface ReviewPolicyResolver {
  resolve(principal: VerifiedReviewPrincipal): TrustedReviewPolicy | null;
}
const ACTIONS: readonly string[] = ["answer-review", "source-preference", "usefulness"];
const identifier = (v: unknown): v is string => typeof v === "string" && /^[A-Za-z0-9][A-Za-z0-9:._@-]{0,199}$/.test(v);
const invalid = (): never => { throw new Error("invalid_review_authority_config"); };
function shape(v: unknown, keys: string[]): v is Record<string, unknown> {
  return !!v && typeof v === "object" && !Array.isArray(v) && Object.keys(v).length === keys.length && keys.every(k => Object.prototype.hasOwnProperty.call(v, k));
}
function principal(v: unknown): v is VerifiedReviewPrincipal {
  if (!v || typeof v !== "object") return false;
  const p = v as Partial<VerifiedReviewPrincipal>;
  return isValidTenantId(p.tenantId) && identifier(p.keyId) && Array.isArray(p.scopes) && p.scopes.every(s => typeof s === "string");
}

/** Parse only server-owned configuration. This module never reads env, files, requests or raw keys.
 * Shape: {version:1,tenants:[{tenantId,keys:[{keyId,subject,reviewerKind,canPropose,canReview,answerActions}]}]}.
 * Unset configuration denies every identity; malformed configuration refuses startup atomically. */
export function createReviewPolicyResolver(input?: string): ReviewPolicyResolver {
  const tenants = new Map<string, Map<string, TrustedReviewPolicy>>();
  if (input !== undefined && input !== "") {
    if (typeof input !== "string" || input.length > 131072) invalid();
    let config: unknown;
    try { config = JSON.parse(input); } catch { invalid(); }
    if (!shape(config, ["version", "tenants"]) || config.version !== 1 || !Array.isArray(config.tenants) || config.tenants.length > 100) invalid();
    let count = 0;
    for (const tenant of config.tenants) {
      if (!shape(tenant, ["tenantId", "keys"]) || !isValidTenantId(tenant.tenantId) || tenant.tenantId.length > 200 ||
        tenants.has(tenant.tenantId) || !Array.isArray(tenant.keys) || tenant.keys.length > 100) invalid();
      const keys = new Map<string, TrustedReviewPolicy>();
      for (const key of tenant.keys) {
        if (++count > 1000 || !shape(key, ["keyId", "subject", "reviewerKind", "canPropose", "canReview", "answerActions"]) ||
          !identifier(key.keyId) || keys.has(key.keyId) || !identifier(key.subject) ||
          (key.reviewerKind !== "human" && key.reviewerKind !== "automation") || typeof key.canPropose !== "boolean" || typeof key.canReview !== "boolean" ||
          !Array.isArray(key.answerActions) || key.answerActions.length > ACTIONS.length || key.answerActions.some(a => typeof a !== "string" || !ACTIONS.includes(a)) ||
          new Set(key.answerActions).size !== key.answerActions.length || (key.reviewerKind === "automation" && (key.canReview || key.answerActions.length > 0))) invalid();
        keys.set(key.keyId, Object.freeze({ tenantId: tenant.tenantId, subject: key.subject, reviewerKind: key.reviewerKind,
          canPropose: key.canPropose, canReview: key.canReview, answerActions: Object.freeze([...key.answerActions]) as readonly HumanReviewAction[] }));
      }
      tenants.set(tenant.tenantId, keys);
    }
  }
  return Object.freeze({ resolve(p: VerifiedReviewPrincipal): TrustedReviewPolicy | null {
    if (!principal(p)) return null;
    return tenants.get(p.tenantId)?.get(p.keyId) ?? null;
  } });
}

/** Existing routers still enforce their own required scopes; configuration grants no scopes. */
export function createReviewAdapters(resolver: ReviewPolicyResolver): {
  answerReviewAuthority: AnswerReviewAuthority;
  relationshipContextFor: SpeakerRelationsRouterDeps["contextFor"];
} {
  return {
    answerReviewAuthority: {
      async verifyHuman(req, action) {
        if (!principal(req.auth)) return null;
        const p = resolver.resolve(req.auth);
        if (!p || p.tenantId !== req.auth.tenantId || p.reviewerKind !== "human" || !identifier(p.subject) || !p.answerActions.includes(action)) return null;
        return { kind: "human", tenantId: req.auth.tenantId, subject: p.subject };
      },
    },
    async relationshipContextFor(auth) {
      if (!principal(auth)) return null;
      const p = resolver.resolve(auth);
      if (!p || p.tenantId !== auth.tenantId || !identifier(p.subject) || typeof p.canPropose !== "boolean" || typeof p.canReview !== "boolean" ||
        (p.reviewerKind !== "human" && p.reviewerKind !== "automation") || (p.reviewerKind === "automation" && p.canReview)) return null;
      return { tenantId: auth.tenantId, actorId: p.subject, reviewerKind: p.reviewerKind, canPropose: p.canPropose, canReview: p.canReview };
    },
  };
}
