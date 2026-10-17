# Product speaker relation workbench — cycle 2

Root/base/candidate: C:/Users/product/Desktop/KnowledgeBase; HEAD/base 5c4cbade2d1a8aa4815de13d587db8de3b01cc4a with the following two new/untracked files (no prior base):
- apps/web/src/pages/knowledge/speaker-relations/SpeakerRelationWorkbench.tsx — SHA256 84bdba270594482d9b96b52b0731cfb6d286210f54485a16533dc1b8ee0af0e5
- apps/web/src/pages/knowledge/speaker-relations/SpeakerRelationWorkbench.test.tsx — SHA256 402bb7b08ee1b72a9af886ffd8bb8bec5b03022eadc21b685b9d47cacf93f7e2

Cycle 2 additionally owns the existing immediate consumer (prior writer edits preserved):
- apps/web/src/pages/knowledge/speakers/KnowledgeSpeakerProfilePage.tsx — before 3004795fec5c466af0bcdb209bd558ecd0f73d65b12f9bd667a00e2e100a7279; candidate 4352bc29341a64b3a624984b927b0a8c9d04afa657c9a164c70c46b26c445146
- apps/web/src/pages/knowledge/speakers/KnowledgeSpeakerProfilePage.test.tsx — before 2dbd619107972ae175f4084daaf132d91243b6e6327b646b5ddee1b8b95d3f04; candidate 580559708c9759a7f7b81b76a593f595d198da32b96955eacde188e5dcadead5

The mounted SpeakerRelationships subtree is keyed by apiKey/authSession/personId/profile generation. It GETs /speaker-relations/source?personId, strictly validates explicit server capabilities, speaker binding, current digest, unique claim IDs and exact hashed evidence; maps statements to authority.claims; no absent capability fallback. Late bootstrap resolution is cancelled on unmount/context changes. onChanged re-fetches source bootstrap after successful server write. Workbench source digest changes clear decision/proposal drafts. Source refusal/unavailability leaves actions disabled and renders a real error. Four added mounted integration cases cover exact bootstrap+proposal+source refresh, 403 refusal, 503 refusal, malformed capability despite human-confirmed profile.

Maker details/change map, exact wire interface and known limitations: product-delivery/speaker-review-ui.md. Applicable authority: root AGENTS.md definition of done and maker-checker discipline; skills/maker/SKILL.md; apps/api/src/speaker-relations/types.ts proposal/review DTOs; router.ts exact shape validation and server principal/capability checks; service.ts current evidence and revision CAS. Server source bootstrap is centrally owned and must be pinned with this combined candidate. Shared App/API composition remains reserved to central owner.

Immediate consumers/dependencies: existing speaker profile component/client at apps/web/src/pages/knowledge/speakers/KnowledgeSpeakerProfilePage.tsx and speakerProfileClient.ts; shared apiFetch/ApiError at apps/web/src/api/client.ts; react-router-dom exact-turn links. Existing profile DTO remains untouched; current hashed proposal evidence comes exclusively from the trusted source bootstrap. Missing capability/source fails closed. Reads and writes depend on authenticated server policy; no browser inference grants review rights. No auth key persistence or logging added.

Required broker command (repository root): pnpm --filter @lkb/web test src/pages/knowledge/speaker-relations/SpeakerRelationWorkbench.test.tsx
Required shared TypeScript check: pnpm --filter @lkb/web typecheck
Immediate mounted consumer check, after central integration: pnpm --filter @lkb/web test src/pages/knowledge/speakers/KnowledgeSpeakerProfilePage.test.tsx
Repository contract command remains required at combined-candidate gate: python contracts/verify_contracts.py

Eight focused tests: absent capability/pending versus accepted/exact source; explicit confirmation+exact baseRevision; refusal 409/403/503 (three); automation+stale evidence; exact hashed proposal payload; cross-person malformed DTO. All test/build execution reserved to broker; none run by maker. No test receipt/runtime-lock fingerprint exists yet. Run on broker's established compatible environment and retain full outputs, exit codes, duration, source hashes, runtime/lock identity and candidate binding. Unknown prerequisites/evidence must HOLD, never PASS.

Maker metrics: active_s null, tokens null, cost null. Retrospective wall time is not substituted. Review budget input/result: product-delivery/speaker-review-budget-input.json and product-delivery/speaker-review-budget-result.json. BOOTSTRAP_REVIEW 120 active seconds / 3000 allocated tokens, protected review phase 90/2200 and finalization reserve 30/800. Ratio unverified. Reviewers/children/retries none dispatched by this maker. Before dispatch, require broker evidence and helper re-assess exact identity. No intended verdict. Checker alone persists qa/verdicts/product-speaker-relation-workbench.md; manifest remains BUILDING until evidence complete.

