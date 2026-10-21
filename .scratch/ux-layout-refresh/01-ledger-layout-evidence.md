# 任务 01：台账浏览与宽详情实施记录

日期：2026-10-21。起点：`26821e00d9f840d6723c5db167f9e1fbf38d5b5d`。分支：`codex/ux-ledger-layout`。工作区：`/Users/kuku/.codex/worktrees/ux-ledger-layout/9-workbench`。

## 改动

- 真实台账保持未选择时的完整表格，打开记录后换为 316px 摘要列表和宽详情。分类横向排列，当前分类新增与粘贴位于分类区，搜索、环境、标签和运维范围控件归列表侧。
- 摘要从真实对象读取名称、适用环境／标签、地址／用户名／仓库／频率及对象说明。账号显示所属入口、资源或系统；入口与资源摘要保留其账号用户名及秘密复制入口。选中记录具备背景和左侧结构标记，长说明在摘要预览两行，详情保留完整文本。
- 台账内容区不超过 840px 时单栏显示详情。完整表格与摘要分开挂载，摘要滚动不会写入完整表格的返回位置。返回保留系统、分类、搜索、环境、标签及表格滚动位置。
- 搜索词变化保留正在看的详情；分类、环境、标签、运维类型或状态变化沿用原先保存后关闭详情的边界，未放宽资料复制的环境校验。
- 复用原详情编辑器、`useSaveGroup`、资料复制和秘密接口。新增摘要字段复制会等待保存并读取最新快照；秘密复制按钮增加可选 `beforeCopy`，台账传入保存组。取消解锁、保存失败或组件失效不会继续复制旧资料。
- 样式新增于限定台账作用域的 `ledger-layout.css`。未新增依赖、持久化字段、数据库迁移、IPC、演示数据或原型入口。系统管理动作和按需批量条由任务 02 接续。

## 红 → 绿

使用已确认的 Playwright Electron 公共入口和临时 `CLEVER_WORKBENCH_DATA_DIR`，测试期间通过共享锁串行使用原生进程与系统剪贴板。

| 回归 | 红色观察 | 绿色结果 |
| --- | --- | --- |
| 摘要与宽详情 | 原详情／列表宽比为 0.474，未达到大于 1.6 的验收线 | 摘要与宽详情并存，完整表格退出，搜索位于详情左侧 |
| 搜索不丢详情、窄窗返回 | 搜索空结果时当前详情被关闭 | 搜索空结果仍保留详情，960px 返回后条件与完整表格位置恢复 |
| 账号摘要直接复制 | 摘要不存在密码复制按钮 | 用户名、密码、Token、私钥直接复制；取消解锁、无效编辑和锁定清理验证通过 |
| 按内容区切换布局 | 1080px 窗口受旧全局规则影响，列表被隐藏 | 1080px 仍可双栏且详情大于 500px，960px 单栏 |
| 范围筛选沿用原边界 | 环境切换后详情仍保留，可能留下范围不匹配的复制对象 | 环境变化先保存再关闭详情；环境校验接口保持原实现 |
| 长内容摘要 | 长标题、地址和备注令单条摘要达到 521px | 备注摘要限制两行，条目小于 300px；详情长文本可换行和滚动 |

首轮宽比红色数值来自执行输出，未保留完整追踪。其余红色日志或追踪已从实现工作区 `release/ux-ledger-layout/` 复制到集成工作区 `release/ux-layout-refresh/task01/`，包括 `red-filter-trace.zip`、`red-account-summary.log`、`red-content-width.log`、`red-scope-boundary.log`、`red-long-summary.log`。这些运行产物不纳入源码提交。

## 实际验证

- `npm run typecheck`：通过。
- `npm run build`：通过，包含 TypeScript 检查及渲染层、主进程、preload、worker 生产构建。
- `npm run test -- tests/ledger-workspace.test.ts tests/ledger-copy.test.ts tests/system-ledger.test.ts tests/ledger.test.ts`：4 个文件、17 条通过。
- 台账 Electron 专项：`ledger-layout`、`workspace-redesign`、`ledger`、`system-ledger`、`ledger-copy`、`account-list` 共 16 条。首跑 15 条通过；1 条旧用例全页匹配用户名，因摘要与详情同时展示该用户名触发严格定位冲突。定位限定详情后，单独重跑通过，未削弱其创建和保存断言。
- 后续长内容与范围边界修正，布局与账号 3 条重跑通过。合入任务 03 源码后，重新构建并重跑布局、账号、资料复制，共 4 条通过（`green-after-integration.log`）。最新 `97d4a29` 相对已测 `3d571b7` 只增加集成记录文档，已同步。
- 观察了 1440×960、1440×760、1380×850、1080×760 和 960×760；现有台账用例另覆盖 1024×768。新增布局截图覆盖浅色／深色、宽／窄、长标题／地址／备注；保存失败输入保留、返回阻止、最新字段复制、附带账号、取消解锁、账号显隐和系统锁定清理均通过真实 Electron 路径。
- `git diff --check`：通过。作者及提交者来自仓库本地配置 `ikuku-tt`，未使用身份覆盖。

## 图像证据与剩余边界

截图与日志已复制至集成工作区 `release/ux-layout-refresh/task01/`，25 个文件逐一校验与实现工作区内容一致。最新截图已在包含任务 03 共用壳的构建上重采。

- [台账宽窗口，浅色](../../release/ux-layout-refresh/task01/ledger-wide-light.png)
- [台账宽窗口，深色](../../release/ux-layout-refresh/task01/ledger-wide-dark.png)
- [台账窄窗口，浅色](../../release/ux-layout-refresh/task01/ledger-narrow-light.png)
- [台账窄窗口，深色](../../release/ux-layout-refresh/task01/ledger-narrow-dark.png)
- [账号摘要](../../release/ux-layout-refresh/task01/account-summary.png)
- [详情资料复制](../../release/ux-layout-refresh/task01/ledger-copy-details.png)

剩余验收边界：

- 本项为开发生产构建的 Electron 验证，不是安装包或目标平台发布验收；未推送、发布或安装应用。
- 未新增独立测试逐项穷举运维筛选、文档导航；这些仍沿用原处理链路，完整集成回归由任务 04 执行。
- 跟随系统、高对比、减少透明度、减少动态效果沿用现有外观语义；全局外观专项由任务 03／04 覆盖。本项未把截图观察替代可访问性专项结果。
- 新布局的原生鼠标点击、完整测试集、使用文档和 AGENTS.md 的新断点说明由任务 04 统一完成，本记录不宣称这些环节已通过。
