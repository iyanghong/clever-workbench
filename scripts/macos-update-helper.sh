#!/bin/sh
# Copy this helper OUTSIDE the installed bundle before invoking it.
# Arguments: parent PID, installed .app, verified candidate .app, private transaction directory.
# This process never restores user data and never alters quarantine attributes.
set -eu
umask 077
[ "$#" -eq 4 ] || exit 64
parent_pid=$1
target=$2
source_app=$3
transaction=$4
case "$parent_pid" in ''|*[!0-9]*) exit 64;; esac
case "$target" in /*.app) ;; *) exit 64;; esac
case "$source_app" in /*.app) ;; *) exit 64;; esac
case "$transaction" in /*) ;; *) exit 64;; esac
[ -d "$transaction" ] && [ ! -L "$transaction" ] || exit 64
exec >> "$transaction/helper.log" 2>&1
candidate="$target.incoming"
previous="$target.previous"
lock="$target.update-lock"
phase() {
  /usr/bin/printf '%s\n' "$1" > "$transaction/helper-status.next"
  /bin/mv -f "$transaction/helper-status.next" "$transaction/helper-status"
}
fail() { phase "$1"; exit 1; }
# Lock is attached to the installation path, independent of profile/userData.
/bin/mkdir "$lock" || fail 'needs-attention:installation-locked'
trap '/bin/rmdir "$lock" 2>/dev/null || true' EXIT
[ ! -L "$target" ] && [ ! -L "$source_app" ] || fail 'needs-attention:symlink-app'
[ -d "$target" ] && [ -d "$source_app" ] || fail 'failed:missing-app'
[ -w "$(/usr/bin/dirname "$target")" ] || fail 'needs-attention:installation-not-writable'
[ ! -e "$previous" ] && [ ! -e "$candidate" ] || fail 'needs-attention:previous-transaction-present'
# Validated by the coordinator; enforce the shared identity again at the last boundary.
installed_id=$(/usr/libexec/PlistBuddy -c 'Print :CFBundleIdentifier' "$target/Contents/Info.plist")
candidate_id=$(/usr/libexec/PlistBuddy -c 'Print :CFBundleIdentifier' "$source_app/Contents/Info.plist")
[ "$installed_id" = "$candidate_id" ] || fail 'failed:application-identity-mismatch'
/usr/bin/codesign --verify --deep --strict "$source_app" || fail 'failed:bundle-signature-invalid'
phase 'staging'
/usr/bin/ditto "$source_app" "$candidate" || fail 'failed:stage-copy'
phase 'waiting-for-exit'
attempt=0
while /bin/kill -0 "$parent_pid" 2>/dev/null; do
  attempt=$((attempt + 1))
  [ "$attempt" -le 60 ] || fail 'failed:exit-timeout'
  /bin/sleep 1
done
phase 'backing-up-app'
/bin/mv "$target" "$previous" || fail 'failed:backup-app'
phase 'replacing-app'
if ! /bin/mv "$candidate" "$target"; then
  if [ ! -e "$target" ] && /bin/mv "$previous" "$target"; then
    phase 'failed:replacement-restored'
    /usr/bin/open -n "$target" --args --clever-update-transaction "$transaction" || true
  else
    phase 'needs-attention:restore-app-failed'
  fi
  exit 1
fi
phase 'launching'
if ! /usr/bin/open -n "$target" --args --clever-update-transaction "$transaction"; then
  fail 'needs-attention:launch-failed'
fi
# LaunchServices accepting an open request does NOT establish application health.
phase 'awaiting-health'
