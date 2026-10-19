# Clever Workbench 一键自更新研究

研究日期：2026-10-19  
范围：以 Apple Silicon macOS 为首发平台，从 GitHub Releases 检查并安装 Clever Workbench 的最新正式版本。本文只做研究和方案比较，不实现功能。

## 结论

Clever Workbench 应使用 `electron-updater` + electron-builder 的 GitHub provider，不应照搬 sub2api 的“下载压缩包后替换当前可执行文件”。sub2api 是一个由外部 supervisor 重启的单二进制服务；Clever Workbench 是带签名、bundle、framework 和 helper 进程的 macOS 应用。Electron 官方更新链路会处理发布元数据、架构选择、下载校验、macOS Squirrel 安装和重启，更适合当前工程。

首版可实现用户想要的主要体验：启动时和每 30 分钟静默检查、头像附近显示版本状态、有更新时高亮、点击后下载、显示进度、下载完成后由用户立即重启安装、下次启动执行健康确认、记录最近 30 次检查/下载/安装结果。需要先完成正式发布基础设施：Developer ID 签名、公证、GitHub Release 工作流、更新元数据和版本发布规则。

“失败自动回滚”需要拆成两层理解：

- 下载、校验或安装前失败：保持当前版本，`electron-updater` 的正常流程可以满足。
- 新版本已经替换，但无法启动或启动后健康检查失败：应用本身可能已经无法运行，Electron/electron-builder 没有提供完整的自动回滚事务。若此项必须无人值守完成，需要一个独立于应用 bundle 的 launcher/watchdog，负责启动超时、恢复旧 bundle 并重新启动。仅在应用内部保留“恢复上一版本”按钮不能覆盖“新版本根本启动不了”的情况。

此外，应用数据也会限制回滚。当前数据库在打开时拒绝比程序支持版本更高的 schema（[`electron/store.ts`](../../electron/store.ts)）；如果新版本执行了不可逆迁移，旧版本即使恢复成功也可能打不开数据。因此任何“应用回滚成功”的定义都必须同时规定数据迁移兼容策略和更新前备份。

## sub2api 的真实做法

本次检查的源码为 `Wei-Shaw/sub2api` 的 `main` 分支提交 `b0a02a3304a0a78cdd003ddda1dd23ba02c03084`（2026-10-16，版本 0.2.17），本地副本位于 `/tmp/sub2api-inspect.ejhUEH`；远端 `main` 与该提交一致。

### 检测版本

