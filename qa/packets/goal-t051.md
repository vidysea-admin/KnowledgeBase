# T-051 Ubuntu supervisor interface — cycle 1

Authority: D-170, user full forty-task implementation goal; root exclusive lease for these supervisor files and T-051 documentation section. Priority tier 3 (T-051).

Candidate paths and SHA256:
- scripts/webinar/supervisor/install-ubuntu-supervisor.mjs: 0098172515A1BEA31A366BA0653C8896F0178F2EE27E214E6FCC3CBBD1FA710C
- scripts/webinar/supervisor/install-ubuntu-supervisor.test.mjs: 0F1448090A28BA3408528721EBF43FB4529F46CE1C6E731549F8BFA421B430B5
- docs/webinar-release.md: 1201D54D6BD044AA397D888BB41DB76C5816B99C39AC165E544EF72965435E68

Both installer files are new; docs modifies the T-051 section. Contract: qa/contracts/goal-t051.md C1 installer/interface foundation; retain C2-C4 actual host/live/elapsed-time full-release gates. Earlier Windows installer foundation and its historical QA files remain untouched.

Behavior: default preview executes actual setup.mjs --service-preview --display=<local X11>, 15s/65536-byte bounded native node subprocess. Validate every unit directive against fixed common runner, paths/display, restart and user graphical target. Linux/non-root principal, physical no-link source paths, current-user private config dirs, root-owned non-writable systemctl. Install checks known disabled/not-found state; exclusive O_EXCL/O_NOFOLLOW mode0600 write and owned bounded readback; rechecks disabled state. No daemon reload, enable or start in installation. Separate explicit activation validates exact installed unit, reloads user systemd, enables/starts only fixed unit, and checks is-active. Unsuccessful state/commands fail closed; an active service returns liveRecoveryVerified:false.

Immediate consumers: scripts/webinar/setup.mjs renderServicePreview; scripts/webinar/run-pipeline.mjs --run --watch. Runner's protected work DB, connected tenant and OS-specific actual live media proof unchanged. No new credentials, default activation, external messages, capture/DB/provider calls, system installation or OS setting change occurred during implementation.

Security flags: system user-unit write only via --install and explicit --activate runtime launch interface. No auth API/schema/tenant DB read/write changes. Require fixture attacks on root/OS/display, symlink/private permissions/foreign owner, malformed unit/rebinding/extra directives, existing unit/enablement, bounded subprocess failure and configured runtime command consumption.

Maker command: node --test --test-isolation=none --test-concurrency=1 --test-timeout=15000 scripts/webinar/supervisor/install-ubuntu-supervisor.test.mjs
Result exit0;10/10 pass;0fail;0skips; TAP duration173.693ms; exec2.8246907s. Tests use in-memory OS/FS/systemctl seams, never actual installation/activation. Last test evaluates only actual production setup renderer definition (importing setup would run doctor), consumes Linux paths and %/$ escaping with the actual installer validator. Earlier isolated node test runner produced spawnEPERM before product tests; no-isolation avoids that environmental child-spawn restriction. Initial nine-test pass superseded by final ten-test candidate. No mutation tests or browser runs.

Static source node --check commands exited0; git diff --check -- docs/webinar-release.md docs/DECISIONS.md exited0. Previous packaging frozen-contract verification passed by vacuity; no new frozen contracts exist. No fresh validator execution claimed here.

Upstream systemctl is-enabled statuses disabled/nonzero and not-found/4 verified from primary systemd manual: https://github.com/systemd/systemd/blob/main/man/systemctl.xml. Actual target Ubuntu/version/systemctl behavior remains part of live gate; any unrecognized state is refused.

Remaining full T-051 acceptance: actual Windows and Ubuntu installation/supervision/restart/recovery; configured credentials/account/profile; real discovered admitted webinar, audible/changing media, timing-valid provider transcription, frame/speech provenance, tenant-safe index/search/cited Ask; actual alerts; seven elapsed unattended days. No source test substitutes those proofs. No full task closure.

Current cycle 1 maker evidence: node --test --test-isolation=none --test-concurrency=1 --test-timeout=15000 scripts/webinar/supervisor/install-ubuntu-supervisor.test.mjs -> exit0,11/11,0skips,TAP113.7327ms,tool6.2222385s. node qa/evidence/goal-t051checker-shadow.mjs -> exit0, unchanged recorded reproduction now refused:true, launched:null, no enable/start, stops at effective-manager show. Three candidate hashes above are current cycle1; earlier10-test cycle0 evidence remains historical. Independent cycle1 checker pending; full C2-C4 still NOT VERIFIED. No actual systemctl/host/capture/provider/database call.
