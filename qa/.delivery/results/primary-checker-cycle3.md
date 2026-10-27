Cycle checked: 4
Policy-Version: proportional-verification/2026-10-19.17
VERDICT: CONTINUE-NEEDED
CODE-REVIEW: PASS
PUSH-CANDIDATE: YES
SENIOR-REVIEW: Approve
FAILURES: none in the repaired CODE boundary.
ISSUES-WRITTEN: none.

Canonical verdict, including complete commands, executable reproducer stdin and raw outputs: [calendar-bot-operational-completion.md](C:/Users/Lenovo/.codex/worktrees/calendar-bot-completion/KnowledgeBase/qa/verdicts/calendar-bot-operational-completion.md).

Same original CODE unit, product cycle4. Immutable managed delivery phase3 ownership and prior failures remain preserved. This continuation uses project D-014’s uncapped security/auth/data-write rule; it does not invent fourth-cycle human approval. Full C1–C8 acceptance remains open. This coordinator’s PASS still requires aggregation with the blind second check.

The repair closes the demonstrated approval-authority defect:

- `gws-gmail.ts:220` now emits `unresolved-body` whenever the filtered invitation lacks `startTime`.
- `store.ts:160,175–180` prevents automatic approval and forwards that refusal.
- `meeting-candidates.ts:18–23,71–99` persists it while preserving the existing approval and occurrence.
- `auto-join.ts:187` blocks scheduling before retained approval can grant attendance authority.
- Native attendance acquisition also carries the refusal through its candidate projection.

All **87/87 source hashes matched before and after**. HEAD remains `0c2edb1497d40c227a4dd216a06bbe31b9fe502e`. The diff contains 87 files, 4,614 insertions and 802 deletions, with no paths outside the release identity. `git diff --check` exited 0; the scoped untracked-product inventory was empty.

Independent execution evidence:

| Instrument | Result |
|---|---|
| Focused scanner/API/runtime tests | **7/7 PASS**, exit0, 4115.5454ms |
| Unchanged cycle3 six-case reproducer | **6/6 correct**, exit0, 1013ms |
| Strengthened reproducer, adding no-time and preserved-authority assertions | **7/7 correct**, exit0, 1171ms |
| Current API, DB and authentication consumer files | **44/44 PASS**, exit0, 2563.8607ms |
| Isolated refusal falsification | GREEN → intended RED → byte-restored |

Exact focused command:

```text
node --test --test-concurrency=1 "--test-name-pattern=uncertain acquired time|requires source year|conflicting MIME|yearless registration|summary is trusted callback|unsupported attachment invitations|ISS-333 recorded|extra spoofs" --import tsx apps/api/src/gws/gws-gmail.test.ts apps/api/src/routes/meeting-candidates.test.ts scripts/webinar/scheduler/deps-runtime.test.mjs
```

Output summary:

```text
tests 7
pass 7
fail 0
skipped 0
duration_ms 4115.5454
exit=0
```

Exact affected command:

```text
node --test --test-concurrency=1 --import tsx apps/api/src/routes/meeting-candidates.test.ts packages/db/src/collections/meeting-candidates.test.ts packages/meeting-bot/src/calendar/sender-authentication.test.ts
```

Output summary:

```text
tests 44
pass 44
fail 0
skipped 0
duration_ms 2563.8607
exit=0
```

This includes current API **23/23**, DB **13/13**, and authentication consumer **8/8**. DB checks cover tenant isolation, decision/provenance races, scalar-to-array CAS guards, idempotency and preservation of approval/occurrence fields.

The unchanged previous reproducer ran with:

```text
node --import tsx --input-type=module
```

Its exact stdin is retained in the canonical verdict. Both it and the strengthened run used synthetic mail, the real scanner/API/DB-helper/selector functions and an in-memory DB, with a 30,000ms child timeout.

| Case | Acquired time | Durable refusal | Retained status/time | Scheduled |
|---|---|---|---|---:|
| Explicit dated control | `2099-10-15T10:00:00.000Z` | absent | approved / original time | **1** |
| Same-link MIME conflict | absent | unresolved-body | approved / original time | **0** |
| Nearby receipt-inferred year | absent | unresolved-body | approved / original time | **0** |
| Yearless, no receipt | absent | unresolved-body | approved / original time | **0** |
| Yearless, outside 31 days | absent | unresolved-body | approved / original time | **0** |
| Missing timezone | absent | unresolved-body | approved / original time | **0** |
| No date/time, strengthened run | absent | unresolved-body | approved / original time | **0** |

The strengthened run additionally asserted that uncertain acquired rows contain no `startTime`, `endTime` or `canonicalEventIdentity`, while their durable rows retain the original approved status and occurrence.

