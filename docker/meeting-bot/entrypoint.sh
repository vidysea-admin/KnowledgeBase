#!/bin/sh
# Meeting-bot container entrypoint (runs under tini). BOT_MODE: run (default) | doctor | login.
#   run    start PulseAudio + Xvfb, clear stale locks, doctor gate, exec run-pipeline --run --watch
#   doctor start PulseAudio + Xvfb, run `setup.mjs --doctor`, exit with its status (no pipeline)
#   login  start PulseAudio + Xvfb + x11vnc (needs VNC_PASSWORD) and open Chrome on the bot profile for
#          the one-time Google sign-in; publish the port loopback-only:
#          docker compose --profile bot run --rm -p 127.0.0.1:5900:5900 -e BOT_MODE=login bot
set -eu
cd /app
MODE="${BOT_MODE:-run}"
DISPLAY="${DISPLAY:-:99}"; export DISPLAY
XDG_RUNTIME_DIR="${XDG_RUNTIME_DIR:-/tmp/runtime-node}"; export XDG_RUNTIME_DIR
mkdir -p "$XDG_RUNTIME_DIR" && chmod 0700 "$XDG_RUNTIME_DIR"

# Stale per-boot state: X lock/socket and the tab-capture lock (PID reuse after a restart would
# otherwise make every capture refuse; survey blocker 2).
rm -f "/tmp/.X99-lock" "/tmp/.X11-unix/X99"
rm -f "${LKB_BOT_PROFILE_DIR:-/data/bot-profile}/.lkb-tab-capture.lock"

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
  [ -n "${VNC_PASSWORD:-}" ] || { echo "login mode needs VNC_PASSWORD (value-less env pass-through)" >&2; exit 1; }
  x11vnc -display :99 -forever -shared -rfbport 5900 -passwd "$VNC_PASSWORD" -bg -o /tmp/x11vnc.log >/dev/null
  CHROME="$("$LKB_PYTHON" -c 'import pathlib,seleniumbase; print(pathlib.Path(seleniumbase.__file__).parent/"drivers"/"cft_drivers"/"chrome-linux64"/"chrome")')"
  SANDBOX=""; [ "${LKB_CHROME_NO_SANDBOX:-}" = "1" ] && SANDBOX="--no-sandbox"
  exec "$CHROME" $SANDBOX --user-data-dir="${LKB_BOT_PROFILE_DIR:-/data/bot-profile}" --no-first-run --window-size=1920,1080 https://accounts.google.com/
fi

node scripts/webinar/setup.mjs --doctor | tee /tmp/doctor.log
if grep -q '^MISSING' /tmp/doctor.log; then echo "doctor failed" >&2; exit 1; fi
[ "$MODE" = "doctor" ] && exit 0

exec node scripts/webinar/run-pipeline.mjs --run --watch
