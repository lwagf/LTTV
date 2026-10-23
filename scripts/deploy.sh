#!/usr/bin/env bash
# Installs the debug APK on the Fire TV at $LTTV_DEVICE (ip:port) and launches it.
set -euo pipefail
cd "$(dirname "$0")/.."
source scripts/env.sh
: "${LTTV_DEVICE:?set LTTV_DEVICE=<stick-ip>:5555}"
ADB=${ADB:-adb}

# Under WSL the adb daemon can hang while forking; run the server in the foreground instead.
if ! timeout 5 "$ADB" devices >/dev/null 2>&1; then
  pkill -x adb || true
  nohup "$ADB" nodaemon server >/dev/null 2>&1 &
  sleep 2
fi

timeout 20 "$ADB" connect "$LTTV_DEVICE" >/dev/null
"$ADB" -s "$LTTV_DEVICE" install -r android/app/build/outputs/apk/debug/app-debug.apk
"$ADB" -s "$LTTV_DEVICE" shell am start -n io.github.lwagf.lttv.debug/io.github.lwagf.lttv.MainActivity
