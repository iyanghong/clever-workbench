# 首批操作指引全量覆盖清单

Status: in-progress

日期：2026-10-21。状态：源码清点完成；以下是待编写、待运行核对的范围，不是已经完成的用户指引。

本地基线：`5ea5782bdba7565831766a373670ec20b2bbd43c`，应用版本 `0.1.11`。已存在的远端引用：`origin/master` 的 `4dc5b58c34ae22c67c83a97adb07b3ae521f278e`。本次未合并、未发布、未启动应用验证功能，仅静态核对源码。

## 覆盖口径

Q15 要求首批覆盖全部现有功能。下面按 26 组用户流程组织，复杂组应拆成短的子流程，共用编辑、保存、解锁与复制说明可以复用。组数不是交付指标；每组列出的操作都应关联到最终配置的 `guideId` 和步骤，不能只创建 26 个空标题。

维护者的源码提交、构建与双击发布脚本属于[发布规范](../../docs/releases.md)，不作为应用内普通用户导航功能。正式版不显示的开发者工具不纳入本清单。新增的指引功能自身也需要“查看功能指引、重看版本说明”的使用说明，不能因其不属于当前源码而漏掉。

## 功能矩阵

以下各行当前均为“待编写／未运行核对”。建议标识在实际配置登记时固定，后续不因改名随意更换。

