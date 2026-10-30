# Gate H-10: default studentData on a new WhatsApp link

**Asked:** 2026-10-30. The W11 survey (`docs/whatsapp/student-data-call-sites.md`) found that plan W11 and grill Q-W1 recommend the default `unknown`. That conflicts with D-206 and with the code (`packages/db/src/collections/whatsapp-links.ts:14`, default `"no"`).
**Answered:** 2026-10-30 by Umesh: keep `"no"`, per D-206.

## What this means for W11 part B
- A new link defaults to `studentData: "no"`, so WhatsApp-derived knowledge reaches external models by default. D-206 is unchanged.
- The `externalModelEligible(tenantId, sourceId)` gate excludes a source only when its link resolves to `yes` or `unknown`.
- A source whose link cannot be resolved (legacy env-seeded links have no `whatsappLinkId` stamp) still fails closed to `unknown` and is excluded. The survey recommends this. Changing it needs a new gate.
- No plan or decision text is edited by this gate. The plan's `unknown` recommendation is superseded for this build.
