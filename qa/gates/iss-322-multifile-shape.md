# GATE — the ISS-322 email-authentication fix needs a multi-file shape approved (and it is wider than the answered gate)

**Opened:** 2026-09-27 by the maker, while scoping the unit `qa/gates/iss-322-sender-spoofing.md`
authorized on 2026-09-27T10:32 ("(a) require Gmail Authentication-Results").
**Owner:** Umesh (Approver). **Severity:** high — auth/trust class, so full ceremony regardless.
**Blocks:** the ISS-322 build. Nothing else; the answered gate's *policy* is not being reopened.

## Why you are being asked again, when you already answered (a)

You answered **what** to require. This gate is **where to enforce it**, and the honest answer turned
out not to be the place ISS-322's own `fix_direction` names. The project CLAUDE.md requires a
multi-file change to be proposed before it is written, and this is one.

## The thing ISS-322 gets wrong (filed as ISS-333, high)

ISS-322 names `isTrustedSender` as the enforcement point. It is neither the only route nor the
shortest one. Three surfaces chain, and the short one never calls that function:

1. `packages/meeting-bot/src/calendar/auto-join.ts:251` — the config allowlist
   (`!item.preTrusted && !isTrustedSender(...)`). **This is the surface ISS-322 describes.**
2. `auto-join.ts:170` — `preTrusted: c.status === "approved" || c.status === "auto_approved"`.
   Because line 251 short-circuits on `!item.preTrusted`, **a preTrusted item never evaluates
   `isTrustedSender` at all.**
3. `apps/api/src/store.ts:181-182` — `getTrustedSender(tenantId, candidate.senderDomain)` →
   `status = trusted?.autoApprove ? "auto_approved" : "pending"`. This is what *sets* the status
   feeding (2), keyed on `senderDomain` = `senderEmail.split("@")[1]` from the raw From header —
   `gws-gmail.ts:278-280`, the exact lines ISS-322 quotes.

**The spoof route:** forge `From` as any domain that has crossed `AUTO_APPROVE_THRESHOLD` (three of
your approvals, `packages/db/src/collections/trusted-senders.ts:23-37`) → `store.ts` files it
`auto_approved` at scan time with no human in the loop → `auto-join` sees `auto_approved` →
`preTrusted` → the allowlist check is skipped → auto-record.

Putting the Authentication-Results check inside `isTrustedSender` **leaves that route completely
untouched.** It is also the cheaper route to attack: the config allowlist holds 2 emails + 2 domains
and changes only when you edit it, while `trusted_senders` grows by one domain every third approval
you click.

## What I propose to change (all edit-in-place)

Enforce where the unauthenticated header *becomes* trust, not at one of its consumers.

- **`apps/api/src/gws-gmail.ts`** — surface the `Authentication-Results` header on
  `GmailMeetingCandidate`. **Raw string only**, ~4 lines: this file is at **286 of the 300-line C1
  budget** and cannot hold a parser.
- **`packages/meeting-bot/src/calendar/auto-record-policy.ts`** — the parser and the rule
  (`parseAuthenticationResults`, and `isTrustedSender` taking the verdict). This is the trust-policy
  module and it has room: **85 lines used of 300.**
- **`apps/api/src/store.ts:181-182`** — refuse `auto_approved` when the sender is not authenticated;
  drop to `pending`, i.e. one click from you. **This single change closes routes (2) and (3)
  together**, because `preTrusted` can then only come from an authenticated scan or an explicit
  human decision.
- **`packages/meeting-bot/src/calendar/auto-join.ts`** — pass the verdict through. At **291 of 300**,
  so this must stay a handful of lines.

## The decision I actually need

**(a) Approve the shape above — recommended.** Fix routes (1), (2) and (3) in one unit, because
fixing (1) alone closes nothing. Four files, two of them near the LOC budget but with room for the
few lines each needs.

**(b) Fix only `isTrustedSender` (literal ISS-322 scope), file ISS-333 for later.** Smaller diff and
literally what the answered gate says — but it ships a fix whose headline claim is false, and leaves
the cheaper route open while the ledger reads "ISS-322 fixed". I do not recommend this and would
want the manifest to say plainly that the spoof is still reachable.

**(c) Something else** — e.g. you would rather `auto_approved` never exist without a human click at
all, which is simpler than authenticating it and is a product call, not a security one.

## One thing I could not settle without you

`store.ts` is in `apps/api`, `auto-record-policy.ts` is in `packages/meeting-bot`. If the depcruise
rules forbid `apps/api` importing `packages/meeting-bot`, the parser needs a home both can reach
(`packages/core`?) — which would be a **new file**, and the anti-drift rule reserves that for you. I
have not checked the rule yet because the answer only matters under option (a). Flagging it now so
it is not a surprise mid-build.

## Cross-cutting note, not part of this gate

`DEFAULT_TRUSTED_SENDER_DOMAINS` contains `ashoka.edu.in` — the domain of the webinar that failed to
record today. Authentication will not change whether Ashoka is trusted; it changes whether mail
*claiming* to be Ashoka is. Worth knowing the two are independent.

**Answer format:** reply `iss-322-multifile-shape: a` (or b / c). The maker appends
`Answered: <ISO> - <choice> - <where>` here, and under option (a) or (c) an authorizing DECISIONS
entry is written before any file is touched.

**Answered:** (pending)
