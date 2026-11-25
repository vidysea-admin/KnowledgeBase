#!/bin/sh
# Meeting-bot container entrypoint (runs under tini). BOT_MODE: run (default) | record-once | doctor | login.
#   run         start PulseAudio + Xvfb, clear stale locks, doctor gate, run-pipeline --run --watch
#               (or, with LKB_ATTENDANCE_ACCOUNT set, one `--run --calendar-attendance-account` tick per interval)
#   record-once start PulseAudio + Xvfb, doctor gate, ONE `record $LKB_RECORD_URL --until $LKB_RECORD_UNTIL`
#               (extra record flags: LKB_RECORD_ARGS), copy the finished .webm files to the bucket, exit with its status
#   doctor      start PulseAudio + Xvfb, run `setup.mjs --doctor`, exit with its status (no pipeline)
#   login       start PulseAudio + Xvfb + x11vnc (needs VNC_PASSWORD) and open Chrome on the bot profile for
#               the one-time Google sign-in; publish the port loopback-only:
#               docker compose --profile bot run --rm -p 127.0.0.1:5900:5900 -e BOT_MODE=login bot
#
# External state (D-233, unit B4). Active in run and record-once ONLY when LKB_STATE_BUCKET is set; with it unset
# no bucket command is ever called and the sequence is the one this file always had (exec, no supervision).
# The bucket client is `gcloud storage` (cp, cat, rm, objects describe); no ACL or IAM command is ever used.
#   LKB_STATE_BUCKET        bucket name (gs:// prefix optional)       LKB_STATE_PREFIX   object prefix (default recorder)
#   LKB_BOT_PROFILE_DIR     Chrome profile (image default /data/bot-profile)
#   LKB_RELEASE_DIR         release state dir that holds poller.lock and live-proof.json (default $PWD/data/webinar-release)
#   LKB_RECORD_DIR          recordings dir (image default /app/raw/webinars)
#   LKB_SNAPSHOT_INTERVAL_S snapshot period (default 300)     LKB_LEASE_TTL_S (default 120)   LKB_LEASE_RENEW_S (default 30)
#   LKB_STOP_WAIT_S         whole seconds the pipeline (and each helper) gets to exit after SIGTERM, then SIGKILL (default 3)
#   LKB_GCLOUD_TIMEOUT_S    bound on every single bucket call (default 120)
#   LKB_SHUTDOWN_BUDGET_S   after SIGTERM, all bucket calls together must end within LKB_STOP_WAIT_S plus this (default 5)
#   LKB_ATTENDANCE_ACCOUNT  attendance account (run mode)             LKB_ATTENDANCE_INTERVAL_S (default 300, POLL_MS)
#   LKB_APP_DIR             working directory (default /app; tests only)
# Objects: <prefix>/state.tar.gz (members <profile dir name>/ and <release dir name>/), <prefix>/lease,
# <prefix>/state.prev.tar.gz (the archive before the latest snapshot), <prefix>/recordings/<path under the recordings dir>.
# Exit statuses worth knowing: 75 lease held elsewhere or lost, 74 a recording was made but not copied to the bucket.
set -eu
cd "${LKB_APP_DIR:-/app}"
MODE="${BOT_MODE:-run}"
DISPLAY="${DISPLAY:-:99}"; export DISPLAY
XDG_RUNTIME_DIR="${XDG_RUNTIME_DIR:-/tmp/runtime-node}"; export XDG_RUNTIME_DIR
mkdir -p "$XDG_RUNTIME_DIR" && chmod 0700 "$XDG_RUNTIME_DIR"

# login mode: the VNC password leaves the environment FIRST, before any daemon is forked, so no
# pulseaudio/Xvfb/x11vnc (nor Chrome) inherits it in /proc/<pid>/environ (ISS-409). The only reader is the
# step below that writes the 0600 pass file; x11vnc reads the file (rm: deletes it after reading), never argv:
# `ps` and /proc/*/cmdline must not show it. printf is a shell builtin, so no process carries it either.
# The trap removes the file if x11vnc (or anything after it) fails before it was consumed (ISS-410); a
# successful `exec` discards the trap, and by then x11vnc has already deleted the file.
VNC_PASSFILE="$XDG_RUNTIME_DIR/vnc.pass"
if [ "$MODE" = "login" ]; then
  [ -n "${VNC_PASSWORD:-}" ] || { echo "login mode needs VNC_PASSWORD (value-less env pass-through)" >&2; exit 1; }
  trap 'rm -f "$VNC_PASSFILE"' EXIT
  ( umask 077; printf '%s\n' "$VNC_PASSWORD" > "$VNC_PASSFILE" )
fi
unset VNC_PASSWORD  # all modes: no later child (pulseaudio, Xvfb, x11vnc, Chrome, node) may carry it