| 编号／建议标识 | 流程与必须覆盖的操作 | 入口与源码依据 |
| --- | --- | --- |
| 01 `workspace-basics` | 模块切换；首页快速记录待办、完成及撤销、最近文档与写方案；常用系统／入口／账号／工具的选择、打开、上移、下移、移出；原生窗口关闭／最小化／全屏／缩放、编辑菜单及保存反馈。 | 工作台；工具卡片星标；[HomePage](../../src/features/home/HomePage.tsx)、[ToolsPage](../../src/features/tools/ToolsPage.tsx)、[原生菜单](../../electron/main.ts)。 |
| 02 `search-and-create` | 全局搜索、键盘选择与打开、结果中的地址打开及账号复制；九种新建项及当前系统／环境背景；先保存再打开、取消及无背景场景。说明秘密不参与搜索。 | 顶部搜索／新建；⌘K、⌘N（Windows 对应 Ctrl）；[GlobalSearch](../../src/features/search/GlobalSearch.tsx)、[QuickCreate](../../src/app/QuickCreate.tsx)、[登记表](../../src/app/modules.tsx)。 |
| 03 `systems-environments-projects` | 新增系统；编辑名称、登录地址、说明；环境新增、改名、删除；系统当前项目与沿革；项目新增、编辑、归档、恢复、删除空项目。说明项目不决定任务归属，恢复项目不自动恢复系统的当前项目关联。 | 台账切换系统；更多 → 系统信息 → 基本信息／环境管理／项目档案；侧栏项目档案；[SystemActionsMenu](../../src/features/ledger/SystemActionsMenu.tsx)、[WorkspaceEditors](../../src/features/ledger/WorkspaceEditors.tsx)。 |
| 04 `ledger-browse-and-copy` | 七类台账切换；搜索、环境与标签筛选；完整清单、摘要、详情和返回；编辑／完成编辑；适用范围与标签；单字段、单条、当前结果和多选资料复制；显式选择账号／秘密、解锁及复制失败处理。 | 台账；[LedgerWorkspace](../../src/features/ledger/LedgerWorkspace.tsx)、[LedgerCopy](../../src/features/ledger/LedgerCopy.tsx)、[适用范围](../../src/features/ledger/WorkspaceEditors.tsx)。 |
| 05 `access-entries` | 创建与编辑访问入口；多个地址、地址名、常用地址、排序、删除地址；打开／复制地址、关联账号及常用账号；复制到目标系统／环境时选择账号与秘密；删除入口及影响。 | 台账 → 访问入口；[AccessEntryEditor](../../src/features/ledger/AccessEntryEditor.tsx)、[LedgerCaptureForm](../../src/features/ledger/LedgerCaptureForm.tsx)。 |
| 06 `resources` | 服务器和数据库／中间件创建与编辑；名称、类型、地址端口、配置、附加字段、说明及关联账号；资源链接；复制资源、选择目标与秘密；删除前的引用限制。 | 台账 → 服务器／数据库／中间件；[Resources](../../src/features/ledger/Resources.tsx)。 |
| 07 `accounts` | 账号创建、用途／角色、用户名、说明与秘密；收藏；单条和列表显示／隐藏秘密；复制用户名、密码、其他秘密及整行；复制账号、同系统内调整归属、删除。说明环境／资源／入口归属条件。 | 台账账号分类及对象详情；[AccountList](../../src/features/ledger/AccountList.tsx)、[Accounts](../../src/features/ledger/Accounts.tsx)、[QuickRecord](../../src/features/ledger/QuickRecord.tsx)。 |
| 08 `services-and-deployments` | 创建与编辑服务、代码仓库和说明；新增／编辑／删除部署节点；固定部署与按需调度；环境、可选服务器、地址端口、数量和说明；删除服务；地址回退显示规则。 | 台账 → 应用部署；[WorkspaceEditors](../../src/features/ledger/WorkspaceEditors.tsx)、[LedgerWorkspace](../../src/features/ledger/LedgerWorkspace.tsx)。 |
| 09 `operations-and-related-work` | 运行作业与备份策略的新增、编辑、类型／状态筛选、删除；频率、环境及服务／资源关联；操作文档；从相关工作为当前系统写文档、录入任务、打开已有对象。 | 台账 → 运行维护／相关工作；[WorkspaceEditors](../../src/features/ledger/WorkspaceEditors.tsx)、[RelatedWork](../../src/features/ledger/RelatedWork.tsx)。 |
| 10 `ledger-paste` | 粘贴表格／TSV；条目类型、环境及所属对象；清单／资料卡模式；表头、列映射和忽略；逐行勾选校对、确认新增及丢弃。覆盖入口、服务器、数据库、Redis、其他资源、服务、作业、备份策略、账号和节点。 | 台账 → 粘贴表格；[PasteLedger](../../src/features/ledger/PasteLedger.tsx)。 |
| 11 `system-export` | 选择系统，选择 Markdown／Word／PDF 格式和秘密类型，必要解锁，保存并查看结果；明确秘密明文输出且不可用于恢复。远端内容选择及任务日期筛选另见下方基线差异。 | 台账 → 更多 → 导出资料；[SystemExportDialog](../../src/features/ledger/SystemExportDialog.tsx)、[system-export](../../electron/system-export.ts)。 |
| 12 `tasks` | 快速录入／详细草稿／丢弃／创建；标题内容、放大编辑、保存失败重试；关联系统与返回台账；开始／完成时间；预计完成与临期开始；标签；完成、重开、删除；系统／状态／关键词／标签筛选，任一／全部标签匹配；紧凑布局与时间归类；批量关联系统；标签新增、改名、换色、删除。 | 任务及任务详情；[TaskWorkspace](../../src/features/tasks/TaskWorkspace.tsx)、[Detail](../../src/components/Detail.tsx)、[TaskTags](../../src/features/tasks/TaskTags.tsx)。 |
| 13 `documents-and-editor` | 新建、标题／正文搜索、通用／系统归属及背景筛选、关联背景与回到对象；即时排版与 Markdown 源码；格式、列表、勾选、引用、代码、表格、撤销重做；本地图片插入／粘贴／拖入及原图预览；自动保存与重试。共用编辑能力与任务复用。 | 文档；[DocumentsPage](../../src/features/documents/DocumentsPage.tsx)、[Editor](../../src/components/Editor.tsx)。 |
| 14 `work-review` | 月度／系统回顾，月份切换与回到本月，系统筛选，全貌／逐月查看，点击任务进入详情；数量和跨度解释，未完成任务延伸至今。 | 工作回顾；[Timeline](../../src/components/Timeline.tsx)。 |
| 15 `recycle-bin` | 任务恢复、单条彻底删除和清空；进入文档回收站，单篇恢复与彻底删除；只读查看和不可逆确认。不要宣称文档支持批量清空，或台账直接删除也会进入此回收站。 | 侧栏回收站 → 文档回收站；文档页的回收站入口；[TaskWorkspace](../../src/features/tasks/TaskWorkspace.tsx)、[DocumentsPage](../../src/features/documents/DocumentsPage.tsx)。 |
| 16 `appearance` | 浅色、深色、跟随系统；减少透明度、增强对比、减少动态效果；系统可访问性偏好的作用。 | 设置 → 界面主题；[SettingsPage](../../src/features/settings/SettingsPage.tsx)。 |
| 17 `secret-protection` | 默认系统账户保护；可选主密码的启用、解锁、立即锁定、更改、关闭；秘密显示／复制与锁定影响；更改后重新锁定，普通资料仍可读。与备份密码分开说明。 | 设置 → 秘密保护；[SettingsPage](../../src/features/settings/SettingsPage.tsx)、[PasswordChange](../../src/features/settings/PasswordChange.tsx)。 |
| 18 `backup-password` | 设置／更改独立备份密码，首次备份／启用自动备份／安装更新中的设置提示；至少 6 字符并确认；取消后停止该次触发动作；新密码只适用于后续备份。 | 设置 → 备份与迁移；[SettingsPage](../../src/features/settings/SettingsPage.tsx)、[VaultProvider](../../src/features/vault/VaultProvider.tsx)、[ADR 0011](../../docs/adr/0011-independent-password-for-portable-backups.md)。 |
| 19 `full-backup` | 导出完整 `.cwb`；覆盖资料、草稿、回收站、引用图片及秘密；锁定时备份；自动备份开关、目录、最近结果和立即重试；运行期间有变更时的每日备份及最近 7 份自动备份保留规则。 | 设置 → 备份与迁移；[SettingsPage](../../src/features/settings/SettingsPage.tsx)、[backup](../../electron/backup.ts)、[使用说明](../../docs/usage.md)。 |
| 20 `restore-and-migrate` | 选备份、输入该文件密码、预检摘要、确认整份替换与取消；目标主密码已启用时先解锁；恢复前的当前资料副本；保留目标保护模式和备份目录；新旧格式密码差异、换机恢复与失败处理。 | 设置 → 从备份恢复；[SettingsPage](../../src/features/settings/SettingsPage.tsx)、[backup](../../electron/backup.ts)。 |
| 21 `app-update` | 手动检查、有版本时品牌入口、下载与进度、立即重启／稍后、再次打开待安装提示；安装前保存与备份密码；正式安装位置和私有仓库读取条件。下载完成不是安装成功。 | 设置 → 关于；[AppUpdate](../../src/features/settings/AppUpdate.tsx)、[发布与安装说明](../../docs/releases.md)。 |
| 22 `update-history-and-recovery` | 最近 30 次历史、版本网页、定位备份／旧应用及查看日志；只读隔离运行后的 Finder 安装处理；系统授权；健康成功后的清理、失败时保留材料；区分人工恢复和自动更新成功。 | 设置 → 关于 → 更新历史；[AppUpdate](../../src/features/settings/AppUpdate.tsx)、[发布与安装说明](../../docs/releases.md)。 |
| 23 `zip-archive-files` | 单文件／目录、输出位置、TXT 分片大小、本次归档密码与确认、开始、进度、打开结果目录和复制路径；隐藏文件、空目录及二进制；新建 `.txtparts` 且不覆盖已有目录。 | 工具 → ZIP 文本归档 → 归档文件；[ZipTextPage](../../src/features/tools/ZipTextPage.tsx)。 |
| 24 `zip-archive-git` | 本地 Git 目录、分支、作者／日期／快捷时间范围、应用筛选、提交全选／反选／清空、文件预览与缺失文件、归档。必须说明“提交筛选路径，内容取当前磁盘”，包含未提交修改，既不 fetch 也不是历史快照导出。 | 工具 → ZIP 文本归档 → Git 筛选归档；[ZipTextPage](../../src/features/tools/ZipTextPage.tsx)。 |
| 25 `zip-restore-directory` | 分片目录、输出位置、原归档密码、开始与结果；无需原分片大小，新建 `restored` 而不覆盖已有目标；分片不完整／密码错误处理。 | 工具 → ZIP 文本归档 → 目录还原；[ZipTextPage](../../src/features/tools/ZipTextPage.tsx)。 |
| 26 `zip-restore-clipboard` | 复制完整 TXT、⌘V／从剪贴板加入；顺序不限与重复跳过；异常片替换、移除、清空；集齐有效分片、输出目录、密码和还原；后台切页与结束前退出限制。本次密码不保存。 | 工具 → ZIP 文本归档 → 剪贴板还原；[ZipTextPage](../../src/features/tools/ZipTextPage.tsx)。 |

