// B4B (D-236 part B, D-233 step 7): the live-proof recording is its own bucket object, published once by BOT_MODE=publish-proof and
// restored at start. Also the regressions of two B4 ledger rows (ISS-B4RECORDERSTATE-001 and -002, repo rule D-015).
// The REAL docker/meeting-bot/entrypoint.sh runs under `sh` in a temp folder with stub executables first on PATH: gcloud (a local
// folder is the bucket; it honours --if-generation-match, logs every call, can fail or hang on demand), node (logs and exits),
// pulseaudio, pactl, Xvfb, xdpyinfo. No bucket, network or Docker daemon is reachable.
// Run: node --test docker/meeting-bot/recorder-live-proof.test.mjs
// LKB_ENTRYPOINT_UNDER_TEST points the tests at another copy of the script (the falsification runs use it); LKB_TEST_SH names the shell.
import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync, mkdirSync, writeFileSync, readFileSync, existsSync, readdirSync, rmSync, chmodSync, symlinkSync, statSync} from 'node:fs';
import {spawnSync} from 'node:child_process';
import {createHash} from 'node:crypto';
import {tmpdir} from 'node:os';
import {dirname, join, delimiter} from 'node:path';
import {fileURLToPath, pathToFileURL} from 'node:url';
import {gzipSync, gunzipSync} from 'node:zlib';

const root = join(dirname(fileURLToPath(import.meta.url)), '../..');
const ENTRY = process.env.LKB_ENTRYPOINT_UNDER_TEST || join(root, 'docker/meeting-bot/entrypoint.sh');
const SH = process.env.LKB_TEST_SH || 'sh';
const posix = (p) => process.platform === 'win32' ? p.replace(/\\/g, '/').replace(/^([A-Za-z]):/, (_, d) => '/' + d.toLowerCase()) : p;
const shAvailable = spawnSync(SH, ['-c', 'echo ok'], {encoding: 'utf8'}).stdout?.trim() === 'ok';
const T = {skip: shAvailable ? false : 'no POSIX sh on PATH (set LKB_TEST_SH)'};
const BUCKET = 'testbucket', PFX = 'recorder';
const FAKE_TOKEN = 'ya29.FAKE-TOKEN-SHOULD-NEVER-BE-LOGGED';
const sha256 = (buf) => createHash('sha256').update(buf).digest('hex');
const MEDIA = Buffer.concat([Buffer.from('proof-media-bytes-'), Buffer.from([0, 1, 2, 255, 254, 10, 13, 0]), Buffer.from('-end')]);
const OTHER = Buffer.concat([Buffer.from('another-recording-'), Buffer.from([9, 8, 7, 0, 255])]);
const REC = 'raw/webinars/tab-abc123.webm';

// ---- stubs ----------------------------------------------------------------------------------------------------------
const GCLOUD = String.raw`#!/bin/sh
# stub gcloud: a local folder is the bucket; generations are integers; --if-generation-match is honoured atomically.
echo "gcloud $*" >> "$STUB_LOG"
R="$STUB_BUCKET_DIR"
if [ -n "\${STUB_HANG_PROOF:-}" ]; then case "$*" in "storage cp "*live-proof/*) sleep 20; exit 1 ;; esac; fi
[ "$1" = storage ] || { echo "stub gcloud: only 'storage' is supported: $*" >&2; exit 2; }
shift; sub="$1"; shift
if [ "$sub" = objects ]; then sub="$1"; shift; fi
match=""; fmt=""; a1=""; a2=""
for x in "$@"; do
  case "$x" in
    --if-generation-match=*) match="\${x#*=}" ;;
    --format=*) fmt="\${x#*=}" ;;
    --*) : ;;
    *) if [ -z "$a1" ]; then a1="$x"; else a2="$x"; fi ;;
  esac
done
obj() { echo "$R/\${1#gs://}"; }
gen_of() { if [ -f "$1.gen" ]; then cat "$1.gen"; else echo 0; fi; }
missing() { echo "ERROR: (gcloud.storage) HTTPError 404: No such object: \${1#gs://}" >&2; exit 1; }
precond() { echo "ERROR: (gcloud.storage) HTTPError 412: At least one of the pre-conditions you specified did not hold." >&2; exit 1; }
n=0; until mkdir "$R/.lock" 2>/dev/null; do n=$((n+1)); [ "$n" -gt 500 ] && { echo "stub lock timeout" >&2; exit 2; }; sleep 0.02; done
trap 'rmdir "$R/.lock" 2>/dev/null' EXIT
next_gen() { c=$(cat "$R/.counter" 2>/dev/null || echo 1000); c=$((c+1)); echo "$c" > "$R/.counter"; echo "$c"; }
case "$sub" in
  describe) f="$(obj "$a1")"; [ -f "$f" ] || missing "$a1"
    case "$fmt" in
      *size*) sz=$(wc -c < "$f" | tr -d ' '); if [ -n "\${STUB_SIZE_LIE:-}" ]; then case "$a1" in *live-proof/*) sz=$((sz+1)) ;; esac; fi; echo "$sz" ;;
      *) gen_of "$f" ;;
    esac ;;
  cat) f="$(obj "$a1")"; [ -f "$f" ] || missing "$a1"; cat "$f" ;;
  ls) d="$(obj "$a1")"; d="\${d%/}"
    [ -d "$d" ] || { echo "ERROR: (gcloud.storage.ls) One or more URLs matched no objects." >&2; exit 1; }
    for e in "$d"/*; do case "$e" in *.gen|*.tmp|*.hist-*) ;; *) if [ -f "$e" ]; then echo "\${a1%/}/$(basename "$e")"; fi ;; esac; done ;;
  rm) f="$(obj "$a1")"; [ -f "$f" ] || missing "$a1"
      if [ -n "$match" ] && [ "$match" != "$(gen_of "$f")" ]; then precond; fi
      rm -f "$f" "$f.gen" ;;
  cp)
    case "$a1" in
      gs://*) f="$(obj "$a1")"
        case "$a2" in
          gs://*) [ -f "$f" ] || missing "$a1"
            d="$(obj "$a2")"; mkdir -p "$(dirname "$d")"; cp "$f" "$d.tmp"; mv "$d.tmp" "$d"; g="$(next_gen)"; echo "$g" > "$d.gen" ;;
          *) if [ -n "\${STUB_FAIL_PROOF_DOWNLOAD:-}" ]; then case "$a1" in *live-proof/*) echo "ERROR: (gcloud.storage) HTTPError 503: backend error" >&2; exit 1 ;; esac; fi
             if [ -n "\${STUB_DOWNLOAD_ERR:-}" ]; then case "$a1" in *state*) echo "\$STUB_DOWNLOAD_ERR" >&2; exit 1 ;; esac; fi
             [ -f "$f" ] || missing "$a1"; cp "$f" "$a2" ;;
        esac ;;
      *) case "$a2" in *"\${STUB_FAIL_UPLOAD:-@@none@@}"*) echo "ERROR: stub upload failure" >&2; exit 1 ;; esac
         f="$(obj "$a2")"
         if [ -n "$match" ] && [ "$match" != "$(gen_of "$f")" ]; then precond; fi
         mkdir -p "$(dirname "$f")"; cp "$a1" "$f.tmp"; mv "$f.tmp" "$f"; g="$(next_gen)"; echo "$g" > "$f.gen"
         case "$f" in */state.tar.gz) cp "$f" "$f.hist-$g" ;; esac ;;
    esac ;;
  *) echo "stub gcloud: unsupported subcommand $sub" >&2; exit 2 ;;
esac
`.replaceAll('\\${', '${').replaceAll('\\$STUB', '$STUB');