sub2api 后端请求 GitHub REST API 的 `GET /repos/Wei-Shaw/sub2api/releases/latest`，可选读取 `UPDATE_GITHUB_TOKEN`，仅向 `api.github.com` 发送认证头；API 请求超时 30 秒，下载超时 10 分钟。版本检查结果缓存 20 分钟，失败时优先返回缓存结果，否则把错误放进 `warning`，并把当前版本当成最新版本返回。[GitHub client](https://github.com/Wei-Shaw/sub2api/blob/b0a02a3304a0a78cdd003ddda1dd23ba02c03084/backend/internal/repository/github_release_service.go)；[update service](https://github.com/Wei-Shaw/sub2api/blob/b0a02a3304a0a78cdd003ddda1dd23ba02c03084/backend/internal/service/update_service.go)

它去掉 tag 的 `v` 前缀，并以自写的三段整数比较器比较 `major.minor.patch`。预发布后缀会被截掉，因此这不是完整的 SemVer 比较器。GitHub 的 latest release 接口本身返回最近的非草稿、非预发布正式 Release；返回数据包含 `tag_name`、release notes、发布时间和 assets。[GitHub Releases REST API](https://docs.github.com/en/rest/releases/releases#get-the-latest-release)

前端把版本组件放在侧栏顶部，挂载时检查一次；有更新时徽标变为琥珀色并显示动态圆点，展开后显示当前版本、目标版本、更新按钮、release notes 链接和回退入口。它没有定时轮询；再次检查来自手动刷新或组件重新挂载。[VersionBadge.vue](https://github.com/Wei-Shaw/sub2api/blob/b0a02a3304a0a78cdd003ddda1dd23ba02c03084/frontend/src/components/common/VersionBadge.vue)；[app store](https://github.com/Wei-Shaw/sub2api/blob/b0a02a3304a0a78cdd003ddda1dd23ba02c03084/frontend/src/stores/app.ts)

### 选择、下载与校验资产

sub2api 以 Go 的 `runtime.GOOS`/`runtime.GOARCH` 组成如 `darwin_arm64` 的片段，在 Release assets 中寻找名称包含该片段的压缩包，同时寻找 `checksums.txt`。发布流程由 GoReleaser 生成 Linux、Windows、Darwin 的 amd64/arm64 资产和 SHA-256 清单。[update service](https://github.com/Wei-Shaw/sub2api/blob/b0a02a3304a0a78cdd003ddda1dd23ba02c03084/backend/internal/service/update_service.go)；[GoReleaser 配置](https://github.com/Wei-Shaw/sub2api/blob/b0a02a3304a0a78cdd003ddda1dd23ba02c03084/.goreleaser.yaml)；[release workflow](https://github.com/Wei-Shaw/sub2api/blob/b0a02a3304a0a78cdd003ddda1dd23ba02c03084/.github/workflows/release.yml)

下载只允许 HTTPS 和 GitHub 资产域名，最大 500 MB；解包只接受目标二进制，拒绝 `..` 路径和非普通文件，并限制解压后的二进制大小。找到 `checksums.txt` 时必须匹配 SHA-256；但 Release 若完全没有 `checksums.txt`，代码会继续安装，因此清单在运行时不是强制要求。[update service](https://github.com/Wei-Shaw/sub2api/blob/b0a02a3304a0a78cdd003ddda1dd23ba02c03084/backend/internal/service/update_service.go)

### 应用更新、重启和回退

sub2api 在当前可执行文件同一目录创建临时目录，以保证重命名发生在同一文件系统。它先把当前二进制改名为 `.backup`，再把新二进制原子改名到原路径；第二步失败时立即把 backup 改回去。成功后保留一个 backup，下一次更新会覆盖它。[update service](https://github.com/Wei-Shaw/sub2api/blob/b0a02a3304a0a78cdd003ddda1dd23ba02c03084/backend/internal/service/update_service.go)

更新接口与 HTTP 客户端断开解耦，最长运行 15 分钟，并用系统操作锁和幂等键防止并发重复更新。替换后前端要求用户点击重启；Linux 上服务进程退出，依赖 systemd 的 `Restart=always` 拉起。前端等待 8 秒后最多请求 5 次 `/health`，成功则刷新页面，失败也会刷新。[system handler](https://github.com/Wei-Shaw/sub2api/blob/b0a02a3304a0a78cdd003ddda1dd23ba02c03084/backend/internal/handler/admin/system_handler.go)；[restart.go](https://github.com/Wei-Shaw/sub2api/blob/b0a02a3304a0a78cdd003ddda1dd23ba02c03084/backend/internal/pkg/sysutil/restart.go)；[VersionBadge.vue](https://github.com/Wei-Shaw/sub2api/blob/b0a02a3304a0a78cdd003ddda1dd23ba02c03084/frontend/src/components/common/VersionBadge.vue)

回退有两种：恢复本地唯一的 `.backup`，或列出最多三个低于当前版本的正式 Release，再下载指定旧版本并走相同替换流程。它没有在健康检查失败后触发回退，也没有证明重启后的进程确实运行目标版本；数据库迁移文档还明确提醒迁移是 forward-only，回退镜像不能反向恢复数据库。[update service](https://github.com/Wei-Shaw/sub2api/blob/b0a02a3304a0a78cdd003ddda1dd23ba02c03084/backend/internal/service/update_service.go)；[Apple container deployment](https://github.com/Wei-Shaw/sub2api/blob/b0a02a3304a0a78cdd003ddda1dd23ba02c03084/deploy/APPLE_CONTAINER.md)

### 可借鉴与不应照搬的部分

可借鉴：清晰的版本徽标、缓存与强制刷新、平台/架构匹配、限制下载大小、校验、同一时间只允许一个更新动作、明确区分 source build 和 release build、保留更新前版本、更新后验证服务可用。

不应照搬：手工替换 Electron bundle 内的主可执行文件；自行解析有限 SemVer；把 checksum 设为可选；只检测 HTTP `/health` 就宣称回退闭环完成；假定 systemd 或容器 supervisor 会重启桌面应用。

## Electron 与 electron-builder 的约束

### 更新机制与发布资产

Electron 内置 `autoUpdater` 在 macOS 基于 Squirrel.Mac，要求应用已签名；下载完成后调用 `quitAndInstall()`，或在下次应用启动时应用已下载更新。[Electron autoUpdater](https://www.electronjs.org/docs/latest/api/auto-updater/)

当前工程已经使用 electron-builder 26。其官方推荐方案是安装运行时依赖 `electron-updater`，配置 publish provider，由 electron-builder 生成并发布更新元数据和安装资产；应用调用 `checkForUpdatesAndNotify()`，或监听事件构建自定义 UI。macOS 必须同时生成 ZIP，因为 Squirrel.Mac 使用 ZIP，缺少 ZIP 时 `latest-mac.yml` 不能正确生成。更新器依据 metadata 中的 `files[]`、大小和 SHA-512 选择并校验资产，而不是从 GitHub latest 响应中随意挑一个 DMG。官方还明确要求用安装后的打包应用验证更新，而不能只在开发模式验证。[electron-builder v26 Auto Update](https://www.electron.build/v26/docs/features/auto-update/)

为了保留“一次点击才下载”的产品语义，应设置 `autoDownload = false`：静默检查只取得更新信息，用户点击后调用 `downloadUpdate()`，下载完成后再提供“重启并安装”。`electron-updater` 的实现默认 `autoDownload=true`、`autoInstallOnAppQuit=true`，并暴露 `downloadUpdate()`、`quitAndInstall()` 和 `allowDowngrade`；首版应显式设置，避免默认行为和产品承诺不一致。[electron-updater AppUpdater source](https://github.com/electron-userland/electron-builder/blob/v26.0.12/packages/electron-updater/src/AppUpdater.ts)

`electron-updater` 从 `latest-mac.yml` 的 `files[]` 选择 ZIP，并在 Apple Silicon 上优先含 `arm64` 的文件；Intel Mac 排除 arm64 文件。当前工程只承诺 Apple Silicon，继续发布 arm64 是最小方案；若未来同时支持 Intel，可发布 x64+arm64 资产或一个 universal 资产，不应让多个独立 job 互相覆盖同名的 `latest-mac.yml`。[MacUpdater source](https://github.com/electron-userland/electron-builder/blob/v26.0.12/packages/electron-updater/src/MacUpdater.ts)；[electron-builder architecture](https://github.com/electron-userland/electron-builder/blob/master/website/docs/architecture.md)

### 签名与公证

macOS 自动更新要求正式签名。当前 `package.json` 使用 `identity: "-"`，CI 又关闭证书自动发现；这只是 ad-hoc 签名。现有验证中的 `codesign --verify --deep --strict` 能证明 bundle 内部结构自洽，不能替代 Developer ID 身份或公证。[`package.json`](../../package.json)；[desktop workflow](../../.github/workflows/desktop.yml)；[现有发布验证](release-verification.md)

对 GitHub 直接分发，需使用 Developer ID Application 证书。macOS 10.15 以后，站外分发还需 Apple 公证；electron-builder 可以在 CI 中使用 App Store Connect API key 或 Apple ID 凭据完成公证和 stapling。公证要求 hardened runtime。证书和公证凭据只能作为 GitHub Actions secrets 注入，不能写进仓库或应用。[electron-builder macOS signing](https://www.electron.build/docs/features/code-signing/code-signing-mac/)；[electron-builder notarization](https://www.electron.build/docs/notarization/)

签名身份和 `appId` 应在首个正式 Release 前固定。更新包必须保持相同的产品身份和签名链；否则 Squirrel/Mac 的签名校验会拒绝更新。当前 `appId=com.cleverworkbench.desktop` 已明确，可以继续使用。[`package.json`](../../package.json)；[Electron autoUpdater](https://www.electronjs.org/docs/latest/api/auto-updater/)

### GitHub Releases 与检查频率

GitHub Release 应作为发布记录和更新资产容器，tag 使用与 `package.json.version` 对应的 `vX.Y.Z`。latest endpoint 不包含 draft 和 prerelease，符合首版“只跟踪稳定版”的要求。[GitHub Releases REST API](https://docs.github.com/en/rest/releases/releases#get-the-latest-release)

如果自己调用 REST API，未认证请求的主限额是每来源 IP 每小时 60 次，认证用户通常为每小时 5,000 次。启动时加每 30 分钟检查对单机很轻，但共享出口和额外请求会共同消耗额度；收到 `403/429` 时应按 `retry-after` 或 rate-limit reset 退避。公开仓库无需在客户端内置 PAT，应用包里也不应包含发布 token。采用 electron-builder GitHub provider 后不应再并行写一套 GitHub REST 轮询；更新器返回的版本信息就是 UI 的数据源。[GitHub REST rate limits](https://docs.github.com/en/rest/using-the-rest-api/rate-limits-for-the-rest-api)；[GitHub REST best practices](https://docs.github.com/en/rest/using-the-rest-api/best-practices-for-using-the-rest-api)

## 当前工程与目标之间的缺口

截至 2026-10-19，远端存在 `v0.1.0` tag，但 `GET /repos/iyanghong/clever-workbench/releases/latest` 返回 404；也就是说还没有可供 updater 消费的正式 GitHub Release。

| 范围 | 当前状态 | 需要补齐 |
| --- | --- | --- |
| 应用版本 | `package.json` 为 `0.1.0` | tag、package version、Release version 单一来源；发布前校验三者一致 |
| 打包目标 | macOS arm64 已生成 DMG+ZIP | 保留 ZIP；增加 GitHub publish 配置和 `latest-mac.yml` 等更新元数据 |
| 运行时 updater | 未依赖 `electron-updater`，主进程、preload、类型中均无更新接口 | 主进程 UpdateController、受限 IPC、事件订阅与状态类型 |
| 发布渠道 | CI 只在 push/PR 打包并上传短期 Actions artifact | tag 驱动的 Release job，签名、公证、staple、发布 assets，发布前安装验证 |
| macOS 信任 | ad-hoc 签名，无公证 | Developer ID Application、hardened runtime、公证凭据与产物验证 |
| UI | 无版本/更新状态 | 头像附近的版本按钮、状态面板、release notes、进度、失败和重试 |
| 安装前保存 | 退出流程已有 renderer flush、备份等待、vault 锁定和导出等待 | `quitAndInstall` 必须复用同一套退出协调，不能绕过 close handler |
| 健康确认 | 安装包 E2E 只在 CI 执行 | 启动标记、版本确认、Store 初始化、窗口加载完成、超时及结果落盘 |
| 回退 | 无应用版本回退；数据 schema 会拒绝新版本数据被旧程序打开 | 明确数据兼容规则、更新前备份、上一版本恢复机制；全自动则增加外部 watchdog |
| 历史 | 无更新历史 | 保存最近 30 条阶段、起止版本、耗时、结果、简化错误；不保存 token |

相关证据：[`package.json`](../../package.json)、[`.github/workflows/desktop.yml`](../../.github/workflows/desktop.yml)、[`electron/main.ts`](../../electron/main.ts)、[`electron/preload.ts`](../../electron/preload.ts)、[`src/types.ts`](../../src/types.ts)、[`README.md`](../../README.md)。

## 推荐的产品与技术流程

### 状态与按钮

主进程持有唯一状态，renderer 只通过 preload 获取快照、订阅状态和触发允许的动作。推荐状态如下：

1. `unsupported`：开发模式、未打包、签名/发布配置不支持更新。
2. `idle` / `checking`：显示当前版本；启动后延迟数秒检查，之后每 30 分钟检查。
3. `up-to-date`：显示“已是最新 vX.Y.Z”和上次检查时间。
4. `available`：按钮高亮，显示当前版本、目标版本、发布时间、release notes 和“更新”。
5. `downloading`：显示百分比、已下载大小和速度；禁止重复触发。
6. `ready`：显示“重启并安装”；此时仍可继续工作。
7. `installing`：先协调保存、等待备份/导出、锁 vault，写入 pending marker，再调用 `quitAndInstall(false, true)`。
8. `validating`：新进程启动后核对 `app.getVersion()`、数据库成功打开、主窗口加载完成，并在有限时间内写入健康标记。
9. `failed`：保留当前可运行版本或展示恢复入口，并把可读错误写入历史。

更新按钮可以复用 sub2api 的轻量徽标思路，但应在主窗口顶部现有头像/工具区显示；展开面板承载详情和阶段，设置页承载渠道、自动检查开关、检查间隔、历史和恢复。首版固定官方仓库 `iyanghong/clever-workbench` 与稳定渠道，高级设置不应允许任意 URL，因为更新源属于代码执行信任边界。

### 发布流水线

建议新增 tag 驱动的 release workflow：

1. 只接受 `vX.Y.Z`，校验 tag 与 `package.json.version` 一致，运行 typecheck、单元测试、build 和安装包 E2E。
2. 在 Apple Silicon runner 构建 arm64 DMG+ZIP，注入 Developer ID 证书和公证凭据。
3. 验证 `codesign`、Gatekeeper assessment、公证 ticket/staple，并从 ZIP 启动做基础健康检查。
4. 在 publish 配置中显式固定 `provider: github`、`owner: iyanghong` 和 `repo: clever-workbench`，由 electron-builder 生成并发布 DMG、ZIP、`latest-mac.yml` 及相关 blockmap/metadata 到同一个非 draft GitHub Release。不要只依赖 `.git/config` 推断更新源，以免仓库改名或转移后已安装客户端继续轮询旧地址。
5. Release 全部资产上传成功后再公开；草稿阶段不应成为客户端 latest。
6. 用已安装的 `N-1` 正式版本对该 draft/staging feed 做升级验收，再公开生产 Release。官方文档明确建议测试安装后的应用更新。[electron-builder v26 Auto Update](https://www.electron.build/v26/docs/features/auto-update/)

普通 push/PR 继续执行当前无证书的构建验证；只有受保护的 tag release job 使用签名 secrets。发布权限应最小化为 `contents: write`，日常 CI 保持 `contents: read`。[electron-builder Publish](https://www.electron.build/v26/docs/publish/)

### 健康检查和回退等级

建议把“健康”定义成可验证的应用条件，而不是单纯“进程存在”：目标版本匹配、SQLite Store 打开且 schema 可读、renderer 完成首屏加载、主进程与 renderer IPC 往返成功。健康窗口建议 30–60 秒；成功后清除 pending marker，并把更新历史标记为成功。

有三个可选等级：

- **A：可靠安装 + 手动恢复**。下载/签名/安装失败保留旧版本；新版本健康失败时提示从上一 Release 手动安装。实现最简单，但不满足已经确认的 Q5。
- **B：应用内自动恢复**。新版本能启动主进程但业务健康失败时，允许下载/安装已记录的上一正式版本并重启。它不能处理 Electron/Main 入口直接崩溃，也要解决降级许可和数据库兼容。
- **C：外部 watchdog 自动恢复**。发布时附带独立、稳定且签名的 launcher/helper。helper 在更新前记录旧 bundle/版本与健康 nonce，启动新版本并等待确认；超时或退出异常时恢复旧 bundle，再启动旧版本。这才覆盖“完全启动不了”的 Q5，但增加签名、权限、安装位置、helper 自身升级和误判处理的复杂度。

若 Q5 保持为硬性验收，技术上应选择 C，并把它单独做成第二阶段；第一阶段先完成官方 updater、签名发布、健康 marker、更新前数据备份和可操作的恢复入口。若首版必须同时交付 C，需要先做一个签名安装包原型验证 `/Applications` 下 bundle 替换权限、quarantine、公证和 helper 生命周期，再承诺排期。

数据回退规则必须先定：含 schema 升级的版本在发布前要么证明旧程序仍能读取新 schema，要么在更新前创建可恢复的完整加密备份，并把“恢复上一版本”定义为“恢复旧应用 + 对应备份”。只恢复应用但继续使用已升级数据，不应显示为成功。

## 建议的验收边界

- 从已签名、公证的 `N-1` arm64 安装版检查到 `N` 正式 Release。
- 无更新、离线、GitHub 限流、Release 缺资产、metadata 损坏、下载中断、校验失败均有明确状态，当前版本继续可用。
- 下载过程可观察且重复点击不会并发下载；退出应用后已下载更新是否自动安装与 UI 文案一致。
- 安装前未保存编辑必须落盘，正在恢复备份、轮换主密码或系统导出时不得强制退出。
- 新版本启动后核对实际版本、Store、renderer 和 IPC；历史记录包含各阶段耗时和最终结果。
- arm64 客户端绝不选择 x64-only 资产；未来多架构发布时验证 arm64、x64 或 universal 的选择规则。
- 更新不会覆盖 `userData`；升级前后的台账、附件、凭据、草稿和备份均保持可读。
- 回退测试必须包含一次 schema 未变化的回退和一次 schema 变化场景，证明产品承诺与实际数据恢复路径一致。

## 下一轮需要确认的设计问题

1. Q5 是否是“新版本根本无法启动也必须无人值守恢复”的硬性要求？如果是，需要接受独立 watchdog/helper，而不是只做 Electron updater。
2. 首个公开 Release 是否只发布 Apple Silicon arm64，还是直接发布 universal 以减少未来渠道迁移？当前正式目标是 arm64，首版保持 arm64 风险更低。
3. 更新是否必须在用户点击后才下载？本研究建议是；静默检查不应消耗大文件流量。
4. 更新完成后由用户点击“重启并安装”，还是允许退出应用时自动安装？当前应用有严格的保存/备份退出协调，显式动作更容易解释和验证。
5. schema 发生变化的版本，是否允许自动回退应用？本研究建议只有声明为 backward-compatible 的迁移才允许应用级自动回退；否则恢复应用与数据备份必须绑定。

