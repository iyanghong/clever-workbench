# 03: 下载并验证更新包

What to build: 点击下载并展示进度，通过校验后显示重启并更新。

Blocked by: 02

Status: ready-for-human

Completion: implemented

规格：[自更新](../spec.md)

- [x] 校验来源、SHA-256、架构、应用身份和压缩包安全。
- [x] 并发合并、错误重试，不安装不可信包。
- [x] 通过更新公共接口覆盖下载成功及失败。

## Verification

更新协调器公共操作测试覆盖成功下载、哈希不一致、包内链接越界、错误应用版本、非可信重定向、并发下载与待安装状态保护。生产验证使用系统 plutil、lipo、codesign；对下载包添加 quarantine，不绕过 Gatekeeper。真实公网发布包启动验收仍由 07 跟踪。

2026-10-19：实际 electron-builder macOS arm64 ZIP 经公共协调器下载流程验证成功，使用真实解压、framework 符号链接、plutil、lipo、codesign 和 xattr；该测试以 CWB_UPDATE_ZIP 环境变量启用。此证据仅证明原生包校验，不代表已通过公网 quarantine 启动验收。
