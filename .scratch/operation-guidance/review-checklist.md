# 操作指引正式发布前人工核对表

状态：待维护者核对。此表供拟发布源码的最终界面验收使用；代理测试证据不能代替维护者签认。实际发布版本、源码 SHA、审核人、日期和结果应在检查完成后据实填写到 `content/guidance/pending.json#review`。此表目前不表示已通过。

## 核对方法

1. 使用本次整合源码构建的隔离 macOS 应用，确认“设置 → 查看全部使用指引”和各功能附近的入口；从指引点击“前往功能”时，确认只导航，不自动创建、删除、导出或安装。
2. 对下表每一组，打开对应正文，核对入口、步骤文字与操作后的可见结果；需要对象背景的步骤在隔离示例资料中操作。可参考[完整覆盖及既有证据](coverage.md)，其中历史 `v99.4.13` 包的证明不自动变成本次整合包的证明。
3. 核对三张本地图片是否真实显示、内容是否对应当前界面：`application-update/check`、`ledger-paste/direct-rows`、`system-export/choose-format`。图片只用示例资料，不能包含真实凭据。
4. 记录每组“通过／失败／未验证”、实际环境和偏差；不适用项注明原因。尤其检查新增的直接批量录入、具名连接、文档引用和单文件导出。

| 组 | 指引正文 | 最终界面需人工核对的重点 | 人工结果 |
| --- | --- | --- | --- |
| 01 工作台 | `workspace-basics`、`workspace-favorites`、`workspace-window` | 首页入口、收藏、原生窗口动作和保存反馈。 | 待核对 |
| 02 搜索与新建 | `search-and-open`、`search-and-create` | 全局搜索、九项新建、取消和上下文。 | 待核对 |
| 03 系统与项目 | `systems-environments`、`projects-history` | 系统、环境、项目沿革及归档入口。 | 待核对 |
| 04 台账浏览与复制 | `ledger-browsing`、`ledger-scope`、`ledger-copy` | 七类筛选、详情切换、复制和秘密解锁。 | 待核对 |
| 05 访问入口 | `access-entries`、`access-copy-delete` | 多地址、常用地址、复制与删除。 | 待核对 |
| 06 资源 | `resource-server`、`resource-datastores`、`resource-copy-delete` | 多组具名连接、服务器地址回退、常用连接、同系统复制和删除限制。 | 待核对 |
| 07 账号 | `accounts-secrets`、`accounts-ownership` | 归属、显示／复制秘密、收藏和删除。 | 待核对 |
| 08 服务与节点 | `services-deployments` | 操作文档引用、节点可选资料和地址回退。 | 待核对 |
| 09 运维与相关工作 | `operations-maintenance`、`ledger-related-work` | 作业、备份策略、相关任务和文档。 | 待核对 |
| 10 批量录入 | `ledger-paste` | 手填多行、粘贴映射后追加、逐行修正与跳过、未提交离开；核对新截图。 | 待核对 |
| 11 系统导出 | `system-export` | 文档和任务选项、日期、单文件／ZIP、被引用的通用文档、秘密明文；核对截图。 | 待核对 |
| 12 任务 | `tasks-capture`、`tasks-edit`、`tasks-planning`、`tasks-filter`、`tasks-tags` | 创建、保存、计划、标签、筛选、完成和重开。 | 待核对 |
| 13 文档与编辑器 | `documents-and-editor`、`editor-formatting`、`editor-images` | 归属、自动保存、图片和被服务／节点引用时的保护。 | 待核对 |
| 14 工作回顾 | `work-review` | 月份／系统筛选和日历跨度措辞。 | 待核对 |
| 15 回收站 | `recycle-tasks`、`recycle-documents` | 恢复与彻底删除，台账删除的边界。 | 待核对 |
| 16 外观 | `appearance` | 浅深主题、对比度、透明度与减少动态效果。 | 待核对 |
| 17 凭据保护 | `secret-protection`、`master-password-manage` | 默认系统保护、主密码、锁定和钥匙串触发时机。 | 待核对 |
| 18 备份密码 | `backup-password` | 与主密码分离、设置、更改与取消。 | 待核对 |
| 19 完整备份 | `full-backup`、`automatic-backup` | `.cwb` 范围、自动备份状态与保留规则。 | 待核对 |
| 20 恢复迁移 | `restore-and-migrate` | 预检、整份替换、取消及失败保护。 | 待核对 |
| 21 应用更新 | `application-update` | 检查、下载、立即／稍后重启、健康结果；核对截图。 | 待核对 |
| 22 更新历史 | `update-history-and-recovery` | 历史、日志、隔离位置和恢复材料。 | 待核对 |
| 23 文件归档 | `zip-archive-files` | 单文件／目录、分片、密码和结果。 | 待核对 |
| 24 Git 归档 | `zip-archive-git` | 提交筛选与当前磁盘文件内容的关系。 | 待核对 |
| 25 目录还原 | `zip-restore-directory` | 分片完整性、密码和不覆盖目标。 | 待核对 |
| 26 剪贴板还原 | `zip-restore-clipboard` | 分片收集、修复、还原和后台任务。 | 待核对 |

## 本次版本操作变化

`content/guidance/pending.json` 当前将操作变化标为 `changed`。维护者还需核对 `using-guidance/open`、`read`、`versions`、`navigate` 和 `application-update/check`、`download`、`restart-choice`、`prepare`、`verify`，并确认 GitHub 摘要与应用内指引同源。核对之前，`review` 保持 `pending`；检查器的十项人工核对警告真实保留，但按已确认规则不阻止发布。

## 机器证据与剩余验证

- 远端 `v0.1.15` 的六个提交已合入干净集成工作区，`App.tsx`、`LedgerWorkspace.tsx` 和 `Dialog.tsx` 的冲突已按保存与关闭语义处理；见[整合记录](implementation-release-integration.md)。
- 合并后全量 Vitest 为 214 通过、3 跳过；整合后的 `operations-guidance` 六项及针对弹窗、版本提示、批量录入、资源连接、系统导出和系统保护的 32 项 Electron 用例通过。构建和内容检查通过；内容检查仍有十项真实的人工核对警告。
- 隔离 macOS 安装包、最终界面试用、真实 GitHub 发布和旧版在线升级在本表创建时仍待完成；以之后的实际记录更新结果。Windows 与 Intel macOS 未在本次本机验收范围内。
