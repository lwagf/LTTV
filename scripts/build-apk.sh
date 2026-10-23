#!/usr/bin/env bash
# Builds the web app, bundles it into the Android assets and assembles a debug APK.
set -euo pipefail
cd "$(dirname "$0")/.."
source scripts/env.sh

bun run build
rm -rf android/app/src/main/assets/web
mkdir -p android/app/src/main/assets
cp -r web/dist android/app/src/main/assets/web

version=$(bun -e 'console.log(require("./package.json").version)')
# versionCode must grow with every release: 1.2.3 → 10203.
code=$(bun -e 'const [a, b, c] = require("./package.json").version.split(".").map(Number); console.log(a * 10000 + b * 100 + c)')
(cd android && ./gradlew -q assembleDebug "-PappVersion=$version" "-PappVersionCode=$code")
bash scripts/check-permissions.sh android/app/build/outputs/apk/debug/app-debug.apk
echo "APK: android/app/build/outputs/apk/debug/app-debug.apk"