## 已知事实差异与编写约束

### 导出功能的本地与远端差异

本地基线固定包含系统文档与任务，只能选择格式及秘密类型，总是保存 ZIP。已存在的 `origin/master 4dc5b58` 另有文档／任务包含开关、任务开始日期范围（含首尾、空值不限），以及单格式且无输出文档时保存单文件并嵌图的逻辑。

这些远端流程纳入第 11 组的待核对范围；本次未将其合入本地、未证明已经发布。正式编写绑定选定源码：若含该变化必须完整讲解；若未包含则不能在当前指引中显示尚不存在的控件。

### 三种密码不要混用

当前源码及 ADR 0011 已将新备份恢复密码与日常主密码分离；原有根规范中“备份生成时的主密码”不能作为所有新备份的说明。新备份使用生成时的独立备份密码，历史备份按实际格式使用生成时的旧密码。ZIP 文本归档的密码又独立于这两者，仅用于该次归档／还原。

此差异在已确认规范中明确标注；本轮未修改根规范或密码实现。正式交付指引时应同步修正过时的根规范表述，避免长期存在两个口径。

### 菜单文字与实际行为

原生菜单仍有“新增任务／搜索任务”的文字，但对应动作实际上打开统一新建和全局搜索。指引应说明真实功能，不能缩窄为只有任务；此菜单文案差异单独记录，不能在操作截图中伪造已经修改。

### 平台与删除边界

当前真实发布／在线自动安装以 macOS Apple Silicon 为准，不宣称 Windows 或 Intel 安装更新已验收。任务、文档有对应回收站；不能将其他台账实体的直接删除写成可从这些回收站找回。工作回顾显示日历跨度，不能称为实际工时。

## 后续填写的覆盖证据

每个子流程记录以下字段，允许同一指引复用到多个组：

| 覆盖项 | 指引 ID／步骤 | 核对源码／版本 | 平台与环境 | 正文／图片状态 | 实际核对结果与证据 | 缺项与原因 |
| --- | --- | --- | --- | --- | --- | --- |
| 待按上述矩阵展开 | 未编写 | 未核对 | 未运行 | 待编写 | 未验证 | 不得填为通过 |

初始全量覆盖是本次功能完成条件；用户仍可按已确认策略带着警告发布，但不能据此把未编写项记为已经覆盖。后续版本发生操作变化时更新相应行及发布说明。
