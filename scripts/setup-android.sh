#!/usr/bin/env bash
# Installs JDK 17, the Android SDK pieces and Gradle under ~/.local/android. Safe to re-run.
set -euo pipefail
source "$(dirname "$0")/env.sh"
mkdir -p "$LTTV_TOOLS"
tmp=$(mktemp -d)
trap 'rm -rf "$tmp"' EXIT

if [ ! -x "$JAVA_HOME/bin/java" ]; then
  echo "Installing Temurin JDK 17..."
  curl -fsSL -o "$tmp/jdk.tar.gz" \
    "https://api.adoptium.net/v3/binary/latest/17/ga/linux/x64/jdk/hotspot/normal/eclipse"
  mkdir -p "$JAVA_HOME"
  tar -xzf "$tmp/jdk.tar.gz" -C "$JAVA_HOME" --strip-components=1
fi

if [ ! -x "$ANDROID_HOME/cmdline-tools/latest/bin/sdkmanager" ]; then
  echo "Installing Android cmdline-tools..."
  curl -fsSL -o "$tmp/cmdline.zip" \
    "https://dl.google.com/android/repository/commandlinetools-linux-11076708_latest.zip"
  mkdir -p "$ANDROID_HOME/cmdline-tools"
  unzip -q "$tmp/cmdline.zip" -d "$tmp/cmdline"
  mv "$tmp/cmdline/cmdline-tools" "$ANDROID_HOME/cmdline-tools/latest"
fi

yes | sdkmanager --licenses >/dev/null || true
sdkmanager "platform-tools" "platforms;android-35" "build-tools;35.0.0" >/dev/null

if [ ! -x "$LTTV_TOOLS/gradle/bin/gradle" ]; then
  echo "Installing Gradle..."
  curl -fsSL -o "$tmp/gradle.zip" "https://services.gradle.org/distributions/gradle-8.11.1-bin.zip"
  unzip -q "$tmp/gradle.zip" -d "$tmp/gradle"
  mv "$tmp/gradle/gradle-8.11.1" "$LTTV_TOOLS/gradle"
fi

echo "Android toolchain ready in $LTTV_TOOLS"
