# wa-selection-api checker A: mutation evidence (head 225fcfee, code 1d557bbf)
Throwaway copy `git archive 225fcfee` outside the bound root, junctions to the main node_modules. Driver applies ONE mutant at a time, runs
`node --test --import tsx src/whatsapp/selection/router.test.ts` (timeout 120 s), restores the saved bytes in `finally`, then checks
`git hash-object` equals the HEAD blob (service.ts 5e413934, router.ts 70724461). All restored: true (first-run `restored:false` was a driver bug in
a raw-byte hash on CRLF files; `git hash-object` after that run equalled the HEAD blobs, and every later run reported true).

| Id | Criterion | Mutant (service.ts) | Result | Red test |
|---|---|---|---|---|
| M1 | W6-1 floor | admin-write refusal `if (!owner && write) return ADMIN_READ_ONLY` removed | KILLED (15 pass / 2 fail) | C1 refusals; C1 gate |
| M2 | W6-2 floor | Mongo write verb added to service.ts | KILLED | C2 source assertion |
| F3 | W6-3 floor | setGroup in-list group check replaced by a synthetic group | KILLED | C3 jid not in THIS owner's list |
| F4 | W6-4 floor | `jid` added to selection.changed data (setGroup) | KILLED | C4/C6 events |
| M5 | W6-5 floor | default archiver failure mapped to 503 selection_unavailable | KILLED | C5 archiver down |
| F6 | W6-6 floor | `same` idempotent short-circuit removed | KILLED | C4/C6 events |
| M1b | W6-1 extra | `if (!owner && !p.admin) return NOT_FOUND` removed | KILLED (3) | C1 refusals; C1 admin reads; C3 |
| M7 | W6-1 extra | listPeople authority downgraded to the read check (admin could read people) | KILLED | C1 refusals |
| M3 | W6-3 extra | setGroup `JID_RE` check removed | SURVIVED | none (test accepts 400 or 404; the in-list check makes it behaviour-equivalent: a malformed jid cannot match a listed group) |
| M4 | W6-4 extra | setPeople emits event even when archiver says `changed:false` | SURVIVED | none (no test repeats a setPeople; source has `if (r.changed)`, so product behaviour is correct, test gap only) |
| M6 | W6-6 extra | `same` ignores `trackAllSenders` | SURVIVED | none (no test re-marks with a different trackAllSenders; source is correct, test gap only) |

Other runs: `router.test.ts + links/router.test.ts + links/service.test.ts` -> 41 pass, 0 fail (reproduced). `tsc --noEmit -p apps/api` in the copy -> exit 0.
Production factory probe (`buildWhatsAppSelection` over a stub Db and stub archiver, copy only): `setGroup` -> one `whatsapp_events` insert
`{eventType:"selection.changed", actorKind:"user", linkId, actorId, data:{groupCount:1, markedCount:1}, tenantId}`, accepted by `assertEventPayloadSafe`
and the schema (schema/whatsapp_events.schema.json), no log lines. A missing link -> 404 before any archiver call.
Not run: read-only-credential failed-write probe (starting a local mongod was refused by the permission system; not circumvented).
