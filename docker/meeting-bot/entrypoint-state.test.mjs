// B4 (D-233, D-231): the entrypoint keeps the recorder's state outside the container. These tests run the REAL
// docker/meeting-bot/entrypoint.sh with `sh` (Git Bash on Windows, any POSIX sh elsewhere) in a temp folder, with stub
// executables first on PATH: gcloud (a local folder is the bucket; it honours --if-generation-match and logs every
// call), tar (only in the tar-failure test), pulseaudio, pactl, Xvfb, xdpyinfo and a node stub that records its argv
// and environment. No bucket, network or Docker daemon is reachable. Run: node --test docker/meeting-bot/entrypoint-state.test.mjs
// LKB_ENTRYPOINT_UNDER_TEST points the tests at another copy of the script (the falsification runs use it); LKB_TEST_SH names the shell.
import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync, mkdirSync, writeFileSync, readFileSync, existsSync, readdirSync, rmSync, chmodSync, copyFileSync} from 'node:fs';
import {spawn, spawnSync} from 'node:child_process';
import {tmpdir} from 'node:os';
import {dirname, join, delimiter} from 'node:path';
import {fileURLToPath} from 'node:url';
import {gzipSync, gunzipSync} from 'node:zlib';

const root = join(dirname(fileURLToPath(import.meta.url)), '../..');
const ENTRY = process.env.LKB_ENTRYPOINT_UNDER_TEST || join(root, 'docker/meeting-bot/entrypoint.sh');
const SH = process.env.LKB_TEST_SH || 'sh';
const posix = (p) => process.platform === 'win32' ? p.replace(/\\/g, '/').replace(/^([A-Za-z]):/, (_, d) => '/' + d.toLowerCase()) : p;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const shAvailable = spawnSync(SH, ['-c', 'echo ok'], {encoding: 'utf8'}).stdout?.trim() === 'ok';
const T = {skip: shAvailable ? false : 'no POSIX sh on PATH (set LKB_TEST_SH)'};
const BUCKET = 'testbucket', PFX = 'recorder';

// ---- stubs ----------------------------------------------------------------------------------------------------------
const GCLOUD = String.raw`#!/bin/sh
# stub gcloud: a local folder is the bucket; generations are integers; --if-generation-match is honoured atomically.
echo "gcloud $*" >> "$STUB_LOG"
R="$STUB_BUCKET_DIR"
# a hung call: either every call once the hang file exists, or the calls that match STUB_HANG_MATCH once the pipeline stub is up
if [ -e "$STUB_DIR/hang-gcloud" ]; then sleep 20; exit 1; fi
if [ -n "\${STUB_HANG_MATCH:-}" ] && [ -e "$STUB_DIR/ready" ]; then case "$*" in *"$STUB_HANG_MATCH"*) sleep 20; exit 1 ;; esac; fi
[ "$1" = storage ] || { echo "stub gcloud: only 'storage' is supported: $*" >&2; exit 2; }
shift; sub="$1"; shift
if [ "$sub" = objects ]; then sub="$1"; shift; fi
match=""; a1=""; a2=""
for x in "$@"; do
  case "$x" in
    --if-generation-match=*) match="\${x#*=}" ;;
    --*) : ;;
    *) if [ -z "$a1" ]; then a1="$x"; else a2="$x"; fi ;;
  esac
done
obj() { echo "$R/\${1#gs://}"; }
gen_of() { if [ -f "$1.gen" ]; then cat "$1.gen"; else echo 0; fi; }
missing() { echo "ERROR: (gcloud.storage) HTTPError 404: No such object: \${1#gs://}" >&2; exit 1; }
precond() { echo "ERROR: (gcloud.storage) HTTPError 412: At least one of the pre-conditions you specified did not hold." >&2; exit 1; }
if [ "$sub" = describe ] && [ -n "\${STUB_BARRIER:-}" ] && [ ! -f "$(obj "$a1")" ]; then
  : > "$R/.barrier.$$"; n=0
  while [ "$(ls "$R"/.barrier.* 2>/dev/null | wc -l)" -lt "$STUB_BARRIER" ] && [ "$n" -lt 100 ]; do n=$((n+1)); sleep 0.05; done
fi
n=0; until mkdir "$R/.lock" 2>/dev/null; do n=$((n+1)); [ "$n" -gt 500 ] && { echo "stub lock timeout" >&2; exit 2; }; sleep 0.02; done
trap 'rmdir "$R/.lock" 2>/dev/null' EXIT
next_gen() { c=$(cat "$R/.counter" 2>/dev/null || echo 1000); c=$((c+1)); echo "$c" > "$R/.counter"; echo "$c"; }
case "$sub" in
  describe) f="$(obj "$a1")"; [ -f "$f" ] || missing "$a1"; gen_of "$f" ;;
  cat) f="$(obj "$a1")"; [ -f "$f" ] || missing "$a1"; cat "$f" ;;
  rm) f="$(obj "$a1")"; [ -f "$f" ] || missing "$a1"
      if [ -n "$match" ] && [ "$match" != "$(gen_of "$f")" ]; then precond; fi
      rm -f "$f" "$f.gen" ;;
  cp)
    case "$a1" in
      gs://*) f="$(obj "$a1")"
        case "$a2" in
          gs://*) [ -f "$f" ] || missing "$a1"   # server-side copy, bucket to bucket
            d="$(obj "$a2")"; mkdir -p "$(dirname "$d")"; cp "$f" "$d.tmp"; mv "$d.tmp" "$d"; g="$(next_gen)"; echo "$g" > "$d.gen" ;;
          *) if [ -n "\${STUB_FAIL_DOWNLOAD:-}" ]; then echo "ERROR: (gcloud.storage) HTTPError 503: backend error" >&2; exit 1; fi
             [ -f "$f" ] || missing "$a1"; cp "$f" "$a2" ;;
        esac ;;
      *) case "$a2" in *"\${STUB_FAIL_UPLOAD:-@@none@@}"*) echo "ERROR: stub upload failure" >&2; exit 1 ;; esac
         case "$a2" in */state.tar.gz) if [ -f "$STUB_DIR/grandchild.pid" ]; then
           if kill -0 "$(cat "$STUB_DIR/grandchild.pid")" 2>/dev/null; then echo "GRANDCHILD alive-at-upload" >> "$STUB_LOG"; else echo "GRANDCHILD gone-at-upload" >> "$STUB_LOG"; fi; fi ;; esac
         f="$(obj "$a2")"
         if [ -n "$match" ] && [ "$match" != "$(gen_of "$f")" ]; then precond; fi
         mkdir -p "$(dirname "$f")"; cp "$a1" "$f.tmp"; mv "$f.tmp" "$f"; g="$(next_gen)"; echo "$g" > "$f.gen"
         case "$f" in */state.tar.gz) cp "$f" "$f.hist-$g" ;; esac ;;
    esac ;;
  *) echo "stub gcloud: unsupported subcommand $sub" >&2; exit 2 ;;
esac
`.replaceAll('\\${', '${');

const NODE = String.raw`#!/bin/sh
# stub node: logs argv and the environment it was given, then behaves as STUB_NODE_* say.
S="$STUB_DIR"
echo "node $*" >> "$STUB_LOG"
{ echo "args=$*"; echo "LKB_TRANSCRIPT_QA=\${LKB_TRANSCRIPT_QA-<unset>}"; echo "WEBINAR_VISION_MODEL=\${WEBINAR_VISION_MODEL-<unset>}"
  echo "GEMINI_STT_MODEL=\${GEMINI_STT_MODEL-<unset>}"; echo "VNC_PASSWORD=\${VNC_PASSWORD-<unset>}"; } >> "$S/node-env.log"
case "$*" in
  *setup.mjs*)
    m=no; [ -e "$LKB_BOT_PROFILE_DIR/marker.txt" ] && m=yes; p=no; [ -e "$LKB_RELEASE_DIR/live-proof.json" ] && p=yes
    echo "DOCTOR marker=$m live-proof=$p" >> "$STUB_LOG"
    if [ -n "\${STUB_DOCTOR_STEAL_LEASE:-}" ]; then   # another instance takes the lease while the doctor gate runs
      printf 'holder=intruder
expires=%s
' "$(( $(date +%s) + 3600 ))" > "$STUB_BUCKET_DIR/testbucket/recorder/lease"; echo 99999 > "$STUB_BUCKET_DIR/testbucket/recorder/lease.gen"
    fi
    echo "\${STUB_DOCTOR_OUT:-DOCTOR OK}"; exit "\${STUB_DOCTOR_RC:-0}" ;;
esac
n=$(cat "$S/ticks" 2>/dev/null || echo 0); n=$((n+1)); echo "$n" > "$S/ticks"
now() { date +%s%N | cut -c1-13; }
echo "START $n $(now)" >> "$S/ticks.log"
if ! mkdir "$S/running" 2>/dev/null; then echo "OVERLAP at tick $n" >> "$STUB_LOG"; fi
SP=""
mode="\${STUB_NODE_MODE:-exit}"
if [ "$mode" = ignore-term ]; then
  trap 'echo "node ignoring TERM" >> "$STUB_LOG"' TERM
else
  trap 'echo "node got TERM" >> "$STUB_LOG"; if [ -n "\${STUB_HANG_ON_TERM:-}" ]; then : > "$S/hang-gcloud"; fi; [ -n "$SP" ] && kill "$SP" 2>/dev/null; rmdir "$S/running" 2>/dev/null; exit 143' TERM
fi
: > "$S/ready"
if [ -n "\${STUB_GRANDCHILD:-}" ]; then   # a process the pipeline starts (as Chrome is started) that ignores SIGTERM
  sh -c 'trap "" TERM; while :; do sleep 1; done' &
  echo $! > "$S/grandchild.pid"
fi
if [ -n "\${STUB_TOUCH_LOCKS:-}" ]; then
  : > "$LKB_RELEASE_DIR/poller.lock"; : > "$LKB_BOT_PROFILE_DIR/.lkb-tab-capture.lock"; : > "$LKB_BOT_PROFILE_DIR/.lkb-recovery.lock"
fi
if [ -n "\${STUB_TICK_WRITE:-}" ]; then
  mkdir -p "$LKB_RECORD_DIR"; printf 'video%s' "$n" > "$LKB_RECORD_DIR/rec-$n.webm"; : > "$LKB_RECORD_DIR/empty-$n.webm"
fi
if [ -n "\${STUB_WRITE_WEBM:-}" ]; then
  mkdir -p "$LKB_RECORD_DIR"; printf 'recorded-bytes' > "$LKB_RECORD_DIR/meeting.webm"; : > "$LKB_RECORD_DIR/zero.webm"
fi
rc="\${STUB_NODE_RC:-0}"
for t in \${STUB_FAIL_TICKS:-}; do [ "$t" = "$n" ] && rc=3; done
case "$mode" in
  hang) i=0; while [ "$i" -lt 150 ]; do i=$((i+1)); sleep 0.2 & SP=$!; wait "$SP"; done ;;
  ignore-term) i=0; while [ "$i" -lt 100 ]; do i=$((i+1)); sleep 0.2; done ;;
  *) if [ -n "\${STUB_NODE_SLEEP:-}" ]; then sleep "$STUB_NODE_SLEEP" & SP=$!; wait "$SP"; fi ;;
esac
echo "node end rc=$rc" >> "$STUB_LOG"; echo "END $n $(now)" >> "$S/ticks.log"
rmdir "$S/running" 2>/dev/null
exit "$rc"
`.replaceAll('\\${', '${');

