# 首批操作指引全量覆盖清单

Status: ready-for-human

初始源码清点日期：2026-10-21。下方“功能矩阵”保留当时确定的 26 组验收范围；当前交付结果见文末逐项映射，不能把初始“待编写”表述当作现状。

初始调查基线：`5ea5782bdba7565831766a373670ec20b2bbd43c`，应用版本 `0.1.11`；当时的远端引用为 `4dc5b58c34ae22c67c83a97adb07b3ae521f278e`。最终实施选定源码 `319072ec799b686d9ad73ada0ca84780e21700d2` 已包含导出变化及跨平台文案修订；任务 11 用隔离本地绑定包 `v99.4.13` 核对，未推送或公开该测试版本。

## 覆盖口径

Q15 要求首批覆盖全部现有功能。下面按 26 组用户流程组织，复杂组应拆成短的子流程，共用编辑、保存、解锁与复制说明可以复用。组数不是交付指标；每组列出的操作都应关联到最终配置的 `guideId` 和步骤，不能只创建 26 个空标题。

维护者的源码提交、构建与双击发布脚本属于[发布规范](../../docs/releases.md)，不作为应用内普通用户导航功能。正式版不显示的开发者工具不纳入本清单。新增的指引功能自身也需要“查看功能指引、重看版本说明”的使用说明，不能因其不属于当前源码而漏掉。

## 功能矩阵

下表是初始需求清单，标识为当时的建议名。实际指引有拆分和复用，以文末逐项映射及包内配置为准。

