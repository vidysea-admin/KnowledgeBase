# Full-parent contract — T-013 avatar/voice counsellor client

Status: active; checker-owned; created 2026-10-14.
Roadmap tier: 3. Parent task remains open until every criterion below passes.

## Authority and scope

- TASKS.md and .goal/goal.json T-013: Avatar/voice counsellor client, depends on T-009.
- .goal/catalogue.json C13: Talk to your KB (real-time voice); C14: 3D-avatar AI Knowledge Assistant. Both currently lack probes; that absence cannot lower full-parent acceptance.
- ARCHITECTURE.md sections 1, H3, H7 and section 5: counsellor is a client of the existing knowledge API; internal-first grounded answers; separate web citations; auth-derived tenancy.
- docs/goal.md: reliable webinar knowledge strengthens the virtual counsellor; the vision also mentions an existing partially built 3D avatar.
- Developer API and web-ask-page contracts establish the existing authenticated client, citation and failure boundaries. Their older mock-only scope does not discharge this new full-parent live acceptance.
- D-170 authorizes application implementation and independent contracts, preserving credentials, spend, production writes/activation and real live acceptance gates.

This contract checks the functioning 3D-avatar/real-time-voice API client. It does not claim championship victory, independent-human counsellor quality, speaker identity certainty, account delivery, model training or a new brain. A 2D graphic can be a verified source slice, but cannot close C14 or full T-013. Browser-native voice can implement the client, provided the supported browser and any remote recognition service are disclosed accurately.

## Full-parent acceptance

| ID | Required behavior | Required evidence |
|---|---|---|
| F1 | The running product exposes the counsellor through app navigation and an actual route. It uses existing authenticated API/client and configured provider plumbing, rather than fabricated answers or a disconnected duplicate brain. | Checked central route/navigation integration, actual mounted page, and real authenticated POST /ask response from the established API/provider path. |
| F2 | Typed input and actual microphone speech can each produce a nonblank question. An explicitly enabled conversational mode supports real-time spoken question → answer/readback without requiring manual typing/submission each turn. The recognized transcript remains visible/editable in dictation mode; blank input issues no request; input mode and permission/capability/error states are clear. | Real browser microphone recognition with the resulting transcript and transmitted query, including the enabled conversation flow and its stop control; focused blank, denied, unavailable and recognition-error probes. Dictation plus a disconnected read button, or injected recognition callbacks alone, cannot prove real-time voice. |
| F3 | The counsellor presents the actual API answer and can speak it through functioning voice output. The user can stop playback. Unsupported synthesis/no available usable voice/failure is surfaced without falsely claiming speech succeeded. | Real supported browser speech output with retained observation or audio, actual answer-to-utterance trace, stop/cancellation proof, and focused unavailable/error probes. A fake speak spy alone is insufficient. |
| F4 | A visible actual 3D avatar reacts to listening, awaiting an answer, speaking and completion/failure states; its state reflects the relevant voice/API lifecycle. It remains understandable with motion reduced and labelled controls. Unsupported rendering is honest. | Actual depth/mesh rendering source and real supported-browser render evidence, state-boundary checks, and retained live interaction observations/screenshots. A 2D SVG/decorative icon cannot close C14. A jaw animation must follow the actual synthesis lifecycle; phoneme-perfect lip sync is not inferred or newly required. |
| F5 | Grounding survives the new interface. Internal and web sources are separate and labelled. Returned internal provenance retains session/turn, speaker label, timestamps and quoted evidence when supplied; links resolve to real tenant-authorized detail. Missing provenance remains explicit, without fabricated identities or dead links. Web anchors accept only HTTP(S). | Real internal answer and citation click-through to the source session/turn, parity with returned evidence, plus focused absent/malformed evidence and unsafe-URL probes. The interface does not claim resolved speaker identity from a diarization label. |
| F6 | Weak coverage, provider/web failure, API errors and auth/scope/rate-limit failures remain honest. A prior answer is not presented or spoken as the result of a failed new query. Spoken wording must not erase the answer's displayed coverage qualification. | Focused failure and insufficient-coverage checks; real-provider/live failure evidence where already available, attributed precisely. |
| F7 | Auth changes, overlapping work and navigation/unmount do not leak an old user's answer or allow stale recognition/API/synthesis callbacks to render data, submit work or restart voice. Recognition and playback stop on cancellation/unmount/auth change. Keys remain within the existing credential mechanism, never logs/UI/citations/voice. Tenant is never client-selected. | Independent race/failure probes covering delayed response across key/session replacement, callbacks after stop/unmount, and visible/voice state reset. Relevant existing auth/scope behavior is reused only with clear checked-byte attribution. |
| F8 | The complete interaction is demonstrated against real sample knowledge and its immediate consumer: spoken/typed query → established provider/API → grounded answer → avatar/voice output → working source view. | Retained dated real end-to-end evidence identifies app/API/browser/provider/model configuration, sample query/source, response, voice observations and downstream citation result, omitting secrets. Existing unrelated Ask-page evidence cannot establish this new client. |
| F9 | The delivered bytes and focused integration checks are reproducible and regressions are disclosed. | Matching ready-for-check manifest/cycle/packet/final hashes; focused client tests, relevant typecheck/structure checks and contracts/verify_contracts.py when applicable, with exact command/output/exit/duration. Root-owned shared composition is included in checked hashes. |

## Checking and honest partial delivery

The checker may identify a verified source slice, but full T-013 PASS requires F1–F9. Missing actual microphone, speech output, provider/API or citation evidence is HOLD rather than inferred success. Proven source violations are FAIL. Retain exact source hashes and distinguish independently reproduced checks from attributed maker/root evidence.

Check at least one independent meaningful boundary beyond happy-path implementation tests. Source-only tests must cover safe external links, malformed provenance, cancellation and stale auth responses/callbacks. Do not run browsers, competing full suites, paid provider calls, credential setup or production writes without the coordinator's execution/approval allocation. Never edit product source or existing ground-truth contracts to make a failing candidate pass.

## Initial gaps

At contract creation, repository searches found the existing Ask client and provider/citation foundations, but no T-013 counsellor/avatar/voice implementation or matching live evidence. Central navigation/composition, new client implementation and real voice/3D/API/provider/citation proof remain required. C13/C14 were independently located after the initial draft; their real-time-voice/3D wording is now explicit in F2/F4 rather than treating 2D/dictation as full completion.