const TAR_STUB = String.raw`#!/bin/sh
case " $* " in *" -czf "*)
  if [ -n "\${STUB_TAR_FAIL:-}" ]; then echo "tar: stub failure" >&2; exit 2; fi
  if [ -n "\${STUB_TAR_EXIT1:-}" ]; then "$REAL_TAR" "$@"; echo "tar: stub: a file changed as we read it" >&2; exit 1; fi
  if [ -n "\${STUB_TAR_CORRUPT:-}" ]; then "$REAL_TAR" "$@"; printf 'this is not a gzip archive' > "$2"; exit 0; fi ;; esac
exec "$REAL_TAR" "$@"
`.replaceAll('\\${', '${');
const CP_STUB = String.raw`#!/bin/sh
if [ -n "\${STUB_CP_FAIL:-}" ] && [ "$1" = "-a" ]; then echo "cp: stub failure (no space left on device)" >&2; exit 1; fi
exec "$REAL_CP" "$@"
`.replaceAll('\\${', '${');
const FIND_STUB = String.raw`#!/bin/sh
case " $* " in *" -mindepth "*) if [ -n "\${STUB_FIND_FAIL:-}" ]; then echo "find: stub failure" >&2; exit 1; fi ;; esac
exec "$REAL_FIND" "$@"
`.replaceAll('\\${', '${');

const QUIET = (name, body = 'exit 0') => `#!/bin/sh\n${body}\n`;

// ---- ustar helpers (so hostile archives need no symlink support from the host) ---------------------------------------
const oct = (n, w) => n.toString(8).padStart(w, '0');
function member({name, type = '0', content = Buffer.alloc(0), linkname = '', mode = 0o644}) {
  const h = Buffer.alloc(512);
  h.write(name, 0, 100); h.write(oct(mode, 7) + '\0', 100); h.write(oct(0, 7) + '\0', 108); h.write(oct(0, 7) + '\0', 116);
  h.write(oct(content.length, 11) + '\0', 124); h.write(oct(0, 11) + '\0', 136); h.fill(0x20, 148, 156); h.write(type, 156);
  h.write(linkname, 157, 100); h.write('ustar\0', 257); h.write('00', 263);
  let sum = 0; for (const b of h) sum += b;
  h.write(oct(sum, 6) + '\0 ', 148);
  const pad = Buffer.alloc((512 - (content.length % 512)) % 512);
  return Buffer.concat([h, content, pad]);
}
const makeTgz = (members) => gzipSync(Buffer.concat([...members.map(member), Buffer.alloc(1024)]));
function readTgz(buf) {
  const t = gunzipSync(buf), out = [];
  let off = 0, longName = null;
  while (off + 512 <= t.length && t[off] !== 0) {
    const h = t.subarray(off, off + 512);
    const str = (a, l) => { const s = h.subarray(a, a + l); const z = s.indexOf(0); return s.subarray(0, z < 0 ? l : z).toString('utf8'); };
    const size = parseInt(str(124, 12).trim() || '0', 8), type = str(156, 1) || '0';
    let name = str(0, 100); const prefix = str(345, 155); if (prefix) name = prefix + '/' + name;
    const content = t.subarray(off + 512, off + 512 + size);
    off += 512 + Math.ceil(size / 512) * 512;
    if (type === 'L') { longName = content.toString('utf8').replace(/\0.*$/s, ''); continue; }
    if (longName) { name = longName; longName = null; }
    out.push({name, type, content: Buffer.from(content), linkname: str(157, 100)});
  }
  return out;
}

