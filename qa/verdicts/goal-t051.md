# T-051 checker verdict — cycle 0

VERDICT: FAIL
Cycle checked: 0
Scope: C1 Ubuntu supervisor installer interface. Full T-051 C2-C4 acceptance: HOLD, actual Windows/Ubuntu live operation/recovery and seven elapsed days are absent. A foundation verdict cannot close T-051.

## Reproduced finding

Activation verifies the physical config unit but invokes systemctl by unit name without checking the manager's effective FragmentPath, drop-ins or executable binding. A shadowed effective unit can therefore be started despite the verified file. This violates C1's exact verified-unit activation and fail-closed unknown-state boundary. The official [systemd unit manual](https://github.com/systemd/systemd/blob/main/man/systemd.unit.xml) describes unit-path precedence and custom unit load paths; this is an actual unit-resolution boundary, not a claim of live Ubuntu execution.

Independent in-memory probe uses the real installer and the maker fixture filesystem, then independently models a manager whose effective unit is /run/user/1000/systemd/transient/lkb-webinar-portable-supervisor.service. On enable --now it tracks the chosen effective unit. The installer returned status=activated, refused=false and launched that differing path. It queried only preview, daemon-reload, enable --now and is-active; no effective-unit binding check occurred. The probe asserts refusal before any launch and exits 1.

Required repair: independently verify the manager's effective unit/command and absence of overriding drop-ins before any enable/start; reject missing, unexpected or contradictory binding/state. Preserve disabled exclusive installation and existing runner gates. Submit cycle 1; do not erase this evidence.

## Exact focused commands and results

```sh
node --test --test-isolation=none --test-concurrency=1 --test-timeout=15000 scripts/webinar/supervisor/install-ubuntu-supervisor.test.mjs
node qa/evidence/goal-t051checker-shadow.mjs
python contracts/verify_contracts.py
```

Independent supplied suite: exit 0, 10/10 PASS, 0 skips, TAP152.8945ms. Actual production setup renderer consumption passes. Frozen validator: exit 0, PASS by vacuity (no frozen contracts). Combined command observation 18:39:31.7184876Z-18:39:33.1459082Z (1.4327147s; tool wall2.9719024s). The first probe in that batch hit a checker-only missing UNIT_NAME fixture injection, so it was corrected and is not acceptance evidence.

Corrected independent probe: node exit 1 with AssertionError: Activation must refuse a manager effective unit differing from the independently verified physical unit before launching it. Observation18:39:45.0100637Z-18:39:45.3986300Z (0.3908296s; tool wall1.0973138s). Source fixture is qa/evidence/goal-t051checker-shadow.mjs. All filesystem/systemctl seams were in memory; no actual service/file installation, provider/database/browser action occurred. No production source mutation or mutation-test restoration was needed.

## Checked bytes and provenance

Packet: qa/packets/goal-t051.md; manifest: qa/manifests/goal-t051.md, ready-for-check cycle0. Independently read new source, tests, exact unit producer, runner workDB/live-proof/tenant gates and docs. Final hashes match packet:

| Path | SHA256 |
| --- | --- |
| scripts/webinar/supervisor/install-ubuntu-supervisor.mjs | da3b1e17ebfc121d6ca53928b3960dae38e9729067514f0037f0d846f523b2df |
| scripts/webinar/supervisor/install-ubuntu-supervisor.test.mjs | e0ddc9086978dbe4c9abc2560b2cdb0cd0d2a3c0ec90abdd60dd8b3a0e2361fb |
| docs/webinar-release.md | 052575ef6f0b161fadfd899ca28ff8382c2426850b87d3eb4c89c98680c5d2cc |

## Phases, timing and limits

Observed checker launch/read start18:34:54.2393694Z; read review checkpoint18:36:07.2608317Z. Root CPU lease was requested, then explicitly granted; exact request/grant seconds are unmeasured. Primary-document read confirmed load-path semantics; no local UI/browser opened. Focused commands and independent failure ended18:39:45.3986300Z. Draft/persist follows this observation; initial scope review and waiting exceeded120-180s because the shared CPU needed a root lease and an effective-unit security boundary required an independent probe. No elapsed interval is falsely attributed to drafting by subtraction. Complete launch-to-persist timestamp is recorded in tool outputs; initial marker before this observed launch unknown.

ISSUES-WRITTEN: none; the concrete same-unit finding is persisted here and routed verbatim to maker/root. No unrelated backlog/sweep or broader test suite ran.

EXPLANATION: Proven C1 acceptance violation requires FAIL despite the existing ten tests passing. All C2-C4 live, real provider/index/cited-Ask, supervisor recovery/alerts and seven-day acceptance remain HOLD. Repairing C1 alone can earn only a scoped foundation PASS and never whole-task completion.

---

# T-051 checker verdict — cycle 1

VERDICT: PASS
Cycle checked: 1
Scope: C1 Ubuntu supervisor installer software foundation ONLY. Full goal T-051 C2-C4: HOLD, not completed. This matching-cycle foundation verdict supersedes cycle0 for the repaired source and preserves the original finding/history above.

## Independent executed acceptance

At19:27:55.7542895Z-19:27:56.1657714Z, independently executed these exact commands sequentially after the current ready-for-check cycle1 manifest's three SHA256 pins matched:

```sh
node --test --test-isolation=none --test-concurrency=1 --test-timeout=15000 scripts/webinar/supervisor/install-ubuntu-supervisor.test.mjs
node qa/evidence/goal-t051checker-shadow.mjs
node qa/evidence/goal-t051checker-safe.mjs
```

Suite exit0,11/11 PASS,0fail/skip/cancel, TAP42.2619ms. Original unchanged shadow reproduction exit0: effective transient fragment differed, launched=null, refused=true, and calls stopped at manager show before any enable/start. Separate independent safe-control exit0: exact installed fragment yielded activated with liveRecoveryVerified=false; show followed daemon-reload and preceded enable/is-active. All three source hashes were independently rechecked after commands and remained unchanged. Total measured shell batch0.4122587s, toolwall1.8s; individual probe durations were not measured. Every filesystem/service seam was mocked; hostActions=false. No service, browser, provider or real DB action occurred.

Current code directly queries the manager's FragmentPath, DropInPaths, loaded/transient/reload state, WorkingDirectory, DISPLAY and single exact ExecStart path/argv before launch, then rereads the owned physical unit. Unknown/contradictory bindings are refused. Existing preview, disabled exclusive private install, root/OS/display/path/ownership guards and runner proof/database/tenant gates remain. Quote-safe preview/install is preserved; activation requires simple physical POSIX path tokens, explicitly documented because unfamiliar manager serialization fails closed.

The original regression command was rerun verbatim rather than replaced by a easier corpus; its one recorded shadow case is1/1 refused. The11-case standing suite also exercises the new manager fragment/drop-in/reload/executable attack matrix and actual common setup renderer consumption. The safe-path probe independently establishes that the security repair does not merely reject every activation.

## Final candidate/provenance

Manifest qa/manifests/goal-t051.md ready-for-check, cycle1; packet qa/packets/goal-t051.md cycle1 with attributed maker11/11 and original-probe refusal evidence. Earlier manifest stale pins were detected and repaired by maker before independent execution; no source or test change was inferred from chat alone.

| Path | SHA256 |
| --- | --- |
| scripts/webinar/supervisor/install-ubuntu-supervisor.mjs | 0098172515a1bea31a366ba0653c8896f0178f2ee27e214e6fcc3cbbd1fa710c |
| scripts/webinar/supervisor/install-ubuntu-supervisor.test.mjs | 0f1448090a28ba3408528721ebf43fb4529f46ce1c6e731549f8bfa421b430b5 |
| docs/webinar-release.md | 1201d54d6bd044aa397d888bb41db76c5816b99c39ac165e544ef72965435e68 |

Required frozen-validator evidence is attributed from qa/evidence/goal-t051checker-validator.json: exact python contracts/verify_contracts.py exit0/PASS by vacuity, with validator+registry byte pins. It is an empty frozen-contract gate and does not prove actual pipeline release.

Observed resumed scope read19:24:59.0940146Z; packet repin awaited; focused review/commands ended19:27:56.1657714Z. Draft/persist starts 2026-10-14 19:32:15 UTC. Required queue/packet and user-directed pause/resume intervals are separate from CPU command time; complete initial-dispatch elapsed remains unknown. No approval was requested by this checker, and no broad suite ran. The root CPU lease was released after the three completed processes.

ISSUES-WRITTEN: none; original same-unit manager-binding finding is corrected.

EXPLANATION: Maker may close this C1 software foundation manifest as checked-PASS, explicitly retaining full-parent HOLD. Actual Ubuntu and Windows installation/activation/restart/capture, real provider-to-index-to-cited-Ask proof, health/alerts and seven elapsed days remain mandatory C2-C4 gates. Do not mark T-051 done, production live, or all forty goal tasks complete from this PASS.
