# Checkpoint - ua-production-enable (coordinator A) - cycle 0
Head 2ae928e5 (code e9600960), base 0f565734. Policy proportional-verification/2026-10-19.17. Environment: node v24.13.1, tsx 4.23.13, scratch copies of git archive 2ae928e5 outside the bound root (junctions to main node_modules, unlinked and deleted after). Bound tree untouched: git hash-object == HEAD blob for production.ts fd26ab0d, watch-runs.ts 6f2f9f10, production.test.ts 7ced9523, mounted-routes.test.ts 8f944804, user-accounts.ts d66cc39e; git status clean.
Completed checks (command -> result):
- node --test --import tsx apps/api/src/production.test.ts -> 6/6
- same on apps/api/src/composition/integrations/mounted-routes.test.ts -> 6/6
- same on watch-runs.test.ts watch-silence.test.ts health.test.ts watched-sources.test.ts -> 49/49
- tsc --noEmit -p apps/api -> exit 0
- lint-loc.mjs --all -> 9 of 10 stages exit 0 (loc dirsize root dupes migrations codex-hooks snapshot lint-tests tracker); stage dependencies not runnable in scratch (junction path ENOENT); dependency-cruiser on bound tree: 817 violations, all no-unresolvable-workspace-import (no node_modules there), 0 other rule. production.ts 264 non-blank lines.
- moved-block differential: removed block in production.ts (base) vs appended block in watch-runs.ts, CR/blank stripped, export stripped -> identical.
Falsifications (isolated copies, green-before, red-after): F1 drop userAccounts line -> P-1 positive red; F1b default AUTH_CSRF_SECRET -> P-1 negative red; F2 drop requireAuth on /admin -> P-2 and P-3 red; F3a subjectHash constant -> P-3 red; F3b publicOrigin constant -> P-3 red; F4a heartbeat fallback 1h->2h and F4b drop workerSnapshot/workerReceipt privacy filter in moved deps -> SURVIVE all consumer tests (no test pins the Mongo factories; pre-existing, same on base).
Attribution: coordinator A only; no sub-checkers; the dual partner evidence was not read.