// ---- the world one test runs in ---------------------------------------------------------------------------------------
function world(extraStubs = {}) {
  const dir = mkdtempSync(join(tmpdir(), 'b4state-'));
  const w = {dir};
  for (const d of ['bin', 'bucket/' + BUCKET + '/' + PFX, 'app', 'prof/bot-profile', 'rel/webinar-release', 'rec', 'tmp', 'xdg', 'stub', 'outside']) mkdirSync(join(dir, d), {recursive: true});
  const put = (name, text) => { const p = join(dir, 'bin', name); writeFileSync(p, text); chmodSync(p, 0o755); };
  put('gcloud', GCLOUD); put('node', NODE);
  put('pulseaudio', QUIET()); put('Xvfb', QUIET()); put('xdpyinfo', QUIET());
  put('pactl', QUIET('pactl', 'case "$1 $2 $3" in "list short sinks") echo "0 botsink" ;; esac; exit 0'));
  for (const [n, t] of Object.entries(extraStubs)) put(n, t);
  w.posix = (...p) => posix(join(dir, ...p));
  w.bucketFile = (key) => join(dir, 'bucket', BUCKET, PFX, key);
  w.seed = (key, buf, gen = 5) => { const f = w.bucketFile(key); mkdirSync(dirname(f), {recursive: true}); writeFileSync(f, buf); writeFileSync(f + '.gen', String(gen)); };
  w.log = () => existsSync(join(dir, 'stub.log')) ? readFileSync(join(dir, 'stub.log'), 'utf8').split('\n').filter(Boolean) : [];
  w.nodeEnv = () => existsSync(join(dir, 'stub/node-env.log')) ? readFileSync(join(dir, 'stub/node-env.log'), 'utf8') : '';
  w.profile = (f) => join(dir, 'prof/bot-profile', f);
  w.release = (f) => join(dir, 'rel/webinar-release', f);
  w.env = (extra = {}) => {
    const e = {...process.env};
    for (const k of Object.keys(e)) if (/^(LKB_|BOT_|STUB_|VNC_|WEBINAR_|GEMINI_)/.test(k)) delete e[k];
    return {...e, PATH: join(dir, 'bin') + delimiter + (process.env.PATH ?? ''), TMPDIR: w.posix('tmp'), XDG_RUNTIME_DIR: w.posix('xdg'),
      LKB_APP_DIR: w.posix('app'), LKB_BOT_PROFILE_DIR: w.posix('prof/bot-profile'), LKB_RELEASE_DIR: w.posix('rel/webinar-release'),
      LKB_RECORD_DIR: w.posix('rec'), LKB_STATE_PREFIX: PFX, LKB_SNAPSHOT_INTERVAL_S: '60', LKB_LEASE_RENEW_S: '30', LKB_STOP_WAIT_S: '3',
      STUB_LOG: w.posix('stub.log'), STUB_DIR: w.posix('stub'), STUB_BUCKET_DIR: w.posix('bucket'), ...extra};
  };
  w.bucketEnv = (extra = {}) => w.env({LKB_STATE_BUCKET: BUCKET, ...extra});
  w.run = (env, timeout = 60000) => {
    const r = spawnSync(SH, [posix(ENTRY)], {env, encoding: 'utf8', timeout});
    return {status: r.status, out: (r.stdout ?? '') + (r.stderr ?? ''), signal: r.signal};
  };
  w.runAsync = (env) => new Promise((resolve) => {
    const c = spawn(SH, [posix(ENTRY)], {env}); let out = '';
    c.stdout.on('data', (d) => { out += d; }); c.stderr.on('data', (d) => { out += d; });
    c.on('close', (status) => resolve({status, out}));
  });
  // Starts the entrypoint, waits for the pipeline stub to signal readiness, sends SIGTERM (optionally twice), reports exit status and delay.
  w.runWithTerm = (env, {second = false, pre = '0.3', timeout = 90000, waitEnds = 0} = {}) => {
    const drv = join(dir, 'driver.sh');
    writeFileSync(drv, `#!/bin/sh
sh "$1" >"$OUTFILE" 2>&1 &
EP=$!
i=0; while [ ! -e "$READY" ] && [ "$i" -lt 300 ]; do sleep 0.1; i=$((i+1)); done
sleep "$PRE"
if [ "\${WAITENDS:-0}" -gt 0 ]; then   # wait for N finished node runs (a loaded machine runs fewer ticks in a fixed time)
  i=0; while [ "$(grep -c '^node end rc=' "$STUB_LOG" 2>/dev/null || true)" -lt "$WAITENDS" ] && [ "$i" -lt 900 ]; do sleep 0.1; i=$((i+1)); done
fi
t0=$(date +%s%N); kill -TERM "$EP"
if [ -n "\${SECOND:-}" ]; then sleep 0.3; kill -TERM "$EP" 2>/dev/null; fi
rc=0; wait "$EP" || rc=$?
t1=$(date +%s%N)
echo "$rc" > "$RCFILE"; echo $(( (t1 - t0) / 1000000 )) > "$MSFILE"
`);
    const e = {...env, OUTFILE: w.posix('driver.out'), READY: w.posix('stub/ready'), PRE: pre, WAITENDS: String(waitEnds), RCFILE: w.posix('driver.rc'), MSFILE: w.posix('driver.ms'), ...(second ? {SECOND: '1'} : {})};
    const r = spawnSync(SH, [posix(drv), posix(ENTRY)], {env: e, encoding: 'utf8', timeout});
    const rd = (f) => existsSync(join(dir, f)) ? readFileSync(join(dir, f), 'utf8') : '';
    return {driverStatus: r.status, status: Number(rd('driver.rc').trim()), ms: Number(rd('driver.ms').trim()), out: rd('driver.out')};
  };
  w.cleanup = () => { try { rmSync(dir, {recursive: true, force: true, maxRetries: 3}); } catch {} };
  return w;
}
const seedLocal = (w) => {
  writeFileSync(w.profile('marker.txt'), 'local-profile-marker');
  writeFileSync(w.release('local.json'), '{"local":true}');
};
const noPublicOrIam = (lines) => {
  const bad = lines.filter((l) => /\b(acl|iam)\b|--canned-acl|--predefined-acl|allUsers|allAuthenticatedUsers|-a (public|private)/i.test(l));
  assert.deepEqual(bad, [], 'a stub call sets an ACL, a public object or IAM');
};
const nodeCalls = (w) => w.log().filter((l) => /^node (scripts|--import)/.test(l));
const calls = (w, re) => w.log().filter((l) => l.startsWith('gcloud ') && re.test(l));
const stateUploads = (w) => calls(w, /^gcloud storage cp \S+ gs:\/\/testbucket\/recorder\/state\.tar\.gz/);
const stateDownloads = (w) => calls(w, /^gcloud storage cp gs:\/\/testbucket\/recorder\/state\.tar\.gz (?!gs:)/);
const statePrevCopies = (w) => calls(w, /^gcloud storage cp gs:\/\/testbucket\/recorder\/state\.tar\.gz gs:\/\/testbucket\/recorder\/state\.prev\.tar\.gz/);
const histories = (w) => readdirSync(join(w.dir, 'bucket', BUCKET, PFX)).filter((n) => n.startsWith('state.tar.gz.hist-'))
  .sort((a, b) => Number(a.split('-')[1]) - Number(b.split('-')[1])).map((n) => readTgz(readFileSync(join(w.dir, 'bucket', BUCKET, PFX, n))));
const names = (members) => members.map((m) => m.name.replace(/\/$/, '')).sort();
const sleepSecs = (s) => spawnSync(SH, ['-c', `sleep ${s}`]);

const stateTar = (extra = []) => makeTgz([
  {name: 'bot-profile/', type: '5', mode: 0o700},
  {name: 'bot-profile/marker.txt', content: Buffer.from('marker-from-bucket')},
  {name: 'bot-profile/Default/', type: '5', mode: 0o700},
  {name: 'bot-profile/Default/Cookies', content: Buffer.from([0, 1, 2, 255, 254, 10, 13, 0])},
  {name: 'bot-profile/.lkb-recovery.lock', content: Buffer.from('needs inspection')},
  {name: 'bot-profile/.lkb-tab-capture.lock', content: Buffer.from('999')},
  {name: 'bot-profile/SingletonSocket', type: '2', linkname: '/tmp/.org.chromium.Chromium.abc/SingletonSocket'},
  {name: 'webinar-release/', type: '5', mode: 0o700},
  {name: 'webinar-release/live-proof.json', content: Buffer.from('{"status":"passed"}')},
  {name: 'webinar-release/poller.lock', content: Buffer.from('4242')},
  ...extra]);

// =========================================================================================================================
test('B4-C1 restore: the bucket tar is extracted before the doctor gate; bytes match; the sequence is otherwise the old one', T, () => {
  const w = world();
  try {
    w.seed('state.tar.gz', stateTar());
    const r = w.run(w.bucketEnv());
    assert.equal(r.status, 0, r.out);
    const log = w.log();
    const iDown = log.findIndex((l) => l.startsWith('gcloud storage cp gs://testbucket/recorder/state.tar.gz')), iDoc = log.findIndex((l) => l.includes('setup.mjs'));
    assert.ok(iDown >= 0 && iDown < iDoc, 'restore must come before the doctor gate');
    assert.ok(log.includes('DOCTOR marker=yes live-proof=yes'), 'the doctor must already see the restored files');
    assert.ok(iDoc < log.findIndex((l) => l.includes('run-pipeline.mjs')), 'doctor gate before the pipeline');
    assert.equal(readFileSync(w.profile('marker.txt'), 'utf8'), 'marker-from-bucket');
    assert.deepEqual([...readFileSync(w.profile('Default/Cookies'))], [0, 1, 2, 255, 254, 10, 13, 0]);
    assert.equal(readFileSync(w.release('live-proof.json'), 'utf8'), '{"status":"passed"}');
    assert.equal(existsSync(w.profile('SingletonSocket')), false, 'Chrome Singleton* files are host-bound and never restored');
    noPublicOrIam(log);
  } finally { w.cleanup(); }
});

test('B4-C1(a)/B4-I3 no bucket variable: no stub bucket command is called and the pipeline is exec-ed as before', T, () => {
  const w = world();
  try {
    const r = w.run(w.env({STUB_NODE_RC: '4'}));
    assert.equal(r.status, 4, r.out);
    assert.equal(calls(w, /.*/).length, 0, 'no gcloud call at all');
    const lines = nodeCalls(w);
    assert.equal(lines.length, 2);
    assert.match(lines[0], /setup\.mjs --doctor/);
    assert.equal(lines[1], 'node scripts/webinar/run-pipeline.mjs --run --watch');
  } finally { w.cleanup(); }
});

test('B4-C1(b) bucket set, no object: first boot starts with whatever state is local and says so', T, () => {
  const w = world();
  try {
    seedLocal(w);
    const r = w.run(w.bucketEnv());
    assert.equal(r.status, 0, r.out);
    assert.match(r.out, /first boot/);
    assert.equal(readFileSync(w.profile('marker.txt'), 'utf8'), 'local-profile-marker');
    assert.ok(w.log().some((l) => l.includes('run-pipeline.mjs')));
  } finally { w.cleanup(); }
});

test('B4-C1(c) a truncated tar, or an unreadable bucket object: exit non-zero, local state untouched, pipeline never started', T, () => {
  for (const mode of ['truncated', 'unreadable']) {
    const w = world();
    try {
      seedLocal(w);
      const tgz = stateTar();
      if (mode === 'truncated') w.seed('state.tar.gz', tgz.subarray(0, Math.floor(tgz.length / 2)));
      else w.seed('state.tar.gz', tgz);
      const r = w.run(w.bucketEnv(mode === 'unreadable' ? {STUB_FAIL_DOWNLOAD: '1'} : {}));
      assert.notEqual(r.status, 0, `${mode}: ${r.out}`);
      assert.equal(readFileSync(w.profile('marker.txt'), 'utf8'), 'local-profile-marker', `${mode}: local state must be untouched`);
      assert.equal(readFileSync(w.release('local.json'), 'utf8'), '{"local":true}');
      assert.ok(!w.log().some((l) => l.includes('run-pipeline.mjs') || l.includes('setup.mjs')), `${mode}: nothing may run`);
      assert.equal(stateUploads(w).length, 0, `${mode}: a failed restore must not overwrite the bucket object`);
    } finally { w.cleanup(); }
  }
});

