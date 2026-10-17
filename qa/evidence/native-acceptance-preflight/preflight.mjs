// Broker-only diagnostic. No application modules, DB writes, provider calls or services.
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';

const owned = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(owned, '../../..');
const args = new Set(process.argv.slice(2));
if ([...args].some(a => !['--mongo-readonly', '--broker-authorized'].includes(a))) {
  throw new Error('Unknown flag');
}
if (!args.has('--broker-authorized')) throw new Error('Execution requires the coordinator database/CPU lease');
const sha = value => crypto.createHash('sha256').update(value).digest('hex');
const pin = p => fs.existsSync(p) ? { path: p, sha256: sha(fs.readFileSync(p)) } : { path: p, missing: true };
const report = { utc: new Date().toISOString(), mode: args.has('--mongo-readonly') ? 'read-only-mongo' : 'local-only',
  runtime: { executable: process.execPath, version: process.version, platform: process.platform, arch: process.arch },
  resources: { logicalCpus: os.cpus().length, freeBytes: os.freemem(), totalBytes: os.totalmem(), loadAverage: os.loadavg(),
    cpuActivityMeasured: false, note: 'Windows load average is not a CPU lease or utilization sample; broker must serialize execution.' },
  sourcePins: ['apps/api/package.json', 'apps/api/src/transcript-review/mongodb.integration.test.ts',
    '.cache/coordination/safe-test-runtime/register.mjs'].map(p => pin(path.join(root, p))) };
let client;
const watchdog = setTimeout(() => { process.stderr.write('Preflight bounded deadline exceeded; no database writes were issued.\n'); process.exit(124); }, 25000);
try {
  // Reject configured driver logging before any dependency loading or .env read.
  // Include sink/length controls conservatively; never echo names or values.
  if (Object.keys(process.env).some(name => /^MONGODB_LOG_/i.test(name) && process.env[name] !== '')) {
    const blocked = new Error();
    blocked.name = 'DriverLoggingConfigurationRejected';
    throw blocked;
  }
  const probe = path.join(owned, `.write-probe-${crypto.randomUUID()}`);
  let fd;
  try { fd = fs.openSync(probe, 'wx'); fs.writeFileSync(fd, 'owned-preflight-probe'); report.temp = { parent: owned, writable: true }; }
  finally { if (fd !== undefined) { fs.closeSync(fd); fs.unlinkSync(probe); } }
  const require = createRequire(path.join(root, 'apps/api/package.json'));
  const mongodbPath = require.resolve('mongodb');
  report.mongodbPackage = { entry: mongodbPath, sha256: sha(fs.readFileSync(mongodbPath)) };
  if (args.has('--mongo-readonly')) {
    // Parse the existing file internally; do not print URI, hosts, auth material or error messages.
    const env = require('dotenv').parse(fs.readFileSync(path.join(root, '.env')));
    if (!env.MONGODB_URL) throw new Error('MissingMongoConfiguration');
    const database = 'lkb_staging';
    if (database === 'lkb' || database !== 'lkb_staging') throw new Error('DatabaseGuard');
    const { MongoClient } = require('mongodb');
    client = new MongoClient(env.MONGODB_URL, { serverSelectionTimeoutMS: 8000, connectTimeoutMS: 8000,
      socketTimeoutMS: 8000, timeoutMS: 9000, maxPoolSize: 1, minPoolSize: 0 });
    await client.connect();
    const db = client.db(database);
    const hello = await db.command({ hello: 1, maxTimeMS: 8000 });
    report.mongo = { database, helloOk: hello.ok === 1, replicaSet: typeof hello.setName === 'string' && hello.setName.length > 0,
      writablePrimary: hello.isWritablePrimary === true, logicalSessions: typeof hello.logicalSessionTimeoutMinutes === 'number',
      maxWireVersion: hello.maxWireVersion,
      transactionPrerequisites: !!hello.setName && typeof hello.logicalSessionTimeoutMinutes === 'number' && hello.maxWireVersion >= 7,
      transactionActuallyExercised: false, writes: 0 };
    const known = ['sources', 'sessions', 'turns', 'claims', 'session_pages', 'chunks', 'tree_index', 'graph_edges',
      'transcript_reviews', 'transcript_review_history', 'collections'];
    const existing = await db.listCollections({ name: { $in: known } }, { nameOnly: true, authorizedCollections: true, maxTimeMS: 8000 }).toArray();
    report.mongo.existingKnownStagingCollections = existing.map(v => v.name).sort();
    report.mongo.collectionNote = 'Filtered schema names only; no documents/counts, database inventory, indexes or credentials were read.';
  }
} catch (error) {
  report.failure = { name: /^[A-Za-z][A-Za-z0-9]{0,79}$/.test(error?.name || '') ? error.name : 'Error',
    code: Number.isSafeInteger(error?.code) ? error.code : undefined, messageSuppressed: true };
  process.exitCode = 1;
} finally {
  try { if (client) await client.close(); } catch { report.closeFailed = true; process.exitCode = 1; }
  clearTimeout(watchdog);
  process.stdout.write(JSON.stringify(report, null, 2) + '\n');
}
