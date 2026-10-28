# 操作指引与 v0.1.15 已发布源码整合记录

状态：整合版代理验收完成，等待维护者核对最终界面。日期：2026-10-28。正式发布和日常应用替换等待用户最终界面验收与人工核对。

## 来源与合并

- 本次使用独立工作区 `/Users/kuku/code/.cwb-guidance-tickets/release-integration`，分支 `codex/operation-guidance-release-integration`。原始 `/Users/kuku/code/9-workbench` 的 `master` 有用户未提交文件，未清理、未暂存、未覆盖。
- 在操作指引原集成提交 `48bd231` 上合入当时远端 `origin/master` 的 `984e19a`（正式 `v0.1.15` 及其前五个提交），合并提交 `a52dda1`。三个文本冲突位于 `src/App.tsx`、`src/features/ledger/LedgerWorkspace.tsx`、`src/shared/Dialog.tsx`；保留新建记录离开保护、指引导航保存、弹窗互斥、未提交录入确认与焦点返回。操作指引 ADR 从 0012 调整为 0014，避免占用远端已有 0012、0013。
- 合并提交的 author 和 committer 均为仓库本地 `ikuku-tt <267023805+ikuku-tt@users.noreply.github.com>`，标题及正文为中文；未推送远端。

## 正文与界面修订

- 台账批量录入指引改为先手填或把 Word／Excel／TSV 映射后追加到上方表格，再逐行校对；明确最多 200 条及未提交离开保护。按钮旁的指引名称与“批量录入”一致，示意图替换为远端提交的隔离测试截图。
- 资源指引补充多组具名连接、常用连接、关联服务器的地址回退与复制语义；服务和节点补充可选部署资料及操作文档引用；文档指引补充引用仍存在时的删除与改归属限制。
- 系统导出指引改为无实际文档时单选格式并保存单文件、实际有文档时可多格式保存 ZIP；说明本系统服务／节点直接引用的通用文档会纳入。秘密保护指引补充系统钥匙串只在实际秘密使用或转换保护方式时可能授权。
- 47 篇正文现有 275 个步骤、三张本地图片；新增功能保持原稳定 `guideId`，新增步骤用新 `stepId`，既有步骤标识未更改。

## 已执行验证

- 合并后 `npm run typecheck`、`npm run build` 通过；完整 `npm test` 为 214 通过、3 跳过。
- 本次正文与入口修订后 `npm run build` 通过。`tests/e2e/operations-guidance.spec.ts` 6 项通过；弹窗、版本提示、指引导航、批量录入、资源连接、系统导出、系统保护等 7 份相关 Electron 测试 32 项通过，共 38 项。
- `npm run guidance:check` 返回 0，47 篇正文可用；十项警告只涉及尚未填写的维护者人工核对，没有缺图、坏 JSON、缺失指引或无效步骤引用。`review` 仍为 `pending`，未伪造签认。

## 隔离 macOS 安装版

- 从业务提交 `41a1fd8936cfe8dd8e8c1c4d24d163b18f88242d` 创建独立 QA 工作树，只在本机绑定测试 tag `v99.4.16`，版本提交 `aaf9f12fdd9a21be18fbca169560f3229c73fac8`。两次提交和 tag 的署名均使用仓库本地 `ikuku-tt`，说明为中文；未向 GitHub 推送测试版本。验收后已删除本地测试 tag，防止影响下一次正式版本选择；测试版本不代表下一正式版本号。
- `npm run build`、`electron-builder --mac --arm64 --dir --publish never`、`codesign --verify --deep --strict` 均退出 0，得到独立[验收应用](../../../release-qa-bound/release/mac-arm64/Clever%20Workbench.app)。该包为 ad-hoc 签名，未做 Apple 公证，也未放入日常 `/Applications`。
- 从该包的 `app.asar` 原样读取并与业务源码比较，47 篇 JSON 逐字一致，合计 275 个步骤；三张本地图片均在渲染资产中，测试记录的 tag 与业务 SHA 正确。绑定包内容检查返回 0，同时保留待发布草稿和绑定记录中的 20 项人工核对警告，不将待审核写成通过。
- 以 `CWB_TEST_EXECUTABLE`、独立系统临时资料目录及显式模拟钥匙串执行安装版 Electron 用例：首次版本说明显示／重启去重、批量录入附近入口、外观与辅助偏好的深浅主题／窄窗口合计 3 项通过。模拟钥匙串不证明生产 Keychain 授权。
- 原生 CUA 从包的绝对路径绑定窗口，AX 来源确认是该包 `app.asar/dist/index.html`。鼠标关闭首次版本说明后显示带示例任务和文档的工作台；从设置打开 47 项指引目录，再打开“校对表格后批量录入台账”的第 2／9 步，图片实际可见；原生关闭后焦点返回“查看全部使用指引”。
- 当前验收窗口仍运行，资料在系统临时目录 `cwb-release-integration-preview-SSB7MR`，只有演示系统、环境、入口、无密码账号、服务器、服务、任务和文档。用户可据此手动核对；此前的原集成预览窗口也保留，避免中断既有试用。两者均未触及真实业务资料。

## 待完成

- 由用户对当前隔离安装版核对最终界面、实际步骤、截图和入口，按[人工核对表](review-checklist.md)记录结果。当前应用仅供本机验收，`v99.4.16` 并非正式 Release。
- 用户签认后才在干净工作区合入、推送及制作正式 Release；真实旧版网络更新与健康启动先在独立可写位置和隔离资料中执行，不以开发版或模拟钥匙串结果替代。