const NODE = String.raw`#!/bin/sh
echo "node $*" >> "$STUB_LOG"
case "$*" in
  *setup.mjs*)
    m=no; [ -s "$LKB_MEDIA_PATH" ] && m=yes
    echo "DOCTOR media=$m" >> "$STUB_LOG"
    echo "DOCTOR OK"; exit 0 ;;
esac
if [ -n "\${STUB_WRITE_WEBM:-}" ]; then mkdir -p "$LKB_RECORD_DIR"; printf 'recorded-bytes' > "$LKB_RECORD_DIR/meeting.webm"; fi
if [ -n "\${STUB_NODE_SLEEP:-}" ]; then sleep "$STUB_NODE_SLEEP"; fi
echo "node end rc=0" >> "$STUB_LOG"
exit 0
`.replaceAll('\\${', '${');
const QUIET = (body = 'exit 0') => `#!/bin/sh\n${body}\n`;

// ---- ustar helpers ----------------------------------------------------------------------------------------------------
const oct = (n, w) => n.toString(8).padStart(w, '0');
function member({name, type = '0', content = Buffer.alloc(0), mode = 0o644}) {
  const h = Buffer.alloc(512);
  h.write(name, 0, 100); h.write(oct(mode, 7) + '\0', 100); h.write(oct(0, 7) + '\0', 108); h.write(oct(0, 7) + '\0', 116);
  h.write(oct(content.length, 11) + '\0', 124); h.write(oct(0, 11) + '\0', 136); h.fill(0x20, 148, 156); h.write(type, 156);
  h.write('ustar\0', 257); h.write('00', 263);
  let sum = 0; for (const b of h) sum += b;
  h.write(oct(sum, 6) + '\0 ', 148);
  return Buffer.concat([h, content, Buffer.alloc((512 - (content.length % 512)) % 512)]);
}
const makeTgz = (members) => gzipSync(Buffer.concat([...members.map(member), Buffer.alloc(1024)]));
function readTgz(buf) {
  const t = gunzipSync(buf), out = [];
  let off = 0;
  while (off + 512 <= t.length && t[off] !== 0) {
    const h = t.subarray(off, off + 512);
    const str = (a, l) => { const s = h.subarray(a, a + l); const z = s.indexOf(0); return s.subarray(0, z < 0 ? l : z).toString('utf8'); };
    const size = parseInt(str(124, 12).trim() || '0', 8);
    let name = str(0, 100); const prefix = str(345, 155); if (prefix) name = prefix + '/' + name;
    out.push({name, content: Buffer.from(t.subarray(off + 512, off + 512 + size))});
    off += 512 + Math.ceil(size / 512) * 512;
  }
  return out;
}

// ---- the world one test runs in -----------------------------------------------------------------------------------------
const marker = (rec, extra = {}) => JSON.stringify({status: 'passed', backend: 'tab', platform: process.platform, audio: true, video: true,
  sessionId: 'tab-abc123', verifiedAt: '2026-11-25T10:00:00.000Z', recording: rec, ...extra}, null, 2);
