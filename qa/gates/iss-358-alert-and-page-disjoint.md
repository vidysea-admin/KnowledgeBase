# PREMISE gate — ISS-358: the alert and the page watch different things

**Opened:** 2026-09-28 by the maker, on the u4c checker's finding. **Owner:** Umesh (Approver).
**Blocks:** nothing currently building. U4a and U4c are both `checked-PASS` and merged; U4b is in build.
This gate decides whether a **U4d** is needed, or whether R4's framing changes.

## The finding

Established by the u4c checker by reading the shipped code on master (U4a landed mid-review, so this is
the real merged behaviour, not a plan-level guess):

- **R1's alert** (`notifyPollFailed`, U4a) fires off the **`watch_state`** collection, via
  `scripts/watch/run-watch.mjs` — the U2 Drive / Gmail / Calendar watcher.
- **R4's page** (`WatchPage.tsx`, U4c) reads only **`watched_sources`** (the T-027/A13 URL bookmarks) and
  `meeting-candidates`.

These are **genuinely disjoint collections with zero code overlap** — not two names for one store. The
checker verified this directly rather than inferring it.

**Consequence.** The Ashoka-class incident — a Drive/Gmail/Calendar watcher that stops — *will* alert
correctly once U4a and U4b are live. The deep link in that alert lands the reader on a page with **zero
visibility into the failure that triggered it.** The page can only ever show the state of URL bookmarks,
and today only for a poll the reader triggered themselves, since `watched_sources` persists no failure
state and has no scheduler — its only caller anywhere in the repo is the page's own "Poll now" button.

**This is not a defect in U4c's build, and the gate should not be read as one.** D-046 approved R4-R8
against `watched_sources` **by name** — R6 cites its route explicitly. U4c built exactly what was
approved, disclosed the gap rather than working around it, and PASSed on its merits. The defect is one
level up: the spec was written against one collection and the alerting against another, and nobody
reconciled them. The maker wrote that spec, so this is its own miss.

## Why it matters more than its severity suggests

The feature's stated purpose is *"is the watching alive, and what is it about to do?"*, and its
justification is a specific incident. As things stand, the system will correctly shout about that
incident and then hand the reader a screen that knows nothing about it. That is a worse experience than
no page, because it invites the reader to conclude nothing is wrong.

It also interacts with the answer Umesh already gave. He chose **(b) push alert first, page second** —
which is a reason the gap is *survivable*: the alert carries the failure reason in its own text, so a
reader is not dependent on the page to learn what broke. But "the page is second" was never meant to
mean "the page is about something else".

## The options

**(a) A U4d that extends the page to read `watch_state`.** The page becomes one surface over both
collections: the Drive/Gmail/Calendar watchers that actually fail, and the URL bookmarks. Makes the
alert's deep link meaningful. Cost: another unit, and `watch_state` needs a read-only API route, since
nothing currently serves it to the web tier. **This is the maker's recommendation** — it is the option
that makes the feature do what it was justified by.

**(b) Re-scope R4 and say so plainly.** Accept that the page covers `watched_sources` only, and that the
alert is the whole surface for the `watch_state` class. Cheapest, and defensible under "alert first" —
but it must be written into the spec and into the alert's own text (the alert should then NOT deep-link
to a page that cannot show its subject), or the incoherence just stays undocumented.

**(c) Unify the two collections.** One watch substrate covering both source kinds. Structurally cleanest
and by far the largest — a schema and migration job touching U2's watcher, and not something to start
inside this wave.

## Two related rows, for context when answering

- **ISS-359** (medium, tenancy-adjacent): the checker's live two-tenant walk found
  `apps/api/src/fixtures.ts` `fakeMeetingCandidatesDeps` ignores its `tenantId` argument, so a second
  tenant's key saw the first tenant's candidates **in the test double**. The production path is
  `scopedCollection`-backed and verified correctly scoped, so this is a coverage gap, not a live
  disclosure. It matters because it is the class of defect ISS-078 was, and a test double that cannot
  fail on tenancy cannot protect against it.
- `watched_sources` having **no scheduler at all** is worth noting when choosing: option (b) leaves a
  page whose only data source is a button the reader presses.

## Answer format

`iss-358: <a|b|c>`

**Answered:** `iss-358: a` -- Umesh, AskUserQuestion, 2026-09-28. Extend scope in a **U4d** that gives the
`/watch` page visibility into `watch_state`; do NOT re-scope R4. Authorized by **D-047**. Per ISS-361, U4d
must also surface `watch_heartbeat`, which D-048 makes a third collection, rather than leaving a second
round-trip.
**Gate status:** ANSWERED 2026-09-28 (D-047). U4d is queued as the next U4 unit
recommends (a) and states that the unreconciled premise is its own, from the spec it wrote
