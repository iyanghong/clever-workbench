# 首轮调查：可复用功能与设计参考

查证日期：2026-10-18。本文区分已核实事实和待讨论建议，不替代需求决策。

## Clever Plan 可复用范围

本机参考目录为 `/Users/axelton/code/clever-plan`。调查时该目录没有 Git 元数据，因此本记录不能绑定到具体提交。

| 范围 | 已有行为 | 接入工作台时的关注点 |
| --- | --- | --- |
| 任务 | 标题即可创建，自动记录创建和开始时间；一键完成、重开、回收站 | 明确“归类”与“归档”的区别，确认重开是否沿用当前状态口径 |
| 项目 | 名称、颜色、归档时间；任务最多属于一个项目；有未完成任务时不能归档 | 与台账中的项目是否共用身份，须由领域关系决定 |
| 编辑器 | Tiptap 即时排版，图片选择、拖入、粘贴及预览；JSON 正文与 Markdown 副本 | 明确用户需要即时排版、源码模式还是两者；独立技术文档需要独立对象 |
| 保存 | 防抖保存、图片导入等待、退出前保存握手 | 将编辑和附件能力供任务与文档共同使用 |
| 图片 | 独立本地副本、内容哈希命名；支持 PNG、JPEG、WebP、GIF | 复用附件导入机制，升级引用关系与备份范围 |
| 统计 | 月度与项目回顾，时间条为开始至完成；未完成延伸至现在 | 这是回顾跨度；没有计划排期、依赖或实际工时 |
| 本地存储 | Electron 主进程中的 SQLite；现有项目、任务、偏好三张表 | 新增台账与文档后需升级迁移和备份校验 |
| 备份 | 数据库一致快照与引用图片组成 ZIP；恢复前校验并保留恢复前副本 | 当前格式固定为 Clever Plan，现有内容与 ZIP 未加密 |
| 桌面能力 | Electron、受限 preload/IPC、窗口管理、macOS/Windows 打包配置 | 新应用需独立身份与数据路径；Windows 仍需实机验收 |

关键证据：

- [任务创建与完成](../../../clever-plan/electron/store.ts) 中的 `saveTask` / `completeTask`；原文件在当前仓库同级的 `clever-plan` 目录下。
- [图文编辑器](/Users/axelton/code/clever-plan/src/components/Editor.tsx:43)、[自动保存](/Users/axelton/code/clever-plan/src/components/Detail.tsx:63)。
- [时间口径](/Users/axelton/code/clever-plan/src/domain.ts:20)、[时间线](/Users/axelton/code/clever-plan/src/components/Timeline.tsx:41)。
- [备份与恢复](/Users/axelton/code/clever-plan/electron/backup.ts:55)、[桌面隔离与窗口](/Users/axelton/code/clever-plan/electron/main.ts:54)。
- [现有应用入口](/Users/axelton/code/clever-plan/src/App.tsx:37) 将页面与侧栏写在主文件中，尚无可扩展模块入口。

本轮运行了现有 `npm test`：1 个测试文件、9 项测试通过，使用隔离临时目录。未运行桌面 E2E、构建、打包或 Windows 实机验证。原 README 中的平台验证描述属于已有记录，不作为本轮验证结果。

## macOS 27 视觉依据