test('B4-C1(d) a tar with a ../ member, an absolute member, an outside symlink or a member outside both trees is refused; nothing is written outside', T, () => {
  const attacks = {
    parent: [{name: 'bot-profile/../../escape.txt', content: Buffer.from('x')}],
    absolute: [{name: '/tmp/b4-abs-escape.txt', content: Buffer.from('x')}],
    symlinkOut: [{name: 'bot-profile/evil', type: '2', linkname: '../../outside'}],
    symlinkAbs: [{name: 'webinar-release/evil', type: '2', linkname: '/etc'}],
    hardlinkOut: [{name: 'bot-profile/hard', type: '1', linkname: '../outside/target'}],
    outsideTrees: [{name: 'other/dir/file.txt', content: Buffer.from('x')}],
  };
  for (const [label, members] of Object.entries(attacks)) {
    const w = world();
    try {
      seedLocal(w);
      w.seed('state.tar.gz', stateTar(members));
      const r = w.run(w.bucketEnv());
      assert.notEqual(r.status, 0, `${label}: ${r.out}`);
      assert.match(r.out, /refused/i, label);
      assert.equal(readFileSync(w.profile('marker.txt'), 'utf8'), 'local-profile-marker', `${label}: local state must be untouched`);
      for (const p of [join(w.dir, 'escape.txt'), join(w.dir, 'prof', 'escape.txt'), join(w.dir, 'outside', 'target'), '/tmp/b4-abs-escape.txt', join(w.dir, 'prof/bot-profile/evil'), join(w.release('evil'))])
        assert.equal(existsSync(p), false, `${label}: ${p} must not exist`);
      assert.ok(!w.log().some((l) => l.includes('run-pipeline.mjs')), `${label}: pipeline must not start`);
    } finally { w.cleanup(); }
  }
});

test('B4-C2 locks: poller.lock and .lkb-tab-capture.lock are gone after restore; .lkb-recovery.lock stays; a snapshot drops the first two and keeps the third', T, () => {
  const w = world();
  try {
    w.seed('state.tar.gz', stateTar());
    const r = w.run(w.bucketEnv({STUB_TOUCH_LOCKS: '1'}));   // the pipeline stub (re)creates all three locks, as the real one does
    assert.equal(r.status, 0, r.out);
    const log = w.log();
    assert.ok(log.some((l) => l === 'DOCTOR marker=yes live-proof=yes'));
    const final = histories(w).at(-1), n = names(final);
    assert.ok(n.includes('bot-profile/.lkb-recovery.lock'), 'the snapshot keeps .lkb-recovery.lock');
    assert.ok(!n.some((x) => x.endsWith('poller.lock')) && !n.some((x) => x.endsWith('.lkb-tab-capture.lock')), `locks must not be in the snapshot: ${n}`);
    // restore alone (pipeline exits at once and leaves no locks): the locks the tar carried are absent, the recovery lock is in place
    const w2 = world();
    try {
      w2.seed('state.tar.gz', stateTar());
      assert.equal(w2.run(w2.bucketEnv()).status, 0);
      assert.equal(existsSync(w2.release('poller.lock')), false);
      assert.equal(existsSync(w2.profile('.lkb-tab-capture.lock')), false);
      assert.equal(readFileSync(w2.profile('.lkb-recovery.lock'), 'utf8'), 'needs inspection');
    } finally { w2.cleanup(); }
  } finally { w.cleanup(); }
});

test('B4-C3 lease: an unexpired lease of another holder blocks restore and pipeline, is never overwritten, and exits non-zero', T, () => {
  const w = world();
  try {
    seedLocal(w);
    const body = `holder=someone-else\nexpires=${Math.floor(Date.now() / 1000) + 3600}\n`;
    w.seed('lease', Buffer.from(body), 7); w.seed('state.tar.gz', stateTar());
    const r = w.run(w.bucketEnv());
    assert.notEqual(r.status, 0, r.out);
    assert.match(r.out, /lease is held by someone-else/);
    assert.equal(readFileSync(w.bucketFile('lease'), 'utf8'), body, 'the other holder\'s lease must not change');
    assert.equal(stateDownloads(w).length, 0, 'no restore');
    assert.equal(nodeCalls(w).length, 0, 'no doctor, no pipeline');
    assert.equal(calls(w, /storage (cp \S+ gs:\/\/\S*lease|rm)/).length, 0, 'no write to the lease');
    assert.equal(readFileSync(w.profile('marker.txt'), 'utf8'), 'local-profile-marker');
  } finally { w.cleanup(); }
});

test('B4-C3 lease: an expired lease is taken over (replace only if unchanged), renewed while the pipeline runs, and deleted on clean shutdown', T, () => {
  const w = world();
  try {
    w.seed('lease', Buffer.from('holder=dead-instance\nexpires=100\n'), 7);
    const r = w.run(w.bucketEnv({LKB_LEASE_RENEW_S: '1', LKB_LEASE_TTL_S: '30', STUB_NODE_SLEEP: '9'}));
    assert.equal(r.status, 0, r.out);
    const writes = calls(w, /^gcloud storage cp \S+ gs:\/\/testbucket\/recorder\/lease /);
    assert.match(writes[0], /--if-generation-match=7$/, 'takeover is conditional on the generation that was read');
    assert.ok(writes.length >= 3, `taken once and renewed at least twice, got ${writes.length}`);
    assert.ok(writes.slice(1).every((l) => /--if-generation-match=\d+$/.test(l) && !/match=0$/.test(l)), 'every renewal is conditional too');
    assert.equal(existsSync(w.bucketFile('lease')), false, 'a clean shutdown deletes the lease it holds');
    assert.ok(calls(w, /^gcloud storage rm gs:\/\/testbucket\/recorder\/lease --if-generation-match=\d+/).length === 1);
  } finally { w.cleanup(); }
});

test('B4-C3(d) two entrypoints started together against one bucket (barrier at the first lease read): exactly one proceeds', T, async () => {
  const w = world();
  try {
    const env = w.bucketEnv({STUB_BARRIER: '2', STUB_NODE_SLEEP: '4'});
    const [a, b] = await Promise.all([w.runAsync(env), w.runAsync(env)]);
    const codes = [a.status, b.status].sort();
    assert.deepEqual(codes, [0, 75], `${a.out}\n---\n${b.out}`);
    assert.equal(w.log().filter((l) => l.includes('run-pipeline.mjs')).length, 1, 'only one pipeline');
    assert.equal(stateDownloads(w).length, 1, 'only one restore attempt');
    assert.equal(calls(w, /recorder\/lease --if-generation-match=0$/).length, 2, 'both tried create-if-absent');
  } finally { w.cleanup(); }
});