# ---- state configuration (read only; nothing below acts on it unless the mode and variables say so) ---------------
BUCKET="${LKB_STATE_BUCKET:-}"; BUCKET="${BUCKET#gs://}"; BUCKET="${BUCKET%/}"
case "$MODE" in login|doctor) BUCKET="" ;; esac   # doctor and login never touch the bucket
PREFIX="${LKB_STATE_PREFIX:-recorder}"; PREFIX="${PREFIX#/}"; PREFIX="${PREFIX%/}"
PROFILE_DIR="${LKB_BOT_PROFILE_DIR:-/data/bot-profile}"; PROFILE_DIR="${PROFILE_DIR%/}"
RELEASE_DIR="${LKB_RELEASE_DIR:-$PWD/data/webinar-release}"; RELEASE_DIR="${RELEASE_DIR%/}"
RECORD_DIR="${LKB_RECORD_DIR:-/app/raw/webinars}"; RECORD_DIR="${RECORD_DIR%/}"
SNAPSHOT_S="${LKB_SNAPSHOT_INTERVAL_S:-300}"
LEASE_TTL="${LKB_LEASE_TTL_S:-120}"
LEASE_RENEW_S="${LKB_LEASE_RENEW_S:-30}"
STOP_WAIT="${LKB_STOP_WAIT_S:-3}"; case "$STOP_WAIT" in ''|*[!0-9]*) STOP_WAIT=3 ;; esac
GC_TIMEOUT="${LKB_GCLOUD_TIMEOUT_S:-120}"; case "$GC_TIMEOUT" in ''|*[!0-9]*|0) GC_TIMEOUT=120 ;; esac
SHUT_BUDGET="${LKB_SHUTDOWN_BUDGET_S:-5}"; case "$SHUT_BUDGET" in ''|*[!0-9]*) SHUT_BUDGET=5 ;; esac
ATTENDANCE_ACCOUNT=""; [ "$MODE" = "run" ] && ATTENDANCE_ACCOUNT="${LKB_ATTENDANCE_ACCOUNT:-}"
ATTENDANCE_S="${LKB_ATTENDANCE_INTERVAL_S:-300}"
SUPERVISE=0
if [ -n "$BUCKET" ] || [ -n "$ATTENDANCE_ACCOUNT" ]; then SUPERVISE=1; fi
if [ "$MODE" = "record-once" ] && { [ -z "${LKB_RECORD_URL:-}" ] || [ -z "${LKB_RECORD_UNTIL:-}" ]; }; then
  echo "record-once mode needs LKB_RECORD_URL and LKB_RECORD_UNTIL" >&2; exit 1
fi

STAGE=""; CHILD=""; CHILD_PG=""; WATCH_PID=""; RENEW_PID=""; SNAP_PID=""; NAP_PID=""; SHUT_DEADLINE=0
PHASE=pre; STOPPING=0; SIGS=0; CHILD_RC=0; HAVE_LEASE=0; HOLDER=""
LEASE_GEN=""; LEASE_HOLDER=""; LEASE_EXPIRES=0
LT=main   # LT names the scratch files of the process that calls the lease helpers (main, renew, snap)
STATE_URL="gs://$BUCKET/$PREFIX/state.tar.gz"; STATE_PREV_URL="gs://$BUCKET/$PREFIX/state.prev.tar.gz"; LEASE_URL="gs://$BUCKET/$PREFIX/lease"
log() { echo "[bot-state] $*"; }

# ---- helpers (functions only; they run when called) ----------------------------------------------------------------
# Sleep that a trapped signal can interrupt without orphaning the sleep.
nap() { sleep "$1" & NAP_PID=$!; if [ "$STOPPING" = 1 ]; then kill "$NAP_PID" 2>/dev/null || true; fi; wait "$NAP_PID" 2>/dev/null || true; NAP_PID=""; return 0; }

is_absent() {  # $1 stderr file of a failed gcloud call: was the object simply missing?
  grep -Eqi '404|No such object|not found|No URLs matched|matched no objects' "$1" 2>/dev/null
}

# Every bucket call goes through gc: it is bounded by timeout, and after SIGTERM all calls share one deadline, so a hung
# call cannot use up the shutdown. The call runs in the background so a trapped signal never leaves it orphaned, and its
# pid is kept in a file so stop_helpers can end a call that a helper is stuck in.
gc() {
  t="$GC_TIMEOUT"
  if [ "$SHUT_DEADLINE" -gt 0 ]; then
    left=$(( SHUT_DEADLINE - $(date +%s) ))
    if [ "$left" -le 0 ]; then echo "skipped" >>"$STAGE/skipped"; return 124; fi
    if [ "$left" -lt "$t" ]; then t="$left"; fi
  fi
  timeout -k 2 "$t" gcloud "$@" &
  gcp=$!
  echo "$gcp" >"$STAGE/gc-$LT.pid"
  grc=0
  while :; do
    wait "$gcp" && grc=0 || grc=$?
    if kill -0 "$gcp" 2>/dev/null; then continue; fi
    break
  done
  rm -f "$STAGE/gc-$LT.pid"
  return "$grc"
}