| 编号／建议标识 | 流程与必须覆盖的操作 | 入口与源码依据 |
| --- | --- | --- |
| 01 `workspace-basics` | 模块切换；首页快速记录待办、完成及撤销、最近文档与写方案；常用系统／入口／账号／工具的选择、打开、上移、下移、移出；原生窗口关闭／最小化／全屏／缩放、编辑菜单及保存反馈。 | 工作台；工具卡片星标；[HomePage](../../src/features/home/HomePage.tsx)、[ToolsPage](../../src/features/tools/ToolsPage.tsx)、[原生菜单](../../electron/main.ts)。 |
| 02 `search-and-create` | 全局搜索、键盘选择与打开、结果中的地址打开及账号复制；九种新建项及当前系统／环境背景；先保存再打开、取消及无背景场景。说明秘密不参与搜索。 | 顶部搜索／新建；⌘K、⌘N（Windows 对应 Ctrl）；[GlobalSearch](../../src/features/search/GlobalSearch.tsx)、[QuickCreate](../../src/app/QuickCreate.tsx)、[登记表](../../src/app/modules.tsx)。 |
| 03 `systems-environments-projects` | 新增系统；编辑名称、登录地址、说明；环境新增、改名、删除；系统当前项目与沿革；项目新增、编辑、归档、恢复、删除空项目。说明项目不决定任务归属，恢复项目不自动恢复系统的当前项目关联。 | 台账切换系统；更多 → 系统信息 → 基本信息／环境管理／项目档案；侧栏项目档案；[SystemActionsMenu](../../src/features/ledger/SystemActionsMenu.tsx)、[WorkspaceEditors](../../src/features/ledger/WorkspaceEditors.tsx)。 |
| 04 `ledger-browse-and-copy` | 七类台账切换；搜索、环境与标签筛选；完整清单、摘要、详情和返回；编辑／完成编辑；适用范围与标签；单字段、单条、当前结果和多选资料复制；显式选择账号／秘密、解锁及复制失败处理。 | 台账；[LedgerWorkspace](../../src/features/ledger/LedgerWorkspace.tsx)、[LedgerCopy](../../src/features/ledger/LedgerCopy.tsx)、[适用范围](../../src/features/ledger/WorkspaceEditors.tsx)。 |
| 05 `access-entries` | 创建与编辑访问入口；多个地址、地址名、常用地址、排序、删除地址；打开／复制地址、关联账号及常用账号；复制到目标系统／环境时选择账号与秘密；删除入口及影响。 | 台账 → 访问入口；[AccessEntryEditor](../../src/features/ledger/AccessEntryEditor.tsx)、[LedgerCaptureForm](../../src/features/ledger/LedgerCaptureForm.tsx)。 |
| 06 `resources` | 服务器和数据库／中间件创建与编辑；多组具名连接、关联服务器、地址回退与常用连接；可选配置、附加字段、说明及账号；资源链接；复制资源、选择目标与秘密；删除前的引用限制。 | 台账 → 服务器／数据库／中间件；[Resources](../../src/features/ledger/Resources.tsx)、[连接字段](../../src/features/ledger/RecordFields.tsx)。 |
| 07 `accounts` | 账号创建、用途／角色、用户名、说明与秘密；收藏；单条和列表显示／隐藏秘密；复制用户名、密码、其他秘密及整行；复制账号、同系统内调整归属、删除。说明环境／资源／入口归属条件。 | 台账账号分类及对象详情；[AccountList](../../src/features/ledger/AccountList.tsx)、[Accounts](../../src/features/ledger/Accounts.tsx)、[QuickRecord](../../src/features/ledger/QuickRecord.tsx)。 |
| 08 `services-and-deployments` | 创建与编辑服务、代码仓库和说明；新增／编辑／删除部署节点；固定部署与按需调度；环境、可选服务器、地址端口、数量和部署排障资料；服务和节点引用本系统或通用操作文档；删除服务；地址回退显示规则。 | 台账 → 应用部署；[WorkspaceEditors](../../src/features/ledger/WorkspaceEditors.tsx)、[LedgerWorkspace](../../src/features/ledger/LedgerWorkspace.tsx)。 |
| 09 `operations-and-related-work` | 运行作业与备份策略的新增、编辑、类型／状态筛选、删除；频率、环境及服务／资源关联；操作文档；从相关工作为当前系统写文档、录入任务、打开已有对象。 | 台账 → 运行维护／相关工作；[WorkspaceEditors](../../src/features/ledger/WorkspaceEditors.tsx)、[RelatedWork](../../src/features/ledger/RelatedWork.tsx)。 |
| 10 `ledger-paste` | 直接填写多行，或粘贴表格／TSV 后按清单／资料卡、表头和列映射追加到可编辑表格；逐行修正、跳过、确认新增及丢弃。每批最多 200 条，覆盖入口、服务器、数据库、Redis、其他资源、服务、作业、备份策略、账号和节点。 | 台账 → 批量录入；[PasteLedger](../../src/features/ledger/PasteLedger.tsx)。 |
| 11 `system-export` | 选择系统、文档与任务及任务开始日期范围；无实际文档时单选 Markdown／Word／PDF 保存单文件，包含文档时可多选格式保存 ZIP；本系统直接引用的通用文档一同导出；明确秘密明文输出且不可用于恢复。 | 台账 → 更多 → 导出资料；[SystemExportDialog](../../src/features/ledger/SystemExportDialog.tsx)、[system-export](../../electron/system-export.ts)。 |
| 12 `tasks` | 快速录入／详细草稿／丢弃／创建；标题内容、放大编辑、保存失败重试；关联系统与返回台账；开始／完成时间；预计完成与临期开始；标签；完成、重开、删除；系统／状态／关键词／标签筛选，任一／全部标签匹配；紧凑布局与时间归类；批量关联系统；标签新增、改名、换色、删除。 | 任务及任务详情；[TaskWorkspace](../../src/features/tasks/TaskWorkspace.tsx)、[Detail](../../src/components/Detail.tsx)、[TaskTags](../../src/features/tasks/TaskTags.tsx)。 |
| 13 `documents-and-editor` | 新建、标题／正文搜索、通用／系统归属及背景筛选、关联背景与回到对象；被服务或节点引用时的删除／改归属保护；即时排版与 Markdown 源码；格式、列表、勾选、引用、代码、表格、撤销重做；本地图片插入／粘贴／拖入及原图预览；自动保存与重试。共用编辑能力与任务复用。 | 文档；[DocumentsPage](../../src/features/documents/DocumentsPage.tsx)、[Editor](../../src/components/Editor.tsx)。 |
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