function world() {
  const dir = mkdtempSync(join(tmpdir(), 'b4b-'));
  const w = {dir};
  for (const d of ['bin', 'bucket/' + BUCKET + '/' + PFX, 'app/raw/webinars', 'app/data/webinar-release', 'prof/bot-profile', 'tmp', 'xdg', 'stub', 'outside']) mkdirSync(join(dir, d), {recursive: true});
  const put = (name, text) => { const p = join(dir, 'bin', name); writeFileSync(p, text); chmodSync(p, 0o755); };
  put('gcloud', GCLOUD); put('node', NODE); put('pulseaudio', QUIET()); put('Xvfb', QUIET()); put('xdpyinfo', QUIET()); put('x11vnc', QUIET());
  put('pactl', QUIET('case "$1 $2 $3" in "list short sinks") echo "0 botsink" ;; esac; exit 0'));
  put('chrome-stub', QUIET()); put('python-stub', QUIET(`echo "${posix(join(dir, 'bin', 'chrome-stub'))}"`));
  w.posix = (...p) => posix(join(dir, ...p));
  w.app = (...p) => join(dir, 'app', ...p);
  w.release = (f) => join(dir, 'app/data/webinar-release', f);
  w.bucketPath = (...p) => join(dir, 'bucket', BUCKET, ...p);
  w.log = () => existsSync(join(dir, 'stub.log')) ? readFileSync(join(dir, 'stub.log'), 'utf8').split('\n').filter(Boolean) : [];
  w.proofObjects = () => existsSync(w.bucketPath('live-proof')) ? readdirSync(w.bucketPath('live-proof')).filter((n) => !/\.(gen|tmp)$/.test(n)).sort() : [];
  w.objGen = (name) => readFileSync(w.bucketPath('live-proof', name + '.gen'), 'utf8').trim();
  w.putProof = (rec = REC, bytes = MEDIA) => {   // the human-written marker and the recording it names, on this container's disk
    mkdirSync(dirname(w.app(rec)), {recursive: true}); writeFileSync(w.app(rec), bytes); writeFileSync(w.release('live-proof.json'), marker(rec));
  };
  w.env = (extra = {}) => {
    const e = {...process.env};
    for (const k of Object.keys(e)) if (/^(LKB_|BOT_|STUB_|VNC_|WEBINAR_|GEMINI_)/.test(k)) delete e[k];
    return {...e, PATH: join(dir, 'bin') + delimiter + (process.env.PATH ?? ''), TMPDIR: w.posix('tmp'), XDG_RUNTIME_DIR: w.posix('xdg'),
      LKB_APP_DIR: w.posix('app'), LKB_BOT_PROFILE_DIR: w.posix('prof/bot-profile'), LKB_RELEASE_DIR: w.posix('app/data/webinar-release'),
      LKB_RECORD_DIR: w.posix('app/raw/webinars'), LKB_STATE_PREFIX: PFX, LKB_SNAPSHOT_INTERVAL_S: '60', LKB_LEASE_RENEW_S: '30', LKB_STOP_WAIT_S: '3',
      LKB_MEDIA_PATH: w.posix('app', REC), GOOGLE_OAUTH_ACCESS_TOKEN: FAKE_TOKEN,
      STUB_LOG: w.posix('stub.log'), STUB_DIR: w.posix('stub'), STUB_BUCKET_DIR: w.posix('bucket'), ...extra};
  };
  w.bucketEnv = (extra = {}) => w.env({LKB_STATE_BUCKET: BUCKET, ...extra});
  w.run = (env, timeout = 300000) => {
    const r = spawnSync(SH, [posix(ENTRY)], {env, encoding: 'utf8', timeout});
    return {status: r.status, out: (r.stdout ?? '') + (r.stderr ?? ''), signal: r.signal};
  };
  w.publish = (extra = {}, timeout) => w.run(w.bucketEnv({BOT_MODE: 'publish-proof', ...extra}), timeout);
  w.cleanup = () => { try { rmSync(dir, {recursive: true, force: true, maxRetries: 3}); } catch {} };
  return w;
}
// A fresh container that sees the same bucket (a restart): empty local trees, the bucket folder copied over.
function restarted(w) {
  const n = world();
  rmSync(join(n.dir, 'bucket'), {recursive: true, force: true});
  spawnSync(SH, ['-c', `cp -a "${posix(join(w.dir, 'bucket'))}" "${posix(join(n.dir, 'bucket'))}"`]);
  return n;
}
const calls = (w, re) => w.log().filter((l) => l.startsWith('gcloud ') && re.test(l));
const proofUploads = (w) => calls(w, /^gcloud storage cp \S+ gs:\/\/testbucket\/live-proof\//);
const proofCalls = (w) => calls(w, /live-proof/);
const stateUploads = (w) => calls(w, /^gcloud storage cp \S+ gs:\/\/testbucket\/recorder\/state\.tar\.gz/);
const histories = (w) => existsSync(w.bucketPath(PFX)) ? readdirSync(w.bucketPath(PFX)).filter((n) => n.startsWith('state.tar.gz.hist-'))
  .sort((a, b) => Number(a.split('-')[1]) - Number(b.split('-')[1])).map((n) => readTgz(readFileSync(w.bucketPath(PFX, n)))) : [];
const skipLines = (out) => out.split('\n').filter((l) => /proof restore skipped/.test(l));
const failLines = (out) => out.split('\n').filter((l) => /proof publish failed/.test(l));
// C6 on every run: no ACL, IAM, public or signed-URL word in any recorded call, no credential value in the log or the output.
const clean = (w, r) => {
  const bad = w.log().filter((l) => /\b(acl|iam)\b|--canned-acl|--predefined-acl|allUsers|allAuthenticatedUsers|signurl|sign-url|signed|public|-a (public|private)/i.test(l));
  assert.deepEqual(bad, [], 'a stub call sets an ACL, a public object, a signed URL or IAM');
  assert.equal(w.log().join('\n').includes(FAKE_TOKEN), false, 'a credential value is in the stub log');
  if (r) assert.equal(r.out.includes(FAKE_TOKEN), false, 'a credential value is in the output');
};
// The real gate (scripts/webinar/run-pipeline.mjs:43-57). Imported whole when the monorepo's dependencies resolve; in a checkout
// without them (a bare worktree) the same source lines (const ID ... return work) are cut out of the file at test time and run.
let gateFn = null, gateHow = '';
async function gate() {
  if (gateFn) return gateFn;
  try {
    gateFn = (await import(pathToFileURL(join(root, 'scripts/webinar/run-pipeline.mjs')).href)).validateRunGate; gateHow = 'imported';
    return gateFn;
  } catch {}
  const src = readFileSync(join(root, 'scripts/webinar/run-pipeline.mjs'), 'utf8');
  const m = /const ID = [\s\S]*?\n  return work;\r?\n\}/.exec(src);
  assert.ok(m && /export function validateRunGate/.test(m[0]), 'the gate source could not be located');
  const dirTmp = mkdtempSync(join(tmpdir(), 'b4b-gate-')), file = join(dirTmp, 'gate.mjs');
  writeFileSync(file, `import {existsSync, readFileSync, realpathSync, statSync} from 'node:fs';
import {join, resolve, relative, isAbsolute} from 'node:path';
import {isProtectedWorkDbName} from ${JSON.stringify(pathToFileURL(join(root, 'scripts/lib/transcript-provenance.mjs')).href)};
${m[0]}`);
  gateFn = (await import(pathToFileURL(file).href)).validateRunGate; gateHow = 'extracted';
  return gateFn;
}
const GATE_ENV = {MONGO_WORK_DB: 'kb_work_b4b_test'};
const gatePasses = async (w) => { const g = await gate(); assert.equal(g(w.app(), GATE_ENV), 'kb_work_b4b_test'); };
const gateThrows = async (w) => { const g = await gate(); assert.throws(() => g(w.app(), GATE_ENV), /proof|recording|outside|ENOENT|no such file/i); };   // a missing recording reaches the gate's lstat: still a refusal
// a state tar as the snapshot would hold it: the marker and (optionally) the pointer, plus a profile file
const stateTar = ({markerText = null, sidecar = null} = {}) => makeTgz([
  {name: 'bot-profile/', type: '5', mode: 0o700}, {name: 'bot-profile/marker.txt', content: Buffer.from('p')},
  {name: 'webinar-release/', type: '5', mode: 0o700},
  ...(markerText ? [{name: 'webinar-release/live-proof.json', content: Buffer.from(markerText)}] : []),
  ...(sidecar ? [{name: 'webinar-release/live-proof.sha256', content: Buffer.from(sidecar)}] : [])]);