# Lease: one object holding holder= and expires= lines. Every take and replace is conditional on the object's
# generation (create-if-absent is generation 0), so two instances cannot both win (B4-C3).
lease_read() {  # sets LEASE_GEN LEASE_HOLDER LEASE_EXPIRES; 0 present, 1 absent, 2 error. Generation is read BEFORE the
  LEASE_GEN=""; LEASE_HOLDER=""; LEASE_EXPIRES=0   # body: a newer body with an older generation only makes a later replace fail.
  if ! gc storage objects describe "$LEASE_URL" '--format=value(generation)' >"$STAGE/l-$LT.gen" 2>"$STAGE/l-$LT.err"; then
    if is_absent "$STAGE/l-$LT.err"; then return 1; fi
    return 2
  fi
  LEASE_GEN="$(tr -d ' \r\n' <"$STAGE/l-$LT.gen")"
  [ -n "$LEASE_GEN" ] || return 2
  if ! gc storage cat "$LEASE_URL" >"$STAGE/l-$LT.body" 2>"$STAGE/l-$LT.err"; then
    if is_absent "$STAGE/l-$LT.err"; then return 1; fi
    return 2
  fi
  LEASE_HOLDER="$(sed -n 's/^holder=//p' "$STAGE/l-$LT.body" | head -n 1 | tr -d '\r')"
  LEASE_EXPIRES="$(sed -n 's/^expires=//p' "$STAGE/l-$LT.body" | head -n 1 | tr -d '\r ')"
  case "$LEASE_EXPIRES" in ''|*[!0-9]*) LEASE_EXPIRES=0 ;; esac
  return 0
}
lease_put() {  # $1 generation precondition (0 = create only if absent); 0 written, 1 precondition failed, 2 error
  printf 'holder=%s\nexpires=%s\n' "$HOLDER" "$(( $(date +%s) + LEASE_TTL ))" >"$STAGE/l-$LT.new"
  if gc storage cp "$STAGE/l-$LT.new" "$LEASE_URL" "--if-generation-match=$1" >"$STAGE/l-$LT.out" 2>"$STAGE/l-$LT.err"; then return 0; fi
  if grep -Eqi '412|precondition' "$STAGE/l-$LT.err"; then return 1; fi
  cat "$STAGE/l-$LT.err" >&2
  return 2
}
lease_acquire() {  # 0 held; 75 held by another instance; 70 bucket error
  tries=0
  while [ "$tries" -lt 5 ]; do
    tries=$((tries + 1))
    rc=0; lease_read || rc=$?
    case "$rc" in
      1) pre=0 ;;
      0) if [ "$LEASE_EXPIRES" -gt "$(date +%s)" ]; then
           echo "lease is held by $LEASE_HOLDER until epoch $LEASE_EXPIRES; this instance will not restore or run" >&2
           return 75
         fi
         log "lease of $LEASE_HOLDER expired (epoch $LEASE_EXPIRES); taking it over"
         pre="$LEASE_GEN" ;;
      *) cat "$STAGE/l-$LT.err" >&2; echo "lease read failed" >&2; return 70 ;;
    esac
    prc=0; lease_put "$pre" || prc=$?
    case "$prc" in
      0) HAVE_LEASE=1; log "lease taken by $HOLDER"; return 0 ;;
      1) log "lease changed under us; re-reading" ;;
      *) echo "lease write failed" >&2; return 70 ;;
    esac
  done
  echo "lease is contended; giving up" >&2
  return 75
}
lease_renew() {  # 0 renewed; 1 lost; 2 could not tell
  rc=0; lease_read || rc=$?
  case "$rc" in 0) ;; 1) return 1 ;; *) return 2 ;; esac
  if [ "$LEASE_HOLDER" != "$HOLDER" ]; then return 1; fi
  prc=0; lease_put "$LEASE_GEN" || prc=$?
  case "$prc" in 0) return 0 ;; 1) return 1 ;; *) return 2 ;; esac
}
lease_held() {  # snapshots and uploads only while this is true
  if [ -e "$STAGE/lease-lost" ]; then return 1; fi
  rc=0; lease_read || rc=$?
  if [ "$rc" -ne 0 ]; then return 1; fi
  if [ "$LEASE_HOLDER" != "$HOLDER" ]; then return 1; fi
  [ "$LEASE_EXPIRES" -gt "$(date +%s)" ]
}
lease_release() {  # deletes the lease only if this instance still holds it
  if [ "$HAVE_LEASE" != 1 ]; then return 0; fi
  HAVE_LEASE=0
  rc=0; lease_read || rc=$?
  if [ "$rc" -eq 0 ] && [ "$LEASE_HOLDER" = "$HOLDER" ]; then
    if gc storage rm "$LEASE_URL" "--if-generation-match=$LEASE_GEN" >"$STAGE/l-$LT.out" 2>&1; then log "lease released"; else log "lease release failed (it will expire)"; fi
  elif [ "$rc" -eq 0 ]; then
    log "lease no longer ours; left in place"
  else
    log "lease could not be read; left in place (it will expire)"
  fi
  return 0
}

