# 04: 保存、备份并完成自动安装

What to build: 保存和完整加密备份后独立助手替换运行位置的完整应用并启动。

Blocked by: 01、03

Status: ready-for-human

Completion: implemented and verified; health confirmation and recovery presentation continue in ticket 05.

规格：[自更新](../spec.md)

- [x] 保存或备份失败不退出不替换。
- [x] 无主密码阻止安装，备份期间阻止新写入。
- [x] 跨进程安装锁、阶段记录与替换失败恢复。
- [x] 不移除 quarantine，不绕过系统安全。

## Verification

- Update operation tests cover saving failure, backup refusal, coalesced clicks, and real encrypted backup/restore of the final edit despite a recent automatic backup.
- Main waits pending operations before flush, freezes new operations after flush, then waits idle and creates a required backup. A rejected pending operation aborts the update.
- Helper stages and validates before reporting readiness; the app quits only after that acknowledgement. The helper is copied outside the installed bundle and recorded in a private transaction directory.
- Real macOS run `node scripts/verify-macos-update.mjs` passed replacement/relaunch, actual filesystem rename refusal/restoration, and interrupted replacement recovery without automatically launching old data. Evidence directory: `/var/folders/73/c35nxr410f11hfh3ls36xjlc0000gn/T/clever-update-experiment-PadJOg`.
- Typecheck and targeted update/preload tests passed (20 passed, 1 existing Linux-only permission test skipped on macOS). Build passed. GitHub-downloaded Gatekeeper acceptance remains ticket 07.
