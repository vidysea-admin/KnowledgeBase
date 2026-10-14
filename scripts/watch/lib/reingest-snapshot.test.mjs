// scripts/watch/lib/reingest-snapshot.test.mjs — iss-reingestsafe-001-004-typed-snapshot-replay.
// Type-exact EJSON snapshot file, atomic write, tamper detection, per-file lock. Filesystem only (a temp dir,
// removed afterwards); no Mongo, no network.
import { test, after } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync, existsSync, mkdirSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  BSON, EJSON, acquireReingestLock, contentHash, defaultSnapshotDir, docKey, isCommitted, listSnapshots, markCommitted,
  readSnapshotFile, removeSnapshot, snapshotPaths, writeSnapshotFile,
} from "./reingest-snapshot.mjs";

const root = mkdtempSync(join(tmpdir(), "reingestejson-snap-"));
after(() => rmSync(root, { recursive: true, force: true }));
let seq = 0;
const fresh = () => join(root, `d${(seq += 1)}`);
const ser = (d) => Buffer.from(BSON.serialize(d)).toString("hex");

const vec = Array.from({ length: 3072 }, (_, i) => Math.sin(i) / 7);
export const typedRows = () => ({
  sessions: [{ _id: "s1", at: new Date("2026-09-25T10:00:00.123Z"), n: 7, ratio: 0.1, big: 2 ** 40, neg0: -0, tenantId: "toc" }],
  turns: [
    { _id: new BSON.ObjectId("65f0c0ffee0123456789abcd"), oid: new BSON.ObjectId("0123456789abcdef01234567"), text: "नमस्ते ☃ \u0000 😀", tenantId: "toc" },
    { _id: "t2", d: new Date(0), dBefore1970: new Date(-1234567), i32: new BSON.Int32(5), i64: BSON.Long.fromString("9007199254740993"), dbl: new BSON.Double(5), ts: new BSON.Timestamp({ t: 12, i: 3 }), tenantId: "toc" },
  ],
  claims: [{ _id: "c1", conf: BSON.Decimal128.fromString("0.9100000000000000000000000000000001"), dec2: BSON.Decimal128.fromString("-1E+6111"), nested: { a: [1, 2.5, { d: new Date(86400000) }], n: null }, tenantId: "toc" }],
  chunks: [{
    _id: "k1", sourceRef: "s1", vector: vec,
    embedding: BSON.Binary.fromFloat32Array(new Float32Array([0.25, -1.5, 3, 1e-8])),
    blob: new BSON.Binary(Buffer.from([0, 255, 1, 254]), 0), uuid: new BSON.Binary(Buffer.from("00112233445566778899aabbccddeeff", "hex"), 4),
    re: /a.b/i, nan: Number.NaN, inf: Number.POSITIVE_INFINITY, tenantId: "toc",
  }],
});
const params = (dir, over = {}) => ({ dir, tenant: "toc", driveFileId: "FILE_1", oldSessionId: "s1", correctSessionId: "s2", preexistingSessionIds: [], rows: typedRows(), treeRoot: { _id: "root", node_id: "tenant:toc", children: [{ id: "y", at: new Date(5) }], tenantId: "toc" }, ...over });

test("every BSON type survives the EJSON snapshot file byte-for-byte (BSON bytes equal) and by class", () => {
  const dir = fresh();
  const rows = typedRows();
  const file = writeSnapshotFile(params(dir, { rows }));
  const back = readSnapshotFile(file);
  for (const coll of Object.keys(rows)) {
    assert.equal(back.rows[coll].length, rows[coll].length);
    for (let i = 0; i < rows[coll].length; i += 1) {
      // NaN/Infinity/-0/RegExp serialise the same on both sides; compare the encoded BSON of original and replayed row
      assert.equal(ser(back.rows[coll][i]), ser(rows[coll][i]), `${coll}[${i}] BSON bytes differ after the EJSON round trip`);
    }
  }
  const t = back.rows.turns[0];
  assert.ok(t._id instanceof BSON.ObjectId && t._id.toHexString() === "65f0c0ffee0123456789abcd");
  assert.ok(t.oid instanceof BSON.ObjectId);
  assert.ok(back.rows.sessions[0].at instanceof Date && back.rows.sessions[0].at.toISOString() === "2026-09-25T10:00:00.123Z");
  assert.ok(back.rows.turns[1].dBefore1970 instanceof Date && back.rows.turns[1].dBefore1970.getTime() === -1234567);
  assert.ok(back.rows.claims[0].conf instanceof BSON.Decimal128 && back.rows.claims[0].conf.toString() === "0.9100000000000000000000000000000001");
  assert.equal(back.rows.claims[0].dec2.toString(), "-1E+6111");
  const e = back.rows.chunks[0].embedding;
  assert.ok(e instanceof BSON.Binary && e.sub_type === 9 && Array.from(e.toFloat32Array()).join() === Array.from(new Float32Array([0.25, -1.5, 3, 1e-8])).join());
  assert.equal(back.rows.chunks[0].uuid.sub_type, 4);
  assert.deepEqual([...back.rows.chunks[0].blob.buffer], [0, 255, 1, 254]);
  assert.equal(back.rows.chunks[0].vector.length, 3072);
  assert.ok(back.rows.turns[1].i64 instanceof BSON.Long && back.rows.turns[1].i64.toString() === "9007199254740993", "int64 above 2^53 must not round");
  assert.ok(back.rows.turns[1].ts instanceof BSON.Timestamp);
  assert.equal(back.rows.turns[0].text, rows.turns[0].text);
  assert.ok(back.treeRoot.children[0].at instanceof Date);
  assert.equal(back.manifest.sha256, contentHash(rows));
});

