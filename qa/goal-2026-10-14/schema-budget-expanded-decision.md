## D-172 | 2026-10-14 | type: decision | status: ACTIVE

**What:** Set only structure.config.json dirsize.overrides.schema from 43 to 45 for forty-three canonical collection schemas plus index.json and validate.py.
**Supersedes:** D-171 -- The verified T-061 form operation producer requires application_operations distinct from readiness runs, and the verified T-057 audited scheduling producer requires operations_schedules; the earlier nine-collection projection omitted these two concrete durable consumers.
**Why:** The root orchestrator explicitly approved the necessary 44 or 45 file budget after inspecting actual producer definitions and synthetic fixture shapes. Form submission must not masquerade as read-only readiness; audited digest/Sheets schedules must persist independently of browser preferences. Both shapes are now documented by their real typed producers, with tenant scope and durable CAS/audit requirements. This exact directory-only adjustment preserves every other source and global budget.
**Result:** The central writer may author these two canonical schemas, generated types, tenant-scoped accessors and unapplied migrations. No live form submission, email/Sheets dispatch, production write, deployment or acceptance proof is authorized by this source adjustment.
**Changes-authorized:** structure.config.json dirsize.overrides.schema only.
**Links:** D-170; D-171; T-057; T-061; apps/api/src/automation/form-types.ts; qa/packets/goal-t061-form-schema-fixtures.json; apps/api/src/operations-integrations/model.ts.
