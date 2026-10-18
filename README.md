# Clever Workbench

面向技术负责人的本地个人工作台：查生产账号、记录排障方案、随手记任务并完成。支持长期系统台账和阶段项目管理，数据保存在当前电脑，通过加密备份迁移。

目标平台为 Apple Silicon macOS 和 Windows 11 x64。应用使用 Electron、React 和 SQLite；实际打包与平台验收记录见[交付验证](.scratch/desktop-workbench/release-verification.md)。

日常入口包括工作台、台账、任务、文档和工作回顾。系统可以跨项目迭代，保留历史关联；服务仓库只录一次，各环境独立维护部署、资源和多角色账号。任务与文档共用 Markdown 编辑器，支持即时排版、源码、表格和本地图片。回顾图展示任务开始至完成的日历跨度，未完成任务延伸到当前时间。

## 使用

安装后先从工作台记录任务，或在台账里新增系统。名称即可创建，大部分信息可随后补充。`⌘/Ctrl K` 搜索工作台，`⌘/Ctrl N` 快速新建；从系统、环境或资源进入新建时，会自动带入当前背景。

编辑内容自动保存在本机，切换页面和退出时会等待未完成的保存及图片导入。任务完成时间默认为当前时间，可在详情中修正开始和完成时间。归档项目之前需处理未完成任务，归档后系统台账仍可维护。

[安装与资料保护说明](docs/usage.md)介绍主密码、自动备份、换机恢复和异常处理。

## 开发与验证

使用 Node.js 24.15 或更高版本，建议使用 Node.js 24 LTS。

```sh
npm ci
npm run setup:electron
npm run dev
```

```sh
npm run typecheck
npm test
npm run build
npm run test:e2e
npm run dist:mac -- --publish never
npm run dist:win -- --publish never
```

Mac 打包目标为 arm64，Windows 为 x64。打包输出在 `release/`，个人版本没有正式签名、公证或自动更新。对已安装应用运行桌面测试时，将 `CWB_TEST_EXECUTABLE` 指向其可执行文件，随后运行 `npm run test:e2e`；测试使用独立临时资料目录，保留原应用数据。

运行时可用 `CLEVER_WORKBENCH_DATA_DIR` 指定隔离的资料位置。该目录下的 `data/` 包含数据库分代、附件和默认备份目录；日常迁移优先使用应用内完整备份，不直接拼接数据库文件。

## 添加内置模块

在 `src/features/` 实现页面，在 `src/app/modules.tsx` 登记入口、搜索类型和快捷新建操作。页面通过 `ModuleProps` 发布创建背景，并登记离开页面前的保存函数。加载并确定当前对象后调用 `setContext`；没有对象时传入 `{}`。这一步同时启用全局新建，避免在页面尚未就绪时使用错误背景。共用主题、弹层、Markdown 编辑器、附件、账号秘密和备份由现有模块提供。

普通数据读写经过类型化的 `window.desktop` 接口，秘密操作由主进程单独授权。增加持久化模型时，同步更新数据库版本、迁移、备份结构与恢复校验，并补充公开行为测试。更详细的术语和约定见 [CONTEXT.md](CONTEXT.md) 与 [AGENTS.md](AGENTS.md)。

- [正式规格](.scratch/desktop-workbench/spec.md)
- [23 项开发任务](.scratch/desktop-workbench/ticket-plan.md)与[实现进度](.scratch/desktop-workbench/implementation-state.md)
- [技术方案](.scratch/desktop-workbench/technical-plan.md)与[凭据保护实现](.scratch/desktop-workbench/vault-design.md)
