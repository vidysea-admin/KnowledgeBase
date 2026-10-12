# iss-jobqprune-001-retention-30-days

**Handshake status:** checked-PASS (cycle 0)
Fix cycle: 0
Tier: Approver ruling (D-128, "Approver ruling 2026-10-12 (2)": job-queue retention 30 days). Data-write class: full ceremony.
Lane: lane/jobqretain (from 15015cf). No new ledger file; no existing ledger row edited (ISS-JOBQPRUNE-001 is answered by this unit; ISS-JOBQLOST-001 closes on checker PASS).

## Scope
Only `packages/core/src/job-queue/` (+ this manifest). `core/index.ts`, `run-state-store/`, contracts, DECISIONS untouched.
- `FileJobQueueOptions.pruneTerminalAfterMs?: number | null`. **Unset = ON at 30 days** (`DEFAULT_PRUNE_TERMINAL_AFTER_MS = 30*24*60*60*1000`, exported). A positive safe integer overrides. **`null` disables** pruning (no stamp, no removal; the pre-default behaviour). `0`, negatives, non-integers still throw RangeError (0 is NOT a disable switch). Pruning semantics unchanged (terminal jobs of the operation's tenant only; ready/leased never; backwards clock prunes nothing; same single atomic save).
- Consequence documented in the option's doc comment: idempotency of a producer's job id now lasts 30 days after the job turns terminal. Pre-existing terminal jobs without a stamp are stamped on the first op and age from then.
- Tests: `file-job-queue.prune.test.ts` helper `mk(null)` now passes `null` (was `undefined`, which now means default) and the first test is renamed "disabled with null"; 6 new tests (constant = 30 d; kept at 30 d - 1 ms, pruned at 30 d; dead pruned, ready/leased never; other tenant untouched; override 1 h / 2 x 30 d and null disable; 0 still invalid, null accepted). No other suite edited.

## Evidence (packages/core, node v24.19.0 off PATH, `timeout` around each)
main 15/15; lost-update 6/6 x5; stalled-holder 10/10; pid-reuse 8/8; ids-crash 4/4; tenancy 6/6; property 1/1; prune 20/20 (was 14); lock-eperm 17/17 x5. `tsc --noEmit -p tsconfig.json` exit 0.

### Growth replay (ISS-JOBQLOST-001 recorded shape: 99% finished, 100/1000/5000 jobs, real fs, tenant ta, finished jobs stamped older than 30 d, clock 31 d; median of 7)
| jobs | null (disabled): seeded -> after first op / enqueue / claim | default: seeded -> after first op / enqueue / claim |
|---|---|---|
| 100 | 31.4 -> 31.6 KB / 49.0 / 33.4 ms | 31.4 -> 0.5 KB / 33.0 / 55.1 ms |
| 1,000 | 316.1 -> 316.3 KB / 55.6 / 85.8 ms | 316.1 -> 3.2 KB / 42.4 / 53.4 ms |
| 5,000 | 1589 -> 1589 KB / 144 / 136 ms | 1589 -> 15.4 KB / 34.3 / 25.8 ms |
(Machine shared with a live worker; timings noisy. Script not committed.)

## NOT covered
- No mutation run this unit (change is a default flip; the prune suite's 9 recorded mutants still apply to unchanged logic).
- Wiring: the queue is still not wired. Remaining ISS-JOBQUEUE-002 before-wiring conditions: ISS-JOBQSTALL-001 and ISS-JOBQPID-001 (low windows); callers must pass `tenantId` on every ref/claim and use unguessable or namespaced ids; ISS-JOBQPRUNE-002 (tenant-less ops prune nothing; lock hold grows with live jobs).
