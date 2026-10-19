# 06: 生成可供更新使用的 Release

What to build: tag 驱动生成 arm64 ZIP、DMG 和校验清单并在资产齐备后公开。

Blocked by: 01、03

Status: ready-for-human

Completion: implemented; real assets published after verification, with local finalization. Fully automatic cloud publication remains unconfirmed because v0.1.1 draft lookup failed and v0.1.2 jobs could not start due to billing/spending limits.

规格：[自更新](../spec.md)

- [x] 版本/tag 一致，必要测试通过。
- [x] 客户端与资产协议一致，不内置令牌。
- [x] 先验证构建流程，未获额外授权不发布真实公开版本。

## Verification

2026-10-19：发布 CLI 的 tag 不匹配、缺失资产、上传完整性门槛及成功路径测试通过。实际构建同版本 arm64 ZIP/DMG，prepare-release 生成 SHA256SUMS 并通过 shasum 校验；ZIP 通过原生包校验（包括签名、framework 链接和 quarantine 写入），已安装应用版本入口真实 Electron 测试通过。检查实际 ad-hoc entitlements 包含 disable-library-validation。构建所需下载使用本机系统代理，仅作用于命令环境。

已提供正式 tag 工作流：测试与打包通过后创建 Draft、完整上传并验证，再发布。首次实施时未推送 tag；维护者后续确认后的远程执行和网络升级证据由 07 跟踪。

2026-10-19：v0.1.1 云端构建、单元测试、原生包与 302 回归、安装版桌面测试通过；三个资产上传后按 tag 读取 Draft 返回 404，使用数字 ID 验证散列及实际清单后由本机完成发布。修正 `1f36c04` 改用 Release ID，双轴审查均无发现。v0.1.2 因 GitHub 账户账单／支出额度限制未启动任何云端步骤；本机最终应用代码与 tag 一致，完整测试和真实包验证通过，上传及核对远程大小、散列、校验清单后发布。两个版本均有 ZIP、DMG 和 SHA256SUMS，仓库仍私有；不把人工补完或被阻止的运行记为自动发布成功。详见[发布证据](../github-verification.md)。
