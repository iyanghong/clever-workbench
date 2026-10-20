#!/bin/bash
# Finder starts Terminal with an unrelated working directory and a limited PATH.
set -u
cd -- "$(dirname -- "${BASH_SOURCE[0]}")" || exit 1
export PATH="/opt/homebrew/bin:/usr/local/bin:$PATH"

finish() {
  result=$?
  trap - EXIT
  if [[ $result -ne 0 ]]; then
    printf '\n发布未完成，请查看上方错误和日志。\n'
  fi
  if [[ -t 0 ]]; then
    printf '\n按回车键关闭此窗口……'
    IFS= read -r _ || true
  fi
  exit "$result"
}
trap finish EXIT
if [[ "$(uname -s)" != "Darwin" ]]; then
  printf '此双击入口仅支持 macOS。\n' >&2
  exit 1
fi
if ! command -v node >/dev/null 2>&1; then
  printf '请先安装 Node.js 24.15 或更新版本（建议 24 LTS），再双击运行。\n' >&2
  exit 1
fi
if ! command -v git >/dev/null 2>&1; then
  printf '请先安装 Git／Xcode Command Line Tools，再双击运行。\n' >&2
  exit 1
fi
node scripts/publish-release.mjs "$@"
