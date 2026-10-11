# Verdict: iss-jobqueue-002-lost-update

VERDICT: PASS
Cycle checked: 0
Commit checked: a89f431 (lane/jobqlost, from 5c2a07f)
Scope: unwired; one machine; local filesystem; processes and worker threads.

## EXPLANATION

Guarantee I certify: on one machine and a local filesystem, writers in any mix of processes or threads that each finish their load-to-rename in far less than 30 s are serialised by `job-queue.lock`, and a writer that cannot get the lock writes nothing (typed `conflict`; see ISS-JOBQLOST-004 for a Windows case that comes back as `io-error`).
Before-wiring condition of ISS-JOBQUEUE-002: met for the lost-update half (lock, recorded repro safe), NOT met for the row's other half (no pruning, growth, ISS-JOBQLOST-001) and not for a holder stalled past 30 s (ISS-JOBQLOST-003). The row stays `open-before-wiring`; I did not change it.

- Row text read. Recorded repro: second `FileJobQueue.enqueue` on the same dir at each fs call of the first instance's enqueue, on the real fs. The test asserts the row text by regex and replays that interleaving against the real store and `realQueueFs`. "10 hook points" = every fs call of one enqueue now (mkdirp, create, read, mkdirp, create, read, read, rename, read, unlink): the row's ~6 plus the lock's calls. Re-run: 10/10 lose nothing; B stored at 2, conflict elsewhere.
- Counts re-run by me: lost-update 6/6, main 15/15, ids-crash 4/4, tenancy 6/6 (ISS-JOBQUEUE-001 repro 2/2), property 1/1, tsc exit 0. Matches the maker. Own 4-process stress (25 enqueues each): 0 acknowledged-but-missing in 3 runs.
- Lock: acquire is `wx` (atomic). Release unlinks only on own token, in `finally`, so a throw releases; a crash leaves a lock taken over after 30 s of wall age. Rename retries EPERM/EACCES/EBUSY (40x). `claim`/`complete`/`fail` return the save error, so no lease is handed out for a failed write; no-op changes write nothing.
- Takeover window (the key finding): NARROWED, NOT CLOSED. The token re-check, then the content re-check, then rename leave a gap of a few instructions. Scenario, reproduced on the real fs: A passes both checks, stalls >30 s before its rename; B takes over, enqueues, renames; A renames over it. A and B both report `enqueued`, only A's job is stored. B's acknowledged write is lost (ISS-JOBQLOST-003). Same class as ISS-LOCKTAKE-005: the run-state lock never displaces a live same-host pid below 1 h; this lock judges by age alone. Also the stale-break moves whatever is at the path, which can be a fresh lock. Outside the stated guarantee and disclosed by the maker; hence not FAIL. ISS-RUNLOCK-003 (no expected-revision revalidation) is not repeated: the content re-read does that here.
- Two lock implementations in `core` is duplication, a note only.
- Windows: EPERM on lock create/read is not retried (ISS-JOBQLOST-004; 1 to 2 of 100 ops under 4-process contention, no loss).
- Loosened tests: legitimate. main test: split into "only reads for the queue file" plus allowed lock traffic (stronger on the file). ids-crash: late crashes (lock release after the commit) must leave the committed version, with a new floor of 5; the retry step is skipped only for them. property: crash index range widened 4 to 9, "must not change" excused only when the log shows the rename already happened.
- Tenancy intact. One lock for the whole dir: a tenant's contention can only delay others by the 2 s wait then conflict (note, not a defect).
- Mutations (own, byte backup per mutation, restored in finally, hashes equal HEAD): 6/6 killed, all by lost-update.test.ts: wx to w, skip stillHeld, always-stale takeover, swallow conflict, release before rename, create skipped. Harness and debris removed; `git status` clean. The maker's 12 were not re-run.

ISSUES-WRITTEN: ISS-JOBQLOST-003 (medium), ISS-JOBQLOST-004 (medium), in qa/issues.jobqlost.jsonl
