#!/usr/bin/env bash
# Fails if the APK requests any Android permission outside the allowlist.
set -euo pipefail
source "$(dirname "$0")/env.sh"
apk=${1:?usage: check-permissions.sh <apk>}
aapt2=$(command -v aapt2 || ls "${ANDROID_HOME:?ANDROID_HOME not set}"/build-tools/*/aapt2 | sort -V | tail -1)
# The last entry is AndroidX's app-private signature permission guarding its own receivers;
# it grants the app no access to anything.
allowed="android.permission.INTERNET android.permission.ACCESS_NETWORK_STATE
  io.github.lwagf.lttv.DYNAMIC_RECEIVER_NOT_EXPORTED_PERMISSION
  io.github.lwagf.lttv.debug.DYNAMIC_RECEIVER_NOT_EXPORTED_PERMISSION"

bad=0
while read -r perm; do
  case " $allowed " in
    *[[:space:]]"$perm"[[:space:]]*) ;;
    *) echo "Disallowed permission: $perm" >&2; bad=1 ;;
  esac
# Matches both uses-permission and uses-permission-sdk-23 lines.
done < <("$aapt2" dump permissions "$apk" | sed -n "s/.*uses-permission[a-z0-9-]*: name='\([^']*\)'.*/\1/p")

[ "$bad" -eq 0 ] && echo "Permissions OK"
exit "$bad"