const seedBucket = (w, key, buf, gen = 5) => { const f = w.bucketPath(...key.split('/')); mkdirSync(dirname(f), {recursive: true}); writeFileSync(f, buf); writeFileSync(f + '.gen', String(gen)); };

// =========================================================================================================================
test('B4B-C1 publish: one create-only upload to live-proof/<sha256>.<ext>, bytes equal, snapshot after it, marker untouched, name disjoint, exit 0', T, () => {
  const w = world();
  try {
    w.putProof();
    const before = readFileSync(w.release('live-proof.json'));
    const r = w.publish();
    assert.equal(r.status, 0, r.out);
    const name = `${sha256(MEDIA)}.webm`;
    assert.deepEqual(w.proofObjects(), [name], 'exactly one proof object, named by the independently computed sha256');
    assert.equal(Buffer.compare(readFileSync(w.bucketPath('live-proof', name)), MEDIA), 0, 'stored bytes equal the local file');
    const ups = proofUploads(w);
    assert.equal(ups.length, 1, ups.join('\n'));
    assert.match(ups[0], new RegExp(`^gcloud storage cp \\S+ gs://testbucket/live-proof/${name} --if-generation-match=0$`), 'create-only precondition');
    assert.ok(!existsSync(w.bucketPath('live-proof', 'tab-abc123.webm')), 'the proof is never stored under its file name');
    const iUp = w.log().indexOf(ups[0]), iSnap = w.log().indexOf(stateUploads(w)[0]);
    assert.ok(stateUploads(w).length === 1 && iUp >= 0 && iSnap > iUp, 'the state snapshot comes after the successful upload');
    assert.equal(Buffer.compare(readFileSync(w.release('live-proof.json')), before), 0, 'B4B-I2: live-proof.json is byte-equal');
    // disjoint names: nothing of the proof is under the state, lease or recordings names
    for (const f of readdirSync(w.bucketPath(PFX))) assert.ok(!/live-proof|\.webm$/.test(f) || f === 'recordings', f);
    const snap = readTgz(readFileSync(w.bucketPath(PFX, 'state.tar.gz')));
    assert.ok(snap.every((m) => /^(bot-profile|webinar-release)(\/|$)/.test(m.name)), 'the snapshot holds exactly the two trees');
    assert.ok(!snap.some((m) => /\.webm$/.test(m.name)), 'the media is not in the tar');
    assert.equal(Buffer.compare(snap.find((m) => m.name === 'webinar-release/live-proof.json').content, before), 0);
    clean(w, r);
  } finally { w.cleanup(); }
});

test('B4B-C2 a failed publish exits non-zero with one stable line, takes no snapshot, leaves no object and the marker byte-equal; a good rerun uploads once and snapshots', T, () => {
  const cases = {
    // `line`: the one failure line names its cause (a stub that hangs for 20 s and then exits 1 would otherwise fail the run too, only later)
    'upload exits non-zero': {env: {STUB_FAIL_UPLOAD: 'live-proof'}, line: /upload failed/},
    'upload hangs past the bound': {env: {STUB_HANG_PROOF: '1', LKB_PROOF_TIMEOUT_S: '2'}, line: /timed out/},
    'no marker': {setup: (w) => rmSync(w.release('live-proof.json')), line: /no marker/},
    'status is not passed': {setup: (w) => writeFileSync(w.release('live-proof.json'), marker(REC, {status: 'failed'})), line: /status/},
    'recording is missing': {setup: (w) => rmSync(w.app(REC)), line: /missing or empty/},
    'recording is zero bytes': {setup: (w) => writeFileSync(w.app(REC), Buffer.alloc(0)), line: /missing or empty/},
  };
  for (const [label, c] of Object.entries(cases)) {
    const w = world();
    try {
      w.putProof(); c.setup?.(w);
      const mk = existsSync(w.release('live-proof.json')) ? readFileSync(w.release('live-proof.json')) : null;
      const r = w.publish(c.env ?? {});
      assert.notEqual(r.status, 0, `${label}: ${r.out}`);
      assert.equal(failLines(r.out).length, 1, `${label}: one stable log line\n${r.out}`);
      assert.match(failLines(r.out)[0], c.line, `${label}: the line names the cause`);
      assert.equal(stateUploads(w).length, 0, `${label}: no snapshot call`);
      assert.deepEqual(w.proofObjects(), [], `${label}: no object left`);
      if (mk) assert.equal(Buffer.compare(readFileSync(w.release('live-proof.json')), mk), 0, `${label}: marker byte-equal`);
      clean(w, r);
      if (label === 'upload exits non-zero' || label === 'upload hangs past the bound') {   // a second run with a working stub
        const attempts = proofUploads(w).length;
        const r2 = w.publish();
        assert.equal(r2.status, 0, r2.out);
        assert.equal(proofUploads(w).length - attempts, 1, 'the working run uploads once');
        assert.equal(stateUploads(w).length, 1, 'the working run snapshots');
        assert.deepEqual(w.proofObjects(), [`${sha256(MEDIA)}.webm`]);
      }
    } finally { w.cleanup(); }
  }
});

