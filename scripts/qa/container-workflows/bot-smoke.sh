#!/usr/bin/env bash
# Meeting-bot container smoke (D-205 U5): proves tab capture + Xvfb + PulseAudio end to end inside the
# bot image WITHOUT a live meeting. It serves a local fixture page (animated canvas + 440 Hz tone) over
# HTTPS on 127.0.0.1 inside the container and records it exactly the way run-pipeline does:
#   node --import tsx packages/meeting-bot/src/cli.ts record <url> --until <now+90s> --backend tab
# Usage:  BOT_IMAGE=<built image> bash scripts/qa/container-workflows/bot-smoke.sh
#         (build first: docker build -f docker/meeting-bot/Dockerfile -t <image> .)
# Exit 0 only when ALL of (a)-(d) hold, otherwise nonzero:
#   a  a non-empty .webm was produced
#   b  ffprobe shows exactly one audio and one video stream
#   c  audio peak (ffmpeg volumedetect max_volume) is above -40 dB, i.e. not silent
#   d  the record process exited 0 and no chrome/chromedriver process remains (/proc scan)
# Why HTTPS: record consent (record-consent/context.ts recordMeetingHash) refuses non-https meeting URLs,
# and detectPlatform() reports a localhost URL as "unknown" (accepted: no platform logic is bypassed).
# Chrome must trust the fixture certificate, so the smoke imports it into the node user's NSS db
# (certutil, package libnss3-tools, shipped in the image). The throwaway container runs with
# `--network none`: everything the smoke touches is loopback or already in the image, so the run needs
# no network (building the image does).
# Modes (internal): --inside (runs in the container), --check <rec_dir> <record_exit> (criteria a-d only).
set -uo pipefail

MIN_PEAK_DB="${BOT_SMOKE_MIN_PEAK_DB:--40}"

# ---- criteria (a)-(d); pure on its inputs so it is testable without Docker ---------------------------
check_artifacts() {
  local rec="$1" record_exit="$2" proc="${BOT_SMOKE_PROC:-/proc}" fail=0 webm f
  webm=""
  for f in "$rec"/tab-*.webm; do
    [ -e "$f" ] || continue
    case "$f" in *.playable.webm) continue ;; esac
    webm="$f"; break
  done
  if [ -n "$webm" ] && [ -s "$webm" ]; then
    echo "SMOKE a PASS non-empty webm: $webm ($(wc -c < "$webm") bytes)"
  else
    echo "SMOKE a FAIL no non-empty tab-*.webm in $rec"; fail=1
  fi

  if [ -n "$webm" ] && [ -s "$webm" ]; then
    local nv na
    nv="$(ffprobe -v error -select_streams v -show_entries stream=codec_type -of csv=p=0 "$webm" 2>/dev/null | grep -c video)"
    na="$(ffprobe -v error -select_streams a -show_entries stream=codec_type -of csv=p=0 "$webm" 2>/dev/null | grep -c audio)"
    if [ "$nv" = "1" ] && [ "$na" = "1" ]; then echo "SMOKE b PASS 1 video + 1 audio stream"
    else echo "SMOKE b FAIL streams: video=$nv audio=$na (want 1 and 1)"; fail=1; fi

    local peak
    peak="$(ffmpeg -hide_banner -nostdin -i "$webm" -vn -af volumedetect -f null - 2>&1 | sed -n 's/.*max_volume: \(-\{0,1\}[0-9.]*\) dB.*/\1/p' | tail -n 1)"
    if [ -n "$peak" ] && awk -v p="$peak" -v m="$MIN_PEAK_DB" 'BEGIN{exit !(p > m)}'; then
      echo "SMOKE c PASS audio max_volume ${peak} dB (> ${MIN_PEAK_DB} dB)"
    else
      echo "SMOKE c FAIL audio max_volume '${peak:-unreadable}' dB (need > ${MIN_PEAK_DB} dB)"; fail=1
    fi
  else
    echo "SMOKE b FAIL no webm to probe"; echo "SMOKE c FAIL no webm to measure"; fail=1
  fi

  # (d) exit status of the record process, then no leftover browser process (short grace for teardown).
  local left="" tries=0 p comm
  while :; do
    left=""
    for p in "$proc"/[0-9]*; do
      [ -r "$p/comm" ] || continue
      comm="$(cat "$p/comm" 2>/dev/null)"
      case "$comm" in chrome|chrome_crashpad*|chromedriver|uc_driver) left="$left ${p##*/}:$comm" ;; esac
    done
    [ -z "$left" ] && break
    tries=$((tries + 1)); [ "$tries" -ge "${BOT_SMOKE_REAP_TRIES:-10}" ] && break
    sleep 1
  done
  if [ "$record_exit" = "0" ] && [ -z "$left" ]; then echo "SMOKE d PASS record exit 0, no chrome process remains"
  else echo "SMOKE d FAIL record_exit=$record_exit leftover=[${left# }]"; fail=1; fi
  return "$fail"
}

