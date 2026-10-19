# 07: 完成真实发布版本之间的升级验收

What to build: 真实安装包与 GitHub 下载升级验证和交付记录。

Blocked by: 05、06

Status: ready-for-human

Completion: partial — local full-application acceptance passed with explicit manual system-limit outcome; real public GitHub Release acceptance remains unverified.

规格：[自更新](../spec.md)

- [x] 验证资料保留、备份恢复、替换失败及系统拦截。
- [x] 明确区分本地验证与真实公网发布验证。
- [x] 缺少发布资产或权限时准确记录未验证项，不虚报通过。

## Verification and remaining work

See [acceptance evidence](../acceptance.md). Full installed-app harness exit 0 verified real encrypted backup/restore including an image, replacement, retained quarantine, and independent-helper `needs-attention:health-timeout` with recovery instructions. This machine did not confirm a healthy LaunchServices restart of the quarantined new application; it correctly reported manual intervention. Installed version/health/history UI checks: 3 passed, 1 expected development-only skip.

No public release was created. Validate a real published old/new release pair and actual GitHub asset transport before declaring release acceptance complete. The full harness uses an explicitly documented local transport fixture and cannot establish that public result.