test('B4-C3(e) a lost lease stops the pipeline and nothing more is uploaded (no snapshot, no recording copy)', T, async () => {
  const w = world();
  try {
    const env = w.bucketEnv({LKB_LEASE_RENEW_S: '1', LKB_SNAPSHOT_INTERVAL_S: '2', LKB_LEASE_TTL_S: '30', STUB_NODE_MODE: 'hang', STUB_WRITE_WEBM: '1'});
    const p = w.runAsync(env);
    for (let i = 0; i < 100 && !existsSync(join(w.dir, 'stub/ready')); i++) await sleep(100);
    // another instance replaces the lease (new generation, other holder)
    writeFileSync(w.bucketFile('lease'), `holder=intruder\nexpires=${Math.floor(Date.now() / 1000) + 3600}\n`);
    writeFileSync(w.bucketFile('lease') + '.gen', '99999');
    const r = await p;
    assert.equal(r.status, 75, r.out);
    assert.ok(w.log().includes('node got TERM'), 'the pipeline was stopped');
    assert.equal(stateUploads(w).length, 0, 'no snapshot upload at all, neither periodic nor final');
    assert.equal(calls(w, /recordings\//).length, 0, 'no recording copy');
    assert.match(readFileSync(w.bucketFile('lease'), 'utf8'), /holder=intruder/, 'the other holder\'s lease is left alone');
    assert.match(r.out, /lease lost/);
  } finally { w.cleanup(); }
});

test('B4-C4 periodic snapshots: at least two while the pipeline runs, each a complete tar of exactly the profile and release trees', T, () => {
  const w = world();
  try {
    writeFileSync(w.profile('marker.txt'), 'm'); mkdirSync(w.profile('Default'), {recursive: true}); writeFileSync(w.profile('Default/Cookies'), 'c');
    writeFileSync(w.release('live-proof.json'), '{}'); writeFileSync(w.release('state.json'), '{"a":1}');
    const r = w.run(w.bucketEnv({LKB_SNAPSHOT_INTERVAL_S: '1', STUB_NODE_SLEEP: '9', LKB_LEASE_TTL_S: '60'}));
    assert.equal(r.status, 0, r.out);
    const tars = histories(w);
    assert.ok(tars.length >= 3, `two periodic + one final expected, got ${tars.length}`);
    const expect = ['bot-profile', 'bot-profile/Default', 'bot-profile/Default/Cookies', 'bot-profile/marker.txt', 'webinar-release', 'webinar-release/live-proof.json', 'webinar-release/state.json'];
    for (const t of tars) assert.deepEqual(names(t), expect);
    assert.equal(tars[0].find((m) => m.name === 'bot-profile/Default/Cookies').content.toString(), 'c');
    noPublicOrIam(w.log());
  } finally { w.cleanup(); }
});

test('B4-C4 a failing upload leaves the previous object byte-identical and does not stop the pipeline', T, () => {
  const w = world();
  try {
    const previous = stateTar();
    w.seed('state.tar.gz', previous);
    const r = w.run(w.bucketEnv({LKB_SNAPSHOT_INTERVAL_S: '1', STUB_NODE_SLEEP: '3', STUB_FAIL_UPLOAD: 'state.tar.gz', LKB_LEASE_TTL_S: '60'}));
    assert.equal(r.status, 0, 'the pipeline status is the exit status: ' + r.out);
    assert.ok(w.log().includes('node end rc=0'), 'the pipeline ran to its end');
    assert.ok(stateUploads(w).length >= 2, 'uploads were attempted');
    assert.ok(readFileSync(w.bucketFile('state.tar.gz')).equals(previous), 'the previous bucket object is byte-identical');
    assert.match(r.out, /upload failed/);
  } finally { w.cleanup(); }
});

test('B4-C4 a failed tar creation uploads nothing', T, () => {
  const realTar = spawnSync(SH, ['-c', 'command -v tar'], {encoding: 'utf8'}).stdout.trim();
  const w = world({tar: TAR_STUB});
  try {
    const previous = stateTar();
    w.seed('state.tar.gz', previous);
    const r = w.run(w.bucketEnv({LKB_SNAPSHOT_INTERVAL_S: '1', STUB_NODE_SLEEP: '3', STUB_TAR_FAIL: '1', REAL_TAR: realTar, LKB_LEASE_TTL_S: '60'}));
    assert.equal(r.status, 0, r.out);
    assert.equal(stateUploads(w).length, 0, 'no upload when tar fails');
    assert.ok(readFileSync(w.bucketFile('state.tar.gz')).equals(previous));
    assert.match(r.out, /tar failed/);
  } finally { w.cleanup(); }
});

test('B4-C5 SIGTERM: forwarded to the pipeline, one final snapshot after it exits, lease released, exit within the bound; a second SIGTERM adds nothing', T, () => {
  const w = world();
  try {
    writeFileSync(w.profile('marker.txt'), 'm');
    const r = w.runWithTerm(w.bucketEnv({STUB_NODE_MODE: 'hang', LKB_LEASE_TTL_S: '60'}), {second: true});
    assert.equal(r.status, 143, r.out);
    assert.ok(r.ms < 8000, `exit took ${r.ms} ms`);
    const log = w.log();
    const iTerm = log.indexOf('node got TERM');
    assert.ok(iTerm >= 0, 'the pipeline got SIGTERM');
    const afterUploads = log.slice(iTerm).filter((l) => /^gcloud storage cp \S+ gs:\/\/testbucket\/recorder\/state\.tar\.gz/.test(l));
    assert.equal(afterUploads.length, 1, 'exactly one final snapshot, taken after the pipeline exited');
    assert.equal(existsSync(w.bucketFile('lease')), false, 'lease released');
    assert.ok(names(histories(w).at(-1)).includes('bot-profile/marker.txt'));
  } finally { w.cleanup(); }
});

test('B4-C5 a pipeline that ignores SIGTERM is killed after the bound; the final snapshot IS taken and the lease is released', T, () => {
  const w = world();
  try {
    const r = w.runWithTerm(w.bucketEnv({STUB_NODE_MODE: 'ignore-term', LKB_STOP_WAIT_S: '2', LKB_LEASE_TTL_S: '60'}));
    assert.ok(r.status !== 0, `${r.status}: ${r.out}`);
    assert.ok(r.ms >= 1800 && r.ms < 10000, `exit took ${r.ms} ms (bound is 2 s)`);
    assert.ok(w.log().includes('node ignoring TERM'));
    assert.match(r.out, /ignored SIGTERM/);
    assert.equal(stateUploads(w).length, 1, 'one final snapshot after the forced kill');
    assert.equal(existsSync(w.bucketFile('lease')), false, 'lease released');
  } finally { w.cleanup(); }
});

test('B4-C6 record-once: doctor gate, ONE record command (never run-pipeline), non-empty .webm copied, final snapshot, lease released, record exit status', T, () => {
  const w = world();
  try {
    const r = w.run(w.bucketEnv({BOT_MODE: 'record-once', LKB_RECORD_URL: 'https://meet.example.com/abc-defg', LKB_RECORD_UNTIL: '18:30',
      LKB_RECORD_ARGS: '--title Standup --transcribe', STUB_WRITE_WEBM: '1', STUB_NODE_RC: '7', LKB_LEASE_TTL_S: '60'}));
    assert.equal(r.status, 7, r.out);
    const nodes = nodeCalls(w);
    assert.equal(nodes.length, 2, nodes.join('\n'));
    assert.match(nodes[0], /setup\.mjs --doctor/);
    assert.equal(nodes[1], 'node --import tsx packages/meeting-bot/src/cli.ts record https://meet.example.com/abc-defg --until 18:30 --title Standup --transcribe');
    assert.ok(!w.log().some((l) => l.includes('run-pipeline.mjs')));
    assert.equal(readFileSync(w.bucketFile('recordings/meeting.webm'), 'utf8'), 'recorded-bytes');
    assert.equal(existsSync(w.bucketFile('recordings/zero.webm')), false, 'a zero-byte recording is skipped');
    assert.match(r.out, /skipping empty recording/);
    const log = w.log(), iEnd = log.indexOf('node end rc=7');
    const iCopy = log.findIndex((l) => l.includes('recordings/meeting.webm')), iSnap = log.findIndex((l, i) => i > iEnd && /state\.tar\.gz/.test(l)), iRm = log.findIndex((l) => l.startsWith('gcloud storage rm'));
    assert.ok(iEnd < iCopy && iCopy < iSnap && iSnap < iRm, `order: record end, copy, final snapshot, lease release (${[iEnd, iCopy, iSnap, iRm]})`);
    assert.equal(existsSync(w.bucketFile('lease')), false);
    noPublicOrIam(log);
    // without a bucket: exec, status passes through
    const w2 = world();
    try {
      const r2 = w2.run(w2.env({BOT_MODE: 'record-once', LKB_RECORD_URL: 'https://x.example/y', LKB_RECORD_UNTIL: '10:00', STUB_NODE_RC: '9'}));
      assert.equal(r2.status, 9);
      assert.equal(calls(w2, /.*/).length, 0);
    } finally { w2.cleanup(); }
    // missing variables: refuses before touching anything
    const w3 = world();
    try {
      const r3 = w3.run(w3.bucketEnv({BOT_MODE: 'record-once'}));
      assert.notEqual(r3.status, 0); assert.match(r3.out, /LKB_RECORD_URL/); assert.equal(w3.log().length, 0);
    } finally { w3.cleanup(); }
  } finally { w.cleanup(); }
});

test('B4-C7 attendance loop: one tick per interval, never --watch, ticks never overlap, a failing tick is logged and the loop goes on, recordings copied once each, SIGTERM stops it', T, () => {
  const w = world();
  try {
    const r = w.runWithTerm(w.bucketEnv({LKB_ATTENDANCE_ACCOUNT: 'bot@example.org', LKB_ATTENDANCE_INTERVAL_S: '1', STUB_NODE_SLEEP: '1', STUB_FAIL_TICKS: '2',
      STUB_TICK_WRITE: '1', LKB_LEASE_TTL_S: '60'}), {pre: '0.5', waitEnds: 3, timeout: 150000});
    assert.ok(r.status === 0 || r.status === 143, `exit ${r.status}: ${r.out}`);
    assert.ok(r.ms < 14000, `stopped within the bound: ${r.ms} ms`);
    const log = w.log();
    const ticks = nodeCalls(w).filter((l) => l.includes('run-pipeline.mjs'));
    assert.ok(ticks.length >= 3, `expected 3+ ticks, got ${ticks.length}`);
    for (const t of ticks) assert.equal(t, 'node scripts/webinar/run-pipeline.mjs --run --calendar-attendance-account bot@example.org');
    assert.ok(!log.some((l) => /--watch/.test(l)), 'never --watch');
    assert.ok(!log.some((l) => l.startsWith('OVERLAP')), 'ticks never overlap');
    assert.match(r.out, /tick failed \(exit 3\)/, 'the failing tick is logged with its exit code');
    const startsAfterFail = ticks.length >= 3;
    assert.ok(startsAfterFail, 'the loop continued after the failing tick');
    const rec = calls(w, /recordings\/rec-1\.webm/);
    assert.equal(rec.length, 1, 'each recording is copied once');
    assert.equal(existsSync(w.bucketFile('recordings/empty-1.webm')), false, 'zero-byte skipped');
    assert.ok(existsSync(w.bucketFile('recordings/rec-2.webm')) || ticks.length < 2);
    const countAtStop = ticks.length;
    sleepSecs(2);
    assert.equal(w.log().filter((l) => l.includes('run-pipeline.mjs')).length, countAtStop, 'no tick after SIGTERM');
  } finally { w.cleanup(); }
});

test('B4-C7 attendance loop works without a bucket (no bucket command), and an overlong tick is never joined by a second one', T, () => {
  const w = world();
  try {
    const r = w.runWithTerm(w.env({LKB_ATTENDANCE_ACCOUNT: 'bot@example.org', LKB_ATTENDANCE_INTERVAL_S: '1', STUB_NODE_SLEEP: '3'}), {pre: '4'});
    assert.ok(r.status === 0 || r.status === 143, `exit ${r.status}: ${r.out}`);
    assert.equal(calls(w, /.*/).length, 0);
    assert.ok(!w.log().some((l) => l.startsWith('OVERLAP')));
    const starts = readFileSync(join(w.dir, 'stub/ticks.log'), 'utf8').split('\n').filter((l) => l.startsWith('START')).map((l) => Number(l.split(' ')[2]));
    assert.ok(starts.length >= 2, `at least two ticks, got ${starts.length}`);
    assert.ok(starts[1] - starts[0] >= 2800, `a tick that outlives the interval is not run twice at once (gap ${starts[1] - starts[0]} ms)`);
  } finally { w.cleanup(); }
});

test('hosted-send-now: LKB_SEND_NOW_QUEUE=1 alone loops the queue worker (never --watch), copies recordings, stops on SIGTERM', T, () => {
  const w = world();
  try {
    const r = w.runWithTerm(w.bucketEnv({LKB_SEND_NOW_QUEUE: '1', LKB_ATTENDANCE_INTERVAL_S: '2', STUB_NODE_SLEEP: '1', STUB_TICK_WRITE: '1', LKB_LEASE_TTL_S: '60'}),
      {pre: '0.5', waitEnds: 3, timeout: 150000});
    assert.ok(r.status === 0 || r.status === 143, `exit ${r.status}: ${r.out}`);
    const calls_ = nodeCalls(w);
    const queue = calls_.filter((l) => l.includes('queue-worker.ts'));
    assert.ok(queue.length >= 3, `expected 3+ queue steps, got ${queue.length}: ${calls_.join(' | ')}`);
    for (const q of queue) assert.match(q, /^node --import tsx scripts\/webinar\/send-now\/queue-worker\.ts --once --max-wait-s \d+$/);
    assert.ok(!calls_.some((l) => l.includes('run-pipeline.mjs')), 'no calendar tick without an attendance account, and never --watch');
    assert.ok(!w.log().some((l) => l.startsWith('OVERLAP')), 'one step at a time');
    assert.equal(calls(w, /recordings\/rec-1\.webm/).length, 1, 'a recording made by a job is copied once');
    const countAtStop = queue.length;
    sleepSecs(2);
    assert.equal(nodeCalls(w).filter((l) => l.includes('queue-worker.ts')).length, countAtStop, 'no queue step after SIGTERM');
  } finally { w.cleanup(); }
});

test('hosted-send-now: with an attendance account the queue step follows each tick; a queue error (exit 1) naps, it does not spin', T, () => {
  const w = world();
  try {
    const r = w.runWithTerm(w.env({LKB_SEND_NOW_QUEUE: '1', LKB_ATTENDANCE_ACCOUNT: 'bot@example.org', LKB_ATTENDANCE_INTERVAL_S: '2', STUB_NODE_RC: '1'}), {pre: '5'});
    assert.ok(r.status === 0 || r.status === 143 || r.status === 1, `exit ${r.status}: ${r.out}`);
    const seq = nodeCalls(w).filter((l) => !l.includes('setup.mjs')).map((l) => l.includes('queue-worker.ts') ? 'Q' : l.includes('--calendar-attendance-account') ? 'T' : '?');
    assert.ok(seq.length >= 4 && seq.length <= 8, `bounded by the interval, not a spin: ${seq.join('')}`);
    assert.match(seq.join(''), /^(TQ)+T?$/, `tick then queue, alternating: ${seq.join('')}`);
    assert.match(r.out, /queue step failed \(exit 1\)/);
  } finally { w.cleanup(); }
});

test('hosted-send-now: a queue step that crashes (exit 137) naps like a config error; only 0 and 2 re-poll at once', T, () => {
  const w = world();
  try {
    const r = w.runWithTerm(w.env({LKB_SEND_NOW_QUEUE: '1', LKB_ATTENDANCE_INTERVAL_S: '2', STUB_NODE_RC: '137'}), {pre: '5'});
    assert.ok([0, 1, 137, 143].includes(r.status), `exit ${r.status}: ${r.out}`);
    const queue = nodeCalls(w).filter((l) => l.includes('queue-worker.ts'));
    assert.ok(queue.length >= 1 && queue.length <= 4, `bounded by the interval, not a spin: ${queue.length} queue steps`);
  } finally { w.cleanup(); }
});

test('hosted-send-now: LKB_SEND_NOW_QUEUE is ignored outside run mode', T, () => {
  const w = world();
  try {
    const r = w.run(w.env({BOT_MODE: 'record-once', LKB_RECORD_URL: 'https://x.example/y', LKB_RECORD_UNTIL: '10:00', LKB_SEND_NOW_QUEUE: '1'}));
    assert.equal(r.status, 0, r.out);
    assert.ok(!nodeCalls(w).some((l) => l.includes('queue-worker.ts')));
  } finally { w.cleanup(); }
});

test('B4-C8 LKB_TRANSCRIPT_QA, WEBINAR_VISION_MODEL and GEMINI_STT_MODEL reach node unchanged in run, record-once and doctor; VNC_PASSWORD never does', T, () => {
  const base = {LKB_TRANSCRIPT_QA: '1', WEBINAR_VISION_MODEL: 'vision-a', GEMINI_STT_MODEL: 'stt-b', VNC_PASSWORD: 'hunter2'};
  for (const [mode, extra, nodeCalls] of [['run', {}, 2], ['record-once', {LKB_RECORD_URL: 'https://x.example/y', LKB_RECORD_UNTIL: '10:00'}, 2], ['doctor', {}, 1]]) {
    for (const bucket of [false, true]) {
      if (mode === 'doctor' && bucket) continue;
      const w = world();
      try {
        const e = bucket ? w.bucketEnv({BOT_MODE: mode, ...base, ...extra}) : w.env({BOT_MODE: mode, ...base, ...extra});
        const r = w.run(e);
        assert.equal(r.status, 0, `${mode} bucket=${bucket}: ${r.out}`);
        const blocks = w.nodeEnv().split('args=').slice(1);
        assert.equal(blocks.length, nodeCalls, `${mode}: node calls`);
        for (const b of blocks) {
          assert.match(b, /LKB_TRANSCRIPT_QA=1\n/); assert.match(b, /WEBINAR_VISION_MODEL=vision-a\n/); assert.match(b, /GEMINI_STT_MODEL=stt-b\n/);
          assert.match(b, /VNC_PASSWORD=<unset>\n/, 'VNC_PASSWORD must not reach node');
        }
      } finally { w.cleanup(); }
    }
  }
});

test('B4-I2 the doctor gate still fails closed, and doctor mode exits after it without a pipeline or any bucket call', T, () => {
  for (const [env, label] of [[{STUB_DOCTOR_RC: '3'}, 'rc'], [{STUB_DOCTOR_OUT: 'MISSING gws'}, 'MISSING']]) {
    for (const bucket of [false, true]) {
      const w = world();
      try {
        const r = w.run(bucket ? w.bucketEnv(env) : w.env(env));
        assert.equal(r.status, 1, `${label} bucket=${bucket}: ${r.out}`);
        assert.match(r.out, /doctor failed/);
        assert.ok(!w.log().some((l) => l.includes('run-pipeline.mjs')));
        if (bucket) assert.equal(existsSync(w.bucketFile('lease')), false, 'a refused start releases the lease it took');
      } finally { w.cleanup(); }
    }
  }
  const w = world();
  try {
    const r = w.run(w.bucketEnv({BOT_MODE: 'doctor'}));
    assert.equal(r.status, 0, r.out);
    assert.equal(calls(w, /.*/).length, 0, 'doctor mode never touches the bucket');
    assert.equal(nodeCalls(w).length, 1);
  } finally { w.cleanup(); }
});

test('B4-I3 with no bucket SIGTERM still reaches the pipeline and the container exits with its status', T, () => {
  const w = world();
  try {
    const r = w.runWithTerm(w.env({STUB_NODE_MODE: 'hang'}));
    assert.equal(r.status, 143, r.out);
    assert.ok(w.log().includes('node got TERM'));
    assert.equal(calls(w, /.*/).length, 0);
  } finally { w.cleanup(); }
});

test('B4-I1/I4/I5/I6 login mode, Dockerfile and the script text: the VNC handling is unchanged, no secret in ENV, no ACL or IAM word in any bucket call', T, () => {
  const e = readFileSync(ENTRY, 'utf8'), d = readFileSync(join(root, 'docker/meeting-bot/Dockerfile'), 'utf8');
  assert.match(e, /^  trap 'rm -f "\$VNC_PASSFILE"' EXIT$/m);
  assert.match(e, /^  \( umask 077; printf '%s\\n' "\$VNC_PASSWORD" > "\$VNC_PASSFILE" \)$/m);
  assert.match(e, /-passwdfile "rm:\$VNC_PASSFILE"/);
  assert.ok(e.indexOf('unset VNC_PASSWORD') < e.indexOf('\npulseaudio -D'));
  assert.ok(e.indexOf('unset VNC_PASSWORD') < e.indexOf('\nXvfb :99'));
  assert.doesNotMatch(e, /gcloud storage [^\n]*(acl|iam|allUsers)/i);
  assert.doesNotMatch(e, /gsutil|set-iam|--canned-acl|--predefined-acl|-a public/);
  assert.match(d, /^USER node$/m);
  assert.match(d, /^ARG GWS_VERSION=0\.22\.5$/m);
  assert.match(d, /ENTRYPOINT \["\/usr\/bin\/tini", "-s", "--", "\/usr\/local\/bin\/bot-entrypoint"\]/);
  assert.doesNotMatch(d, /(API_KEY|TOKEN|PASSWORD|SECRET|MONGODB_URL|PRIVATE_KEY)\s*=\s*\S/);
  assert.match(d, /google-cloud-cli/, 'the image installs the bucket client the entrypoint calls');
  assert.match(d, /if-generation-match/, 'the build fails if the client lacks the generation precondition');
  const lastUser = d.lastIndexOf('USER '); assert.equal(d.slice(lastUser, d.indexOf('\n', lastUser)), 'USER node');
});

// =========================================================================================================================
// Pre-check repair (review findings, fix cycle 0): restore failures, snapshot validation and previous copy, generation
// precondition on the state object, record-once copy failure, shutdown bounds, process group, lease renewal before start.
const shOut = (cmd) => spawnSync(SH, ['-c', cmd], {encoding: 'utf8'}).stdout.trim();
const alive = (pid) => spawnSync(SH, ['-c', `kill -0 ${Number(pid)}`]).status === 0;
const prevTar = () => makeTgz([
  {name: 'bot-profile/', type: '5', mode: 0o700}, {name: 'bot-profile/marker.txt', content: Buffer.from('marker-from-previous')},
  {name: 'webinar-release/', type: '5', mode: 0o700}, {name: 'webinar-release/live-proof.json', content: Buffer.from('{"status":"prev"}')}]);
const lastMatch = (line) => Number(/--if-generation-match=(\d+)$/.exec(line)?.[1]);
const histCount = (w) => readdirSync(join(w.dir, 'bucket', BUCKET, PFX)).filter((n) => n.startsWith('state.tar.gz.hist-')).length;

test('B4-C1 repair: a failing cp or a failing clear during restore ends the container non-zero; "state restored" is never logged, nothing runs, the lease is released', T, () => {
  const realCp = shOut('command -v cp'), realFind = shOut('command -v find');
  for (const [label, extra] of [['cp -a', {STUB_CP_FAIL: '1'}], ['clear (find)', {STUB_FIND_FAIL: '1'}]]) {
    const w = world({cp: CP_STUB, find: FIND_STUB});
    try {
      seedLocal(w);
      w.seed('state.tar.gz', stateTar());
      const r = w.run(w.bucketEnv({REAL_CP: realCp, REAL_FIND: realFind, ...extra}));
      assert.notEqual(r.status, 0, `${label}: the container must not run on a half-restored profile: ${r.out}`);
      assert.match(r.out, /state restore failed/, label);
      assert.doesNotMatch(r.out, /state restored/, label);
      assert.ok(!w.log().some((l) => l.includes('setup.mjs') || l.includes('run-pipeline.mjs')), `${label}: nothing may run`);
      assert.equal(existsSync(w.bucketFile('lease')), false, `${label}: the lease is released`);
      assert.equal(stateUploads(w).length, 0, `${label}: nothing is snapshotted from a half-restored profile`);
    } finally { w.cleanup(); }
  }
});

test('B4-C1 repair: a corrupt or missing current archive falls back to state.prev.tar.gz and says so; both unusable, or a hostile current archive, is refused', T, () => {
  const prev = prevTar(), whole = stateTar();
  const truncated = whole.subarray(0, Math.floor(whole.length / 2));
  { // current truncated, previous good
    const w = world();
    try {
      seedLocal(w); w.seed('state.tar.gz', truncated, 5); w.seed('state.prev.tar.gz', prev, 6);
      const r = w.run(w.bucketEnv());
      assert.equal(r.status, 0, r.out);
      assert.match(r.out, /failed validation/); assert.match(r.out, /state restored from gs:\/\/testbucket\/recorder\/state\.prev\.tar\.gz/);
      assert.equal(readFileSync(w.profile('marker.txt'), 'utf8'), 'marker-from-previous');
      assert.equal(readFileSync(w.release('live-proof.json'), 'utf8'), '{"status":"prev"}');
      assert.ok(readFileSync(w.bucketFile('state.prev.tar.gz')).equals(prev), 'the corrupt current object is never copied over the good previous one');
      const up = stateUploads(w);
      assert.equal(up.length, 1); assert.equal(lastMatch(up[0]), 5, 'the replacement is conditional on the generation of the object it replaces');
      assert.equal(statePrevCopies(w).length, 0);
    } finally { w.cleanup(); }
  }
  { // current missing, previous good
    const w = world();
    try {
      w.seed('state.prev.tar.gz', prev, 6);
      const r = w.run(w.bucketEnv());
      assert.equal(r.status, 0, r.out);
      assert.match(r.out, /state restored from gs:\/\/testbucket\/recorder\/state\.prev\.tar\.gz/);
      assert.equal(readFileSync(w.profile('marker.txt'), 'utf8'), 'marker-from-previous');
      assert.equal(lastMatch(stateUploads(w)[0]), 0, 'the current object did not exist: create-if-absent');
    } finally { w.cleanup(); }
  }
  { // both unusable
    const w = world();
    try {
      seedLocal(w); w.seed('state.tar.gz', truncated, 5); w.seed('state.prev.tar.gz', truncated, 6);
      const r = w.run(w.bucketEnv());
      assert.notEqual(r.status, 0, r.out); assert.match(r.out, /refused/);
      assert.equal(readFileSync(w.profile('marker.txt'), 'utf8'), 'local-profile-marker');
      assert.ok(!w.log().some((l) => l.includes('run-pipeline.mjs')));
    } finally { w.cleanup(); }
  }
  { // hostile current archive: refused, never papered over by the previous one
    const w = world();
    try {
      seedLocal(w); w.seed('state.tar.gz', stateTar([{name: 'bot-profile/../../escape.txt', content: Buffer.from('x')}]), 5); w.seed('state.prev.tar.gz', prev, 6);
      const r = w.run(w.bucketEnv());
      assert.notEqual(r.status, 0, r.out); assert.match(r.out, /refused/);
      assert.equal(readFileSync(w.profile('marker.txt'), 'utf8'), 'local-profile-marker');
      assert.equal(existsSync(join(w.dir, 'escape.txt')), false);
    } finally { w.cleanup(); }
  }
  { // the previous archive gets the same containment check
    const w = world();
    try {
      seedLocal(w); w.seed('state.prev.tar.gz', stateTar([{name: 'bot-profile/evil', type: '2', linkname: '../../outside'}]), 6);
      const r = w.run(w.bucketEnv());
      assert.notEqual(r.status, 0, r.out); assert.match(r.out, /refused/);
      assert.equal(existsSync(w.profile('evil')), false);
    } finally { w.cleanup(); }
  }
});

test('B4-C4 repair: a tar that exits 1 is logged as a warning and its checked archive is used; an archive that fails tar -t is not uploaded', T, () => {
  const realTar = shOut('command -v tar');
  { // exit 1
    const w = world({tar: TAR_STUB});
    try {
      writeFileSync(w.profile('marker.txt'), 'm');
      const r = w.run(w.bucketEnv({STUB_TAR_EXIT1: '1', REAL_TAR: realTar, LKB_LEASE_TTL_S: '60'}));
      assert.equal(r.status, 0, r.out);
      assert.match(r.out, /tar exited 1 \(a file changed while it was read\)/);
      assert.equal(stateUploads(w).length, 1, 'the checked archive is uploaded');
      assert.ok(names(histories(w).at(-1)).includes('bot-profile/marker.txt'));
    } finally { w.cleanup(); }
  }
  { // corrupt output with exit 0
    const w = world({tar: TAR_STUB});
    try {
      const previous = stateTar(); w.seed('state.tar.gz', previous, 5);
      const r = w.run(w.bucketEnv({STUB_TAR_CORRUPT: '1', REAL_TAR: realTar, LKB_LEASE_TTL_S: '60'}));
      assert.equal(r.status, 0, r.out);
      assert.match(r.out, /new archive failed validation; nothing uploaded/);
      assert.equal(stateUploads(w).length, 0, 'no upload of an archive that does not list');
      assert.equal(statePrevCopies(w).length, 0, 'and the previous copy is not touched either');
      assert.ok(readFileSync(w.bucketFile('state.tar.gz')).equals(previous));
    } finally { w.cleanup(); }
  }
});

test('B4-C4 repair: before the state object is replaced, the current one is copied to state.prev.tar.gz (server side); the upload is conditional on the generation it replaces', T, () => {
  const w = world();
  try {
    const previous = stateTar();
    w.seed('state.tar.gz', previous, 5);
    writeFileSync(w.profile('marker.txt'), 'm');
    const r = w.run(w.bucketEnv({LKB_LEASE_TTL_S: '60'}));
    assert.equal(r.status, 0, r.out);
    const log = w.log();
    const iCopy = log.findIndex((l) => /state\.tar\.gz gs:\/\/testbucket\/recorder\/state\.prev\.tar\.gz$/.test(l)), iUp = log.findIndex((l) => /^gcloud storage cp \S+ gs:\/\/testbucket\/recorder\/state\.tar\.gz /.test(l));
    assert.ok(iCopy >= 0 && iCopy < iUp, `previous copy before the upload (${iCopy}, ${iUp})`);
    assert.ok(readFileSync(w.bucketFile('state.prev.tar.gz')).equals(previous), 'the previous archive is kept byte for byte');
    assert.ok(!readFileSync(w.bucketFile('state.tar.gz')).equals(previous), 'the current object is the new snapshot');
    assert.equal(lastMatch(stateUploads(w)[0]), 5);
  } finally { w.cleanup(); }
});

test('B4-C4 repair: the generation is remembered across uploads (each match is the generation the last upload produced); a precondition refusal is logged and not retried', T, async () => {
  const w = world();
  try {
    w.seed('state.tar.gz', stateTar(), 5);
    const r = w.run(w.bucketEnv({LKB_SNAPSHOT_INTERVAL_S: '1', STUB_NODE_SLEEP: '6', LKB_LEASE_TTL_S: '60'}));
    assert.equal(r.status, 0, r.out);
    const up = stateUploads(w).map(lastMatch);
    const gens = readdirSync(join(w.dir, 'bucket', BUCKET, PFX)).filter((n) => n.startsWith('state.tar.gz.hist-')).map((n) => Number(n.split('-')[1])).sort((a, b) => a - b);
    assert.ok(up.length >= 3, `at least two periodic and one final upload, got ${up.length}`);
    assert.equal(gens.length, up.length, 'every upload was accepted by the precondition');
    assert.deepEqual(up, [5, ...gens.slice(0, -1)], 'upload n is conditional on the generation upload n-1 produced');
  } finally { w.cleanup(); }
  const w2 = world();
  try {
    const seeded = stateTar();
    w2.seed('state.tar.gz', seeded, 5);
    const p = w2.runAsync(w2.bucketEnv({LKB_SNAPSHOT_INTERVAL_S: '2', STUB_NODE_SLEEP: '6', LKB_LEASE_TTL_S: '60'}));
    for (let i = 0; i < 100 && !existsSync(join(w2.dir, 'stub/ready')); i++) await sleep(100);
    writeFileSync(w2.bucketFile('state.tar.gz') + '.gen', '99999');   // another writer replaced the object since this instance read it
    const r2 = await p;
    assert.equal(r2.status, 0, r2.out);
    const up = stateUploads(w2);
    assert.ok(up.length >= 2, `a periodic and the final attempt, got ${up.length}`);
    assert.ok(up.every((l) => lastMatch(l) === 5), 'no attempt re-reads the generation and retries blindly');
    assert.ok(readFileSync(w2.bucketFile('state.tar.gz')).equals(seeded), 'the other writer object is untouched');
    assert.match(r2.out, /generation precondition/);
    assert.equal(histCount(w2), 0, 'nothing was accepted');
  } finally { w2.cleanup(); }
});

test('B4-C6 repair: record-once exits non-zero (74) when the recording was made but its copy failed; the record command own status wins; a clean copy still exits 0', T, () => {
  const base = {BOT_MODE: 'record-once', LKB_RECORD_URL: 'https://meet.example.com/abc-defg', LKB_RECORD_UNTIL: '18:30', LKB_LEASE_TTL_S: '60'};
  for (const [label, extra, want] of [['upload fails', {STUB_FAIL_UPLOAD: 'recordings/', STUB_WRITE_WEBM: '1'}, 74], ['record failed too', {STUB_FAIL_UPLOAD: 'recordings/', STUB_WRITE_WEBM: '1', STUB_NODE_RC: '7'}, 7],
    ['upload works', {STUB_WRITE_WEBM: '1'}, 0], ['nothing recorded', {}, 0]]) {
    const w = world();
    try {
      const r = w.run(w.bucketEnv({...base, ...extra}));
      assert.equal(r.status, want, `${label}: ${r.out}`);
      if (label === 'upload fails') {
        assert.match(r.out, /recording copy failed/); assert.match(r.out, /could not be copied/);
        assert.equal(existsSync(w.bucketFile('recordings/meeting.webm')), false);
        assert.equal(stateUploads(w).length, 1, 'the final snapshot is still taken');
        assert.equal(existsSync(w.bucketFile('lease')), false, 'and the lease released');
      }
    } finally { w.cleanup(); }
  }
});

test('B4-C5 repair: LKB_STOP_WAIT_S defaults to 3 seconds (a pipeline that ignores SIGTERM is killed after about 3 s)', T, () => {
  const w = world();
  try {
    const env = w.bucketEnv({STUB_NODE_MODE: 'ignore-term', LKB_LEASE_TTL_S: '60'});
    delete env.LKB_STOP_WAIT_S;
    const r = w.runWithTerm(env);
    assert.ok(r.ms >= 2500 && r.ms < 9000, `killed after the default bound, exit took ${r.ms} ms`);
    assert.match(r.out, /ignored SIGTERM for 3s/);
  } finally { w.cleanup(); }
});

test('B4-C5 repair: a hung gcloud call during shutdown cannot use up the window: calls are bounded and share one deadline', T, () => {
  const w = world();
  try {
    const r = w.runWithTerm(w.bucketEnv({STUB_NODE_MODE: 'hang', STUB_HANG_ON_TERM: '1', LKB_GCLOUD_TIMEOUT_S: '60', LKB_SHUTDOWN_BUDGET_S: '3', LKB_LEASE_TTL_S: '60'}), {timeout: 80000});
    assert.equal(r.status, 143, r.out);
    assert.ok(r.ms < 13000, `the shutdown ended in ${r.ms} ms although every bucket call hung`);
    assert.match(r.out, /shutdown time budget used up/);
  } finally { w.cleanup(); }
});

test('B4-C5 repair: a helper stuck in a hung upload at shutdown is ended after the bound, and so is its bucket call', T, () => {
  const w = world();
  try {
    const r = w.runWithTerm(w.bucketEnv({STUB_NODE_MODE: 'hang', STUB_HANG_MATCH: 'gs://testbucket/recorder/state.tar.gz', LKB_SNAPSHOT_INTERVAL_S: '1', LKB_GCLOUD_TIMEOUT_S: '60', LKB_SHUTDOWN_BUDGET_S: '3', LKB_LEASE_TTL_S: '60'}), {pre: '3', timeout: 80000});
    assert.equal(r.status, 143, r.out);
    assert.ok(r.ms < 14000, `the shutdown ended in ${r.ms} ms although a periodic upload was hung`);
    assert.match(r.out, /helper snap did not stop within 3s/);
  } finally { w.cleanup(); }
});

test('B4-C5 repair: a process the pipeline started and that ignores SIGTERM (as Chrome might) is stopped before the final snapshot, on SIGTERM and on a normal exit', T, () => {
  const runs = [['SIGTERM', (w) => w.runWithTerm(w.bucketEnv({STUB_NODE_MODE: 'hang', STUB_GRANDCHILD: '1', LKB_LEASE_TTL_S: '60'}))],
    ['normal exit', (w) => w.run(w.bucketEnv({STUB_NODE_SLEEP: '1', STUB_GRANDCHILD: '1', LKB_LEASE_TTL_S: '60'}))]];
  for (const [label, run] of runs) {
    const w = world();
    let pid = null;
    try {
      const r = run(w);
      const pf = join(w.dir, 'stub/grandchild.pid');
      assert.ok(existsSync(pf), `${label}: the stub started its helper process`);
      pid = readFileSync(pf, 'utf8').trim();
      const log = w.log();
      assert.ok(log.includes('GRANDCHILD gone-at-upload'), `${label}: it must be gone when the final snapshot is taken: ${log.filter((l) => l.startsWith('GRANDCHILD'))}\n${r.out}`);
      assert.equal(alive(pid), false, `${label}: it is gone when the container exits`);
      assert.match(r.out, /still running; stopping them/);
    } finally { if (pid && alive(pid)) spawnSync(SH, ['-c', `kill -KILL ${Number(pid)}`]); w.cleanup(); }
  }
});

test('B4-C3 repair: the lease is renewed once right before the pipeline starts (after the doctor gate); a lease lost by then stops the start (75)', T, () => {
  const w = world();
  try {
    const r = w.run(w.bucketEnv({LKB_LEASE_RENEW_S: '30', LKB_LEASE_TTL_S: '60'}));
    assert.equal(r.status, 0, r.out);
    const log = w.log();
    const iDoc = log.findIndex((l) => l.startsWith('DOCTOR ')), iPipe = log.findIndex((l) => l.includes('run-pipeline.mjs'));
    const iRenew = log.findIndex((l, i) => i > iDoc && /^gcloud storage cp \S+ gs:\/\/testbucket\/recorder\/lease --if-generation-match=[1-9]/.test(l));
    assert.ok(iDoc >= 0 && iRenew > iDoc && iRenew < iPipe, `doctor ${iDoc}, renewal ${iRenew}, pipeline ${iPipe}`);
  } finally { w.cleanup(); }
  const w2 = world();
  try {
    const r2 = w2.run(w2.bucketEnv({STUB_DOCTOR_STEAL_LEASE: '1', LKB_LEASE_TTL_S: '60'}));
    assert.equal(r2.status, 75, r2.out);
    assert.match(r2.out, /lease lost before the pipeline could start/);
    assert.ok(!w2.log().some((l) => l.includes('run-pipeline.mjs')));
    assert.match(readFileSync(w2.bucketFile('lease'), 'utf8'), /holder=intruder/, 'the other holder lease is left alone');
  } finally { w2.cleanup(); }
});