# ---- runs inside the container as the image's node user --------------------------------------------
inside_main() {
  set -e
  local W=/tmp/bot-smoke-work fx
  fx="$W/fx"
  mkdir -p -m 0700 "$W" "$fx"
  local REC="${LKB_RECORD_DIR:-/app/raw/webinars}"   # image default: the recorder confines output to the repo tree
  export XDG_RUNTIME_DIR="${XDG_RUNTIME_DIR:-/tmp/runtime-node}" DISPLAY="${DISPLAY:-:99}"
  mkdir -p "$XDG_RUNTIME_DIR" && chmod 0700 "$XDG_RUNTIME_DIR"
  cd /app

  # Same bring-up as docker/meeting-bot/entrypoint.sh: PulseAudio null sink first, then Xvfb.
  pulseaudio -D --exit-idle-time=-1 --disable-shm=yes --log-target=stderr >/dev/null 2>&1 || true
  local i=0
  until pactl info >/dev/null 2>&1; do i=$((i+1)); [ "$i" -ge 20 ] && { echo "pulseaudio did not start" >&2; exit 1; }; sleep 0.5; done
  pactl list short sinks | grep -q botsink || pactl load-module module-null-sink sink_name=botsink sink_properties=device.description=BotSink >/dev/null
  pactl set-default-sink botsink
  rm -f /tmp/.X99-lock /tmp/.X11-unix/X99
  Xvfb :99 -screen 0 1920x1080x24 -nolisten tcp >"$W/xvfb.log" 2>&1 &
  i=0
  until xdpyinfo -display :99 >/dev/null 2>&1; do i=$((i+1)); [ "$i" -ge 40 ] && { echo "Xvfb did not start" >&2; exit 1; }; sleep 0.5; done

  # Fixture over HTTPS on 127.0.0.1 with a throwaway cert trusted through the node user's NSS db.
  cp "$W/bot-smoke-meeting.html" "$fx/"
  openssl req -x509 -newkey rsa:2048 -nodes -keyout "$fx/key.pem" -out "$fx/cert.pem" -days 1 \
    -subj /CN=127.0.0.1 -addext "subjectAltName=IP:127.0.0.1" >/dev/null 2>&1
  mkdir -p "$HOME/.pki/nssdb"
  [ -e "$HOME/.pki/nssdb/cert9.db" ] || certutil -d "sql:$HOME/.pki/nssdb" -N --empty-password
  certutil -d "sql:$HOME/.pki/nssdb" -A -n bot-smoke -t "C,," -i "$fx/cert.pem"
  cat > "$fx/serve.py" <<'PY'
import functools, http.server, ssl, sys
handler = functools.partial(http.server.SimpleHTTPRequestHandler, directory=sys.argv[1])
server = http.server.ThreadingHTTPServer(("127.0.0.1", 8443), handler)
ctx = ssl.SSLContext(ssl.PROTOCOL_TLS_SERVER)
ctx.load_cert_chain(sys.argv[1] + "/cert.pem", sys.argv[1] + "/key.pem")
server.socket = ctx.wrap_socket(server.socket, server_side=True)
server.serve_forever()
PY
  python3 "$fx/serve.py" "$fx" >"$W/serve.log" 2>&1 </dev/null &
  local server_pid=$!
  i=0
  until curl -fsk -o /dev/null https://127.0.0.1:8443/bot-smoke-meeting.html; do i=$((i+1)); [ "$i" -ge 20 ] && { echo "fixture server did not start" >&2; exit 1; }; sleep 0.5; done

  # Record the way run-pipeline does (tab backend; env as set by the image ENV).
  local session until url rc
  session="bot-smoke-$(date +%s)-$$"
  until="$(date -u -d '+90 seconds' +%Y-%m-%dT%H:%M:%SZ)"
  url="https://127.0.0.1:8443/bot-smoke-meeting.html"
  echo "SMOKE record start session=$session until=$until"
  set +e
  LKB_RECORD_DIR="$REC" LKB_CAPTURE_BACKEND=tab \
  LKB_CAPTURE_APPROVED_BY=bot-smoke LKB_CAPTURE_APPROVAL_REF=D-205-bot-smoke LKB_CAPTURE_RECORDED_BY=bot-smoke \
    timeout 240 node --import tsx packages/meeting-bot/src/cli.ts record "$url" --until "$until" --backend tab \
      --title bot-smoke-fixture --session-id "$session" </dev/null >"$W/record.log" 2>&1
  rc=$?
  set -e
  echo "SMOKE record exit=$rc"
  tail -n 25 "$W/record.log" | sed 's/^/  record| /'
  kill "$server_pid" 2>/dev/null || true
  ls -la "$REC" | sed 's/^/  rec| /'

  local webm
  webm="$(ls "$REC"/tab-*.webm 2>/dev/null | grep -v '\.playable\.webm$' | head -n 1 || true)"
  if [ -n "$webm" ]; then ffprobe -v error -show_entries stream=index,codec_type,codec_name -of compact "$webm" | sed 's/^/  ffprobe| /'; fi
  set +e
  check_artifacts "$REC" "$rc"
  return $?
}

