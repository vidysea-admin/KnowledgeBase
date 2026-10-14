# T-056 scoped transient answer-policy simulator

Status: active scoped foundation; checker adopted 2026-10-14 under the root's explicit scoped authorization.

This governs the new simulator only. Existing `/ask` keeps its existing contracts. Passing this unit does not complete T-056 or certify factual accuracy of generated claims. YAML policy authoring, persisted policy history, applying policies to Ask, conflict handling and a review queue remain whole-task gates.

1. Policy revisions are detached immutable values with positive safe sequential version numbers. A revision cannot change tenant or policy identity.
2. Simulation rejects a foreign policy or result envelope before reading answer/source content. Source counts remain separated.
3. Invalid/source-free results refuse; internal-only policies refuse web-bearing results; insufficient coverage or absent usable internal session/web URL provenance requires review. Allow means the supplied metadata supports the policy, never verified factual truth. Simulation does not modify its input or return an answer.
4. The authenticated API requires Ask scope, binds retrieval and request dependency factories to the verified tenant, and simulates a fresh result from the existing Ask pipeline. Client-supplied tenant/result values cannot supply that result. Invalid drafts and over-budget/empty queries fail before retrieval. Missing trees and bounded failures produce honest errors.
5. The real server mounts the route after shared authentication/rate limits; default `/ask` execution remains unchanged. Existing provider/job bookkeeping through explicit simulator submission is allowed; policy persistence is outside this unit.
6. The new reachable UI uses the shared API client, trims questions, prevents blank requests, shows genuine API errors and separates policy decisions from candidate answers. Internal/web citations stay separate; missing internal provenance and unsafe web URL schemes remain inert. It reports coverage and whether Ask used web sources without inferring missing configuration from `web_used: false`.
7. Draft revisions are explicitly transient and neither saved nor applied to Ask. Mode changes advance the local revision and invalidate prior simulations; authentication changes/unmount invalidate pending replies. The UI gains no browser build dependency on packages.
8. Focused fake-provider/sample checks cover the affected policy/Ask stage and immediate authenticated HTTP and UI consumption. Frozen-contract validation must pass; its vacuity is reported when there are no frozen contracts. Interactive browser evidence, unrelated whole-workspace checks and full T-056 acceptance remain separate gates, never silently claimed by this scoped verdict.

Related unchanged criteria: ask-router-v2 C3/C4 (source preservation and real composition); web-ask-page C4/C5/C7/C8/I3 (separation, provenance, errors, safe links, no package coupling). Full AskPage C6 is not imported wholesale into this new simulator.
