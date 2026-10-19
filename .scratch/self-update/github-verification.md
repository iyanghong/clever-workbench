# GitHub 实际发布验收进度

日期：2026-10-19。仓库：iyanghong/clever-workbench。

## 已确认事实

- 通过当前电脑现有 GitHub HTTPS 凭据，仓库 API 返回 200；仓库为 private，默认分支 master。当前登录具备 push 权限，不具备 admin/maintain 权限。
- 继续实施之前的正式版本只有 v0.1.0，对应提交 6113a51。其 ZIP、DMG、Windows EXE 和 SHA256SUMS.txt 使用历史命名；该版本不含本轮更新器，不能作为自动更新基线。
- 无授权请求遇到共享出口限流；历史公开网页的 404 不足以证明仓库没有 Release。原先“没有公开 Release”的判断需区分访问权限。
- 已使用实际应用的凭据提供器重新请求 GitHub latest API，返回 200 和 v0.1.0。没有将访问令牌写入源码、安装包、文件或工具输出。

## 本轮改动与验证

- 固定源保持不变；更新器读取本机 Git 凭据助手，支持私有 Release 检查和资产 API 下载。
- 通过更新公共接口验证授权检查、私有资产下载和跨域跳转不携带 Authorization；这些单元测试使用明确的虚构凭据，不能替代实际网络验收。
- 现有完整安装包验收脚本增加 --github 模式，完全保留真实网络和检查时间；报告另行注明调用方提供旧包的来源仍需证据。
- v0.1.1 完整 ZIP 的 9 项下载测试通过（含真实 bundle 校验），真实 Electron 解压及 ASAR 验证通过。
- 未改动请求或响应的 v0.1.1 正式安装版进程成功通过公开 IPC 检查接口读取该私有仓库；记录为 `up-to-date`，时间 `2026-10-19T12:09:08.164Z`。独立进程内诊断确认系统代理生效、本机凭据可读，真实 API 返回 200、tag 为 v0.1.0。检查报告：`/var/folders/73/c35nxr410f11hfh3ls36xjlc0000gn/T/cwb-github-check-GBQsVR/github-check.json`。
- 前两次安装版联网尝试返回网络检查失败，随后重试成功；未改写产品响应或强行将失败判为成功。真实资产下载尚未由此证明。
- 按 `code-review` 技能对 `cf9f4c4...61ffcdd` 进行 Standards 与 Spec 两项并行审查，均无发现；审查不代替真实发布验收。
- 两个版本的 ZIP、DMG 和对应 SHA256SUMS 均已本地生成并重新校验，v0.1.2 ZIP 也通过真实 Electron ASAR 解压及原生 bundle 校验。文件名称、大小、散列和拟用发布说明见[发布准备](release-plan.md)。
- 完整单元测试：26 个文件通过，117 项通过、1 个需要真实包环境的条件跳过；v0.1.1 真实包下载测试另行 9 项通过。v0.1.2 完整安装版桌面测试：43 项通过，1 个开发版专属测试跳过。`npm run build` 含类型检查，通过。
- 使用本地 v0.1.1 安装版和 v0.1.2 ZIP 执行完整安装验收脚本，退出 0。真实完整加密备份能恢复文档及 1 像素附件，旧应用 `.previous` 保留，隔离属性为 `0083;6ad60a28;Clever Workbench;`。新版未产生健康回执，助手 60 秒后记录 `needs-attention:health-timeout`，结果为 manual 并提供恢复说明。报告：`/var/folders/73/c35nxr410f11hfh3ls36xjlc0000gn/T/cwb-installed-update-ekUETL/report.json`。这是本地网络 fixture，`gitHubTransportVerified` 和 `publicGitHubReleaseVerified` 均为 false，不能用来勾选真实发布升级验收。

## 验收完成状态

维护者确认后，已在同一私有仓库发布 v0.1.1、v0.1.2，并从实际发布基线完成真实网络更新。下载来源、SHA-256、加密备份恢复、原位替换及隔离属性均有证据；启动为明确人工处理，不能称为健康无人值守升级。草稿及最初本地候选未被当作已发布基线，私有授权验证也未被标为匿名公开下载。具体发布过程和实验结果见下文。

## 发布确认后的发现与修正

