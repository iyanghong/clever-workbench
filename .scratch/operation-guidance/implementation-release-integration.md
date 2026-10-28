# 操作指引与 v0.1.15 已发布源码整合记录

状态：进行中。日期：2026-10-28。正式发布和日常应用替换等待用户最终界面验收与人工核对。

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

## 待完成

- 从整合源码制作隔离 macOS 安装包，确认包内正文、三张图片、主题、窄窗口和原生关闭／焦点；交给用户核对最终界面与[人工核对表](review-checklist.md)。
- 用户签认后才在干净工作区合入、推送及制作正式 Release；真实旧版网络更新与健康启动先在独立可写位置和隔离资料中执行，不以开发版或模拟钥匙串结果替代。
