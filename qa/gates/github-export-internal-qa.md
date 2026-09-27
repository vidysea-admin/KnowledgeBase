# HUMAN_GATE — export internal QA evidence to GitHub

**Question:** May commits containing this repository's internal QA ledger, manifests, verdicts,
gate records, and browser/evaluation evidence be pushed to
`https://github.com/umeshsugara-ai/living-knowledge-base.git`?

## Why this is a gate

The user requested continuous commits and pushes, but the environment safety reviewer rejected
`git push origin master` because these commits export internal issue/feedback/evidence content to
an external GitHub destination. Local commits are continuing; only the network export is paused.

## Options

- **A — approve this named repository and content scope (recommended if the remote is private and
  intended for this material).** Push the accumulated verified commits to `origin/master` and keep
  pushing later checked-PASS increments under the same scope.
- **B — code only.** Do not export internal QA/evidence; first prepare a separate redacted/code-only
  history or repository plan for approval.
- **C — no GitHub export.** Keep all commits local.

**Answer format:** `github-export-internal-qa: A`, `github-export-internal-qa: B`, or
`github-export-internal-qa: C`.

**Blocks:** GitHub push only; it does not block local builds, tests, checker validation, or commits.

**Opened:** 2026-09-09T18:00:46+05:30 after the environment rejected the attempted push.

**Answered:** 2026-09-21 — **A (approve repo + content scope)**. Umesh approved pushing the
accumulated verified commits — including the internal QA ledger, manifests, verdicts, gate
records, and browser/evaluation evidence — to
`https://github.com/umeshsugara-ai/living-knowledge-base.git`, and continuing to push future
checked-PASS increments under this same scope.

## Condition correction — 2026-09-27 (checker, Umesh answering live)

**The 2026-09-21 answer above was given against a premise that was false at the time.** Option A
reads "recommended if the remote is private and intended for this material", but
`umeshsugara-ai/living-knowledge-base` was **PUBLIC** when that answer was recorded and remained
public until today. Measured before acting: **48 real third-party email addresses** of named people
at external institutions (Ashoka, JGU, BMU, SNU, Atlas, Masters Union, iDreamCareer and others) sat
in tracked files, **40 of them already public** from the 2026-09-21 push, alongside 214 tracked
files under `raw/`/`data/` holding real webinar session data.

**Resolution, Umesh answering in session 2026-09-27:** make the repository **private first**, then
push. Executed in that order:

1. `gh repo edit --visibility private` — confirmed `visibility: PRIVATE`. Checked immediately before
   flipping: `forkCount: 0`, `stargazerCount: 0`, so no fork or mirror retained a public copy and the
   prior exposure was not propagated.
2. `git push origin master` — `4bce7d1..dcf2b47`, 189 accumulated commits; `git rev-list --count
   origin/master..master` now `0`.

**Scope going forward is unchanged from option A, with the condition now actually true:** future
checked-PASS increments push to this same remote, which must stay private. **If anything ever flips
it back to public, this gate is void and must be re-asked** — the content scope A approves is only
safe under privacy, and that is the dependency the original answer left implicit.

**Residual risk, stated rather than closed:** the 40 addresses were publicly reachable between
2026-09-21 and 2026-09-27. Making the repo private stops further access but cannot un-cache what
third parties may already have fetched or indexed. No remediation is claimed here.