test('B4B-C3 never overwritten: (a) same bytes is success with the object untouched, (b) different bytes is an error, (c) a later capture with the same file name leaves it alone, (d) a second marker gets its own object', T, () => {
  // (a)
  let w = world();
  try {
    w.putProof();
    assert.equal(w.publish().status, 0);
    const name = `${sha256(MEDIA)}.webm`, gen = w.objGen(name), mtime = statSync(w.bucketPath('live-proof', name)).mtimeMs;
    const r = w.publish();
    assert.equal(r.status, 0, `(a) ${r.out}`);
    assert.equal(w.objGen(name), gen, '(a) the object generation did not change: not overwritten');
    assert.equal(statSync(w.bucketPath('live-proof', name)).mtimeMs, mtime);
    assert.equal(Buffer.compare(readFileSync(w.bucketPath('live-proof', name)), MEDIA), 0);
    assert.equal(stateUploads(w).length, 2, '(a) the snapshot is still taken');
    clean(w, r);
  } finally { w.cleanup(); }
  // (b)
  w = world();
  try {
    w.putProof();
    const name = `${sha256(MEDIA)}.webm`;
    seedBucket(w, `live-proof/${name}`, OTHER, 42);
    const r = w.publish();
    assert.notEqual(r.status, 0, `(b) ${r.out}`);
    assert.equal(failLines(r.out).length, 1, r.out);
    assert.equal(Buffer.compare(readFileSync(w.bucketPath('live-proof', name)), OTHER), 0, '(b) bytes unchanged');
    assert.equal(w.objGen(name), '42');
    assert.equal(stateUploads(w).length, 0, '(b) no snapshot');
    clean(w, r);
  } finally { w.cleanup(); }
  // (c) a later capture whose recording has the same file name: record-once in a restarted container
  w = world();
  try {
    w.putProof('raw/webinars/meeting.webm');
    assert.equal(w.publish().status, 0);
    const name = `${sha256(MEDIA)}.webm`, gen = w.objGen(name);
    const n = restarted(w);
    try {
      const r = n.run(n.bucketEnv({BOT_MODE: 'record-once', LKB_RECORD_URL: 'https://meet.example/x', LKB_RECORD_UNTIL: '2026-11-26T10:00:00Z', STUB_WRITE_WEBM: '1', LKB_MEDIA_PATH: n.posix('app/raw/webinars/meeting.webm')}));
      assert.equal(r.status, 0, r.out);
      assert.equal(Buffer.compare(readFileSync(n.bucketPath('live-proof', name)), MEDIA), 0, '(c) proof object byte-equal');
      assert.equal(n.objGen(name), gen, '(c) proof object generation unchanged');
      assert.equal(readFileSync(n.bucketPath(PFX, 'recordings/meeting.webm'), 'utf8'), 'recorded-bytes', '(c) the capture copy lands under recorder/recordings/');
      assert.deepEqual(n.proofObjects(), [name]);
      assert.equal(proofUploads(n).length, 0, '(c) the capture run never uploads to live-proof/');
      clean(n, r);
    } finally { n.cleanup(); }
  } finally { w.cleanup(); }
  // (d)
  w = world();
  try {
    w.putProof(REC, MEDIA);
    assert.equal(w.publish().status, 0);
    const a = `${sha256(MEDIA)}.webm`, genA = w.objGen(a);
    w.putProof('raw/webinars/tab-second.webm', OTHER);
    const r = w.publish();
    assert.equal(r.status, 0, r.out);
    const b = `${sha256(OTHER)}.webm`;
    assert.deepEqual(w.proofObjects(), [a, b].sort(), '(d) two objects');
    assert.equal(w.objGen(a), genA, '(d) the first object was not replaced');
    assert.equal(Buffer.compare(readFileSync(w.bucketPath('live-proof', a)), MEDIA), 0);
    assert.equal(Buffer.compare(readFileSync(w.bucketPath('live-proof', b)), OTHER), 0);
    clean(w, r);
  } finally { w.cleanup(); }
});

test('B4B-C4 restore at start: after a restart the media is back at the path the marker names, byte-equal, between the state restore and the doctor gate; the real gate passes; the tars never hold the media', T, async () => {
  const w = world();
  try {
    w.putProof();
    assert.equal(w.publish().status, 0);
    for (const mode of ['run', 'record-once']) {
      const n = restarted(w);
      try {
        await gateThrows(n);   // before the start there is no marker and no media
        const extra = mode === 'record-once' ? {BOT_MODE: 'record-once', LKB_RECORD_URL: 'https://meet.example/x', LKB_RECORD_UNTIL: '2026-11-26T10:00:00Z'} : {};
        const r = n.run(n.bucketEnv({...extra, STUB_NODE_SLEEP: '3', LKB_SNAPSHOT_INTERVAL_S: '1'}));
        assert.equal(r.status, 0, `${mode}: ${r.out}`);
        assert.equal(Buffer.compare(readFileSync(n.app(REC)), MEDIA), 0, `${mode}: media byte-equal at exactly the path the marker names`);
        const log = n.log(), name = `${sha256(MEDIA)}.webm`;
        const iState = log.findIndex((l) => l.startsWith('gcloud storage cp gs://testbucket/recorder/state.tar.gz ') && !l.includes('gs://testbucket/recorder/state.prev')),
          iProof = log.findIndex((l) => l.startsWith(`gcloud storage cp gs://testbucket/live-proof/${name} `)),
          iDoc = log.findIndex((l) => l.startsWith('node scripts/webinar/setup.mjs'));
        assert.ok(iState >= 0 && iState < iProof && iProof < iDoc, `${mode}: state restore, then media restore, then the doctor gate: ${[iState, iProof, iDoc]}`);
        assert.ok(log.includes('DOCTOR media=yes'), `${mode}: the doctor already sees the media`);
        assert.ok(iDoc < log.findIndex((l) => /^node (scripts\/webinar\/run-pipeline|--import)/.test(l)), `${mode}: doctor before the pipeline`);
        await gatePasses(n);
        const tars = histories(n);
        assert.ok(tars.length >= 2, `${mode}: at least a periodic and the final snapshot (${tars.length})`);
        for (const names of tars.map((t) => t.map((m) => m.name))) assert.ok(!names.some((x) => /\.webm$/.test(x)), `${mode}: no media in a tar: ${names}`);
        clean(n, r);
      } finally { n.cleanup(); }
    }
  } finally { w.cleanup(); }
});