Apple 已发布 [macOS 27 设计套件](https://developer.apple.com/news/?id=e2lxw9l1)，包含 Liquid Glass 更新及 macOS 深色模式。[macOS 27 更新说明](https://support.apple.com/en-us/127257) 提到更好的可读性、可调透明程度、统一工具栏和贴边侧边栏。

建议将视觉重点放在导航与内容的清晰分层、精炼工具栏、精确间距和稳定可读性上。玻璃材质集中用于导航和操作区域；密集台账与 Markdown 内容使用清晰底色。两平台可共享视觉语言，窗口操作及快捷键遵从各自平台习惯。这是设计建议，尚未锁定具体布局。

继续设计时对照 [Liquid Glass 采用指南](https://developer.apple.com/documentation/TechnologyOverviews/adopting-liquid-glass)、[侧边栏规范](https://developer.apple.com/design/human-interface-guidelines/sidebars) 和 [搜索规范](https://developer.apple.com/design/human-interface-guidelines/searching)。

## 可借鉴的开源交互

| 参考 | 值得借鉴的方向 | 对本项目的建议 |
| --- | --- | --- |
| [Joplin](https://github.com/laurent22/joplin) | 离线笔记、Markdown、附件与搜索 | 图片粘贴后保存本地副本；快速检索文档与关联内容 |
| [AppFlowy](https://github.com/AppFlowy-IO/AppFlowy) | 同一份数据的不同视图 | 任务列表与时间线读取同一任务；避免各页面产生互不关联的副本 |
| [AFFiNE](https://github.com/toeverything/AFFiNE) | 本地优先文档与内容之间的连接 | 在项目、系统、文档与任务之间提供跳转与上下文聚合 |

[Joplin 附件文档](https://joplinapp.org/help/apps/attachments/) 明确支持拖入附件与直接粘贴图片。[搜索文档](https://joplinapp.org/help/apps/search/) 对中文等无空格分词语言有专门处理，提示本项目需要用真实中文资料验收搜索。

这里借鉴交互，不直接引入第三方源码。实际复制代码前，应检查所涉及文件的许可：[Joplin](https://github.com/laurent22/joplin/blob/dev/LICENSE)、[AppFlowy](https://github.com/AppFlowy-IO/AppFlowy/blob/main/LICENSE)、[AFFiNE](https://github.com/toeverything/AFFiNE/blob/canary/LICENSE)。

## 下一轮需要具体化的语义

- 用户所说的“按项目归档”，是按项目归类，还是将结束的项目移出日常列表，或两者都需要？
- 甘特图用于回顾已发生的工作，还是还需要未来排期？
- 是否需要把已有 Clever Plan 数据导入新工作台？
- 即时 Markdown 排版是否足够，还是需要直接编辑 Markdown 源码？
- 系统、服务、部署环境和账号的归属，在共享服务与共享基础设施场景下如何表达？

## 桌面架构与加密迁移

现有 Electron 程序已经实现 Node 文件访问、SQLite、ZIP 备份、IPC、图片协议及窗口生命周期。继续使用 Electron 可复用这些实现；改用 Tauri 时，React 界面与部分业务计算可保留，但上述桌面能力需移植和重新验证。Tauri 使用平台 WebView，具体差异见 [进程模型](https://v2.tauri.app/concept/process-model/) 和 [WebView 版本说明](https://v2.tauri.app/reference/webview-versions/)。本轮没有测量两者的启动、内存或包体差异。

本机加密与换机恢复是两个问题。[Electron safeStorage](https://www.electronjs.org/docs/latest/api/safe-storage) 在 macOS 使用 Keychain，在 Windows 使用 DPAPI；[Microsoft DPAPI 文档](https://learn.microsoft.com/en-us/windows/win32/api/dpapi/nf-dpapi-cryptprotectdata) 说明其通常与用户及电脑相关。不能假设把本机密文复制到另一台电脑后就能解密。用户已决定应用内保存凭据，因此需要继续确认加密范围、解锁体验和便携备份的恢复方式。

建议按职责分出应用外壳、任务、技术台账、文档及公共桌面能力。新增内置模块接入统一导航、搜索和快捷操作，复用编辑器、附件与备份能力。具体接口在需求明确后确定。

## 源码切换的追加核查

现有 Tiptap 提供 `getMarkdown()`、`setContent(source, { contentType: 'markdown' })` 等公开接口，但 Clever Plan 尚无源码切换入口。[官方用法](https://tiptap.dev/docs/editor/markdown/getting-started/basic-usage) 与 [格式限制](https://tiptap.dev/docs/editor/markdown#limitations) 说明转换依赖相应扩展；当前 Markdown 功能仍标记为 Beta。

本轮使用现有依赖和等效扩展配置做了无文件、无数据库的转换探针：基础格式、本地图片、代码块及单层任务清单可以保留；GFM 表格在当前配置下被解析为空文档，混合列表被拆段，部分标记被规范化。当前缺少 Table 扩展，后端节点校验也不接受表格；嵌套任务清单同样受现有 schema 限制。实现源码切换时需补齐受支持格式与保存校验，保护未支持的原文；不能承诺仅增加一个文本框即可安全完成切换。

## 平台与解锁能力的追加核查

当前机器实际为 `arm64`、macOS 27.0.1（26A434）。Electron 44.9 的 [固定版本说明](https://github.com/electron/electron/blob/v44.9.0/README.md) 列出 macOS 13 及以上、Windows 10 及以上，支持 x64 和 arm64；[Electron 44 说明](https://www.electronjs.org/blog/electron-44-0) 记录了 Windows 32 位支持的移除。运行时支持范围不等于本产品已完成相应平台验收；用户首版目标为当前 Mac 与 Windows 11 x64。

`safeStorage` 不接受应用主密码，也没有通用的每次指纹验证参数。Electron 的 [Touch ID 接口](https://www.electronjs.org/docs/latest/api/system-preferences#systempreferencesprompttouchidreason-macos) 为 macOS 专用，认证成功不等于自动将密钥绑定到用户在场条件。Windows 的 [桌面用户验证](https://learn.microsoft.com/en-us/uwp/api/windows.security.credentials.ui.userconsentverifier) 需要原生互操作，不能假定与 Electron 的 Touch ID 接口直接对等。用户选择跨平台主密码方案，因此首版不以生物识别为依赖。

## 实现前环境核查（2026-10-18）

本次只读核查确认当前工作仓库位于 `master`，现有提交为 `37b437481aa68fdf25e6563261398cd69ccbb7f0`；工作区内容仍是协作配置、规格和任务文档，尚无应用代码。该提交可作为后续实现审查的固定起点。

本机运行环境为 Node 25.8.1、npm 11.11.0。参考程序已安装 Electron 44.9.0、TypeScript 7.0.2、Vitest 4.1.12、Playwright 1.64.1、Tiptap React 与 Markdown 3.32.0；未安装 Tiptap Table 扩展。这里只记录本机实际状态，不把已安装版本等同于已验证新工作台兼容性。

参考程序把任务查询、变更、草稿、图片和备份通过受限桌面接口提供给界面，适合作为此前已确认的测试边界。它的现有桌面测试使用隔离临时资料目录，已有退出保存和完整备份流程；后续接入时需保持这些保护，并扩展账号、文档及加密行为。

迁入新应用时需一并更换产品身份、资料目录环境变量、附件协议、备份格式标识、窗口名称和产物验证脚本。现有附件正文校验与备份检查均含旧协议或旧格式，不能仅替换窗口标题。

GitHub 查询确认 `iyanghong/clever-workbench` 为私有仓库，默认分支为 `master`，Actions 已启用且允许 Actions 工作流；当前没有可核验的运行记录。本轮没有推送或触发工作流。参考程序已有 macOS／Windows 构建矩阵可作为后续起点；Actions 可用不证明 Windows 桌面事件、安装包或双向迁移已经通过，仍需实际执行并保留证据。
