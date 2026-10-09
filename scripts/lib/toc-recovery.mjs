/** Deterministic recovery of preserved TOC transcript bytes; no model or legacy knowledge stamp. */
import {createHash, randomUUID} from "node:crypto";
import {readFileSync, readdirSync, existsSync, mkdirSync, writeFileSync, renameSync, rmSync, realpathSync} from "node:fs";
import {join, resolve, relative, dirname, basename} from "node:path";
import {immutableTranscriptTurns, bindDerivedArtifacts, assertDerivedArtifactsCurrent} from "./transcript-provenance.mjs";

export const ORIGINAL_SESSION_IDS = [
  "2026-04-21-visa-blueprint-part2-italy-france-nz", "2026-05-08-funding-dreams-loans-forex",
  "2026-05-20-telling-your-brand-story-better", "2026-05-22-uniaccess-xavier-university",
  "2026-05-23-uniaccess-atlas-skilltech", "2026-05-28-in-focus-1", "2026-05-29-decoding-ever-expanding-cast",
  "2026-06-03-dual-enrollment-pathway", "2026-06-19-entrance-exams-pathways-india-part1", "2026-06-25-in-focus-2",
  "2026-06-30-exploring-identity-success-counseling", "2026-07-03-inside-the-uc-session",
  "2026-07-08-beyond-black-robes-law-careers", "2026-07-15-creative-futures", "2026-07-22-uniaccess-cept-university",
  "2026-07-28-metrics-and-mingling", "2026-07-30-in-focus-3", "2026-08-03-uk-beyond-offer-letters",
  "2026-08-03-uk-beyond-offer-letters-reupload", "2026-08-10-ucas-what-changed-what-matters",
  "2026-08-12-uniaccess-ashoka-university", "2026-08-24-uniaccess-leeds-arts-university", "2026-08-27-in-focus-4",
];
export const SEPTEMBER_SESSION_IDS = ["2026-09-02-india-test-series-part2", "2026-09-09-global-test-prep-pathways",
  "2026-09-16-pathways-in-psychology", "2026-09-21-uniaccess-japan", "2026-09-24-in-focus",
  "2026-09-24-zoho-next-european-study-destinations"];