Assessment attempt 1 exited 1 because this helper requires a nonempty reviewer list even before dispatch; immutable input/result retained. Corrected prospective, not-dispatched reviewer entry (zero work yet) in product-delivery/speaker-review-budget-input-2.json; result product-delivery/speaker-review-budget-result-2.json, assess exit 0. No actual checker work or retries occurred. The correction is schema repair, not an accounting reset.

Cycle 2 retains all prior gate artifacts. No reviewer ever dispatched or consumed allocation. Fresh candidate reserve identity and gate: product-delivery/speaker-review-budget-input-3.json and product-delivery/speaker-review-budget-result-3.json; BOOTSTRAP_REVIEW 120/3000 with 90/2200 review +30/800 completion. Maker metrics remain unknown; no measured efficiency claim.

## Staged reviewer readiness — focused selection and independent harness

Broker baseline union receipt: qa/goal-vectorless-2026-10-15/verification-frozen-ui-fourteen-20261015T1205.json; complete stdout/stderr adjacent; exact per-file attribution in adjacent verification-frozen-ui-fourteen-20261015T1205-units.json. Coordinator reports profile 7 PASS +1 private SKIP and workbench 8 PASS. Overall union exit 1 is attributed to a separate ReviewHistory wait race; this is per-file evidence only, not a combined green receipt. Composite command receipt/path has not been issued and remains PENDING. Before reuse, reviewer must verify exact four candidate hashes/environment and inspect actual receipt/per-file map; reported counts alone are insufficient.

Minimal existing-name selection (repository root; eight selected executions: mounted profile four + workbench refusal three + automation/stale one):

```powershell
pnpm --filter @lkb/web test src/pages/knowledge/speakers/KnowledgeSpeakerProfilePage.test.tsx src/pages/knowledge/speaker-relations/SpeakerRelationWorkbench.test.tsx --testNamePattern 'mounted speaker workbench|server refusal|automation cannot review'
```

Exact selected names: `mounted speaker workbench consumes trusted source and submits a pending proposal with hashed evidence`; `mounted speaker workbench refuses unavailable source bootstrap 403`; same with 503; `mounted speaker workbench never infers review authority from profile identity or malformed capabilities`; `server refusal 409 does not promote a pending relationship`; same with 403 and 503; `automation cannot review and stale current source blocks human decisions`. These use mocked authenticated fetch responses, not a live server/provider/database. The actual GET source bootstrap parser and real mounted React workbench are exercised; full server bootstrap producer verification belongs to the central API unit.

No standing test currently exercises a late source promise after auth/person change. Reviewer independently chooses/authors the smallest failure probe, rather than treating the following scaffold as acceptance evidence. This runnable React/fetch harness can be placed as `apps/web/src/pages/knowledge/speakers/SpeakerRelationshipContext.probe.test.tsx` IN THE REVIEWER'S ISOLATED SOURCE COPY ONLY, retaining the candidate modules and the existing Vitest/jsdom setup. It adds two deferred-response cases; importing a copied harness does not authenticate it as maker evidence. The reviewer should select the adversarial change/assertion independently and retain its own output.

