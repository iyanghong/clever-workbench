# 发布 Clever Workbench

更新源固定为 `iyanghong/clever-workbench` 的正式 GitHub Releases，可保留仓库私有属性。客户端仅接受 `vX.Y.Z`，不接受 Draft、Prerelease 或任意仓库地址。macOS arm64 自动安装资产为 `Clever-Workbench-X.Y.Z-arm64.zip`，首次安装资产为同名 `.dmg`，两个资产的 SHA-256 写入 `SHA256SUMS`。

私有仓库更新复用当前电脑 Git 凭据助手保存的 GitHub HTTPS 登录（macOS 通常保存在 Keychain）。每台电脑的账号都须能读取该仓库，浏览器登录本身不等于 Git 已保存凭据。应用不保存新令牌，也不将令牌放入安装包、更新记录或页面状态。若单独配置 fine-grained token，只需对该仓库授予 Contents 读取权限。凭据读取不可用时会尝试匿名检查；私有仓库将提示先配置本机 Git 登录。

私有安装包通过 GitHub 资产 API 下载，Authorization 只发往固定仓库的 `api.github.com` 接口。API 跳转到 GitHub 文件服务器后不再携带凭据。来源：[GitHub Release assets API](https://docs.github.com/en/rest/releases/assets#get-a-release-asset)、[Git credential helpers](https://git-scm.com/docs/gitcredentials)。

Electron 的 `net.fetch` 在手动重定向时会报 `Redirect was cancelled`，不能用 Node.js 的 fetch 测试结果替代原生验证。更新传输先用 `net.request` 取得单跳响应头并终止请求，将 3xx 交给协调器验证。非重定向地址会多一次只读取响应头的 GET；正文由禁止重定向的原生 fetch 流读取，避免将整个 ZIP 排队在主进程内存。两次请求之间若目标行为变化，下载会失败，不能自动跟随。依据：[Electron 原生问题记录](https://github.com/electron/electron/issues/43715)、[ClientRequest API](https://www.electronjs.org/docs/latest/api/client-request)。

## 操作指引编写要求

每次发布前按[操作指引编写与发布规范](operation-guidance.md)编写本次用户操作说明：新增功能或操作方式变化须关联对应功能指引；确实没有操作变化时明确写出“无新增操作”及原因，缺少说明不能当作没有变化。首批接入覆盖全部现有功能，范围见[功能覆盖清单](../.scratch/operation-guidance/coverage.md)。

使用[JSON 模板与发布核对清单](operation-guidance/README.md)，保留步骤、截图及入口的实际核对结果和已知缺项。内容与计划发布的源码一起提交到远端；继续遵守本地 Git 身份和中文提交要求。指引问题仅警告，不新增发布阻断，也不把未完成的编写或核对记为通过。

功能指引已接入离线查阅，本地发布预览及 GitHub Actions 使用同一套非阻断内容检查。维护者可用 `npm run guidance:check` 检查当前工作区，实际发布预览仅检查远端计划源码；CI 检查固定 tag 的绑定记录并使用版本提交记录中的业务源码 SHA，输出警告、步骤摘要和 `guidance-check.json` 报告，详见[检查入口与核对清单](operation-guidance/README.md)。GitHub 用户摘要与安装包从同一绑定内容生成，技术提交清单另外完整保留；发布成功不等于内容已全部核对。

待发布说明放在 `content/guidance/pending.json`。发布准备生成 `content/guidance/releases/<版本号>.json`，绑定实际版本、tag 和业务源码；版本提交 SHA 留在构建证据，人工核对来源不自动改写。当前包的记录为 `pending`，安装版可阅读自身记录；下一次发布准备根据正式 GitHub Release 及其固定 tag 原文生成 `published` 历史副本。草稿、失败版本、被修改或无法确认的历史不冒充正式历史，缺口以警告保留。不会在发布后修改已签名包或已公开 tag。

固定 tag 重跑始终读取该 tag 的记录；选择新号时生成新的绑定记录。内容缺失、坏 JSON、失效引用或历史读取失败只警告，可用部分保留，没有有效正文时写明“暂未提供完整操作指引”，不自动写成“无新增操作”。源码身份、版本一致性、代码构建和资产安全错误仍按原规则停止发布。

## macOS 双击发布

维护者在 Finder 中双击仓库根目录的 **`发布新版本.command`**，终端会读取远端 `origin/master`，列出最新正式 Release 之后的全部提交（包含文档提交），建议新版本号，并展示本地 Git 提交身份。输入一次 `yes` 确认发布计划后，脚本在隔离目录准备版本提交、原子推送 master 和注释 tag，等待 GitHub Actions 完成验证并发布。

本轮自动发布只生成 **macOS Apple Silicon ZIP、DMG 和 SHA256SUMS**。构建在 GitHub 的 macOS runner 上执行，维护者电脑不需要本地打包 Electron，也不需要安装 `gh`。

前提条件：

- 本机安装 Git、curl 和 Node.js 24.15 或更新版本（建议 24 LTS）。双击入口补充常见 Homebrew PATH，并按脚本自身位置定位仓库。
- 本功能的脚本与工作流已提交并推送到远端 master，GitHub Actions 已启用。
- 本地 Git 已配置本人 `user.name` 和 `user.email`。提交作者与提交者必须一致，标题和正文使用中文；身份覆盖、缺失或异常时停止，不自动修改原仓库身份。
- 现有 Git HTTPS 凭据助手已保存具有仓库推送权限的 GitHub 登录。fine-grained token 需要 Contents 写权限，以及用于读取、重试和触发工作流的 Actions 写权限；直接在 Git 凭据助手中配置，不填入脚本或日志。使用 SSH origin 时，推送仍使用原 SSH 配置，API 读取使用本机保存的 GitHub HTTPS 登录。

版本号默认在最新正式版上递增补丁号。已被 tag 占用的版本会跳过，远端应用版本更高时建议不低于该版本的新号；也可输入更高的 `vX.Y.Z`。没有新提交时直接结束。脚本只打包远端已推送内容，本地未提交、未跟踪文件和未推送提交均不纳入；版本准备只允许修改 `package.json`、`package-lock.json` 和本次生成的固定版本指引记录，允许清单写入版本提交恢复信息并核验，当前工作目录和分支保持原状。

可先在终端只读预览：

```sh
./发布新版本.command --dry-run
./发布新版本.command --dry-run --version v0.1.5
```

预览不创建提交、tag、草稿或云端任务。脚本自动复用 HTTPS_PROXY／Git 代理配置，macOS 上也读取已启用的系统 HTTP(S) 代理，不写死代理地址。

每次运行日志位于 `release/publish-logs/`；当前发布状态保存在 Git 元数据目录的 `workbench-release-state.json`。同一仓库已有脚本或云端发布运行时，提示等待并提供任务链接，不自动中断现有任务。发布失败后保留已推送版本与云端日志，重新双击可恢复远端 master 上同一源码的未完成版本，并重跑对应工作流；源码已继续变化则重新规划并使用未占用的更高版本。已公开版本、tag 和资产不会覆盖。

终端关闭或等待超时不表示云端任务已取消，请先通过任务链接确认结果。双击入口在成功或失败后等待回车，便于查看结果。GitHub 的分支保护或权限规则导致推送失败时，按提示处理仓库设置或采用原有维护者流程；脚本不强制推送。

## 本地验证

使用 Node.js 24 LTS，在 macOS Apple Silicon 上执行。先更新应用和 lockfile 版本（例如 `npm version 0.2.0 --no-git-tag-version`），提交审阅后再发布对应 tag。

```sh
npm ci
npm run setup:electron
npm test
npm run build
npx electron-builder --mac --arm64 --publish never
node scripts/prepare-release.mjs v0.2.0
node scripts/verify-electron-update-transport.mjs "$PWD/release/Clever-Workbench-0.2.0-arm64.zip"
CWB_UPDATE_ZIP="$PWD/release/Clever-Workbench-0.2.0-arm64.zip" npx vitest run tests/update-download.test.ts
```

将示例版本替换成 `package.json` 中的版本。准备脚本会拒绝 tag 不匹配、缺失或过大的资产。真实 bundle 校验测试通过应用更新接口解压并验证应用身份、版本、架构、签名及内部链接，写入 quarantine；它不证明公网下载后的系统启动授权已经通过。

原生传输回归通过更新协调器的检查和下载接口，使用明确的本地 HTTP 302 fixture 与完整 ZIP，验证授权 API、无授权 CDN 和原生包校验；它不宣称真实 GitHub 网络已经通过。此项已纳入发布工作流。

桌面用例可通过 `CWB_TEST_EXECUTABLE` 指定被测安装版。若开发机的临时签名包被 macOS 钥匙串访问提示阻塞，可显式设置 `CWB_TEST_MOCK_KEYCHAIN=1` 运行界面测试；封装只在 macOS 且 `CLEVER_WORKBENCH_DATA_DIR` 的真实路径是系统临时目录内已经创建的独立目录时传入 `--use-mock-keychain`，缺少隔离、使用临时根目录或符号链接越界均拒绝启动。默认不开启，也不修改生产应用或系统钥匙串设置。此模式属于外部操作系统适配夹具，不能作为真实钥匙串授权、生产秘密保护或安装打开授权的验收证据。该参数会改变相关子系统行为，依据 [Chromium 的 macOS 构建与测试说明](https://chromium.googlesource.com/chromium/src/+/refs/heads/main/docs/mac_build_instructions.md#avoiding-system-permissions-dialogs-after-each-build)。

## GitHub 发布

推送正式版本 tag 会启动 `Publish stable macOS Release`。工作流先校验 tag 与应用版本，运行单元测试、打包、原生包校验及已安装应用桌面测试。全部通过后创建 Draft，上传 ZIP、DMG、SHA256SUMS，通过 Release 数字 ID 读取草稿，核对远程资产名称、大小和上传状态，最后发布为 latest。中途失败保留 Draft，客户端无法发现半成品。私有仓库发布后仍仅对有权限的用户可读。

目标版本在 Draft 阶段不会成为客户端固定仓库的正式 `latest`，因此不能在公开前宣称完成该目标版本的无替身 GitHub 网络升级验收。下载可靠性修复按 [ADR 0015](adr/0015-recover-release-downloads-with-verified-resume.md) 在公开前验证固定包、断流恢复和安全边界；按 [ADR 0016](adr/0016-verify-real-github-updates-after-publication.md) 在公开后立即用隔离旧安装版完成真实私有 GitHub 下载、备份、替换和健康或人工处理验收。发布说明分别标明两阶段结果。若公开后发现可复现的严重资料或安装风险，暂停问题版作为自动更新目标并公告，再使用新版本号修复；不改写已发布标签或资产。

可先运行 `node scripts/verify-electron-update-github.mjs X.Y.Z`，其中版本必须是当前已发布的正式 latest；此命令从当前源码调用真实 Electron 网络和本机 Git 凭据，在独立临时目录完成私有资产下载、完整散列及原生包验证，不安装应用。它能预检新版下载器的真实网络路径，但不能冒充尚未公开目标版本的资产验收；新版本公开后再对其重跑。

工作流用 GitHub Actions 自带的短期 token 和 job 级 `contents: write` 权限；客户端不含任何发布令牌。源码版本提交来自维护者的本地 Git 账号，Actions 只构建和发布，不创建机器人源码提交。不覆盖已经公开的 Release。修正失败后重跑只允许更新尚未公开的 Draft；已经公开的版本应通过新版本号修复。只有维护者明确准备公开时才推送版本 tag。

发布工作流使用仓库级并发组串行执行，且不取消正在运行的发布。`workflow_dispatch` 的 tag 输入仅用于恢复尚未公开的既有版本。完整历史用于生成中文章节的提交说明：保留提交原始标题和链接，标明基准 Release、业务源码、版本提交及构建记录。发布前逐个核对上传状态、大小和 GitHub 计算的 SHA-256，再下载远程 SHA256SUMS 比对；同一草稿中已匹配的资产可复用，未匹配的本次资产只在草稿阶段替换。

若云端因账单或额度未能启动，可在维护者已授权发布的前提下使用同一 tag 的本机已验证产物。记录本机完整测试、真实包验证、产物来源及云端未运行的原因；先上传 Draft 的完整 ZIP、DMG、SHA256SUMS，重新核对远程大小、上传状态、GitHub 计算的散列和下载回来的校验清单，全部匹配后才发布。此类记录须明确属于人工完成发布，不能将失败或未运行的 Actions 标为通过。

macOS 维持 ad-hoc 签名，不需要 Apple Developer ID。默认 Electron 打包权限包含 JIT 和 disable-library-validation；实际签名和启动必须由打包测试验证。下载资产经过 SHA-256 完整性校验，但该校验不等同于开发者身份证明。安装助手不会清除 quarantine 或关闭 Gatekeeper；系统要求授权时用户按系统提示处理。

如果安装更新时提示只读隔离位置（`AppTranslocation`），说明 macOS 正在临时隔离副本中运行应用；即使 `/Applications` 中已经有同名应用，也可能出现这种情况。退出工作台，打开正式 DMG，通过 Finder 将其中的应用拷贝到“应用程序”并替换，再从“应用程序”打开。保留原有资料目录、完整备份和旧应用，系统要求授权时按提示处理。依据：[Apple 关于 Gatekeeper 隔离运行的说明](https://developer.apple.com/documentation/fileprovider/nsfileprovidererror/code/providertranslocated?language=objc)。

### 已安装旧版下载中断时的人工过渡

旧安装版的下载逻辑不会因新 Release 发布而改变。若下载中途反复报网络或 HTTP/2 错误，可先在旧版“设置 → 备份与迁移”导出一份完整加密备份，并妥善保存对应的独立备份密码。随后在有仓库读取权限的 GitHub 账号下打开[正式 Releases](https://github.com/iyanghong/clever-workbench/releases)，下载目标版本的 macOS arm64 `.dmg` 与 `SHA256SUMS`。在终端输入 `shasum -a 256 `，把已下载的 DMG 拖入终端以填入路径后回车；将结果与清单中该 DMG 的一行逐字核对。不一致时停止安装并重新下载。

确认校验值后退出工作台，在 Finder 打开 DMG，将其中的 Clever Workbench.app 拖到原有的可写安装位置（通常是“应用程序”）并选择替换。不要直接从 DMG 运行，也不要删除应用资料目录或已有备份。重新从安装位置打开，检查“设置 → 关于”的版本与原有资料；如 macOS 要求授权，按照[Apple 的“仍要打开”说明](https://support.apple.com/en-gb/102445)在系统设置中处理，不通过移除 quarantine 或关闭 Gatekeeper 绕过保护。人工替换不记作应用内自动升级成功。

安装入口先检查运行位置、所有权和父目录写权限，再保存、冻结写入和创建完整备份；启动独立助手前再次检查。位置检查失败时保持应用运行，给出具体安装步骤。通过 Finder 恢复后仍保留上次失败记录；人工安装恢复不代表已验证无人值守升级成功。

下载与校验完成后自动显示“立即重启并更新 / 稍后重启”。此时应用尚未替换，立即重启仍先完成保存和完整备份；选择稍后、关闭或 Esc 可以继续工作，点击品牌旁的更新按钮可再次打开重启选择，无需滚动版本说明。同一次下载不反复提醒。

更新包传输对可恢复的网络中断最多进行三次尝试；连接连续约两分钟没有新数据时重试，整个下载任务的时限约两小时。重新请求私有资产时会重新校验 GitHub API 与跳转来源，只有部分响应的范围与目标资产一致才续传；服务器忽略范围或返回无效范围时重新获取完整包。未完成片段仅在受控暂存目录为同一目标版本保留最多 24 小时，取消、版本变化、校验失败或安装成功后清理。完整 SHA-256 与原生包校验仍是安装前提。界面显示尝试次数、进度、取消和手动重试；失败后可打开正式 Release 手动安装，本机历史仅保留脱敏的阶段、字节数、尝试次数和错误码。

新版通过版本、数据库、窗口与通信健康检查后，新的安装助手会清理它持有的旧应用副本（`.previous`、`.previous-retired`）和本次 ZIP／解压目录。资料、完整加密备份和更新日志继续保留；失败或健康未确认时保留恢复文件。清理拒绝越界、符号链接、身份不符及被占用的目标，清理未完成在历史中单独提示；已删除的旧应用不再提供定位按钮。此策略适用于使用新安装助手发起的更新，旧版助手及人工恢复遗留的文件不通过扫描磁盘追溯删除。

首个真实版本发布后，必须在隔离资料目录完成“旧安装版经 GitHub 下载 → 保存和备份 → 原位置替换 → 新版健康确认或符合规格的明确人工处理结果”的验收；人工处理不能记为健康成功，本地包和 HTTP fixture 测试不能代替真实网络验收。验收环境单独保留原始旧安装包用于验证备份恢复，不依赖成功更新后已清理的副本；迁移后的资料不应自动交给旧版读取。

真实网络模式不拦截请求、不替换 Release 元数据，也不修改检查时间。旧安装版须来自已发布资产，并单独保留下载和校验来源证明；命令本身只声明该次更新的真实网络经过，不自动证明调用方提供的旧应用来源。

```sh
node scripts/verify-installed-update.mjs --github /absolute/old/Clever\ Workbench.app 0.1.2
```

先确认目标正式版本已发布且旧版包含更新器；历史 v0.1.0 没有该能力，不能作为首次自动更新的基线。私有仓库的授权网络验收与匿名公开下载验收分别记录，不能混淆。
