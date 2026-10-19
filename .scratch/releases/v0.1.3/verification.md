# v0.1.3 发布验证

日期：2026-10-20。用户授权先拉取最新代码，再提交推送并重新打包 macOS 和 Windows，发布 GitHub Release。

## 源码

- 拉取远程 master 至 `491e989`，保留其应用自更新功能；合并本地 `6abe24a`（账号显隐与整行复制）、`d8618eb`（台账资料复制）。
- 唯一冲突位于 `src/styles.css`，双方分别追加账号／资料复制样式与更新样式，均保留。合并提交 `062251a`。
- 应用和 lockfile 版本同步升至 0.1.3，发布源码提交 `ef0e95a2e00040176abfc50b860a2afd84b83ddd`，已推送 origin/master。

## 本机验证

- Node.js 24.22.0；类型检查、生产构建通过。
- 28 个单元测试文件通过，133 项通过、3 项条件跳过（两项 ZIP 专项及一项真实更新包验证）。
- 设置 CWB_UPDATE_ZIP 后，9 项更新下载测试全部通过，包含实际包签名、架构、应用身份验证。
- 原生 Electron ASAR 解压验证、HTTP 302 更新传输 fixture 及真实 ZIP 校验通过。这是本地网络 fixture，不等于新版本的真实公网更新全链路验收。
- 从最终 ZIP 解压出的 macOS 应用通过 50 项桌面测试；1 项仅开发版适用的测试按条件跳过。
- macOS app 深度签名校验和 DMG 完整性校验通过。仍为 ad-hoc 签名，未 Apple 公证。
- Windows x64 NSIS 交叉打包通过；主程序架构为 x86-64，安装器含 32 位引导程序。安装器无 Authenticode 证书。
- 两平台包内所有 dist-electron/*.cjs、页面入口与本次构建逐字节匹配，包内版本均为 0.1.3。
- 未进行 Windows 11 实机安装或运行验证；未操作真实工作台资料目录。

## 发布来源与云端状态

使用本机已验证产物手动发布。最近完成的远程运行因账单／支出限额未启动，本次 master 推送的 [39283292617](https://github.com/iyanghong/clever-workbench/actions/runs/39283292617) 在上传时仍为 queued；不把本机验证记为云端 CI 通过。

## 发布资产

```text
97f5ca2fbc76201d1fcd40138d7d5f15065044f3e02bb1d37ada700bbea8a67a  Clever-Workbench-0.1.3-arm64.zip
92052f82de030170ad3475ce30cce18c746ed56929031e71c6f33264716a780f  Clever-Workbench-0.1.3-arm64.dmg
24913c897ab8da0a9d8e73c5d57e057d7f97237c72c0ba35bb15255459c58744  Clever-Workbench-0.1.3-x64.exe
```

校验清单同时包含 macOS ZIP、DMG 和 Windows EXE；ZIP 命名与现有自更新接口匹配。发布前核对远程每个资产大小、上传状态、GitHub 计算的 SHA-256，并下载远程 SHA256SUMS 与本机逐字节比对。全部核对通过。正式 Release 已发布并设为 latest：

https://github.com/iyanghong/clever-workbench/releases/tag/v0.1.3

已验证 isDraft=false、isPrerelease=false，latest API 返回 v0.1.3。GitHub Release 数字 ID：417493187。发布资产未覆盖旧版本。上传连接曾重试，最终三个安装包及校验文件均逐一核对通过。
