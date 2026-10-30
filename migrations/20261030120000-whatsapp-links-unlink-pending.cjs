// SOURCEONLY — authored for review; never applied by the maker (D-180). schema: pending H-3 approval.
// whatsapp-multiuser W8: whatsapp_links gains the optional boolean `archiverUnlinkPending` (R-7/R-8 follow-through flag).
// The first migration (20261029120000-whatsapp-links) already creates the collections; this one re-applies the
// regenerated $jsonSchema validator with collMod so an existing database accepts the new field. Same work-database
// guard (its `up` runs requireWorkDatabase), no index change, idempotent. Owns only whatsapp_links' validator.
const { up: applyLinks } = require("./20261029120000-whatsapp-links.cjs");

module.exports = {
  async up(db) { await applyLinks(db); },
  async down() {
    throw new Error("Refusing rollback of the WhatsApp links validator; use an explicitly reviewed forward migration.");
  },
};
