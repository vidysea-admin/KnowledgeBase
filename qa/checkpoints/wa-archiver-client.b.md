# Checkpoint (coordinator B) - wa-archiver-client, cycle 0
Policy-Version: proportional-verification/2026-10-19.17 · Head 1647c25b · Resume: 0

Evidence identity per completed check (code hashes = git blobs at 1647c25b; runtime node v24.13.1 with tsx 4.23.13; lock = pnpm-lock.yaml unchanged by the diff; data snapshot n/a; no service/deploy id):
| check | command and scope | result | attribution |
|---|---|---|---|
| W3-1 | node --test --import tsx apps/api/src/whatsapp/archiver/client.test.ts config.test.ts (30 tests) | 30 pass, 0 fail | coordinator B, copy of 1647c25b |
| W3-2 | same runner, client.test.ts (18) | 18 pass | coordinator B |
| W3-3 | same runner, client.test.ts (18) | 18 pass | coordinator B |
| W3-4 | same runner, contract.test.ts + contract-ops.test.ts (46, 19 skipped by design) | 27 pass, 0 fail | coordinator B |
| W3-5 | grep -cE "^# WHATSAPP_ARCHIVER_API_(URL|TOKEN)=$" .env.example ; grep -cE "WHATSAPP_ARCHIVER_API_[A-Z_]+=." .env.example | 2 ; 0 | coordinator B |
| dir | whole archiver dir, 76 tests | 57 pass, 0 fail, 19 skipped | coordinator B |
| types | tsc --noEmit, temp tsconfig including archiver/*.ts, base tsconfig from HEAD | exit 0 | coordinator B |
| lint | scripts/lint-loc.mjs ; scripts/lint-dirsize.mjs | OK ; OK | coordinator B |
| 4c | git diff 00de9d92 HEAD --stat | 10 files, +1519, -0 | coordinator B |
| falsification | 8 isolated-copy mutants (W3-1a/b, 2a/b, 3a/b, 4a/b) plus W3-5 .env.example copy edit | all green-before, red-after, restored hash equal | coordinator B |
| probe | validateArchiverUrl on IPv6 transition forms embedding 169.254.169.254 | accepted (P1) | coordinator B |

Remaining: none. Open (declared, not a check gap): W3-5 compose half behind human gate H-11.