# Restore: validate the whole archive, extract it into the stage, and only then replace the local trees.
tar_contained() {  # needs $STAGE/tar.names and tar.verbose. Every member must sit inside the two trees; no absolute or ..
  awk -v pb="$PROFILE_BASE" -v rb="$RELEASE_BASE" '   # names; no link with an absolute or .. target; only file/dir/link types.
    function badname(p,   n, a, i) {
      if (p ~ /^\//) return "absolute path"
      n = split(p, a, "/")
      for (i = 1; i <= n; i++) if (a[i] == "..") return "parent-directory component"
      return ""
    }
    function singleton(p,   n, a, i) { n = split(p, a, "/"); for (i = 1; i <= n; i++) if (a[i] ~ /^Singleton/) return 1; return 0 }
    FILENAME == ARGV[1] {
      p = $0; why = badname(p)
      if (why != "") { print "member \"" p "\": " why; bad = 1; next }
      sub(/\/$/, "", p); split(p, a, "/")
      if (a[1] != pb && a[1] != rb) { print "member \"" p "\" is outside the profile and release trees"; bad = 1 }
      next
    }
    {
      t = substr($0, 1, 1); rest = $0
      for (i = 0; i < 5; i++) sub(/^[ \t]*[^ \t]+/, "", rest)
      sub(/^[ \t]+/, "", rest)
      name = rest; target = ""
      if (t == "l") { k = index(rest, " -> "); if (k > 0) { name = substr(rest, 1, k - 1); target = substr(rest, k + 4) } }
      else if (t == "h") { k = index(rest, " link to "); if (k > 0) { name = substr(rest, 1, k - 1); target = substr(rest, k + 9) } }
      if (t != "-" && t != "d" && t != "l" && t != "h") { print "member \"" name "\": type " t " is not allowed"; bad = 1; next }
      if (t == "l" || t == "h") {
        if (singleton(name)) next
        why = badname(target)
        if (why != "") { print "link \"" name "\" -> \"" target "\": " why; bad = 1 }
        else if (t == "h") { split(target, a, "/"); if (a[1] != pb && a[1] != rb) { print "hard link \"" name "\" points outside the trees"; bad = 1 } }
      }
    }
    END { exit bad ? 1 : 0 }
  ' "$STAGE/tar.names" "$STAGE/tar.verbose"
}
check_archive() {  # $1 archive. Prints the reason. 0 usable; 1 corrupt or truncated (the previous archive may stand in); 2 hostile (refuse)
  tar -tzf "$1" >"$STAGE/tar.names" 2>/dev/null || { echo "archive is unreadable or truncated"; return 1; }
  tar -tzvf "$1" >"$STAGE/tar.verbose" 2>/dev/null || { echo "archive listing failed"; return 1; }
  tar_contained || return 2
  return 0
}
fetch_archive() {  # $1 url, $2 destination. 0 fetched; 1 the object does not exist; 2 the bucket could not be read
  rm -f "$2"
  if gc storage cp "$1" "$2" >"$STAGE/restore.out" 2>"$STAGE/restore.err"; then return 0; fi
  if is_absent "$STAGE/restore.err"; then return 1; fi
  cat "$STAGE/restore.err" >&2
  return 2
}
state_gen_read() {  # prints the generation of the state object (0 when it does not exist); non-zero when it cannot be read
  if ! gc storage objects describe "$STATE_URL" '--format=value(generation)' >"$STAGE/sg-$LT.out" 2>"$STAGE/sg-$LT.err"; then
    if is_absent "$STAGE/sg-$LT.err"; then echo 0; return 0; fi
    return 1
  fi
  sg="$(tr -d ' \r\n' <"$STAGE/sg-$LT.out")"
  case "$sg" in ''|*[!0-9]*) return 1 ;; esac
  echo "$sg"
}
clear_dir() {  # empty a directory but keep the directory itself (it may be a mount point)
  find "$1" -mindepth 1 -maxdepth 1 -exec rm -rf {} +
}
restore_state() {  # 0 restored or first boot; 1 refused or failed (the caller ends the container). Every step reports its own failure:
  # this runs in an `||` context where `set -e` is off, so nothing here may rely on it.
  if ! sg0="$(state_gen_read)"; then echo "state restore failed: the generation of the state object could not be read" >&2; return 1; fi
  printf '%s\n' "$sg0" >"$STAGE/state.gen" || return 1
  rm -f "$STAGE/restore.tar.gz" "$STAGE/skip-prev-copy"
  used=""; main_why=""
  mrc=0; fetch_archive "$STATE_URL" "$STAGE/restore.tar.gz" || mrc=$?
  if [ "$mrc" -eq 2 ]; then echo "state restore failed: the bucket object could not be read" >&2; return 1; fi
  if [ "$mrc" -eq 0 ]; then
    crc=0; main_why="$(check_archive "$STAGE/restore.tar.gz")" || crc=$?
    if [ "$crc" -eq 0 ]; then used="$STATE_URL"
    elif [ "$crc" -eq 2 ]; then echo "state restore refused: $main_why" >&2; return 1
    else echo "[bot-state] the current state archive failed validation ($main_why); trying the previous archive" >&2
    fi
  fi
  if [ -z "$used" ]; then
    prc=0; fetch_archive "$STATE_PREV_URL" "$STAGE/restore.tar.gz" || prc=$?
    if [ "$prc" -eq 2 ]; then echo "state restore failed: the previous archive could not be read" >&2; return 1; fi
    if [ "$prc" -eq 1 ]; then
      if [ "$mrc" -eq 0 ]; then echo "state restore refused: the current archive is unusable ($main_why) and there is no previous archive" >&2; return 1; fi
      log "no state object in the bucket (first boot): starting with empty state"; return 0
    fi
    crc=0; prev_why="$(check_archive "$STAGE/restore.tar.gz")" || crc=$?
    if [ "$crc" -ne 0 ]; then echo "state restore refused: the previous archive is unusable too ($prev_why)" >&2; return 1; fi
    used="$STATE_PREV_URL"
    : >"$STAGE/skip-prev-copy" || return 1   # the next snapshot must not copy the unusable current object over the good previous one
  fi
  rm -rf "$STAGE/x" || return 1
  mkdir -p "$STAGE/x" || return 1
  if ! tar -xzf "$STAGE/restore.tar.gz" -C "$STAGE/x" --no-same-owner --exclude='Singleton*' --exclude=poller.lock --exclude=.lkb-tab-capture.lock 2>"$STAGE/restore.err"; then
    cat "$STAGE/restore.err" >&2; echo "state restore failed: extraction error" >&2; return 1
  fi
  for pair in "$PROFILE_BASE:$PROFILE_DIR" "$RELEASE_BASE:$RELEASE_DIR"; do
    base="${pair%%:*}"; dest="${pair#*:}"
    clear_dir "$dest" || { echo "state restore failed: could not empty $dest" >&2; return 1; }
    if [ -d "$STAGE/x/$base" ]; then
      cp -a "$STAGE/x/$base/." "$dest/" || { echo "state restore failed: could not copy the restored files into $dest" >&2; return 1; }
    fi
  done
  log "state restored from $used"
  return 0
}
snapshot_state() {  # $1 label. Only while the lease is held; a failed tar, validation or upload leaves the bucket object as it was.
  if [ -z "$BUCKET" ]; then return 0; fi
  if ! lease_held; then echo "[bot-state] $1 snapshot skipped: lease not held" >&2; return 1; fi
  out="$STAGE/snap-$1.tar.gz"; rm -f "$out"
  trc=0
  tar -czf "$out" --exclude=poller.lock --exclude=.lkb-tab-capture.lock --exclude='Singleton*' \
    -C "$PROFILE_PARENT" "$PROFILE_BASE" -C "$RELEASE_PARENT" "$RELEASE_BASE" 2>"$STAGE/snap.err" || trc=$?
  if [ "$trc" -gt 1 ] || [ ! -s "$out" ]; then
    cat "$STAGE/snap.err" >&2 || true
    echo "[bot-state] $1 snapshot: tar failed (exit $trc); nothing uploaded" >&2; rm -f "$out"; return 1
  fi
  if [ "$trc" -eq 1 ]; then echo "[bot-state] $1 snapshot: tar exited 1 (a file changed while it was read); the archive is checked and used" >&2; fi
  if ! tar -tzf "$out" >/dev/null 2>"$STAGE/snap.err"; then
    cat "$STAGE/snap.err" >&2 || true
    echo "[bot-state] $1 snapshot: the new archive failed validation; nothing uploaded" >&2; rm -f "$out"; return 1
  fi
  gen="$(cat "$STAGE/state.gen" 2>/dev/null || true)"
  case "$gen" in ''|*[!0-9]*) echo "[bot-state] $1 snapshot: the generation of the state object is not known; nothing uploaded" >&2; rm -f "$out"; return 1 ;; esac
  if [ "$gen" != 0 ] && [ ! -e "$STAGE/skip-prev-copy" ]; then   # keep the archive that is about to be replaced (server-side copy)
    if ! gc storage cp "$STATE_URL" "$STATE_PREV_URL" >"$STAGE/snap.out" 2>&1 && ! is_absent "$STAGE/snap.out"; then
      cat "$STAGE/snap.out" >&2
      echo "[bot-state] $1 snapshot: the previous archive could not be kept; upload skipped" >&2; rm -f "$out"; return 1
    fi
  fi
  if gc storage cp "$out" "$STATE_URL" "--if-generation-match=$gen" >"$STAGE/snap.out" 2>&1; then
    rm -f "$out" "$STAGE/skip-prev-copy"
    if ng="$(state_gen_read)"; then printf '%s\n' "$ng" >"$STAGE/state.gen"; log "$1 snapshot uploaded"
    else rm -f "$STAGE/state.gen"; echo "[bot-state] $1 snapshot uploaded, but its generation could not be read; no further snapshot is uploaded" >&2; fi
    return 0
  fi
  cat "$STAGE/snap.out" >&2
  if grep -Eqi '412|precondition' "$STAGE/snap.out"; then
    echo "[bot-state] $1 snapshot refused: the state object changed since this instance last read it (generation precondition); not retried" >&2
  else
    echo "[bot-state] $1 snapshot: upload failed; the previous object is kept" >&2
  fi
  rm -f "$out"; return 1
}
copy_recordings() {  # non-empty .webm files not yet uploaded, each once. 0 only if nothing failed or was skipped for lack of the lease
  fails=0
  if [ -z "$BUCKET" ] || [ ! -d "$RECORD_DIR" ]; then return 0; fi
  if ! lease_held; then echo "[bot-state] recording copy skipped: lease not held" >&2; return 1; fi
  find "$RECORD_DIR" -type f -name '*.webm' >"$STAGE/rec.list"
  while IFS= read -r f; do
    if [ -e "$STAGE/lease-lost" ]; then echo "[bot-state] lease lost: the remaining recordings are not copied" >&2; fails=$((fails + 1)); break; fi
    if grep -qxF -- "$f" "$STAGE/uploaded.list" 2>/dev/null; then continue; fi
    if [ ! -s "$f" ]; then log "skipping empty recording $f"; continue; fi
    rel="${f#"$RECORD_DIR"/}"
    if gc storage cp "$f" "gs://$BUCKET/$PREFIX/recordings/$rel" >"$STAGE/rec.out" 2>&1; then
      printf '%s\n' "$f" >>"$STAGE/uploaded.list"; log "recording copied: $rel"
    else
      cat "$STAGE/rec.out" >&2; echo "[bot-state] recording copy failed: $rel" >&2; fails=$((fails + 1))
    fi
  done <"$STAGE/rec.list"
  [ "$fails" -eq 0 ]
}

