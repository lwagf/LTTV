# Sourced by the other scripts: points at the toolchain installed by setup-android.sh, when present
# (CI provides its own JDK and Android SDK).
LTTV_TOOLS="${LTTV_TOOLS:-$HOME/.local/android}"
if [ -d "$LTTV_TOOLS/jdk" ]; then
  export JAVA_HOME="$LTTV_TOOLS/jdk"
  export ANDROID_HOME="$LTTV_TOOLS/sdk"
  export ANDROID_SDK_ROOT="$ANDROID_HOME"
  export PATH="$JAVA_HOME/bin:$ANDROID_HOME/cmdline-tools/latest/bin:$ANDROID_HOME/platform-tools:$LTTV_TOOLS/gradle/bin:$PATH"
fi