初始本地基线固定包含系统文档与任务，只能选择格式及秘密类型，总是保存 ZIP；当时的远端 `4dc5b58` 已有文档／任务包含开关、任务开始日期范围（含首尾、空值不限），以及单格式且无输出文档时保存单文件并嵌图的逻辑。

实施时已合入该导出功能；`system-export` 的 `choose-content`、`task-dates`、`choose-format` 和 `save-result` 步骤按选定源码及隔离 Electron 导出结果核对。是否已由 GitHub 正式发布仍以实际 Release 为准。

### 三种密码不要混用

当前源码及 ADR 0011 已将新备份恢复密码与日常主密码分离；原有根规范中“备份生成时的主密码”不能作为所有新备份的说明。新备份使用生成时的独立备份密码，历史备份按实际格式使用生成时的旧密码。ZIP 文本归档的密码又独立于这两者，仅用于该次归档／还原。

此差异在已确认规范中明确标注；任务 09 已同步修正根规范和使用文档，未改变密码实现。

### 菜单文字与实际行为

原生菜单仍有“新增任务／搜索任务”的文字，但对应动作实际上打开统一新建和全局搜索。指引应说明真实功能，不能缩窄为只有任务；此菜单文案差异单独记录，不能在操作截图中伪造已经修改。

### 平台与删除边界

当前真实发布／在线自动安装以 macOS Apple Silicon 为准，不宣称 Windows 或 Intel 安装更新已验收。任务、文档有对应回收站；不能将其他台账实体的直接删除写成可从这些回收站找回。工作回顾显示日历跨度，不能称为实际工时。

## 当前交付的逐项覆盖证据

本节原始 269 步安装包证据来自 2026-10-23 的旧台账界面，保留作历史验收记录。2026-10-28 合并远端 `v0.1.15` 后，当前配置为 47 篇、275 步、三张图片；新界面与安装包的验证见[整合记录](implementation-release-integration.md)，不能把旧包截图或旧流程测试当成本次结果。

2026-10-23 隔离本地绑定安装包 `v99.4.13`（业务源码 `319072e`）从包内原始 JSON 读取 47 篇有效功能正文。逐篇从“设置 → 查看全部使用指引”打开，翻阅 **269 个真实步骤**，核对每步标题、预期结果、最后完成结果及三张本地图片加载，结果见[安装版逐步阅读记录](evidence/11/final-installed-all-guides.json)。完整的 26 组 → guideId → 每一个稳定 stepId、实际附近位置和任务证据保存在[全步骤映射](evidence/11/coverage-map.json)；下表列关键步骤便于定位。该阅读检查不等于 269 个业务动作都已逐一实际执行；动作测试与静态核对的界限由每项实施记录说明。