# ---- supervision: the pipeline runs as a child so the shell (and its trap) outlives it ---------------------------------
# The child gets a process group of its own (setsid, else job control) so that what it starts, Chrome above all, can be
# stopped with it. Without either, only the child itself can be signalled and a line says so.
GROUP_MODE=none
if command -v setsid >/dev/null 2>&1; then GROUP_MODE=setsid; else GROUP_MODE=monitor; fi
signal_child() {  # $1 signal name: the child's whole process group when it has one, else the child alone
  if [ -n "$CHILD_PG" ]; then kill -s "$1" -- "-$CHILD_PG" 2>/dev/null || true
  elif [ -n "$CHILD" ]; then kill -s "$1" "$CHILD" 2>/dev/null || true
  fi
  return 0
}
reap_group() {  # the child has exited: stop whatever it left running, so nothing writes the profile during the final snapshot
  if [ -z "$CHILD_PG" ]; then return 0; fi
  if kill -s 0 -- "-$CHILD_PG" 2>/dev/null; then
    echo "[bot-state] processes started by the pipeline are still running; stopping them" >&2
    kill -s TERM -- "-$CHILD_PG" 2>/dev/null || true
    ri=0
    while [ "$ri" -lt 20 ] && kill -s 0 -- "-$CHILD_PG" 2>/dev/null; do sleep 0.1; ri=$((ri + 1)); done
    if kill -s 0 -- "-$CHILD_PG" 2>/dev/null; then kill -s KILL -- "-$CHILD_PG" 2>/dev/null || true; fi
  fi
  CHILD_PG=""
  return 0
}
start_watchdog() {  # SIGKILL the child's group if it is still there after the bound (a child that ignores SIGTERM)
  if [ -n "$WATCH_PID" ]; then return 0; fi
  (
    SP=""; trap 'if [ -n "$SP" ]; then kill "$SP" 2>/dev/null || true; fi; exit 0' TERM
    sleep "$STOP_WAIT" & SP=$!; wait "$SP" || true
    : >"$STAGE/forced"; signal_child KILL
  ) &
  WATCH_PID=$!
  return 0
}
stop_watchdog() {
  if [ -n "$WATCH_PID" ]; then kill -TERM "$WATCH_PID" 2>/dev/null || true; wait "$WATCH_PID" 2>/dev/null || true; WATCH_PID=""; fi
  return 0
}
on_term() {
  SIGS=$((SIGS + 1))
  if [ "$STOPPING" = 1 ]; then return 0; fi   # a second SIGTERM changes nothing (no second final snapshot)
  STOPPING=1
  SHUT_DEADLINE=$(( $(date +%s) + STOP_WAIT + SHUT_BUDGET ))   # every bucket call from here on ends by this time
  if [ "$PHASE" = pre ]; then exit 143; fi
  if [ -n "$NAP_PID" ]; then kill "$NAP_PID" 2>/dev/null || true; fi
  if [ -n "$CHILD" ]; then signal_child TERM; start_watchdog; fi
  return 0
}
wait_child() {  # sets CHILD_RC; survives trapped signals (a signal interrupts `wait` without reaping the child)
  while :; do
    seen=$SIGS; CHILD_RC=0
    wait "$CHILD" || CHILD_RC=$?
    if [ "$SIGS" = "$seen" ]; then break; fi
  done
  reap_group
  stop_watchdog
  if [ -e "$STAGE/forced" ]; then log "pipeline ignored SIGTERM for ${STOP_WAIT}s and was killed"; fi
  CHILD=""
  return 0
}
start_child() {  # $@ command; runs in the background as CHILD, in a process group of its own (CHILD_PG) when it can
  CHILD_PG=""
  if [ "$GROUP_MODE" = setsid ]; then
    setsid "$@" &
    CHILD=$!; CHILD_PG="$CHILD"
  else
    set -m 2>/dev/null || true
    "$@" &
    CHILD=$!
    case "$-" in *m*) CHILD_PG="$CHILD" ;; esac
    set +m 2>/dev/null || true
    if [ -z "$CHILD_PG" ]; then echo "[bot-state] no process-group support: only the pipeline process itself can be stopped" >&2; fi
  fi
  return 0
}
start_helpers() {  # lease renewal and periodic snapshots, each in its own subshell so neither delays the other
  if [ -z "$BUCKET" ]; then return 0; fi
  MAIN_PID=$$
  (
    SP=""; HSTOP=0; LT=renew
    trap 'HSTOP=1; if [ -n "$SP" ]; then kill "$SP" 2>/dev/null || true; fi' TERM
    trap ': >"$STAGE/helper-renew.done"' EXIT
    good_until=$(( $(date +%s) + LEASE_TTL ))
    while [ "$HSTOP" = 0 ]; do
      sleep "$LEASE_RENEW_S" & SP=$!
      if [ "$HSTOP" = 1 ]; then kill "$SP" 2>/dev/null || true; fi
      wait "$SP" || true; SP=""
      if [ "$HSTOP" = 1 ]; then break; fi
      rrc=0; lease_renew || rrc=$?
      if [ "$rrc" -eq 0 ]; then good_until=$(( $(date +%s) + LEASE_TTL )); continue; fi
      if [ "$rrc" -eq 2 ] && [ "$(date +%s)" -lt "$good_until" ]; then echo "[bot-state] lease renewal could not be confirmed; will retry" >&2; continue; fi
      echo "[bot-state] lease lost: stopping the pipeline, uploading nothing more" >&2
      : >"$STAGE/lease-lost"; kill -TERM "$MAIN_PID" 2>/dev/null || true
      break
    done
    exit 0
  ) &
  RENEW_PID=$!
  (
    SP=""; HSTOP=0; LT=snap
    trap 'HSTOP=1; if [ -n "$SP" ]; then kill "$SP" 2>/dev/null || true; fi' TERM
    trap ': >"$STAGE/helper-snap.done"' EXIT
    while [ "$HSTOP" = 0 ]; do
      sleep "$SNAPSHOT_S" & SP=$!
      if [ "$HSTOP" = 1 ]; then kill "$SP" 2>/dev/null || true; fi
      wait "$SP" || true; SP=""
      if [ "$HSTOP" = 1 ]; then break; fi
      snapshot_state periodic || true
    done
    exit 0
  ) &
  SNAP_PID=$!
  return 0
}
stop_helpers() {  # an upload already under way may finish, for at most STOP_WAIT seconds; then the helper and its bucket call are ended
  for p in "$RENEW_PID" "$SNAP_PID"; do
    if [ -n "$p" ]; then kill -TERM "$p" 2>/dev/null || true; fi
  done
  hi=0; hlimit=$(( STOP_WAIT * 10 ))
  while [ "$hi" -lt "$hlimit" ]; do
    pending=0
    if [ -n "$RENEW_PID" ] && [ ! -e "$STAGE/helper-renew.done" ]; then pending=1; fi
    if [ -n "$SNAP_PID" ] && [ ! -e "$STAGE/helper-snap.done" ]; then pending=1; fi
    if [ "$pending" = 0 ]; then break; fi
    sleep 0.1; hi=$((hi + 1))
  done
  for pair in "$RENEW_PID:renew" "$SNAP_PID:snap"; do
    p="${pair%%:*}"; hn="${pair#*:}"
    if [ -z "$p" ]; then continue; fi
    if [ ! -e "$STAGE/helper-$hn.done" ]; then
      echo "[bot-state] helper $hn did not stop within ${STOP_WAIT}s; ending it and its bucket call" >&2
      if [ -f "$STAGE/gc-$hn.pid" ]; then kill -TERM "$(cat "$STAGE/gc-$hn.pid")" 2>/dev/null || true; fi
      kill -KILL "$p" 2>/dev/null || true
    fi
    wait "$p" 2>/dev/null || true
  done
  RENEW_PID=""; SNAP_PID=""
  stop_watchdog
  return 0
}
renew_before_start() {  # a slow start (daemons, doctor gate) must not let another instance take the lease
  if [ -z "$BUCKET" ]; then return 0; fi
  rbrc=0; lease_renew || rbrc=$?
  case "$rbrc" in
    0) log "lease renewed before the pipeline starts" ;;
    1) echo "lease lost before the pipeline could start; not starting it" >&2; exit 75 ;;
    *) echo "[bot-state] lease renewal before the start could not be confirmed; continuing, the renewer retries" >&2 ;;
  esac
  return 0
}
finish() {  # $1 pipeline status: stop the helpers, final snapshot, release the lease, exit
  FIN_RC="$1"; PHASE=post
  stop_helpers
  if [ -n "$BUCKET" ]; then
    snapshot_state final || true
    lease_release || true
  fi
  if [ -e "$STAGE/lease-lost" ]; then FIN_RC=75; fi
  exit "$FIN_RC"
}
on_exit() {
  erc=$?; trap - EXIT
  stop_helpers
  lease_release || true
  if [ -s "$STAGE/skipped" ]; then echo "[bot-state] shutdown time budget used up: some bucket calls were skipped" >&2; fi
  if [ -n "$STAGE" ]; then rm -rf "$STAGE"; fi
  exit "$erc"
}

