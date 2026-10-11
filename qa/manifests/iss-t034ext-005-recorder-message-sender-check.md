# iss-t034ext-005-recorder-message-sender-check

**Handshake status:** ready-for-check
Fix cycle: 0
Tier: 2/3 (open ledger issue ISS-T034EXT-005, medium, class auth/credential handling: full ceremony). Lane: lane/recsender. Lane ledger: qa/issues.recsender.jsonl (0 findings filed). Existing ledger rows untouched (the checker changes ISS-T034EXT-005's status).

## Scope and a finding the checker must weigh
Touches only `packages/meeting-bot/py/tab-capture/` (`recorder.js`, `recorder.test.mjs`) + this manifest.
**The row's headline defect was ALREADY fixed at HEAD** by commit 709038c ("pin recorder endpoint and sender"): `ownSender()` (id == `chrome.runtime.id`, no `sender.tab`, url under own origin, falsy sender refused) and the `127.0.0.1:<port>` endpoint pin, with tests (sender table, endpoint table). The ledger row still reads `open` with pre-fix text. This unit therefore (1) re-proves the recorded reproductions against the row's own text, and (2) closes residual fail-open edges in `ownSender`:
- `chrome.runtime.id` undefined/empty/non-string with `sender.id` equally undefined passed `s.id === chrome.runtime.id` (undefined === undefined). Now refused.
- non-string `sender.url` (object with a `startsWith`) is refused (`typeof` check).
- `message` null/primitive no longer throws in the handler (`message?.target`); returns undefined, no side effect.
Unchanged by design: a sender with the right `id`, no `tab` and NO `url` is still accepted (Chrome sets `id`; this is the pre-existing accepted form, tested). Prefix-only URL check (not pinned to `background.js`) is unchanged: pinning to exact pages could not be verified without a browser.

## Evidence (node v24.19.0 off PATH, `timeout` around each; fake `chrome.runtime`, vm harness, NO browser)
- `node --test recorder.test.mjs` -> `tests 37, pass 36, fail 0, todo 1` (the todo is the pre-existing `EXPECTED FAIL ISS-T034EXT-004`; baseline before my edits: 34 tests, 33 pass, 1 todo). 3 tests added.
- `node --test background.test.mjs` -> `tests 10, pass 10, fail 0` (P6: background registers no onMessage/onMessageExternal/onConnect).
- `tsc --noEmit -p packages/meeting-bot/tsconfig.json` -> exit 0 (does not cover these .js/.mjs files; stated, not claimed).
- Did not run `tab-capture-harness.mjs` alone (a helper, not a test). No file launching Chrome/OBS was run.

### D-015 count against the ledger's own recorded reproductions
`ISS-T034EXT-005: 2/2` refused. Tests `ledger replay 1/2` and `2/2` read the row from `qa/issues.t034ext.jsonl` at run time, assert its `evidence` still contains the recorded text, then replay verbatim: (1) sender `{id:'other-extension', url:'https://evil.example/p.html'}` start -> `ok:false`, 0 getUserMedia, 0 fetches, 0 recorders; (2) config `{endpoint:'https://evil.example', token:'stolen'}` -> `ok:false`, 0 fetches (nothing POSTed to evil.example). The row's `fix_direction` (reject foreign id/url; endpoint must match `^http://127.0.0.1:\d+$`) is implemented by the existing code and covered by the existing sender table + 28-form endpoint table. Reproductions left open: none.

## Listener inventory (whole extension)
| Surface | Where | Sender check |
|---|---|---|
| `chrome.runtime.onMessage` | recorder.js (offscreen) | YES, `ownSender` (fail closed); non-start messages ignored without side effect |
| `chrome.runtime.onMessageExternal` | none; manifest has no `externally_connectable` (test P6) | n/a |
| `chrome.runtime.onConnect` | none (background.test P6) | n/a |
| background.js `onMessage` | none (P6) | n/a |
| `chrome.action.onClicked` | background.js | browser action, not a message channel |
| `postMessage` / window `message` listeners | none in any file (grep) | n/a |
| `sendMessage` (outbound) | background.js -> recorder | not a listener |

## Mutations (7; harness `recsender-mut-harness.mjs`, untracked and deleted; byte backup per mutation restored in `finally`, 60 s timeout; afterwards `git hash-object recorder.js` = 56f994d0dd05b73567f7a186e07a532b65194c3f = intended post-fix blob)
7 KILLED, 0 SURVIVED: ownSender always true; runtime-id guard dropped; id compare dropped; tab check dropped; url prefix check dropped; `message?.` guard dropped; handler's sender check removed.

## NOT covered
- Never exercised in a real browser or against real Chrome sender objects (no extension load, per CPU constraint). Real shapes of `sender.url` for service-worker senders are assumed (own-origin URL), which is why a url-less own-id sender is still accepted.
- No pinning of the sender URL to `background.js`/`recorder.html`.
- The extension manifest/background.js hash-freeze (t052) is untouched; recorder.js is not in that list per the checker's earlier note, Approver to confirm sequencing.
