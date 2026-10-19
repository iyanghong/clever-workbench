# 02: 检查 Release 并展示更新入口

What to build: 侧栏版本徽标和详情，启动及每 30 分钟检查固定仓库，提供手动检查。

Blocked by: 无

Status: ready-for-human

Completion: implemented

规格：[自更新](../spec.md)

- [x] 区分无更新、错误、无 Release、不支持模式。
- [x] 正式版本比较和兼容资产选择通过更新接口测试。
- [x] UI、类型化 IPC 与主进程协调器形成完整行为。

## Verification

更新操作接口测试覆盖版本比较、稳定版过滤、兼容资产、开发模式、网络失败、限流重试与并发缓存。固定资产协议为 Clever-Workbench-<version>-arm64.zip 和 SHA256SUMS。开发版界面通过真实 Electron 测试验证。