const REAL_IDS = [...ORIGINAL_SESSION_IDS, ...SEPTEMBER_SESSION_IDS].sort();
// Independent checker authority for exactly these seven mappings; not a digest of arbitrary current input.
export const APPROVED_REVIEW_SHA256 = "8aa7ce9c90ae2b83107fdf815e90491194ac4fea830ae79a4b957d52dc5ea0e5";
const INVALID_TIMES = new Map([
  ["2026-04-21-visa-blueprint-part2-italy-france-nz-t141", [2008, 213]],
  ["2026-06-03-dual-enrollment-pathway-t026", [1644, 1629]],
  ["2026-08-10-ucas-what-changed-what-matters-t114", [1883, 1868]],
]);
export const sha256 = bytes => createHash("sha256").update(bytes).digest("hex");
const jsonBytes = doc => Buffer.from(`${JSON.stringify(doc, null, 2)}\n`);
const text = value => typeof value === "string" && value.trim().length > 0;
const equal = (a, b) => JSON.stringify(a) === JSON.stringify(b);
const verifiedPackets = new WeakSet();
function freeze(value) {
  if (value && typeof value === "object") {Object.values(value).forEach(freeze); Object.freeze(value);}
  return value;
}
export function assertRecoveryPacketVerified(packet) {
  requireTrue(verifiedPackets.has(packet), "verified recovery snapshot required");
}
function requireTrue(test, message) {if (!test) throw new Error(message);}
function parsed(snapshot, name) {return JSON.parse(snapshot.files.get(name).toString("utf8"));}
function readDocument(path) {
  const bytes = readFileSync(path); JSON.parse(bytes.toString("utf8")); return bytes;
}
/** Snapshot each original once; parsing and parent hashes use these same exact byte buffers. */
export function readRecoveryInputs(corpusDir, reviewPath, evaluationPath) {
  const dated = readdirSync(corpusDir, {withFileTypes: true}).filter(d => d.isDirectory() && /^\d{4}-\d\d-\d\d-/.test(d.name)).map(d => d.name).sort();
  requireTrue(equal(dated, REAL_IDS), "real-session inventory changed; review scope required");
  const files = new Map();
  for (const id of REAL_IDS) for (const name of ["source", "session", "turns", "claims", "session_page"]) {
    files.set(`original/${id}/${name}.json`, readDocument(join(corpusDir, id, `${name}.json`)));
  }
  files.set("original/reviewed.json", readDocument(reviewPath));
  requireTrue(sha256(files.get("original/reviewed.json")) === APPROVED_REVIEW_SHA256, "approved review authority changed; separate scoped review required");
  files.set("original/evaluation-corpus.json", readDocument(evaluationPath));
  return {files};
}
function sourceRows(snapshot) {
  let turnCount = 0; const allClaims = new Map(), rows = [], excluded = [];
  for (const id of REAL_IDS) {
    const get = name => parsed(snapshot, `original/${id}/${name}.json`);
    const source = get("source"), session = get("session"), turns = get("turns"), claims = get("claims");
    requireTrue(source.tenantId === "toc" && session.tenantId === "toc" && session._id === id && session.sourceId === source._id,
      "foreign or inconsistent source/session identity");
    requireTrue(text(source._id) && text(source.kind) && text(source.hash) &&
      source.consent?.given === true && text(source.consent.recordedBy) && text(source.captureMode) && text(source.createdAt) &&
      text(session.title) && session.date === id.slice(0, 10), "invalid source/session metadata");
    requireTrue(Array.isArray(turns) && turns.length && Array.isArray(claims), "invalid original arrays");
    const ids = new Set(), valid = [];
    for (const turn of turns) {
      requireTrue(turn?.tenantId === "toc" && turn.sessionId === id && text(turn._id) && !ids.has(turn._id) &&
        text(turn.speakerRef) && text(turn.text) && Number.isFinite(turn.tStart) && Number.isFinite(turn.tEnd) && turn.tStart >= 0,
        "invalid, duplicate or foreign original turn");
      ids.add(turn._id); turnCount++;
      if (turn.tEnd < turn.tStart) {
        requireTrue(equal(INVALID_TIMES.get(turn._id), [turn.tStart, turn.tEnd]), "unreviewed invalid interval");
        excluded.push({sessionId: id, legacyTurnId: turn._id, tStart: turn.tStart, tEnd: turn.tEnd, reason: "end-before-start; source unchanged"});
      } else valid.push(turn);
    }
    for (const claim of claims) {
      requireTrue(claim?.tenantId === "toc" && text(claim._id) && text(claim.text) && !allClaims.has(claim._id) &&
        claim._id.startsWith(`${id}-c`), "invalid, duplicate or foreign legacy claim");
      allClaims.set(claim._id, {claim, id});
    }
    rows.push({id, source, session, turns, valid, claims});
  }
  requireTrue(turnCount === 3427 && allClaims.size === 72 && excluded.length === 3, "source inventory counts changed");
  return {rows, allClaims, excluded};
}
function reviewedMappings(snapshot, allClaims, rows) {
  const review = parsed(snapshot, "original/reviewed.json"), mappings = review.mappings;
  requireTrue(review.version === 1 && review.status === "INDEPENDENTLY_REVIEWED_REPLACEMENT_PROPOSALS" &&
    review.reviewedClaims === 7 && Array.isArray(mappings) && mappings.length === 7 &&
    Array.isArray(review.unreviewedClaimIds) && review.unreviewedClaimIds.length === 65, "invalid reviewed disposition");
  const reviewed = new Set(), unresolved = new Set(review.unreviewedClaimIds);
  requireTrue(unresolved.size === 65 && [...unresolved].every(id => allClaims.has(id)), "unknown or duplicate unresolved claim");
  for (const mapping of mappings) {
    const original = allClaims.get(mapping.claimId), row = rows.find(r => r.id === mapping.sessionId);
    requireTrue(original && row && original.id === row.id && mapping.tenantId === "toc" && !reviewed.has(mapping.claimId) &&
      !unresolved.has(mapping.claimId) && mapping.reviewStatus === "INDEPENDENTLY_REVIEWED_REPLACEMENT_PROPOSAL", "invalid reviewed claim identity");
    reviewed.add(mapping.claimId);
    requireTrue(mapping.claimText === original.claim.text && sha256(mapping.claimText) === mapping.claimTextSha256 &&
      mapping.currentTurnsSha256 === sha256(snapshot.files.get(`original/${row.id}/turns.json`)) &&
      mapping.originalClaimsSha256 === sha256(snapshot.files.get(`original/${row.id}/claims.json`)) &&
      equal(mapping.originalEvidence, original.claim.evidence), "reviewed source/claim hash mismatch");
    const support = mapping.proposedEvidence;
    requireTrue(Array.isArray(support) && support.length > 0 && new Set(support.map(e => e.turnId)).size === support.length,
      "missing or duplicate reviewed support");
    for (const e of support) {
      const t = row.valid.find(t => t._id === e.turnId);
      requireTrue(e.sessionId === row.id && t && sha256(t.text) === e.turnTextSha256 &&
        e.tStart === t.tStart && e.tEnd === t.tEnd && e.speakerRef === t.speakerRef && text(e.reviewRole), "invalid reviewed supporting turn");
    }
    if (mapping.claimId === "2026-04-21-visa-blueprint-part2-italy-france-nz-c02") {
      requireTrue(equal(support.map(e => [e.turnId, e.reviewRole]), [
        [`${row.id}-t088`, "assertion support"], [`${row.id}-t089`, "country context"]]), "NZ assertion and country context both required");
    }
  }
  requireTrue([...allClaims.keys()].every(id => reviewed.has(id) !== unresolved.has(id)), "claim partition incomplete");
  return {review, mappings};
}
/** Field checks alone do not establish review authority; exposed for independent rejection regressions. */
export function validateRecoveryMappingFields(snapshot) {
  const {rows, allClaims} = sourceRows(snapshot); reviewedMappings(snapshot, allClaims, rows);
}
/** Fresh artifacts are extractive source text, not accepted full-session extraction/index output. */
export function buildRecoveryPacket(snapshot, buildTree) {
  requireTrue(sha256(snapshot.files.get("original/reviewed.json")) === APPROVED_REVIEW_SHA256, "approved review authority changed; separate scoped review required");
  const {rows, allClaims, excluded} = sourceRows(snapshot), {review, mappings} = reviewedMappings(snapshot, allClaims, rows);
  const evaluation = parsed(snapshot, "original/evaluation-corpus.json"), cases = evaluation.cases;
  requireTrue(Array.isArray(cases) && cases.length === 35 && new Set(cases.map(c => c.sessionId)).size === 35 &&
    REAL_IDS.every(id => cases.some(c => c.sessionId === id)), "evaluation inventory changed");
  const missingCases = cases.filter(c => !REAL_IDS.includes(c.sessionId)).map(c => ({sessionId: c.sessionId,
    disposition: "not imported; declared synthetic artifacts missing"}));
  requireTrue(missingCases.length === 6 && missingCases.every(c => c.sessionId.startsWith("synthetic-")), "invalid missing-case inventory");
  const parentHashes = Object.fromEntries([...snapshot.files].map(([name, bytes]) => [name, sha256(bytes)]));
  const packetId = sha256(jsonBytes({version: 1, parentHashes}));
  const files = new Map([...snapshot.files].map(([name, bytes]) => [name, Buffer.from(bytes)]));
  const documents = {sources: [], sessions: [], turns: [], session_pages: [], claims: [], gaps: [], tree_index: []};
  for (const row of rows) {
    const current = immutableTranscriptTurns("toc", row.id, row.valid).map((t, i) => ({...t, legacyTurnId: row.valid[i]._id,
      parentTurnsSha256: parentHashes[`original/${row.id}/turns.json`], recovery: {packetId}}));
    const byLegacy = new Map(current.map(t => [t.legacyTurnId, t]));
    const unresolvedClaimIds = row.claims.filter(c => review.unreviewedClaimIds.includes(c._id)).map(c => c._id);
    const recovery = {packetId, mode: "source-transcript-recovery", semanticAcceptance: false,
      parentTurnsSha256: parentHashes[`original/${row.id}/turns.json`], parentSourceSha256: parentHashes[`original/${row.id}/source.json`],
      originalSourceHashIsSha256: /^[a-f0-9]{64}$/.test(row.source.hash), unresolvedClaimIds,
      excludedTurns: excluded.filter(e => e.sessionId === row.id), vectors: "not generated"};
    const source = {...row.source, recovery};
    const session = {...row.session, status: {...row.session.status, summarize: "pending", index: "pending"}, recovery};
    const claims = mappings.filter(m => m.sessionId === row.id).map(m => ({
      _id: `${m.claimId}-r-${sha256(`${m.claimText}|${m.currentTurnsSha256}`).slice(0, 16)}`, tenantId: "toc",
      text: m.claimText, status: "needs-review", topicRefs: [], legacyClaimId: m.claimId,
      evidence: m.proposedEvidence.map(e => {
        const t = byLegacy.get(e.turnId); return {turnId: t._id, sessionId: row.id, quote: t.text,
          tStart: t.tStart, tEnd: t.tEnd, speakerRef: t.speakerRef, reviewRole: e.reviewRole, origin: "speech"};
      }), recovery: {...recovery, reviewStatus: m.reviewStatus, externallyVerified: false},
    }));
    const page = {_id: `${row.id}-recovery-page-${packetId.slice(0, 16)}`, tenantId: "toc", sessionId: row.id,
      summary: ["Recovered source transcript; semantic extraction and speaker identity remain unverified.",
        ...current.map(t => `[turn:${t._id} speaker:${t.speakerRef} ${t.tStart}-${t.tEnd}s]\n${t.text}`)].join("\n\n"),
      evidence: current.map(t => ({turnId: t._id, sessionId: row.id})), recovery};
    const gaps = [
      {_id: `${row.id}-recovery-source-gap`, tenantId: "toc", kind: "source-pending", status: "open", sourceRef: source._id,
        description: `Current-source reviewed knowledge remains pending; ${unresolvedClaimIds.length} legacy claims unresolved; ${recovery.excludedTurns.length} source intervals excluded.`, recovery},
      {_id: `${row.id}-recovery-vector-gap`, tenantId: "toc", kind: "vector-pending", status: "open", sourceRef: source._id,
        description: "Recovered transcript is available for browsing/lexical search; genuine embedding and strict index acceptance remain pending.", recovery},
    ];
    for (const [name, doc] of Object.entries({source, session, turns: current, claims, session_page: page})) {
      files.set(`sessions/${row.id}/${name}.json`, jsonBytes(doc));
    }
    documents.sources.push(source); documents.sessions.push(session); documents.turns.push(...current);
    documents.session_pages.push(page); documents.claims.push(...claims); documents.gaps.push(...gaps);
  }
  const roots = buildTree(documents.sessions, documents.session_pages, undefined, () => []);
  requireTrue(Object.keys(roots).length === 1 && roots.toc?.node_id === "tenant:toc", "invalid recovered tree root");
  documents.tree_index.push({...roots.toc, tenantId: "toc", _id: `toc-recovery-tree-${packetId.slice(0, 16)}`, recovery: {packetId}});
  files.set("gaps.json", jsonBytes(documents.gaps)); files.set("tree.json", jsonBytes(documents.tree_index[0]));
  const manifest = {version: 1, packetId, tenantId: "toc", status: "SOURCE_RECOVERY_NOT_STRICT_INDEX_ACCEPTANCE", parentHashes,
    originalSessionIds: ORIGINAL_SESSION_IDS, septemberSessionIds: SEPTEMBER_SESSION_IDS, missingCases, excludedTurns: excluded,
    reviewedClaimIds: mappings.map(m => m.claimId), unresolvedClaimIds: review.unreviewedClaimIds,
    counts: Object.fromEntries(Object.entries(documents).map(([name, docs]) => [name, docs.length])),
    sourceTurns: 3427, validTurns: 3424, legacyClaims: 72, treeBytes: files.get("tree.json").length,
    caveat: "All source text retained; full flattened Ask tree can exceed provider context; no model/vector/whole-session acceptance claimed.",
    hashes: Object.fromEntries([...files].map(([name, bytes]) => [name, sha256(bytes)]))};
  files.set("packet.json", jsonBytes(manifest)); return {files, manifest, documents};
}
/** Build in a new directory; originals are never touched and a failed write remains unimportable. */
export function writeRecoveryPacket(packet, directory, corpusDir) {
  const target = resolve(directory), original = realpathSync(corpusDir), missing = [];
  let ancestor = target;
  while (!existsSync(ancestor)) {missing.unshift(basename(ancestor)); ancestor = dirname(ancestor);}
  const canonicalTarget = resolve(realpathSync(ancestor), ...missing);
  requireTrue(relative(original, canonicalTarget).split(/[\\/]/)[0] === ".." && !existsSync(target), "packet destination must be new and outside original corpus");
  mkdirSync(target, {recursive: true});
  for (const [name, bytes] of packet.files) {
    if (name === "packet.json") continue;
    const path = join(target, name); mkdirSync(resolve(path, ".."), {recursive: true}); writeFileSync(path, bytes, {flag: "wx"});
  }
  for (const id of REAL_IDS) bindDerivedArtifacts(join(target, "sessions", id));
  const temp = join(target, `packet.${randomUUID()}.tmp`);
  try {writeFileSync(temp, packet.files.get("packet.json"), {flag: "wx"}); renameSync(temp, join(target, "packet.json"));}
  finally {rmSync(temp, {force: true});}
}
/** Regenerate from trusted originals and freeze only matching byte buffers, never reread at insertion. */
export function readRecoveryPacket(directory, snapshot, buildTree) {
  const expected = buildRecoveryPacket(snapshot, buildTree), buffers = new Map();
  for (const [name, bytes] of expected.files) {
    const found = readFileSync(join(directory, name)); requireTrue(found.equals(bytes), `recovery packet changed: ${name}`); buffers.set(name, found);
  }
  const read = path => {
    const name = relative(directory, path).replaceAll("\\", "/");
    if (!buffers.has(name)) buffers.set(name, readFileSync(path)); return buffers.get(name);
  };
  const documents = {...expected.documents, sources: [], sessions: [], turns: [], claims: [], session_pages: []};
  for (const id of REAL_IDS) {
    const result = assertDerivedArtifactsCurrent(join(directory, "sessions", id), read).documents;
    documents.sources.push(result.source); documents.sessions.push(result.session); documents.turns.push(...result.turns);
    documents.claims.push(...result.claims); documents.session_pages.push(result.page);
  }
  documents.gaps = JSON.parse(buffers.get("gaps.json")); documents.tree_index = [JSON.parse(buffers.get("tree.json"))];
  const packet = freeze({manifest: JSON.parse(buffers.get("packet.json")), documents});
  verifiedPackets.add(packet); return packet;
}