test('B4B-C4 which object: the pointer chooses among several proofs; with no pointer one matching object is used, two are ambiguous and none is restored', T, async () => {
  const w = world();
  try {
    w.putProof(REC, MEDIA); assert.equal(w.publish().status, 0);
    w.putProof('raw/webinars/tab-second.webm', OTHER); assert.equal(w.publish().status, 0);   // marker and pointer now name OTHER; two objects exist
    const n = restarted(w);
    try {
      const r = n.run(n.bucketEnv({LKB_MEDIA_PATH: n.posix('app/raw/webinars/tab-second.webm')}));
      assert.equal(r.status, 0, r.out);
      assert.equal(Buffer.compare(readFileSync(n.app('raw/webinars/tab-second.webm')), OTHER), 0, 'the pointer picked the second object');
      assert.equal(skipLines(r.out).length, 0);
    } finally { n.cleanup(); }
    // no pointer, two objects of the same extension: ambiguous
    const m = world();
    try {
      seedBucket(m, `live-proof/${sha256(MEDIA)}.webm`, MEDIA); seedBucket(m, `live-proof/${sha256(OTHER)}.webm`, OTHER);
      seedBucket(m, 'recorder/state.tar.gz', stateTar({markerText: marker(REC)}));
      const r = m.run(m.bucketEnv());
      assert.equal(r.status, 0, 'the container keeps running\n' + r.out);
      assert.equal(skipLines(r.out).length, 1, r.out);
      assert.ok(!existsSync(m.app(REC)), 'nothing restored when the choice is ambiguous');
      assert.ok(m.log().some((l) => l.includes('run-pipeline.mjs')), 'the pipeline is still started');
      await gateThrows(m);
    } finally { m.cleanup(); }
    // no pointer, exactly one object: restored
    const o = world();
    try {
      seedBucket(o, `live-proof/${sha256(MEDIA)}.webm`, MEDIA);
      seedBucket(o, 'recorder/state.tar.gz', stateTar({markerText: marker(REC)}));
      const r = o.run(o.bucketEnv());
      assert.equal(r.status, 0, r.out);
      assert.equal(Buffer.compare(readFileSync(o.app(REC)), MEDIA), 0);
      await gatePasses(o);
      // a pointer that names another recording is not trusted
      const p = world();
      try {
        seedBucket(p, `live-proof/${sha256(MEDIA)}.webm`, MEDIA);
        seedBucket(p, 'recorder/state.tar.gz', stateTar({markerText: marker(REC), sidecar: `${sha256(OTHER)}  raw/webinars/some-other.webm\n`}));
        const r2 = p.run(p.bucketEnv());
        assert.equal(r2.status, 0, r2.out);
        assert.equal(Buffer.compare(readFileSync(p.app(REC)), MEDIA), 0, 'fell back to the listing');
      } finally { p.cleanup(); }
    } finally { o.cleanup(); }
  } finally { w.cleanup(); }
});

test('B4B-C5 a missing object, a failed download, a wrong size or wrong bytes: one line, the container keeps running, no file or partial file, the real gate refuses', T, async () => {
  const sidecar = `${sha256(MEDIA)}  ${REC}\n`;
  const cases = {
    'object missing': {seed: () => {}},
    'download fails': {seed: (w) => seedBucket(w, `live-proof/${sha256(MEDIA)}.webm`, MEDIA), env: {STUB_FAIL_PROOF_DOWNLOAD: '1'}},
    'size differs from the object': {seed: (w) => seedBucket(w, `live-proof/${sha256(MEDIA)}.webm`, MEDIA), env: {STUB_SIZE_LIE: '1'}},
    'bytes do not match the name': {seed: (w) => seedBucket(w, `live-proof/${sha256(MEDIA)}.webm`, Buffer.concat([MEDIA.subarray(0, MEDIA.length - 1), Buffer.from('X')]))},
  };
  for (const [label, c] of Object.entries(cases)) {
    const w = world();
    try {
      c.seed(w);
      seedBucket(w, 'recorder/state.tar.gz', stateTar({markerText: marker(REC), sidecar}));
      const r = w.run(w.bucketEnv(c.env ?? {}));
      assert.equal(r.status, 0, `${label}: the entrypoint does not exit because of it\n${r.out}`);
      assert.equal(skipLines(r.out).length, 1, `${label}: one log line\n${r.out}`);
      assert.ok(w.log().some((l) => l.includes('run-pipeline.mjs')), `${label}: the pipeline stub is still started`);
      assert.ok(!existsSync(w.app(REC)), `${label}: no file at the path`);
      assert.deepEqual(readdirSync(w.app('raw/webinars')), [], `${label}: no partial file or placeholder`);
      await gateThrows(w);
      clean(w, r);
    } finally { w.cleanup(); }
  }
});

test('B4B-C5 a hostile recording path (absolute, .., wrong extension, backslash, repeated key) is refused at publish and at restore: nothing uploaded, nothing written outside the project root', T, () => {
  const hostile = {
    'absolute': (w) => posix(join(w.dir, 'outside', 'evil.webm')),
    'dot-dot': () => '../outside/evil.webm',
    'dot-dot in the middle': () => 'raw/../../outside/evil.webm',
    'wrong extension': () => 'raw/webinars/evil.txt',
    'no extension': () => 'raw/webinars/evil',
    'backslash': () => 'raw\\webinars\\evil.webm',
    'windows drive': () => 'C:/evil.webm',
  };
  for (const [label, mk] of Object.entries(hostile)) {
    // publish
    let w = world();
    try {
      writeFileSync(join(w.dir, 'outside', 'evil.webm'), MEDIA); writeFileSync(w.app('raw/webinars/evil.txt'), MEDIA); writeFileSync(w.app('raw/webinars/evil'), MEDIA);
      writeFileSync(w.release('live-proof.json'), marker(mk(w)));
      const before = readFileSync(w.release('live-proof.json'));
      const r = w.publish();
      assert.notEqual(r.status, 0, `publish ${label}: ${r.out}`);
      assert.equal(failLines(r.out).length, 1, `publish ${label}: ${r.out}`);
      assert.equal(proofUploads(w).length, 0, `publish ${label}: nothing uploaded`);
      assert.equal(stateUploads(w).length, 0);
      assert.deepEqual(w.proofObjects(), []);
      assert.equal(Buffer.compare(readFileSync(w.release('live-proof.json')), before), 0);
      clean(w, r);
    } finally { w.cleanup(); }
    // restore
    w = world();
    try {
      seedBucket(w, `live-proof/${sha256(MEDIA)}.webm`, MEDIA);
      seedBucket(w, 'recorder/state.tar.gz', stateTar({markerText: marker(mk(w)), sidecar: `${sha256(MEDIA)}  ${mk(w)}\n`}));
      const r = w.run(w.bucketEnv());
      assert.equal(r.status, 0, `restore ${label}: the container keeps running\n${r.out}`);
      assert.equal(skipLines(r.out).length, 1, `restore ${label}: ${r.out}`);
      assert.deepEqual(readdirSync(join(w.dir, 'outside')), [], `restore ${label}: nothing written outside the project root`);
      assert.deepEqual(readdirSync(w.app('raw/webinars')), []);
      assert.equal(proofCalls(w).length, 0, `restore ${label}: no proof-object call for a refused path`);
      clean(w, r);
    } finally { w.cleanup(); }
  }
  // the key given twice: the gate would read the last, this script would read the first; refused
  const w = world();
  try {
    w.putProof();
    writeFileSync(w.release('live-proof.json'), `{"status":"passed","recording":"${REC}","recording":"raw/webinars/other.webm"}`);
    const r = w.publish();
    assert.notEqual(r.status, 0, r.out); assert.equal(proofUploads(w).length, 0);
  } finally { w.cleanup(); }
});

