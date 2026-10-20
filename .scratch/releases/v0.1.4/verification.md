# v0.1.4 发布验证

日期：2026-10-20。用户明确要求在原 GitHub 仓库打包发布 v0.1.4。

## 源码与身份

- 发布源码为 `de3c49f79555b9083eb266dfb052c6a12a4e5c43`，应用与 lockfile 版本均为 0.1.4，已推送 origin/master。
- 包含 `91c073d` 的更新入口调整、更新面板美化、原生鼠标关闭修复，以及 v0.1.3 的账号显隐、台账资料复制等功能。
- 中文提交说明为「准备发布 v0.1.4，包含更新界面调整与关闭修复」。作者、提交者及 GitHub Release 发布账号均核对为 `ikuku-tt`。
- 已推送注释标签 `v0.1.4`；通过 GitHub API 解引用标签并确认指向上述源码。发布验证记录的后续文档提交不移动标签，也不改变资产来源。

## 本机验证

- 类型检查、生产构建和版本／标签一致性检查通过。
- 完整单元测试：28 个文件，133 项通过、3 项条件跳过。
- 设置真实发布 ZIP 后，更新下载专项 9 项全部通过，包含应用身份、版本、架构和原生签名验证。
- 真实 Electron 运行时解压与 HTTP 302 传输验证通过；后者为本地网络 fixture，不作为真实公网自动升级完成的证据。
- 最终 ZIP 解压出的 macOS 安装版完整桌面回归：52 项通过，1 项开发版专属测试按条件跳过。包含更新按钮条件显示、设置手动检查、关闭／重开／Esc／焦点，以及账号显隐和台账复制。
- ZIP 和 DMG 中的 app 均通过 `codesign --verify --deep --strict`；DMG 完整性检查通过。macOS 仍为 ad-hoc 签名，未 Apple 公证。
- Windows x64 NSIS 交叉构建通过，并解出实际安装器内容进行检查；应用为 x86-64，安装器使用正常的 32 位引导程序，未进行 Authenticode 签名。
- ZIP、DMG 和实际 Windows NSIS 载荷内的全部 22 个构建文件均与本轮构建逐字节一致，包内版本均为 0.1.4；包含条件更新入口与弹窗 `app-region: no-drag` 修复。
- 未在 Windows 11 实机验证本机交叉构建的安装器。没有操作真实资料目录或执行真实应用替换。

## 云端检查与限制

历史源码运行曾因 GitHub 账单／额度未启动，但本次源码运行已实际启动，不能沿用旧原因描述本轮结果。

[master 源码运行 39358829748](https://github.com/iyanghong/clever-workbench/actions/runs/39358829748) 的构建、打包和安装步骤完成，安装版回归结果如下：

| 平台 | 通过 | 失败 | 跳过 |
| --- | ---: | ---: | ---: |
| macOS runner | 50 | 2 | 1 |
| Windows runner | 48 | 2 | 3 |

两个平台均在相同位置失败：`account-list.spec.ts:121` 在打开详情后要求列表密码表头可见；`ledger-copy.spec.ts:175` 在编辑详情时悬停列表行。原有响应式样式在宽度不超过 1100px 且打开详情时隐藏列表。本机将最终安装版内容窗口设为 1000×700 后，复现了这两个相同位置和错误的失败；正常宽窗口下本机完整回归通过。此证据支持失败与测试依赖同时展示列表和详情有关，尚未读取云端 trace 确认实际窗口宽度，也未修复或将失败标为通过。跨平台迁移步骤因前置回归失败而未执行。

标签另触发 [Desktop checks 39359504916](https://github.com/iyanghong/clever-workbench/actions/runs/39359504916)，其结果以该运行页面和本地 `release/v0.1.4/cloud-final.json` 记录为准，不将本机验证当作云端通过。

为避免两套流程同时发布同一版本，主动取消重复的 [自动 macOS 发布任务 39359505022](https://github.com/iyanghong/clever-workbench/actions/runs/39359505022)，保留桌面检查运行。本 Release 使用上述本机已验证的 macOS 与 Windows 产物；云端回归失败情况也已写入 Release 说明。

## 正式资产与上传验证

```text
f56097e958638054a5c0908f41d1a8eb142f2b4571c44e187f4eeceeebc0acb2  Clever-Workbench-0.1.4-arm64.zip
2199a5279b14aa59eb4cabd42ad27f89d6378e24e3c0f762c4277506642323c1  Clever-Workbench-0.1.4-arm64.dmg
cd3706588a113bb7d04ab6215f804f39e1cb3e76806ac3686e59cd6b0071de7d  Clever-Workbench-0.1.4-x64.exe
```

三个安装包及 `SHA256SUMS` 先上传至同一个草稿，逐一核对远程大小、uploaded 状态与 GitHub 计算的 SHA-256。校验文件同时包含三个安装包，并通过授权 API 下载后与本机逐字节比对；私有 API 授权未转发给资产 CDN。全部核对通过后才公开发布，没有覆盖既有 Release 或资产。

正式版本：[v0.1.4](https://github.com/iyanghong/clever-workbench/releases/tag/v0.1.4)。Release ID 为 `417942933`，发布于 `2026-10-20T02:38:43Z`（北京时间 10:38:43）。已确认 `draft=false`、`prerelease=false`，latest API 返回 v0.1.4。

## 已安装旧版的真实检查

使用 `/Applications/Clever Workbench.app` 的实际 v0.1.3 可执行文件和全新隔离资料目录，通过现有本机读取授权调用真实私有 GitHub API，返回 `available`，目标版本 0.1.4、ZIP 名称和大小（128975080 字节）均与正式资产一致，品牌旁的条件更新按钮可见。

这次只验证正式版本发现和入口，没有执行下载、备份、应用替换或健康启动验收，没有把用户当前应用安装为 v0.1.4。历史真实 v0.1.1→v0.1.2 更新的 `needs-attention:health-timeout` 人工处理结果保持原记录，不能用本次发布或检查通过改写。