# Stale per-boot state: X lock/socket and the tab-capture lock (PID reuse after a restart would
# otherwise make every capture refuse; survey blocker 2).
rm -f "/tmp/.X99-lock" "/tmp/.X11-unix/X99"
rm -f "${LKB_BOT_PROFILE_DIR:-/data/bot-profile}/.lkb-tab-capture.lock"

# ---- lease, then restore (run / record-once with a bucket). Before any daemon starts and before the doctor gate. ---
if [ "$SUPERVISE" = 1 ]; then
  STAGE="$(mktemp -d "${TMPDIR:-/tmp}/lkb-state.XXXXXX")"
  trap on_exit EXIT
  trap on_term TERM INT
fi
if [ -n "$BUCKET" ]; then
  PROFILE_BASE="${PROFILE_DIR##*/}"; PROFILE_PARENT="${PROFILE_DIR%/*}"; RELEASE_BASE="${RELEASE_DIR##*/}"; RELEASE_PARENT="${RELEASE_DIR%/*}"
  [ -n "$PROFILE_PARENT" ] || PROFILE_PARENT=/; [ -n "$RELEASE_PARENT" ] || RELEASE_PARENT=/
  if [ "$PROFILE_BASE" = "$RELEASE_BASE" ]; then echo "profile and release directories must have different names" >&2; exit 1; fi
  HOLDER="$(uname -n)-$$-$(date +%s)-$(od -An -N6 -tx1 /dev/urandom | tr -d ' \n')"
  mkdir -p "$PROFILE_DIR" "$RELEASE_DIR"
  lease_rc=0; lease_acquire || lease_rc=$?
  if [ "$lease_rc" -ne 0 ]; then exit "$lease_rc"; fi
  restore_state || exit 1
  rm -f "$RELEASE_DIR/poller.lock" "$PROFILE_DIR/.lkb-tab-capture.lock"   # never .lkb-recovery.lock: a restore leaves it in place
