Checker evidence, t038-atomic-lifecycle-outbox cycle 1, 2026-10-26, judged on current master-descendant tree bytes.
run-a: lifecycle-alerts.test + alert-kinds.test (11/11). run-b / literal-b: pipeline+dispatch+index-proof-chain (15/15; literal-b is ISS-SCHEDULERRESUME-001's recorded argv, --test-timeout=30000).
cK-green / cK-red: green-before / red-after of one falsification per criterion, each in its own throwaway copy outside the bound root.
 c1 = C1 lifecycle-alerts.mjs update(): save() moved before prepare()   (restart-replay crash test red)
 c2 = C2 lifecycle-alerts.mjs tick(): outbox replay loop emptied        (saturation/restart test red)
 c3 = C3 lifecycle-alerts.mjs ack: every() -> some()                    (failed-channel-stays-durable red)
 c4 = C1 runner clause run-pipeline.mjs:154-155: update() moved inside the path catch (probe-catch test red; probe exists only in the copy)
probe-bound: outbox bound of eight + foreign tenant/invalid id probe (green, copy only).