ISS-333’s original source corpus remains preserved:

- **(a)** DKIM failure: pending.
- **(b)** Authentication header absent: pending.
- **(c)** Aligned authentication passes and `senderAuthenticated=true`; its original undated body now deliberately remains pending under C4.
- A **separate dated authenticated positive** remains `auto_approved`.
- Scheduler **(d)+(e): 2/2** behave as recorded: unauthenticated automatic approval is refused; human approval with valid time remains trusted.

Thus the original API corpus measures **2/3 historical statuses**, explicitly disclosed. Including scheduler cases, **4/5 historical statuses** remain unchanged; **5/5 current C4-aware expectations** pass. Original case(c) was not silently replaced.

The isolated falsification changed only the copy’s scanner return:

```typescript
// GREEN
messageId: msg.id, ...(!startTime ? {evidenceIssue: "unresolved-body" as const} : {}),

// RED
messageId: msg.id,
```

The unchanged six-case reproducer produced:

```text
GREEN: exit0, 1205ms
RED:   exit1, 982ms

yearless-no-receipt:     scheduled1
yearless-outside-window: scheduled1
missing-zone:           scheduled1

AssertionError [ERR_ASSERTION]:
all uncertain refreshes must refuse scheduling
3 !== 0
```

MIME conflict and inferred-year refusals remained effective in the mutant. Every child had a 30,000ms timeout. `finally` restored the byte backup; `Buffer.compare` returned 0. The bound scanner hash remained:

```text
7e03094530b3e5090bb00206ebb0dfed58a9be5d908e670d4f084bce339d9d66
```

Dependency junctions were explicitly unlinked before validated owned-copy removal. An initial isolation setup lacked per-package/API dependency links and failed `ERR_MODULE_NOT_FOUND @lkb/core` before mutation; it was restored and cleaned, and was not counted as falsification.

Evidence validation and reuse limits:

- Release identity SHA256: `b343223ff52e6dda8a5dee8ec9cee1dc5a4ff31e908d1afdcfe1f4949850e6ba`.
- Full-run input SHA256: `486657462c7892e9025368b40d3c12b29db774ca9a4d6be61b5fde1fb4f22b13`, matching the result’s `inputIdentity`.
- Full-run result SHA256: `ac89d8b1bb6ee3dbff115862315d9dc3f733ada8640b32def5a9822a1fb9011c`.
- That maker record reports **685 tests, 681 PASS, 4 SKIP, 0 FAIL**, exit0, 40490.1874ms.
- Its single current input difference is the disclosed diagnostic-only `String(c.status)` correction. Replacing that expression in memory reconstructs the recorded earlier hash exactly. The current API file independently passed **23/23** in this check.
- Maker’s subsequent API TSC0 is disclosed; TSC/build/broad tests were not repeated.
- Read collection records report **725/725 Node files**, ten batches all exit0, and **143 web files / 1,281 tests**. Collection is not test-body execution.
- Broad evidence remains attributed to its recorded maker execution; no independently rerun whole-suite or fully fingerprinted transitive-environment claim is made.

Installed checker, maker, lock and configured structure hashes match their pins. No fresh root `--policy-check` execution is claimed. The shell helper failed setup; local Node child execution worked. Git’s inaccessible global-ignore warning did not fail the commands.

The prior cycle3 canonical verdict was verified byte-identical to its preserved reference:

```text
1e2a2164e61e7f72a768c25a712d15649d3b53c19b0253fff2e350d886b1382d
```

Source and manifest remained unchanged after verdict persistence. No sibling current result was read. Only owned review outputs were written; no agents, credentials, external network, production writes, commits or push. API tests used owned loopback test servers and synthetic stores.

LIVE-BROWSER: not performed for this read-only CODE repair.

REMAINING: blind-check aggregation and full parent C1–C8 gates—hosted identity/configuration and live Calendar/Gmail comparison; active worker/scheduler heartbeat; independently verified real two-slot AV, capture and transcripts; restart/recovery; seven-day observation; Ubuntu qualification; provider-backed extraction/index/cited Ask; human semantic/evaluation gates; and separately approved production promotion/deployment. No parent task closes from this CODE PASS.

Metrics: start=2026-10-27T13:22:42.329Z end=2026-10-27T13:29:44.026Z wall_min=7.03 agent_min=unavailable blocked_min=0 suite_runs=0 repeat_runs=0 mutations=1 cycle=4 resumes=0 tokens=unavailable builder_min=unavailable check_min=7.03 maker_tokens=unavailable checker_tokens=unavailable policy=proportional-verification/2026-10-19.17 check_s=421.7 mutants=1 defects_unit=0 defects_6c=0