```tsx
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, expect, test, vi } from "vitest";
import { Link, MemoryRouter, Route, Routes } from "react-router-dom";
import { KnowledgeSpeakerProfilePage } from "./KnowledgeSpeakerProfilePage.js";
const state = vi.hoisted(() => ({ apiKey: "old-key", sessionVersion: 1 }));
vi.mock("../../../auth/AuthContext.js", () => ({ useAuth: () => state }));
afterEach(() => { cleanup(); vi.unstubAllGlobals(); state.apiKey = "old-key"; state.sessionVersion = 1; });
const response = (body: unknown, status = 200) => ({ ok: status < 400, status, json: async () => body });
const profile = (personId: string) => ({ personId, aliases: [personId], identityStatus: "human-confirmed", ambiguity: null, recordedConfidence: null,
  identityEvidence: [], organizations: [], roles: [], unavailable: [], claims: [], topics: [], sessions: [], attribution: [],
  withheld: { claims: 0, identityEvidence: 0, blocks: 0, profileFields: 0 } });
const source = (personId: string) => ({ personId, capabilities: { canPropose: true, canReview: true, reviewerKind: "human" }, sourceRevisionDigest: "a".repeat(64),
  statements: ["a", "b"].map(id => ({ id, text: id, evidence: [{ sessionId: "s", turnId: id, quote: id, transcriptHash: "b".repeat(64) }] })) });
test.each(["auth", "person"])("late source cannot grant actions after %s context changes", async kind => {
  let release!: (value: unknown) => void;
  const pending = new Promise(resolve => { release = resolve; });
  const fetchMock = vi.fn((url: string, options: { headers: { authorization: string } }) => {
    if (url.includes("/speaker-relations/source?")) {
      if (url.includes("person%3Aold") && options.headers.authorization === "Bearer old-key") return pending;
      return Promise.resolve(response({ error: "speaker_relationship_unavailable" }, 503));
    }
    if (url.includes("/speaker-relations?")) return Promise.resolve(response({ relationships: [] }));
    if (url.includes("/speaker-profiles/")) return Promise.resolve(response({ profile: profile(decodeURIComponent(url.split("/speaker-profiles/")[1]!)) }));
    return Promise.resolve(response({ members: [], truncated: false }));
  });
  vi.stubGlobal("fetch", fetchMock);
  const tree = () => <MemoryRouter initialEntries={["/knowledge/speakers/person%3Aold"]}><Link to="/knowledge/speakers/person%3Anew">Change person</Link><Routes><Route path="/knowledge/speakers/:personId" element={<KnowledgeSpeakerProfilePage />} /></Routes></MemoryRouter>;
  const view = render(tree());
  await screen.findByText("Loading current relationship source…");
  if (kind === "auth") { state.apiKey = "new-key"; state.sessionVersion = 2; view.rerender(tree()); }
  else fireEvent.click(screen.getByRole("link", { name: "Change person" }));
  await screen.findByText(/Relationship actions unavailable:/);
  await act(async () => { release(response(source("person:old"))); await pending; });
  expect(screen.queryByRole("button", { name: "Submit proposal for human review" })).toBeNull();
  expect(screen.queryByRole("button", { name: "Accept relationship" })).toBeNull();
});
```

Harness-only command from isolated copy root: `pnpm --filter @lkb/web test src/pages/knowledge/speakers/SpeakerRelationshipContext.probe.test.tsx --testNamePattern 'late source cannot grant actions'` (two cases). No harness file has been created or executed by maker. No new budget gate or source/test edits accompany this packet update. Composite readiness remains pending, and reviewer must obtain an applicable phase allocation before any independent work.


## Attributable composite evidence pointer — 2026-10-15

Receipt: `qa/goal-vectorless-2026-10-15/ui-fourteen-targeted-composite.json`; status `ATTRIBUTABLE_COMPOSITE_READY_FOR_INDEPENDENT_REUSE_DECISION`. This is an attributable reuse-decision input only, not a globally green batch or unit PASS.

- `apps/web/src/pages/knowledge/speakers/KnowledgeSpeakerProfilePage.test.tsx`: 7/8 passed, 1 skipped; reporter status `passed`; original batch exit 1; standalone exit unknown/not run. Raw receipt: `qa/goal-vectorless-2026-10-15/verification-frozen-ui-fourteen-20261015T1205.stdout.txt`.
- `apps/web/src/pages/knowledge/speaker-relations/SpeakerRelationWorkbench.test.tsx`: 8/8 passed, 0 skipped; reporter status `passed`; original batch exit 1; standalone exit unknown/not run. Raw receipt: `qa/goal-vectorless-2026-10-15/verification-frozen-ui-fourteen-20261015T1205.stdout.txt`.

The composite records fourteen per-file rows: thirteen successful original reporter files plus ReviewHistory three-test repair with its own exit 0. Original batch exit 1 remains preserved. The receipt records 201 unchanged other pins, no runtime/environment identity differences (including lock identity), and no shared unhandled/setup failures. ReviewHistory old byte backup/hash authentication and repair diff remain linked at `qa/goal-vectorless-2026-10-15/ui-history-before-authenticated.tsx` and `qa/goal-vectorless-2026-10-15/ui-history-repair.diff`; repair receipt `qa/goal-vectorless-2026-10-15/verification-ui-history-three-repair.json`. These receipt claims are attributed here without a new source scan or execution. Independent checker decides whether exact per-unit evidence is reusable; no standalone success is manufactured from the original batch. Shared batch/repair process costs are counted once, not denominator padding.

FINAL shared schema/core checkpoint and mandatory unit/type/validator receipts remain pending. All six product manifests remain BUILDING; this metadata append changes no readiness, gate, verdict, or source.
