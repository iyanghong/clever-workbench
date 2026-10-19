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
[ "$(/usr/bin/stat -f %u "$transaction")" = "$(/usr/bin/id -u)" ] || exit 64
exec >> "$transaction/helper.log" 2>&1
candidate="$target.incoming"
previous="$target.previous"
lock="$target.update-lock"
phase() {
  /usr/bin/printf '%s|%s\n' "$(/bin/date +%s)" "$1" >> "$transaction/phases.log"
  /usr/bin/printf '%s\n' "$1" > "$transaction/helper-status.next"
  /bin/mv -f "$transaction/helper-status.next" "$transaction/helper-status"
}
fail() { phase "$1"; exit 1; }
launch() {
  if [ -f "$transaction/user-data-directory" ]; then
    data_dir=$(/bin/cat "$transaction/user-data-directory")
    /usr/bin/open -n "$target" --env "CLEVER_WORKBENCH_DATA_DIR=$data_dir" --args --clever-update-transaction "$transaction"
  else
    /usr/bin/open -n "$target" --args --clever-update-transaction "$transaction"
  fi
}
# Lock is attached to the installation path, independent of profile/userData.
if ! /bin/mkdir "$lock" 2>/dev/null; then
  # Only the SAME recorded transaction may resume a dead helper; a live helper or
  # an unrelated transaction is never stolen. PID reuse conservatively blocks.
  [ ! -L "$lock" ] && [ -f "$lock/transaction" ] && [ "$(/bin/cat "$lock/transaction")" = "$transaction" ] || fail 'needs-attention:installation-locked'
  old_pid=$(/bin/cat "$lock/pid" 2>/dev/null || true)
  case "$old_pid" in ''|*[!0-9]*) fail 'needs-attention:installation-locked';; esac
  if /bin/kill -0 "$old_pid" 2>/dev/null; then fail 'needs-attention:installation-locked'; fi
  /bin/rm -f "$lock/pid" "$lock/transaction"
  /bin/rmdir "$lock" && /bin/mkdir "$lock" || fail 'needs-attention:installation-locked'
fi
/usr/bin/printf '%s\n' "$$" > "$lock/pid"
/usr/bin/printf '%s\n' "$transaction" > "$lock/transaction"
candidate_owned=0
replacement_started=0
cleanup() {
  # Only this process-created, owned staging directory is removable. Never clean
  # unknown pre-existing candidates, or recovery material after replacement began.
  if [ "$candidate_owned" -eq 1 ] && [ "$replacement_started" -eq 0 ] && [ -d "$candidate" ] && [ ! -L "$candidate" ] && [ "$(/usr/bin/stat -f %u "$candidate")" = "$(/usr/bin/id -u)" ]; then
    /bin/rm -rf "$candidate" || true
  fi
  /bin/rm -f "$lock/pid" "$lock/transaction"
  /bin/rmdir "$lock" 2>/dev/null || true
}
trap cleanup EXIT
trap 'phase "needs-attention:helper-interrupted"; exit 1' TERM INT HUP
[ ! -L "$target" ] && [ ! -L "$source_app" ] || fail 'needs-attention:symlink-app'
if [ ! -e "$target" ] && [ -d "$previous" ] && [ ! -L "$previous" ]; then
  # Previous package only; NEVER restore a database or launch an old app after a
  # new app may already have migrated data.
  last_phase=$(/bin/cat "$transaction/helper-status" 2>/dev/null || true)
  [ "$(/usr/bin/stat -f %u "$previous")" = "$(/usr/bin/id -u)" ] || fail 'needs-attention:unknown-previous-app'
  [ -f "$transaction/expected-app-id" ] && [ "$(/usr/libexec/PlistBuddy -c 'Print :CFBundleIdentifier' "$previous/Contents/Info.plist")" = "$(/bin/cat "$transaction/expected-app-id")" ] || fail 'needs-attention:unknown-previous-app'
  case "$last_phase" in backing-up-app|replacing-app)
    /bin/mv "$previous" "$target" || fail 'needs-attention:restore-app-failed'
    fail 'failed:interrupted-replacement-restored';;
    *) fail 'needs-attention:interrupted-transaction';;
  esac
fi
[ -d "$target" ] && [ -d "$source_app" ] || fail 'failed:missing-app'
[ -w "$(/usr/bin/dirname "$target")" ] || fail 'needs-attention:installation-not-writable'
[ ! -e "$candidate" ] || fail 'needs-attention:previous-transaction-present'
# Validated by the coordinator; enforce the shared identity again at the last boundary.
installed_id=$(/usr/libexec/PlistBuddy -c 'Print :CFBundleIdentifier' "$target/Contents/Info.plist")
candidate_id=$(/usr/libexec/PlistBuddy -c 'Print :CFBundleIdentifier' "$source_app/Contents/Info.plist")
[ "$installed_id" = "$candidate_id" ] || fail 'failed:application-identity-mismatch'
[ -f "$transaction/expected-app-id" ] && [ "$candidate_id" = "$(/bin/cat "$transaction/expected-app-id")" ] || fail 'failed:unexpected-application'
candidate_version=$(/usr/libexec/PlistBuddy -c 'Print :CFBundleShortVersionString' "$source_app/Contents/Info.plist")
[ -f "$transaction/expected-version" ] && [ "$candidate_version" = "$(/bin/cat "$transaction/expected-version")" ] || fail 'failed:unexpected-version'
/usr/bin/codesign --verify --deep --strict "$source_app" || fail 'failed:bundle-signature-invalid'
retired="$target.previous-retired"
# Keep at most two prior apps after installation. Only discard old, owned app bundles
# with the exact expected identity; unknown paths are left for human recovery.
if [ -e "$previous" ]; then
  for prior in "$previous" "$retired"; do
    if [ -e "$prior" ]; then
      [ ! -L "$prior" ] && [ -d "$prior" ] && [ "$(/usr/bin/stat -f %u "$prior")" = "$(/usr/bin/id -u)" ] || fail 'needs-attention:unknown-previous-app'
      [ "$(/usr/libexec/PlistBuddy -c 'Print :CFBundleIdentifier' "$prior/Contents/Info.plist")" = "$installed_id" ] || fail 'needs-attention:unknown-previous-app'
    fi
  done
  if [ -d "$retired" ]; then /bin/rm -rf "$retired" || fail 'failed:retired-app-cleanup'; fi
  /bin/mv "$previous" "$retired" || fail 'failed:previous-app-retention'