| 组 | 附近入口／实际 guideId | 关键 stepId（全量见映射） | 操作依据与范围 |
| --- | --- | --- | --- |
| 01 工作台基础 | 工作台顶部；常用工具卡片旁：`workspace-basics`、`workspace-favorites`、`workspace-window` | `workspace-basics/capture、workspace-favorites/order、workspace-window/commands` | [任务 05](implementation-05.md)：首页、菜单与保存链已核对；原生窗口鼠标另记总验收。 |
| 02 搜索与新建 | 顶部搜索和新建旁：`search-and-open`、`search-and-create` | `search-and-open/select、search-and-create/context、search-and-create/cancel` | [任务 05](implementation-05.md)：九种选项可见且取消安全；并非九类均逐条创建。 |
| 03 系统、环境与项目 | 系统“更多”菜单；项目档案页：`systems-environments`、`projects-history` | `systems-environments/project、projects-history/archive、projects-history/restore` | [任务 06](implementation-06.md)：当前项目、沿革和归档恢复实际操作已验。 |
| 04 台账浏览与复制 | 台账当前分类顶部：`ledger-browsing`、`ledger-scope`、`ledger-copy` | `ledger-browsing/detail、ledger-scope/environments、ledger-copy/password` | [任务 06](implementation-06.md)：七类、范围与显式秘密复制按真实台账运行。 |
| 05 访问入口 | 台账 → 访问入口顶部：`access-entries`、`access-copy-delete` | `access-entries/addresses、access-entries/preferred、access-copy-delete/secrets` | [任务 06](implementation-06.md)：地址排序、常用、秘密复制及取消路径已验。 |
| 06 资源 | 台账 → 服务器／数据库／中间件顶部：`resource-server`、`resource-datastores`、`resource-copy-delete` | `resource-server/fields、resource-datastores/connect、resource-copy-delete/delete` | [任务 07](implementation-07.md)：资源配置、独立副本和被引用删除保护已验。 |
| 07 账号 | 台账 → 账号顶部及关联账号区：`accounts-secrets`、`accounts-ownership` | `accounts-secrets/secret、accounts-secrets/row、accounts-ownership/move` | [任务 06](implementation-06.md)：显示／复制秘密、收藏与归属调整已验。 |
| 08 服务与部署 | 台账 → 应用部署顶部：`services-deployments` | `services-deployments/node、services-deployments/address、services-deployments/delete-service` | [任务 07](implementation-07.md)：节点地址回退、按需状态及删除限制已验。 |
| 09 运维与相关工作 | 台账 → 运行维护顶部及相关工作：`operations-maintenance`、`ledger-related-work` | `operations-maintenance/kind-frequency、ledger-related-work/document、ledger-related-work/task` | [任务 07](implementation-07.md)：作业／备份策略与相关系统工作已验。 |
| 10 表格批量录入 | 台账 → 批量录入旁：`ledger-paste` | `ledger-paste/direct-rows、ledger-paste/append-source、ledger-paste/review-rows、ledger-paste/leave` | 原[任务 07](implementation-07.md)为旧界面验收；合并后[整合验收](implementation-release-integration.md)覆盖手填、追加、逐行跳过与未提交放弃。 |
| 11 系统资料导出 | 系统“更多” → 导出资料旁：`system-export` | `system-export/choose-content、system-export/task-dates、system-export/secrets` | [任务 07](implementation-07.md)：内容／日期／格式选择、保存前同步和解锁取消已验。 |
| 12 工作任务 | 工作任务顶部；任务详情编辑器：`tasks-capture`、`tasks-edit`、`tasks-planning`、`tasks-filter`、`tasks-tags`、`editor-formatting`、`editor-images` | `tasks-capture/discard、tasks-planning/due、tasks-filter/assign、tasks-tags/delete` | [任务 05](implementation-05.md)：录入、计划、标签、归属和保存失败已验；个别控件见任务记录的静态核对。 |
| 13 文档与编辑器 | 文档顶部；文档编辑器：`documents-and-editor`、`editor-formatting`、`editor-images` | `documents-and-editor/context、editor-formatting/table、editor-images/preview` | [任务 05](implementation-05.md)：源码、格式、图片与重开已验；原生拖拽仍未单独执行。 |
| 14 工作回顾 | 工作回顾顶部：`work-review` | `work-review/month、work-review/system、work-review/detail` | [任务 05](implementation-05.md)：月度／系统回顾与日历跨度已验。 |
| 15 回收站 | 侧栏回收站；文档回收站页：`recycle-tasks`、`recycle-documents` | `recycle-tasks/empty、recycle-documents/restore、recycle-documents/purge` | [任务 08](implementation-08.md)：任务和文档恢复、永久删除的范围分别核对。 |
| 16 外观 | 设置 → 外观：`appearance` | `appearance/theme、appearance/contrast、appearance/motion` | [任务 08](implementation-08.md)：浅深主题及辅助偏好、焦点返回已验。 |
| 17 凭据保护 | 设置 → 秘密保护：`secret-protection`、`master-password-manage` | `secret-protection/unlock、secret-protection/lock、master-password-manage/disable` | [任务 08](implementation-08.md)：主密码启停、解锁和秘密保护已验；系统真实钥匙串授权不由模拟夹具证明。 |
| 18 备份密码 | 设置 → 备份与迁移 → 独立备份密码：`backup-password` | `backup-password/enter、backup-password/cancel、backup-password/change` | [任务 09](implementation-09.md)：独立备份密码配置与取消已验。 |
| 19 完整备份 | 设置 → 备份与迁移 → 导出／自动备份：`full-backup`、`automatic-backup` | `full-backup/verify-scope、automatic-backup/result、automatic-backup/retention` | [任务 09](implementation-09.md)：真实加密备份、自动备份失败保留已验。 |
| 20 恢复与迁移 | 设置 → 备份与迁移 → 从备份恢复：`restore-and-migrate` | `restore-and-migrate/password、restore-and-migrate/preview、restore-and-migrate/confirm` | [任务 09](implementation-09.md)：错误密码、取消、目标解锁与整份恢复已验。 |
| 21 应用更新 | 设置 → 关于；更新弹窗：`application-update` | `application-update/check、application-update/restart-choice、application-update/verify` | [任务 01](implementation-01.md)：弹窗、保存避让与测试状态已验；真实 GitHub 下载安装未在本任务执行。 |
| 22 更新历史与恢复 | 设置 → 关于 → 更新历史；更新弹窗：`update-history-and-recovery` | `update-history-and-recovery/interpret-health、update-history-and-recovery/recover` | [任务 09](implementation-09.md)：隔离更新历史与材料定位已验；人工恢复和健康安装未执行。 |
| 23 文件归档 | 工具 → ZIP 文本归档 → 归档文件：`zip-archive-files` | `zip-archive-files/select-source、zip-archive-files/password-run、zip-archive-files/check-result` | [任务 10](implementation-10.md)：实际归档／还原及原目标不覆盖已验。 |
| 24 Git 筛选归档 | 工具 → ZIP 文本归档 → Git 筛选归档：`zip-archive-git` | `zip-archive-git/filter、zip-archive-git/select-preview、zip-archive-git/pack` | [任务 10](implementation-10.md)：提交筛路径、当前磁盘内容与缺失项已验。 |
| 25 分片目录还原 | 工具 → ZIP 文本归档 → 目录还原：`zip-restore-directory` | `zip-restore-directory/parts-directory、zip-restore-directory/recover-failure` | [任务 10](implementation-10.md)：完整分片、密码错误与文件哈希已验。 |
| 26 剪贴板还原 | 工具 → ZIP 文本归档 → 剪贴板还原：`zip-restore-clipboard` | `zip-restore-clipboard/collect、zip-restore-clipboard/repair、zip-restore-clipboard/check` | [任务 10](implementation-10.md)：乱序／重复／混包、后台和退出约束已验。 |

指引功能本身由 `using-guidance/open`、`read`、`versions`、`navigate` 覆盖，设置集中入口和升级后一次提示参见[任务 01](implementation-01.md)与[任务 02](implementation-02.md)。共享编辑步骤在 12／13 复用，不另算一篇。配置中不存在为完成组数而放置的空标题：每篇均含用途、准备条件、入口、动作、可观察结果、完成结果和常见问题；这一结论由[内容检查](evidence/11/guidance-report-summary.json)和实际包内逐步显示共同支持。

截至此表编写时，47 篇指引及三张本地图片可离线阅读。发布核对记录仍有人工签认警告；实际 GitHub Release、真实网络更新、生产系统钥匙串授权、Windows／Intel 安装均不在此本地验收结果内。安装版原生鼠标、最终异常内容链路和正式交付结论以[任务 11 实施记录](implementation-11.md)为准。
