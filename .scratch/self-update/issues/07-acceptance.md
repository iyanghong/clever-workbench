# 07: 完成真实发布版本之间的升级验收

What to build: 真实安装包与 GitHub 下载升级验证和交付记录。

Blocked by: 05、06

Status: ready-for-human

Completion: partial — private GitHub checks, local builds and regression verification prepared; waiting for maintainer confirmation to publish the v0.1.1/v0.1.2 pair before real asset transport and upgrade acceptance.

规格：[自更新](../spec.md)

- [x] 验证资料保留、备份恢复、替换失败及系统拦截。
- [x] 明确区分本地验证与真实公网发布验证。
- [x] 缺少发布资产或权限时准确记录未验证项，不虚报通过。
- [x] 保留同一私有仓库，完成本机凭据检查及两个待发布安装包的准备和审查。
- [ ] 同一私有仓库通过本机 GitHub 凭据检查及下载，凭据不随资产重定向泄露。
- [ ] 两个实际已发布、带更新器的安装版本完成真实网络更新验收，保留基线资产来源和 SHA-256 证明。

## Verification and remaining work

See [acceptance evidence](../acceptance.md). Full installed-app harness exit 0 verified real encrypted backup/restore including an image, replacement, retained quarantine, and independent-helper `needs-attention:health-timeout` with recovery instructions. This machine did not confirm a healthy LaunchServices restart of the quarantined new application; it correctly reported manual intervention. Installed version/health/history UI checks: 3 passed, 1 expected development-only skip.

No public release was created. Validate a real published old/new release pair and actual GitHub asset transport before declaring release acceptance complete. The full harness uses an explicitly documented local transport fixture and cannot establish that public result.

## Comments

2026-10-19：继续实施时使用现有 GitHub 登录读取仓库，确认其为 private；有推送权限，无管理员权限。现有正式 Release v0.1.0 的资产仍是历史命名且不含更新器。用户要求继续使用同一仓库，保留私有属性，补充本机凭据授权和不替换网络响应的真实验收模式。

2026-10-19：私有授权支持已提交为 61ffcdd，真实安装版经公开 IPC 检查接口成功访问该仓库。两个待发布版本、资产校验值及拟用发布说明见[发布准备](../release-plan.md)，授权边界和实测见[GitHub 验收进度](../github-verification.md)，双轴审查见[审查记录](../review-private-github.md)。根据发布文档和任务 06 的既定要求，未额外获得发布确认前不推送触发正式发布的 tag；当前状态表示等待此项人工确认，不表示任务全部完成。
