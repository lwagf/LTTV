#!/usr/bin/env bash
# Builds a signed release APK as ./lttv.apk (used by the release workflow; works locally too).
# Needs VITE_TWITCH_CLIENT_ID (or web/.env), LTTV_KEYSTORE and LTTV_KEYSTORE_PASSWORD.
set -euo pipefail
cd "$(dirname "$0")/.."
source scripts/env.sh

if [ -z "${VITE_TWITCH_CLIENT_ID:-}" ] && ! grep -qE '^VITE_TWITCH_CLIENT_ID=.+' web/.env 2>/dev/null; then
  echo "VITE_TWITCH_CLIENT_ID is not set (and web/.env has none): the app couldn't log in." >&2
  exit 1
fi
: "${LTTV_KEYSTORE:?set LTTV_KEYSTORE to the release keystore}"
: "${LTTV_KEYSTORE_PASSWORD:?set LTTV_KEYSTORE_PASSWORD}"

bun run build
rm -rf android/app/src/main/assets/web
mkdir -p android/app/src/main/assets
cp -r web/dist android/app/src/main/assets/web

version=$(bun -e 'console.log(require("./package.json").version)')
code=$(bun -e 'const [a, b, c] = require("./package.json").version.split(".").map(Number); console.log(a * 10000 + b * 100 + c)')
(cd android && ./gradlew -q assembleRelease "-PappVersion=$version" "-PappVersionCode=$code")

apk=android/app/build/outputs/apk/release/app-release.apk
bash scripts/check-permissions.sh "$apk"
cp "$apk" lttv.apk
echo "Release APK: lttv.apk ($version)"
