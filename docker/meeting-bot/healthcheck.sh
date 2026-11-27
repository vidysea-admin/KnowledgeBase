#!/bin/sh
# Healthy = run-pipeline or the supervising entrypoint alive, Xvfb :99 answering, bot profile writable. Doctor/login modes run no
# pipeline, so they report healthy once the display answers.
xdpyinfo -display "${DISPLAY:-:99}" >/dev/null 2>&1 || exit 1
[ "${BOT_MODE:-run}" = "run" ] || exit 0
# Without a bucket or attendance account the entrypoint exec-s run-pipeline. With either, the supervising entrypoint
# stays alive and runs the calendar tick or the send-now queue step as short children (sleeping between them), so the
# entrypoint itself is the liveness signal there. This proves the loop is alive, NOT that its steps succeed: a queue
# step or calendar tick that fails every time is logged and retried, and still reads healthy here (failures reach the
# operator through the capture-failed alert mails instead). tini (-s, PID 1) exits as soon as the shell does.
# Anchored on the shell running the script: tini's own command line (PID 1) also names bot-entrypoint and never exits.
pgrep -f 'scripts/webinar/run-pipeline.mjs|^/bin/sh /usr/local/bin/bot-entrypoint' >/dev/null || exit 1
d="${LKB_BOT_PROFILE_DIR:-/data/bot-profile}"
[ -d "$d" ] && [ -w "$d" ] || exit 1