fi
phase 'staging'
/bin/mkdir "$candidate" || fail 'failed:stage-directory'
candidate_owned=1
/usr/bin/ditto "$source_app" "$candidate" || fail 'failed:stage-copy'
# ditto into our pre-created directory does not copy root xattrs on macOS.
# Preserve quarantine explicitly in binary-safe hex form; listing/read/write
# errors stop the transaction instead of treating an unreadable flag as absent.
source_attributes=$(/usr/bin/xattr "$source_app") || fail 'failed:source-security-attributes'
if /usr/bin/printf '%s\n' "$source_attributes" | /usr/bin/grep -Fxq 'com.apple.quarantine'; then
  source_quarantine=$(/usr/bin/xattr -px com.apple.quarantine "$source_app") || fail 'failed:source-quarantine-read'
  /usr/bin/xattr -wx com.apple.quarantine "$source_quarantine" "$candidate" || fail 'failed:staged-quarantine-write'
  staged_quarantine=$(/usr/bin/xattr -px com.apple.quarantine "$candidate") || fail 'failed:staged-quarantine-read'
  [ "$staged_quarantine" = "$source_quarantine" ] || fail 'failed:staged-quarantine-mismatch'
fi
/usr/bin/codesign --verify --deep --strict "$candidate" || fail 'failed:staged-signature-invalid'
[ "$(/usr/libexec/PlistBuddy -c 'Print :CFBundleShortVersionString' "$candidate/Contents/Info.plist")" = "$candidate_version" ] || fail 'failed:staged-version-changed'
phase 'waiting-for-exit'
attempt=0
while /bin/kill -0 "$parent_pid" 2>/dev/null; do
  attempt=$((attempt + 1))
  [ "$attempt" -le 60 ] || fail 'failed:exit-timeout'
  /bin/sleep 1
done
# Electron children can briefly outlive their main process. Wait until no process
# holds bundle files; do not rename while a process still depends on this copy.
attempt=0
while /usr/sbin/lsof -t +D "$target" > /dev/null 2>&1; do
  attempt=$((attempt + 1))
  [ "$attempt" -le 30 ] || fail 'failed:bundle-still-in-use'
  /bin/sleep 1
done
phase 'backing-up-app'
/bin/mv "$target" "$previous" || fail 'failed:backup-app'
replacement_started=1
phase 'replacing-app'
if ! /bin/mv "$candidate" "$target"; then
  if [ ! -e "$target" ] && /bin/mv "$previous" "$target"; then
    phase 'failed:replacement-restored'
    launch || true
  else
    phase 'needs-attention:restore-app-failed'
  fi
  exit 1
fi
phase 'launching'
if ! launch; then
  fail 'needs-attention:launch-failed'
fi
# LaunchServices accepting an open request does NOT establish application health.
phase 'awaiting-health'
health_attention() {
  phase "$1"
  # Reveal the private recovery guide/logs even when application JS never starts.
  /usr/bin/open "$transaction" || true
  exit 1
}
# Remain outside the application to diagnose Gatekeeper/pre-main failures.
# This watcher only records a result; it never rolls back data or bypasses OS checks.
attempt=0
while [ "$attempt" -lt 60 ]; do
  receipt="$transaction/health.json"
  if [ -e "$receipt" ] || [ -L "$receipt" ]; then
    [ ! -L "$receipt" ] && [ -f "$receipt" ] && [ "$(/usr/bin/stat -f %u "$receipt")" = "$(/usr/bin/id -u)" ] || health_attention 'needs-attention:invalid-health-receipt'
    outcome=$(/usr/bin/plutil -extract outcome raw -o - "$receipt") || health_attention 'needs-attention:invalid-health-receipt'
    confirmed_version=$(/usr/bin/plutil -extract version raw -o - "$receipt") || health_attention 'needs-attention:invalid-health-receipt'
    case "$outcome" in
      success)
        [ "$confirmed_version" = "$candidate_version" ] || health_attention 'needs-attention:health-version-mismatch'
        phase 'completed'
        exit 0;;
      manual) health_attention 'needs-attention:health-not-confirmed';;
      *) health_attention 'needs-attention:invalid-health-receipt';;
    esac
  fi
  attempt=$((attempt + 1))
  /bin/sleep 1
done
health_attention 'needs-attention:health-timeout'