test("the previous format (plain JSON.stringify) is type-lossy: this is what the EJSON file fixes", () => {
  const rows = typedRows();
  const lossy = JSON.parse(JSON.stringify(rows));
  assert.equal(typeof lossy.sessions[0].at, "string");
  assert.notEqual(ser(lossy.sessions[0]), ser(rows.sessions[0]));
  assert.notEqual(ser(lossy.chunks[0]), ser(rows.chunks[0]));
});

test("file is canonical Extended JSON and carries a manifest (tenant, file, collections, counts, hash)", () => {
  const dir = fresh();
  const file = writeSnapshotFile(params(dir));
  const text = readFileSync(file, "utf8");
  for (const tag of ['"$oid"', '"$date"', '"$numberDecimal"', '"$binary"', '"$numberLong"', '"$numberInt"', '"$numberDouble"']) assert.ok(text.includes(tag), `missing ${tag}`);
  const raw = EJSON.parse(text);
  assert.equal(raw.manifest.format, "reingest-snapshot/1");
  assert.equal(raw.manifest.tenant, "toc");
  assert.equal(raw.manifest.driveFileId, "FILE_1");
  assert.deepEqual(raw.manifest.collections, ["sessions", "turns", "claims", "chunks"]);
  assert.deepEqual(raw.manifest.counts, { sessions: 1, turns: 2, claims: 1, chunks: 1 });
  assert.match(raw.manifest.sha256, /^[0-9a-f]{64}$/);
  assert.equal(file, snapshotPaths(dir, "toc", "FILE_1").file);
  assert.ok(existsSync(join(dir, "toc")));
});

test("JS numbers are typed like the driver would store them (int32 range -> Int32, else Double)", () => {
  const file = writeSnapshotFile(params(fresh(), { rows: { sessions: [{ _id: "x", a: 5, b: 2 ** 31, c: 0.5, d: -3, e: 2 ** 40, tenantId: "toc" }] } }));
  const x = readSnapshotFile(file).rows.sessions[0];
  assert.ok(x.a instanceof BSON.Int32 && x.d instanceof BSON.Int32);
  assert.ok(x.b instanceof BSON.Double && x.c instanceof BSON.Double && x.e instanceof BSON.Double);
  assert.equal(ser(x), ser({ _id: "x", a: 5, b: 2 ** 31, c: 0.5, d: -3, e: 2 ** 40, tenantId: "toc" }));
});

test("atomic: a failure before the rename leaves NO snapshot file and no temp file", () => {
  const dir = fresh();
  assert.throws(() => writeSnapshotFile(params(dir, { hook: (p) => { if (p === "before-rename") throw new Error("killed mid-write"); } })), /killed mid-write/);
  const p = snapshotPaths(dir, "toc", "FILE_1");
  assert.equal(existsSync(p.file), false);
  assert.deepEqual(readdirSync(p.tenantDir), []);
});

test("an existing snapshot is never overwritten: the run must recover it first", () => {
  const dir = fresh();
  const file = writeSnapshotFile(params(dir));
  const before = readFileSync(file);
  assert.throws(() => writeSnapshotFile(params(dir)), /unrecovered snapshot already exists at .*FILE_1\.snapshot\.json/);
  assert.ok(before.equals(readFileSync(file)));
});

test("tamper / truncation / wrong counts are detected and name the path", () => {
  const dir = fresh();
  const file = writeSnapshotFile(params(dir));
  const good = readFileSync(file, "utf8");
  writeFileSync(file, good.replace("नमस्ते", "नमस्त"));
  assert.throws(() => readSnapshotFile(file), new RegExp(`${file.replace(/[\\.]/g, "\\$&")}.*content hash mismatch`));
  writeFileSync(file, good.slice(0, good.length >> 1));
  assert.throws(() => readSnapshotFile(file), /unreadable/);
  const doc = JSON.parse(good);
  doc.rows.turns.pop();
  writeFileSync(file, JSON.stringify(doc));
  assert.throws(() => readSnapshotFile(file), /turns has 1 rows, manifest says 2/);
  writeFileSync(file, JSON.stringify({ manifest: { format: "other" }, rows: {} }));
  assert.throws(() => readSnapshotFile(file), /unknown format/);
});