test('B4B-C5 a symlink out of the tree (the file itself, or a folder on the way) is refused at publish and at restore', T, (t) => {
  const w = world();
  try {
    try { symlinkSync(join(w.dir, 'outside', 'real.webm'), w.app('raw/webinars/link.webm')); writeFileSync(join(w.dir, 'outside', 'real.webm'), MEDIA); }
    catch (e) { t.skip(`no symlink support on this host: ${e.code}`); return; }
    writeFileSync(w.release('live-proof.json'), marker('raw/webinars/link.webm'));
    const r = w.publish();
    assert.notEqual(r.status, 0, r.out); assert.equal(proofUploads(w).length, 0); assert.equal(failLines(r.out).length, 1);
    clean(w, r);
  } finally { w.cleanup(); }
  const v = world();
  try {
    rmSync(v.app('raw/webinars'), {recursive: true}); symlinkSync(join(v.dir, 'outside'), v.app('raw/webinars'), 'dir');   // the folder on the way leaves the tree
    seedBucket(v, `live-proof/${sha256(MEDIA)}.webm`, MEDIA);
    seedBucket(v, 'recorder/state.tar.gz', stateTar({markerText: marker('raw/webinars/tab-abc123.webm'), sidecar: `${sha256(MEDIA)}  raw/webinars/tab-abc123.webm\n`}));
    const r = v.run(v.bucketEnv());
    assert.equal(r.status, 0, r.out); assert.equal(skipLines(r.out).length, 1, r.out);
    assert.deepEqual(readdirSync(join(v.dir, 'outside')), [], 'nothing written through the symlinked folder');
    assert.equal(proofCalls(v).length, 0);
    clean(v, r);
  } finally { v.cleanup(); }
});

test('B4B-C6 no ACL, IAM, public flag or signed URL in any call of publish and restore, and the script text carries none; a credential in the environment never reaches the log', T, async () => {
  const w = world();
  try {
    w.putProof();
    const r = w.publish();
    assert.equal(r.status, 0, r.out);
    clean(w, r);
    const n = restarted(w);
    try { const r2 = n.run(n.bucketEnv()); assert.equal(r2.status, 0, r2.out); clean(n, r2); assert.ok(n.log().some((l) => l.includes('live-proof')), 'the restore ran'); } finally { n.cleanup(); }
    const text = readFileSync(ENTRY, 'utf8');
    assert.doesNotMatch(text, /gcloud storage [^\n]*(acl|iam|allUsers|signurl)|gsutil|set-iam|--canned-acl|--predefined-acl|-a public|add-iam|signed-url/i);
    assert.doesNotMatch(text, /proof[^\n]*\$\{?(GOOGLE_|GCLOUD_|TOKEN|ACCESS_TOKEN)/, 'the proof code reads no credential variable');
  } finally { w.cleanup(); }
});

test('B4B-I1/I5 no bucket variable: neither the new mode nor the restore calls any stub command; no marker in the tree: the restore is silent, in run and record-once', T, () => {
  let w = world();
  try {
    w.putProof();
    const r = w.run(w.env({BOT_MODE: 'publish-proof'}));
    assert.notEqual(r.status, 0, r.out); assert.equal(failLines(r.out).length, 1);
    assert.equal(calls(w, /.*/).length, 0, 'publish-proof with no bucket calls nothing');
    assert.deepEqual(w.proofObjects(), []);
    const r2 = w.run(w.env());   // run mode, marker present, no bucket variable
    assert.equal(r2.status, 0, r2.out); assert.equal(calls(w, /.*/).length, 0, 'the restore step calls nothing without a bucket');
    assert.equal(skipLines(r2.out).length, 0);
  } finally { w.cleanup(); }
  for (const mode of ['run', 'record-once']) {   // no marker in the restored tree (the first run, or record-once producing the proof)
    w = world();
    try {
      seedBucket(w, 'recorder/state.tar.gz', stateTar());
      const extra = mode === 'record-once' ? {BOT_MODE: 'record-once', LKB_RECORD_URL: 'https://meet.example/x', LKB_RECORD_UNTIL: '2026-11-26T10:00:00Z'} : {};
      const r = w.run(w.bucketEnv(extra));
      assert.equal(r.status, 0, `${mode}: ${r.out}`);
      assert.equal(proofCalls(w).length, 0, `${mode}: no proof-object call`);
      assert.doesNotMatch(r.out, /proof/i, `${mode}: nothing is said`);
      assert.ok(w.log().some((l) => /run-pipeline\.mjs|--import/.test(l)), `${mode}: the start went on`);
      clean(w, r);
    } finally { w.cleanup(); }
  }
});

test('B4B-C4/I4 the restore runs only where the state restore runs: doctor and login never call the bucket', T, () => {
  const w = world();
  try {
    seedBucket(w, `live-proof/${sha256(MEDIA)}.webm`, MEDIA);
    seedBucket(w, 'recorder/state.tar.gz', stateTar({markerText: marker(REC)}));
    const r = w.run(w.bucketEnv({BOT_MODE: 'doctor'}));
    assert.equal(r.status, 0, r.out); assert.equal(calls(w, /.*/).length, 0, 'doctor: no bucket call');
    assert.ok(!existsSync(w.app(REC)));
    const l = w.run(w.bucketEnv({BOT_MODE: 'login', VNC_PASSWORD: 'x'.repeat(8), LKB_PYTHON: w.posix('bin/python-stub')}));
    assert.equal(calls(w, /.*/).length, 0, `login: no bucket call\n${l.out}`);
    assert.ok(!existsSync(w.app(REC)));
  } finally { w.cleanup(); }
});

// =========================================================================================================================
// ISS-B4RECORDERSTATE-001 and -002 (repo rule D-015): each row's own recorded reproductions are read from the ledger and re-run.
const ledger = (id) => {
  const rows = readFileSync(join(root, 'qa/issues.B4RECORDERSTATE.jsonl'), 'utf8').split('\n').filter(Boolean).map((l) => JSON.parse(l));
  const row = rows.find((r) => r.id === id); assert.ok(row, `${id} is not in the ledger`); return row;
};
const absentStateTar = () => stateTar({markerText: null});

test('ISS-B4RECORDERSTATE-001: a state object that exists (generation read) whose fetch error reads as "absent" must not start the bot with empty state', T, () => {
  const row = ledger('ISS-B4RECORDERSTATE-001');
  assert.match(row.detail, /:249/); assert.match(row.detail, /:265-267/);
  const m = /loose match on ([^/]+?) \/ ([^)]+)\)/.exec(row.detail);
  assert.ok(m, 'the row names the error phrases it recorded');
  const recorded = [m[1].trim(), m[2].trim()];   // "404" and "not found" as the row has them
  const extra = ['No such object', 'No URLs matched', 'matched no objects'];   // the other alternatives of is_absent (:82)
  let ok = 0;
  for (const phrase of [...recorded, ...extra]) {
    const w = world();
    try {
      seedBucket(w, 'recorder/state.tar.gz', absentStateTar(), 5);
      writeFileSync(join(w.dir, 'prof/bot-profile/marker.txt'), 'local-marker');
      const r = w.run(w.bucketEnv({STUB_DOWNLOAD_ERR: `ERROR: (gcloud.storage) ${phrase}`}));
      assert.notEqual(r.status, 0, `"${phrase}": the bot must not start\n${r.out}`);
      assert.ok(!w.log().some((l) => /run-pipeline\.mjs|setup\.mjs/.test(l)), `"${phrase}": nothing was started`);
      assert.doesNotMatch(r.out, /first boot/, `"${phrase}": not reported as a first boot`);
      assert.equal(readFileSync(join(w.dir, 'prof/bot-profile/marker.txt'), 'utf8'), 'local-marker', `"${phrase}": local state untouched`);
      if (recorded.includes(phrase)) ok++;
    } finally { w.cleanup(); }
  }
  assert.equal(ok, recorded.length);
  // control: the object really absent is still a first boot
  const c = world();
  try { const r = c.run(c.bucketEnv()); assert.equal(r.status, 0, r.out); assert.match(r.out, /first boot/); } finally { c.cleanup(); }
});

