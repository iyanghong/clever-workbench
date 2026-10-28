# v0.1.11 本机安装恢复验收

Status: resolved

日期：2026-10-21。验收方式：人工安装恢复与真实在线检查。

## 问题与范围

用户在 v0.1.7 中点击安装更新时收到只读隔离位置提示。实际应用进程位于 macOS 的 `AppTranslocation` 目录，`resolveUpdateTarget` 对该运行路径返回了同一错误；`/Applications` 中存在同名副本，并不代表当时进程从该副本运行。

本次通过 Finder 恢复正式安装位置，没有修改应用源码、安装助手或发布流程，也没有创建新版本。处理依据见[发布与安装恢复说明](../../docs/releases.md)。

## 安装来源与恢复步骤

- 使用 [GitHub 正式发布的 v0.1.11](https://github.com/iyanghong/clever-workbench/releases/tag/v0.1.11) 中的 `Clever-Workbench-0.1.11-arm64.dmg`。
- 安装包大小为 130376484 字节，SHA-256 为 `a2a242bc9ecfe97c32685a1b1e8da085a8a7311877d02b946714f8a7e198f5a3`，与 GitHub 资产摘要及下载的 `SHA256SUMS` 一致。
- 磁盘映像校验、应用身份与版本核对，以及 `codesign --verify --deep --strict` 均通过。
- 正常退出旧应用后，保留旧应用和本地资料恢复副本；10 个资料文件的副本逐一核验一致。
- 经 Finder 将正式应用复制到“应用程序”并替换现有副本，安装后的 `app.asar` 与正式映像中的文件散列一致。
- 保留 macOS 隔离与授权机制，未移除 quarantine 或关闭 Gatekeeper；验证结束后卸载安装映像。

## 实际验收结果

- 用户解锁 Mac 后，新版窗口及原有资料正常加载，界面显示 v0.1.11。
- 实际进程从 `/Applications/Clever Workbench.app/Contents/MacOS/Clever Workbench` 运行，安装位置检查通过，不再位于 `AppTranslocation`。
- 恢复副本与新版当前资料的 11 张业务表记录数量一致。
- 在“设置 → 关于”中手动触发真实在线检查，观察到“正在检查更新”转为“已是最新版本”，当前没有需要安装的正式更新。
- “上次更新”中的旧隔离失败信息继续作为历史记录保留，没有改写为更新健康成功。

原始安装验证记录和截图保留在本机 `release/current-install/v0.1.11/installation.json` 与 `release/current-install/v0.1.11/update-check-verified.png`；旧应用与资料恢复材料的位置记录在前者中。这些本机产物未纳入本次 Git 提交。

## 验证边界

本记录证明人工安装恢复、正式位置启动、资料数量保持及在线版本检查通过。由于 v0.1.11 当时已是最新版本，没有重新执行真实版本之间的自动替换、自动重启与健康确认，不能将本次恢复记为无人值守升级成功。
