/**
 * scripts/webinar/session-rows.mjs — the write + file-emission helpers behind
 * scripts/webinar/sync-session.mjs, kept in their own module so they can be unit-tested with a
 * fake collection (sync-session.mjs runs its whole job at import time).
 *
 * replaceSessionRows — ISS-291. The sync used to `deleteMany` a session's turns / graph_edges and
 * then `insertOne` the new set in a loop, with no transaction: a throw mid-loop left the old rows
 * gone and only part of the new set written. The production Mongo is a STANDALONE server (`hello`
 * reports no `setName`), so multi-document transactions are unavailable; this is the safe swap
 * instead:
 *   1. upsert every new row by its (deterministic) `_id`, stamped with a fresh `syncGen`;
 *   2. only after EVERY upsert succeeded, delete this scope's rows whose `syncGen` differs
 *      (old-generation rows, including ones the new set no longer contains).
 * A failure in step 1 deletes nothing: every row is either its old version or its new one, and a
 * re-run converges. The collection handle is a packages/db `coll(tenantId)` accessor, so tenant
 * scoping is still applied by the accessor, never by this function.
 */

/** @param {{updateOne: Function, deleteMany: Function}} scoped  coll(tenantId) accessor result
 *  @param {object} scope   filter naming this session's rows, e.g. `{ sessionId }`
 *  @param {Array<{_id: string}>} docs  the complete new set (tenantId already stripped)
 *  @param {string} gen     generation id for this run
 *  @returns {Promise<{upserted: number, removedStale: number}>} */
export async function replaceSessionRows(scoped, scope, docs, gen) {
  for (const doc of docs) {
    const { _id, ...rest } = doc;
    await scoped.updateOne({ _id }, { $set: { ...rest, ...scope, syncGen: gen } }, { upsert: true });
  }
  const del = await scoped.deleteMany({ ...scope, syncGen: { $ne: gen } });
  return { upserted: docs.length, removedStale: del.deletedCount ?? 0 };
}

/**
 * ISS-294 ([C7]). Every other data/toc-migrated/<id>/ directory carries session.json +
 * session_page.json (+ claims.json), and packages/index's real-data tree test and seed-toc.mjs
 * both read them unconditionally. These are DERIVED from what sync-session.mjs already loads —
 * meta.json (title/date/people/orgs), source.json (source id) and turns.json (evidence turn ids)
 * — so nothing here is written that the session's own inputs do not already state.
 * claims.json is an empty list: no claims were hand-written for this session; the real ones come
 * from the indexing step (`--index`), not from a file.
 */
export function buildSessionFiles({ sessionId, tenantId, sessionDoc, meta, turns }) {
  const session = {
    _id: sessionId,
    tenantId,
    sourceId: sessionDoc.sourceId,
    title: sessionDoc.title,
    date: sessionDoc.date,
    org: sessionDoc.org,
    status: sessionDoc.status,
  };
  const orgName = new Map(meta.orgs.map((o) => [o.id, o.name]));
  const who = (p) => `${p.label} (${p.role}${p.org ? `, ${orgName.get(p.org) ?? p.org}` : ""})`;
  const hosts = meta.orgs.filter((o) => !o.partnerOf);
  const countries = [...new Set(hosts.flatMap((o) => o.countries))].map((c) => c.replace("country:", ""));
  const firstTurn = (p) => turns.find((t) => t.speakerRef === p.personId || t.speakerRef === p.label);
  const speaking = meta.people.filter((p) => firstTurn(p));
  const summary =
    `${meta.title} — ${meta.hostOrg}, ${meta.date}, captured by ${meta.capturedBy.via}. ` +
    `Speakers: ${speaking.map(who).join("; ")}. ` +
    `Institutions presented: ${hosts.map((o) => o.name).join(", ")} (${countries.join(", ")}). ` +
    `${turns.length} transcript turns.`;
  const keyInsights = meta.orgs
    .filter((o) => o.partnerOf)
    .map((o) => `${orgName.get(o.partnerOf)} partners with ${o.name} (${o.countries.map((c) => c.replace("country:", "")).join(", ")}).`);
  const evidence = speaking.map((p) => ({ turnId: firstTurn(p)._id, sessionId }));
  if (evidence.length === 0) throw new Error("buildSessionFiles: no speaking person resolves to a turn — evidence would be empty");
  const sessionPage = { _id: `${sessionId}-page`, tenantId, sessionId, summary, keyInsights, evidence };
  return { session, sessionPage, claims: [] };
}