const fnText = (src, name) => { const m = new RegExp(`^${name}\\(\\) \\{[\\s\\S]*?\\n\\}`, 'm').exec(src); assert.ok(m, `${name}() not found in the entrypoint`); return m[0]; };
function harness(body, timeout = 20000) {
  const src = readFileSync(ENTRY, 'utf8');
  const group = /^GROUP_MODE=none\r?\nif command -v setsid[^\n]*$/m.exec(src); assert.ok(group, 'the GROUP_MODE lines are not found');
  const dir = mkdtempSync(join(tmpdir(), 'b4b-h-')), file = join(dir, 'h.sh');
  const fns = ['signal_child', 'reap_group', 'start_watchdog', 'stop_watchdog', 'start_child'].map((n) => fnText(src, n)).join('\n');
  writeFileSync(file, `set -eu\nSTAGE="${posix(dir)}"; STOP_WAIT=3; STOPPING=0; SIGS=0; CHILD=""; CHILD_PG=""; WATCH_PID=""; CHILD_RC=0; PHASE=running\nlog() { echo "$*" >&2; }\n${group[0]}\n${fns}\n${body(src)}\n`);
  const r = spawnSync(SH, [posix(file)], {encoding: 'utf8', timeout});
  rmSync(dir, {recursive: true, force: true});
  return {status: r.status, out: (r.stdout ?? '') + (r.stderr ?? ''), signal: r.signal};
}

test('ISS-B4RECORDERSTATE-002 (a): a signal that lands just after wait reaped the child must not turn its status into 127', T, () => {
  const row = ledger('ISS-B4RECORDERSTATE-002');
  assert.match(row.detail, /127/);
  // the row's own measurement: wait on a reaped pid. Recorded here for the shell under test (bash gives 127, dash repeats the status).
  const meas = spawnSync(SH, ['-c', '(exit 3) & p=$!; wait $p; wait $p 2>/dev/null; echo $?'], {encoding: 'utf8'}).stdout.trim();
  assert.ok(['127', '3'].includes(meas), `second wait on a reaped pid: ${meas}`);
  const scenarios = {
    // [fake wait behaviour, expected CHILD_RC]: the first wait returns the real status and the signal trap ran; a later wait finds no such pid
    'reaped then 127': ['if [ "$n" = 1 ]; then SIGS=$((SIGS+1)); return 7; else return 127; fi', 7],
    'interrupted then the real status': ['if [ "$n" = 1 ]; then SIGS=$((SIGS+1)); return 143; else return 0; fi', 0],
    'no signal': ['return 5', 5],
    'a real 127 with no signal': ['return 127', 127],
  };
  for (const [label, [behave, want]] of Object.entries(scenarios)) {
    const r = harness((src) => `${fnText(src, 'wait_child').replace('wait "$CHILD"', 'fakewait "$CHILD"')}
n=0; fakewait() { n=$((n+1)); ${behave}; }
CHILD=999999; wait_child; echo "CHILD_RC=$CHILD_RC"`);
    assert.equal(r.status, 0, `${label}: ${r.out}`);
    assert.match(r.out, new RegExp(`CHILD_RC=${want}$`, 'm'), `${label}: ${r.out}`);
  }
});

test('ISS-B4RECORDERSTATE-002 (b): a SIGTERM that landed before CHILD was set (on_term found nobody to signal) still reaches the child that is started next', T, () => {
  const row = ledger('ISS-B4RECORDERSTATE-002');
  assert.match(row.detail, /STOPPING test and before CHILD is set/);
  const r = harness((src) => `${fnText(src, 'wait_child')}
STOPPING=1   # on_term already ran with CHILD empty: it only set STOPPING
start_child sleep 8
t0=$(date +%s); wait_child; t1=$(date +%s)
echo "CHILD_RC=$CHILD_RC took=$((t1 - t0))"`, 6500);
  assert.equal(r.status, 0, `the child was not signalled (the harness hit its time limit)\n${r.out}`);
  assert.match(r.out, /CHILD_RC=(143|137) took=[0-4]$/m, r.out);
});
