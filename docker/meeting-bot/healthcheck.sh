#!/bin/sh
# Healthy = run-pipeline alive, Xvfb :99 answering, bot profile writable. Doctor/login modes run no
# pipeline, so they report healthy once the display answers.
xdpyinfo -display "${DISPLAY:-:99}" >/dev/null 2>&1 || exit 1
[ "${BOT_MODE:-run}" = "run" ] || exit 0
pgrep -f 'scripts/webinar/run-pipeline.mjs' >/dev/null || exit 1
d="${LKB_BOT_PROFILE_DIR:-/data/bot-profile}"
[ -d "$d" ] && [ -w "$d" ] || exit 1
