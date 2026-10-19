# 06: 生成可供更新使用的 Release

What to build: tag 驱动生成 arm64 ZIP、DMG 和校验清单并在资产齐备后公开。

Blocked by: 01、03

Status: ready-for-human

Completion: implemented; remote publication not executed

规格：[自更新](../spec.md)

- [x] 版本/tag 一致，必要测试通过。
- [x] 客户端与资产协议一致，不内置令牌。
- [x] 先验证构建流程，未获额外授权不发布真实公开版本。

## Verification

2026-10-19：发布 CLI 的 tag 不匹配、缺失资产、上传完整性门槛及成功路径测试通过。实际构建同版本 arm64 ZIP/DMG，prepare-release 生成 SHA256SUMS 并通过 shasum 校验；ZIP 通过原生包校验（包括签名、framework 链接和 quarantine 写入），已安装应用版本入口真实 Electron 测试通过。检查实际 ad-hoc entitlements 包含 disable-library-validation。构建所需下载使用本机系统代理，仅作用于命令环境。

已提供正式 tag 工作流：测试与打包通过后创建 Draft、完整上传并验证，再公开。未推送 tag、未创建远程 Release；实际 GitHub Actions 执行及公网升级证据由 07 跟踪。