- 用户回复“确认”授权发布 v0.1.1、v0.1.2。现有 HTTPS Token 不允许修改 workflow；改用本机已有 SSH 登录推送，无需新增令牌或改变配置。
- 首次发布运行 39253084500 在安装版测试处停止：42 通过、1 个开发版专属跳过，小屏任务详情遮住批量按钮导致一项超时。本机固定 1024×768 后复现同样错误，调整为先关闭详情再操作清单后通过。Windows 的 POSIX 安装事务测试增加平台边界，可移植的历史和资料测试继续运行。修正提交 7967e64。
- 原生真实私有资产预检进一步复现 `net.fetch` 的 `redirect: manual` 失败。通过协调器公开检查／下载接口构造原生 HTTP 302 和完整 ZIP，先观察到 `error: Redirect was cancelled`，修复为 `net.request` 单跳探测后回归通过。修复提交 9f40252、7014c86；正文采用原生 fetch 流，避免原生事件桥接无界缓存。该回归加入发布门槛。
- 第二次发布运行 39255739600 在真实跳转问题调查期间主动取消，未产生正式 Release。两次更新 tag 前均确认不存在已发布 v0.1.1/v0.1.2，没有覆盖已发布版本。最终 v0.1.1 tag 指向 709715b，v0.1.2 tag 指向含工作流修复的 1f36c04。
- 使用最终原生传输代码，实际下载私有仓库已发布 v0.1.0 的资产 655692628：128800872 字节，SHA-256 为 `4bc37bf3b670a2a77d5b356389a699ec55db518bc9a4c7383c7b8d42c0c1122c`，匹配 GitHub 元数据。API 302 携带授权，CDN 200 不携带授权，无网络拦截、无临时调试日志。报告：`/private/var/folders/73/c35nxr410f11hfh3ls36xjlc0000gn/T/cwb-private-fixed-eA0ApH/report.json`。这是下载预检，旧版不含更新器，仍不能代替版本对验收。
- 测试修正与原生传输分别接受 Standards／Spec 并行审查。审查提出的原生事件队列无界缓冲风险已修正并复核，最终两项均为 0 个残留发现。
- 本地重跑完整桌面测试曾在并行启动原生探测进程时出现一项“应用更新”对话框遮挡；当时的桌面交互影响未单独确证。结束并行原生进程后单独重跑该剪贴板测试通过（32.9 秒）。最终按串行桌面会话重跑完整安装版测试：43 项通过、1 个开发版专属跳过；最新完整单元测试为 117 项通过、1 个真实包条件跳过。修复后新生成的 v0.1.2 ZIP 也通过原生 302 与完整包校验回归。

## 正式发布与基线来源

