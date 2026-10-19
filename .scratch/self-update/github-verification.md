# GitHub 实际发布验收进度

日期：2026-10-19。仓库：iyanghong/clever-workbench。

## 已确认事实

- 通过当前电脑现有 GitHub HTTPS 凭据，仓库 API 返回 200；仓库为 private，默认分支 master。当前登录具备 push 权限，不具备 admin/maintain 权限。
- 实际已发布正式版本只有 v0.1.0，对应提交 6113a51。其 ZIP、DMG、Windows EXE 和 SHA256SUMS.txt 使用历史命名；该版本不含本轮更新器，不能作为自动更新基线。
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

## 尚待完成

需要准备两个含更新器的正式版本，在同一私有仓库形成可读取的已发布版本对，再验证真实资产来源、校验、备份、替换和启动结果。草稿及本地版本不算已发布版本。记录将分别注明网络验证和健康启动／人工处理结果，不将私有授权验收标为匿名公开验收。维护者确认前仅准备安装包及[发布计划](release-plan.md)，不推送触发发布的 tag。
