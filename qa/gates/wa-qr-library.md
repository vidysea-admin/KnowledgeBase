# Gate H-9 — QR rendering for the link Connect page (whatsapp-multiuser, before W10)

**Question:** Render the pairing QR in `apps/web` with a dependency, or have the archiver return a ready image?
**Options:** (a) a small vetted QR library in `apps/web`, exact version pin; (b) archiver returns a ready image (needs W2b).

Answered: 2026-10-30 — (a) pinned QR library in apps/web: exact version (no ^/~), lockfile updated, pure client-side rendering (no network, no CDN), QR payload never logged or persisted; the W10 builder names the package + version + licence in its manifest for the checker to verify — Umesh in chat ("Pinned QR library")