- v0.1.1：[Release](https://github.com/iyanghong/clever-workbench/releases/tag/v0.1.1)，提交 `709715b5e3b26cf45a46fab6f06c72768ebdb614`，Release ID 417328711，发布时间 `2026-10-19T13:40:08Z`。
- [运行 39259870691](https://github.com/iyanghong/clever-workbench/actions/runs/39259870691) 的所有构建、测试与真实包验证门槛通过；最后一步上传完三个资产后，按 tag 读取 Draft 返回 404，因此整次运行仍为 failure。使用 Release 数字 ID 重读，核对上传状态、大小、GitHub 计算的 SHA-256 和实际下载的 SHA256SUMS 后，使用本机现有凭据完成发布。对应工作流修正 `1f36c04` 已通过 Standards 与 Spec 独立审查。
- 从正式 v0.1.1 Release 重新下载校验清单和 ZIP，未复用旧本地候选；解压后核对 `0.1.1`、原生签名。来源凭证：`release/acceptance/github/v0.1.1/baseline-origin.json`，时间 `2026-10-19T13:45:22.675Z`，`realGitHubDownload: true`、`transportInterception: false`。基线由验收脚本直接启动可执行文件，不据此声称首次 DMG 安装已获 Gatekeeper 许可。

| v0.1.1 资产 | ID | 字节数 | SHA-256 |
| --- | ---: | ---: | --- |
| Clever-Workbench-0.1.1-arm64.zip | 656367096 | 128900228 | c2f329d69c539ff411d9dc6793a694e3bb76be39135b3b47b7d8f4e8fee3279a |
| Clever-Workbench-0.1.1-arm64.dmg | 656367089 | 129549565 | 59f3d29d6e3291a067ef32e4671bd91de05a0b6d7547e5a50c0e82399f502761 |
| SHA256SUMS | 656367092 | 198 | 7b15a72c368cbfd077883793f2685af4ce6e2ed7ea6512ac3051359583fc66c5 |

v0.1.2：[Release](https://github.com/iyanghong/clever-workbench/releases/tag/v0.1.2)，提交 `1f36c04ab78ff88812518625bc6ca2a3e60b93c5`，Release ID 417352487，发布时间 `2026-10-19T13:55:45Z`。上传完整资产后核对远程大小、GitHub 散列，并重新下载 SHA256SUMS 与本机内容逐字匹配，再将 Draft 发布为 latest；未覆盖任何已发布资产。来源和门槛记录见 `release/acceptance/github/v0.1.2/pre-publication.json`、`publication.json`；实际 latest API 返回 v0.1.2 的记录见 `latest.json`。

| v0.1.2 资产 | ID | 字节数 | SHA-256 |
| --- | ---: | ---: | --- |
| Clever-Workbench-0.1.2-arm64.zip | 656423725 | 128914853 | 6d2b65e261ac86d0d6ee4e69e6ee57e321e2f5a11d21ad70f5e1bf2793909196 |
| Clever-Workbench-0.1.2-arm64.dmg | 656424676 | 129556338 | a80efee64f2ee37ca7eb3f0b56994855309863a39e56f82f339ac28de4af85ce |
| SHA256SUMS | 656426716 | 198 | 79d6e78483878d332e88f69f0886366d9a4234c947d0960c270da1f70c38ee75 |

## 实际 v0.1.1 → v0.1.2 升级结果

使用已从 GitHub 重新下载并证明来源的基线，以 `scripts/verify-installed-update.mjs --github OLD_APP 0.1.2` 运行，退出 0。没有拦截 API、资产内容或检查时间。报告：`/var/folders/73/c35nxr410f11hfh3ls36xjlc0000gn/T/cwb-installed-update-Sd7RMK/report.json`，本地副本 `release/acceptance/github/v0.1.2/real-upgrade-report.json`。

- 更新事务：`d59b22be-19d3-4f7d-bb5d-7eef650e10fc`，创建于 `2026-10-19T13:56:33.342Z`，起止版本 `0.1.1` → `0.1.2`。
- 实际更新器下载的 `staging/release-idyvti/update.zip` 为 128914853 字节，SHA-256 `6d2b65e261ac86d0d6ee4e69e6ee57e321e2f5a11d21ad70f5e1bf2793909196`，与正式资产 656423725 一致；不是将本机 ZIP 复制进测试流程。
- 同一安装位置替换后为 0.1.2，保留的 `.previous` 为 0.1.1，两者原生签名均验证通过。更新包隔离属性保持为 `0083;6ad62190;Clever Workbench;`。
- 无主密码时拒绝安装；配置隔离测试主密码后生成新的完整加密备份。另一个完整安装版在新的资料目录恢复后，文档标题匹配、附件图片自然宽度为 1。
- 新版没有健康回执，独立助手 60 秒后记录 `needs-attention:health-timeout`、`observed: manual`。保留旧应用、加密备份及应用外的 `RECOVERY.txt`；未绕过隔离属性或将此状态标为成功。
- `gitHubTransportVerified: true`，`publicGitHubReleaseVerified: false`。基线直接执行文件的启动方式不证明首次安装获系统许可。所有本次可丢弃应用进程已停止。

组合证据 `release/acceptance/github/real-upgrade-evidence.json` 于 `2026-10-19T13:58:20.970Z` 再次核对已发布资产散列、基线来源、两个原位版本、原生签名、恢复说明和进程清理。关键数据已同步到本文件；原始大文件保留在本机验收目录。

## 云端执行限制

v0.1.2 的[发布运行 39262632366](https://github.com/iyanghong/clever-workbench/actions/runs/39262632366) 和同次桌面矩阵因账户账单／支出限额未启动任何步骤。原始注释记录在 `release/acceptance/github/v0.1.2/ci-unavailable.json`。本机最终应用与 v0.1.2 tag 的应用代码、脚本、测试和依赖文件完全一致；完整本机测试通过后，再核对实际资产并发布，不将被阻止的云端运行记为成功。

另有一项独立的 Windows 迁移夹具限制：[运行 39255739598](https://github.com/iyanghong/clever-workbench/actions/runs/39255739598) 中 Windows 单元测试和桌面测试通过，但 `Import Mac fixture and export on actual Windows runner` 的旧 manifest 比对失败；实际输出包含现有迁移推导的部署节点及任务历史字段等差异，尚未修正其兼容性预期。对应 macOS 矩阵通过。本次没有放宽该断言，也不宣称所有跨平台 CI 均通过。macOS 自更新的完整备份恢复实验独立执行。
