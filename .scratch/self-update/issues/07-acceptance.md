# 07: 完成真实发布版本之间的升级验收

What to build: 真实安装包与 GitHub 下载升级验证和交付记录。

Blocked by: 05、06

Status: ready-for-human

Completion: verified — published private v0.1.1 → v0.1.2 over real GitHub transport, with backup/restore, same-location replacement and retained quarantine; startup outcome is explicitly manual, not healthy unattended success. Cloud publication limitations are recorded separately.

规格：[自更新](../spec.md)

- [x] 验证资料保留、备份恢复、替换失败及系统拦截。
- [x] 明确区分本地验证与真实公网发布验证。
- [x] 缺少发布资产或权限时准确记录未验证项，不虚报通过。
- [x] 保留同一私有仓库，完成本机凭据检查及两个待发布安装包的准备和审查。
- [x] 同一私有仓库通过本机 GitHub 凭据检查及下载，凭据不随资产重定向泄露。
- [x] 两个实际已发布、带更新器的安装版本完成真实网络更新验收，保留基线资产来源和 SHA-256 证明。

## Verification and limitations

See [acceptance evidence](../acceptance.md) and [GitHub asset/source evidence](../github-verification.md). The real `--github` run exited 0: the baseline was independently downloaded from published v0.1.1, and the normally running updater downloaded published v0.1.2 without interception. Its ZIP SHA-256 matches the remote asset. Same-location versions are 0.1.2 and previous 0.1.1; actual encrypted backup restore returned the saved document and rendered image, while quarantine remained present.

The helper recorded `needs-attention:health-timeout` with recovery instructions; no healthy LaunchServices receipt was observed. This completes the accepted manual-handling path, not unattended startup. The repository remains private, so anonymous public downloads are not claimed. `ready-for-human` reflects the manual startup/review outcome, not unfinished agent-side network testing.

v0.1.1 passed CI build/test/package gates and was finalized locally after a draft lookup failed. v0.1.2 was published from locally verified artifacts because GitHub billing/spending limits prevented its CI jobs from starting. A separate Windows legacy migration fixture still has a manifest comparison failure; no all-platform green-CI claim is made.

## Comments

2026-10-19：继续实施时使用现有 GitHub 登录读取仓库，确认其为 private；有推送权限，无管理员权限。现有正式 Release v0.1.0 的资产仍是历史命名且不含更新器。用户要求继续使用同一仓库，保留私有属性，补充本机凭据授权和不替换网络响应的真实验收模式。

2026-10-19：私有授权支持已提交为 61ffcdd，真实安装版经公开 IPC 检查接口成功访问该仓库。两个待发布版本、资产校验值及拟用发布说明见[发布准备](../release-plan.md)，授权边界和实测见[GitHub 验收进度](../github-verification.md)，双轴审查见[审查记录](../review-private-github.md)。根据发布文档和任务 06 的既定要求，未额外获得发布确认前不推送触发正式发布的 tag；当前状态表示等待此项人工确认，不表示任务全部完成。

2026-10-19：用户回复“确认”，授权发布 v0.1.1、v0.1.2 并继续真实升级验收。HTTPS Token 不具备 workflow scope，未修改凭据配置；使用本机已有 SSH 登录成功推送 feat/self-update 和 v0.1.1。发布运行：39253084500。未修改仓库私有属性。

2026-10-19：首次云端小屏测试失败和原生 302 问题分别经复现后修复；第二次发布运行主动取消，未发布半成品。通过真实私有 v0.1.0 资产验证最终下载传输和散列后，重新发布 v0.1.1（709715b），当前运行 39259870691。完整过程、审查及历史候选归档见 GitHub 验收进度。

2026-10-19：维护者确认后已正式发布 v0.1.1（709715b）和 v0.1.2（1f36c04）。从真实已发布基线完成网络更新，报告 `/var/folders/73/c35nxr410f11hfh3ls36xjlc0000gn/T/cwb-installed-update-Sd7RMK/report.json`，事务 `d59b22be-19d3-4f7d-bb5d-7eef650e10fc`。真实下载、校验、保存备份、原位替换、隔离属性和恢复通过；健康结果明确为人工处理。来源、SHA-256、CI 局限和完整报告均已记录。
