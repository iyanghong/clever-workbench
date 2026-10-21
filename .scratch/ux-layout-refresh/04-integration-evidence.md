# 任务 04：集成验收与视觉收尾记录

日期：2026-10-21。基线：`ba5062db9f63da680f3b3675413cfbfea03ea3d1`。工作区：`/Users/kuku/.codex/worktrees/ux-layout-acceptance/9-workbench`，分支：`codex/ux-layout-acceptance`。

环境：macOS arm64，CLI Node v25.8.1，Electron 44.9.0（内嵌 Node 24.22.0），Playwright 1.64.1。

## 验收边界与改动

沿用用户已确认的真实 Playwright Electron 入口，使用生产构建与隔离 `CLEVER_WORKBENCH_DATA_DIR`。补充运维类型／状态、环境／标签筛选、编辑保存、窄窗口返回、步骤文档、台账文档分类及新增文档背景的连续流程。夹具通过已有 DesktopAPI 创建虚构资料；行为通过页面、真实复制和现有公开接口观察。

使用文档补充两组九项新建、系统选择器、更多菜单、完整清单／摘要／单栏详情、保存与批量选择、分类录入和文档入口；修正旧“环境台账”和任务项目选择说明。`AGENTS.md` 仅将固定窗口断点改为按台账内容区实际可见区域验收。未改领域关系或架构决策。

## 已完成的自动检查

- 类型检查：通过，日志 [typecheck.log](../../release/ux-layout-refresh/task04/typecheck.log)。新增 Electron 回归后再次类型检查通过，见 [typecheck-final.log](../../release/ux-layout-refresh/task04/typecheck-final.log)。
- 生产构建：通过，日志 [build.log](../../release/ux-layout-refresh/task04/build.log)。包含渲染层、主进程、preload 和 worker。
- 完整 Vitest：29 文件，153 条通过、3 条按既有条件跳过，日志 [vitest.log](../../release/ux-layout-refresh/task04/vitest.log)。跳过项分别需要 `ZIP_TOOL_LARGE`、`ZIP_TOOL_REFERENCE`／`ZIP_TOOL_PYTHON`、`CWB_UPDATE_ZIP` 的专项输入；未将它们记作通过。运行保留 Node 的 localstorage-file 警告，测试本身未失败。
- 静态核对：相对 v0.1.7，主进程、持久化与共享业务契约、依赖清单未变化。正式 `src`、`electron`、入口与构建配置没有原型页面、模拟接口、示例资料或方案参数；`prototype` 仅命中既有属性名防护代码。原型来源仍保留于规格的设计参考，未进入生产入口。
- 文档与 diff：校对界面名称、任务系统归属和 ADR 0007／0008，`git diff --check` 通过。
- 新增运维／文档连续流程：1 条通过，日志 [electron-integration.log](../../release/ux-layout-refresh/task04/electron-integration.log)。既有行为一次通过，无需产品代码修复，也不把本次补充覆盖描述为红绿修复。检查了 1440×900 运维摘要和 960×760 文档分类截图，筛选、保存结果、文档背景与主要操作可见。
- 完整 Electron：26 个文件、61 条用例中 **59 条通过、2 条安装版专属跳过**，耗时 3.5 分钟，见 [electron-full.log](../../release/ux-layout-refresh/task04/electron-full.log)。完整套件没有失败，无需修复后复跑。既有颜色环境变量警告保留在日志；没有将开发运行误记为安装版通过。
- Electron 定向与全套运行均先原子创建共享 `electron.lock`，使用 `finally` 释放本次取得的锁；未与原生鼠标并行，也未访问真实用户资料。通过必要检查后只继续文档与提交整理，没有扩大或重复执行测试。

## 用户故事与回归入口