fi

# PulseAudio null sink: recorder.js' AudioContext needs an output device.
pulseaudio -D --exit-idle-time=-1 --disable-shm=yes --log-target=stderr >/dev/null 2>&1 || true
i=0
until pactl info >/dev/null 2>&1; do
  i=$((i+1)); [ "$i" -ge 20 ] && { echo "pulseaudio did not start" >&2; exit 1; }; sleep 0.5
done
pactl list short sinks | grep -q botsink || pactl load-module module-null-sink sink_name=botsink sink_properties=device.description=BotSink >/dev/null
pactl set-default-sink botsink

Xvfb :99 -screen 0 1920x1080x24 -nolisten tcp >/tmp/xvfb.log 2>&1 &
i=0
until xdpyinfo -display :99 >/dev/null 2>&1; do
  i=$((i+1)); [ "$i" -ge 40 ] && { echo "Xvfb did not start" >&2; exit 1; }; sleep 0.5
done

if [ "$MODE" = "login" ]; then
  x11vnc -display :99 -forever -shared -rfbport 5900 -passwdfile "rm:$VNC_PASSFILE" -bg -o /tmp/x11vnc.log >/dev/null
  CHROME="$("$LKB_PYTHON" -c 'import pathlib,seleniumbase; print(pathlib.Path(seleniumbase.__file__).parent/"drivers"/"cft_drivers"/"chrome-linux64"/"chrome")')"
  SANDBOX=""; [ "${LKB_CHROME_NO_SANDBOX:-}" = "1" ] && SANDBOX="--no-sandbox"
  exec "$CHROME" $SANDBOX --user-data-dir="${LKB_BOT_PROFILE_DIR:-/data/bot-profile}" --no-first-run --window-size=1920,1080 https://accounts.google.com/