# ---- host side: one throwaway container, always removed ---------------------------------------------
host_main() {
  export MSYS_NO_PATHCONV=1 MSYS2_ARG_CONV_EXCL='*'   # Git Bash on Windows must not rewrite /usr/bin/tini etc.
  local here image rc
  here="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
  image="${BOT_IMAGE:-${1:-}}"
  [ -n "$image" ] || { echo "usage: BOT_IMAGE=<image> $0   (docker build -f docker/meeting-bot/Dockerfile -t <image> .)" >&2; return 2; }
  docker image inspect "$image" >/dev/null 2>&1 || { echo "image '$image' not found; build it first" >&2; return 2; }
  name="bot-smoke-$$"   # global on purpose: the EXIT trap runs after this function's locals are gone
  cleanup() { docker rm -f -v "$name" >/dev/null 2>&1 || true; }
  trap cleanup EXIT INT TERM
  echo "SMOKE container $name from $image"
  docker run -d --name "$name" --network none --shm-size 1g --entrypoint /usr/bin/tini "$image" -s -- sleep 900 >/dev/null || return 2
  docker exec "$name" sh -c 'command -v certutil >/dev/null' \
    || { echo "SMOKE FAIL certutil missing from the image (libnss3-tools); rebuild the image" >&2; return 1; }
  docker exec -i "$name" sh -c 'mkdir -p /tmp/bot-smoke-work && cat > /tmp/bot-smoke-work/bot-smoke-meeting.html' < <(tr -d "\r" < "$here/fixtures/bot-smoke-meeting.html") || return 1
  docker exec -i "$name" sh -c 'cat > /tmp/bot-smoke-work/bot-smoke.sh' < <(tr -d "\r" < "${BASH_SOURCE[0]}") || return 1
  docker exec "$name" bash /tmp/bot-smoke-work/bot-smoke.sh --inside
  rc=$?
  if [ "$rc" -eq 0 ]; then echo "SMOKE RESULT PASS"; else echo "SMOKE RESULT FAIL (exit $rc)"; fi
  return "$rc"
}

case "${1:-}" in
  --check) shift; [ "$#" -eq 2 ] || { echo "usage: $0 --check <rec_dir> <record_exit>" >&2; exit 2; }; check_artifacts "$1" "$2"; exit $? ;;
  --inside) inside_main; exit $? ;;
  *) host_main "$@"; exit $? ;;
esac
