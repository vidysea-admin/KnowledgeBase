# Gate H-13 — where admin-only WhatsApp link alerts go (whatsapp-multiuser, W9 / W12)

**Question:** May the existing Telegram alert channel carry admin-only link alerts (needs-relink, repeated sync failure, stuck archiver unlink)?
**Options:** (a) Telegram; (b) log only; (c) other.

Answered: 2026-10-30 — (c) NOT Telegram. For now alerts go to in-app ADMIN notifications only: an admin-visible notification entry (W12 events feed / admin page), tenant-scoped, admin-only, never shown to non-admins. Build the alert sink as a small interface so email (and other channels) can be added later without touching callers; no email/Telegram sender is built now. Until W12 lands, W9 keeps console.error — Umesh in chat ("abhi notification se daal dena ... firr mail vggra daal denge ... abhi just admin k notification mi add kr dena")