fi

# Doctor gate: capture the exit status WITHOUT a pipe (`| tee` would hide it and fail open), then fail on
# a nonzero exit as well as on any MISSING line.
doctor_rc=0
node scripts/webinar/setup.mjs --doctor >/tmp/doctor.log 2>&1 || doctor_rc=$?
cat /tmp/doctor.log
if [ "$doctor_rc" -ne 0 ]; then echo "doctor failed (exit $doctor_rc)" >&2; exit 1; fi
if grep -q '^MISSING' /tmp/doctor.log; then echo "doctor failed (MISSING)" >&2; exit 1; fi
[ "$MODE" = "doctor" ] && exit 0
renew_before_start   # the slow part of the start is over; refresh the lease right before the pipeline and helpers start

# record-once: the command and its flags. LKB_RECORD_ARGS is split on spaces (no globbing).
if [ "$MODE" = "record-once" ]; then
  set -f; set -- ${LKB_RECORD_ARGS:-}; set +f
  if [ "$SUPERVISE" != 1 ]; then exec node --import tsx packages/meeting-bot/src/cli.ts record "$LKB_RECORD_URL" --until "$LKB_RECORD_UNTIL" "$@"; fi
  PHASE=running
  start_child node --import tsx packages/meeting-bot/src/cli.ts record "$LKB_RECORD_URL" --until "$LKB_RECORD_UNTIL" "$@"
  start_helpers
  wait_child
  REC_RC="$CHILD_RC"
  copy_rc=0; copy_recordings || copy_rc=$?
  if [ "$REC_RC" -eq 0 ] && [ "$copy_rc" -ne 0 ]; then
    echo "[bot-state] the recording finished but could not be copied to the bucket; exiting 74" >&2
    REC_RC=74
  fi
  finish "$REC_RC"
fi

# Without a bucket and without an attendance account the container behaves exactly as it always did.
if [ "$SUPERVISE" != 1 ]; then
  exec node scripts/webinar/run-pipeline.mjs --run --watch
fi

PHASE=running
if [ -z "$ATTENDANCE_ACCOUNT" ]; then
  start_child node scripts/webinar/run-pipeline.mjs --run --watch
  start_helpers
  wait_child
  finish "$CHILD_RC"
fi

# Attendance loop (D-231): one single-slot tick per interval, never --watch, never two ticks at once.
start_helpers
last_rc=0
while [ "$STOPPING" = 0 ]; do
  tick_start=$(date +%s)
  start_child node scripts/webinar/run-pipeline.mjs --run --calendar-attendance-account "$ATTENDANCE_ACCOUNT"
  wait_child
  last_rc="$CHILD_RC"
  if [ "$last_rc" -ne 0 ]; then echo "[bot-attendance] tick failed (exit $last_rc); the loop continues" >&2; else log "attendance tick finished (exit 0)"; fi
  if [ "$STOPPING" = 1 ]; then break; fi
  copy_recordings || true
  rest=$(( ATTENDANCE_S - ( $(date +%s) - tick_start ) ))
  if [ "$rest" -gt 0 ] && [ "$STOPPING" = 0 ]; then nap "$rest"; fi
done
if [ "$STOPPING" = 1 ] && [ "$last_rc" -eq 0 ]; then finish 0; fi
finish "$last_rc"