test("contentHash and docKey ignore row order and key order, but not values or types", () => {
  const a = { x: [{ _id: "1", p: 1, q: new Date(1) }, { _id: "2", p: 2 }] };
  const b = { x: [{ _id: "2", p: 2 }, { q: new Date(1), p: 1, _id: "1" }] };
  assert.equal(contentHash(a), contentHash(b));
  assert.notEqual(contentHash(a), contentHash({ x: [{ _id: "1", p: 1, q: 1 }, { _id: "2", p: 2 }] }), "Date vs number must differ");
  assert.notEqual(docKey({ v: new BSON.Int32(1) }), docKey({ v: new BSON.Double(1) }));
  assert.notEqual(docKey({ v: "a" }), docKey({ v: "b" }));
});

test("committed marker: written atomically, cleared with the snapshot, orphan marker never leaks into a new snapshot", () => {
  const dir = fresh();
  const file = writeSnapshotFile(params(dir));
  assert.equal(isCommitted(file), false);
  markCommitted(file);
  assert.equal(isCommitted(file), true);
  removeSnapshot(file);
  assert.deepEqual(readdirSync(join(dir, "toc")), []);
  markCommitted(file); // simulate a crash after the snapshot was removed but before the marker was
  assert.deepEqual(listSnapshots(dir, "toc"), []);
  assert.deepEqual(readdirSync(join(dir, "toc")), [], "orphan marker swept by listing");
  markCommitted(file);
  const again = writeSnapshotFile(params(dir));
  assert.equal(isCommitted(again), false, "a new snapshot must start uncommitted");
});

test("listSnapshots sweeps never-renamed temp files and returns real snapshots", () => {
  const dir = fresh();
  writeSnapshotFile(params(dir));
  const tmp = join(dir, "toc", "FILE_2.snapshot.json.tmp-1-ab");
  writeFileSync(tmp, "partial");
  assert.deepEqual(listSnapshots(dir, "toc").map((s) => s.driveFileId), ["FILE_1"]);
  assert.equal(existsSync(tmp), false);
  assert.deepEqual(listSnapshots(dir, "nobody"), []);
});

test("unsafe tenant / file names (path traversal) are refused", () => {
  for (const bad of ["../x", "a/b", "a\\b", "", ".hidden", "x y"]) {
    assert.throws(() => snapshotPaths("/d", "toc", bad), /not a safe file name/, bad);
    assert.throws(() => snapshotPaths("/d", bad, "F"), /not a safe file name/, bad);
  }
});

test("default dir is repo-local and gitignored; REINGEST_SNAPSHOT_DIR moves it outside the repo", () => {
  assert.equal(defaultSnapshotDir("/repo", {}), join("/repo", "data", "reingest-snapshots"));
  assert.equal(defaultSnapshotDir("/repo", { REINGEST_SNAPSHOT_DIR: "/safe/elsewhere" }), "/safe/elsewhere");
  assert.match(readFileSync(new URL("../../../.gitignore", import.meta.url), "utf8"), /^data\/reingest-snapshots\/$/m);
});

test("lock: a live holder is refused (not stolen), release frees it, a dead pid or stale lock is taken over", () => {
  const lockPath = join(fresh(), "toc", "F.lock");
  const a = acquireReingestLock(lockPath);
  assert.equal(a.acquired, true);
  const b = acquireReingestLock(lockPath);
  assert.equal(b.acquired, false);
  assert.equal(b.holder.pid, process.pid);
  a.release();
  const c = acquireReingestLock(lockPath);
  assert.equal(c.acquired, true, "released lock is free again");
  // killed holder: lock file stays, pid is dead
  const d = acquireReingestLock(lockPath, { isAlive: () => false });
  assert.equal(d.acquired, true, "dead pid is taken over");
  d.release();
  assert.deepEqual(readdirSync(join(lockPath, "..")), [], "no stale-renamed leftovers");
  // alive pid but older than staleMs
  const e = acquireReingestLock(lockPath);
  const f = acquireReingestLock(lockPath, { staleMs: -1 });
  assert.equal(f.acquired, true, "stale lock is taken over");
  e.release();
  f.release();
  mkdirSync(join(lockPath, ".."), { recursive: true });
  writeFileSync(lockPath, "not json");
  assert.equal(acquireReingestLock(lockPath, { isAlive: () => true }).acquired, true, "unreadable lock is treated as stale");
});

test("EJSON canonical stringify is what the file uses (sanity: bson EJSON is the mongodb package's own)", () => {
  assert.equal(EJSON.stringify({ d: new Date(0) }, { relaxed: false }), '{"d":{"$date":{"$numberLong":"0"}}}');
});
