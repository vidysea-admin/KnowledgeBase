# Gate: should the WhatsApp events feed work without the archiver?

**Asked:** 2026-10-30 (gate-late: found by both blind checkers of wa-composition-wiring, merge 8e2474ba).
**Question:** `GET /whatsapp/events` reads only Mongo, but it is composed only when the archiver env is valid. With the archiver unset, events (including H-13 admin notifications) are written but admins get 503 reading them.
**Options:** (a) serve events independently of the archiver gate (recommended: Mongo-only, scope and tenant checks unchanged) · (b) keep it fail-closed behind the archiver.
**Blocks:** ISS-WACW-001 only. Nothing else waits on it.