| 用户故事 | 回归入口与可观察结果 |
| --- | --- |
| 1、23–25 | `shell-create`、`home`：稳定搜索／新建位置，两组九项直接可选，真实任务和台账录入继承背景，旧草稿保留 |
| 2–12 | `ledger-layout`、`workspace-redesign`：完整表格、摘要与宽详情、名称／地址／备注长内容，搜索空结果、环境／标签／运维筛选，窄窗返回条件与位置 |
| 13–19 | `ledger-copy`、`account-list`、`system-ledger`、`editor`、`vault`：就近字段／秘密复制、选择与取消、包含账号、取消解锁、锁定清理、保存失败输入与剪贴板保护 |
| 20–22、26 | `ledger-system-actions`、`dialog-polish`、`system-export`、`workspace-redesign`：当前系统信息／导出、选择器新系统、空系统录入、表格粘贴、键盘／Esc／焦点链 |
| 27、29 | `appearance`、`shell-create`、`home`、`documents`、`update` 等：外观偏好、最小窗口全局入口、跨模块编辑与保存、更新弹窗 |
| 28 | 根代理的原生鼠标记录，不能以 Playwright 点击代替 |
| 30 | 静态边界核对，以及现有 `backup`、`automatic-backup`、`vault`、`vault-rotation` 等回归 |

新增运维／文档连续流程补足任务 01 未单独覆盖的边界，未为数据库、加密或更新内部实现增加重复测试。

## 原生鼠标验收

根代理在集成提交 `ba5062d` 的生产构建上执行实际 macOS 鼠标操作，详情见[原生报告](../../release/ux-layout-refresh/native/native-report.md)。完整表格打开详情、详情打开时“更多 → 导出资料”、导出弹窗 X 关闭后焦点返回、全局新建打开两组九项及 X 关闭后焦点返回、系统切换器打开均通过。`page-errors.json` 为空数组。

尝试“系统选择器 → 新建系统”时用户手动操作了窗口，故停止原生操作。该步骤没有计为原生通过，也不计为产品失败；功能与焦点链由 `ledger-system-actions` 的自动回归覆盖。原生临时窗口正常关闭、测试资料已清理，不涉及安装版真实资料。

## 图像检查与交付

本轮实际查看运维摘要、文档清单、深色长内容的宽／窄详情及高对比／减少透明度画面，主要操作可见，长名称、地址和说明没有挤出详情边界。全套截图保留在 `release/ux-layout-refresh/task04/full/`，包括：

- [运维摘要与已保存频率](../../release/ux-layout-refresh/task04/full/ledger-layout-运维筛选在摘要与返回清单间保持有效，编辑后可沿步骤和分类进入文档/operations-wide.png)
- [窄窗口文档分类与新建结果](../../release/ux-layout-refresh/task04/full/ledger-layout-运维筛选在摘要与返回清单间保持有效，编辑后可沿步骤和分类进入文档/documents-narrow.png)
- [深色宽详情与长内容](../../release/ux-layout-refresh/task04/full/ledger-layout-摘要搜索保留详情、范围筛选关闭详情，窄窗口返回恢复清单条件和位置/ledger-wide-dark.png)
- [深色窄窗口单栏详情](../../release/ux-layout-refresh/task04/full/ledger-layout-摘要搜索保留详情、范围筛选关闭详情，窄窗口返回恢复清单条件和位置/ledger-narrow-dark.png)
- [高对比与减少透明度](../../release/ux-layout-refresh/task04/full/appearance-主题跟随与手动覆盖，透明度／对比／动态偏好可保存，键盘操作与弹层焦点有效/settings-accessible.png)

任务 01–03 的原有红绿证据保持原结论，本次全套通过不抹去其历史失败。正式产物的产品源码仍与原生验收的 `ba5062d` 一致，本项只修改测试和文档，不需要重新原生验收。

## 剩余边界

本地验收完成，交由集成代理统一合入；双轴代码审查由根代理在合入后统一组织。在这两个步骤完成前，任务单保留集成交付未勾选项，不将整个实施流程记为完成。

本轮不进行安装版或 Windows 实机验收，不推送、发布、安装或替换本机应用。截图与日志位于忽略目录 `release/ux-layout-refresh/task04/`，交付时须复制到集成工作区后再清理本工作区。
