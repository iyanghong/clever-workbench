# 任务 07：资源、部署、运维、批量录入与导出指引实施记录

日期：2026-10-23。实施代理：Codex 任务 07（开发验证，不代替维护者的正式发布核对）。

## 范围与实际入口

- 基于集成 `da83a182a14808d7343b0357cf89f6424276224b` 的独立分支 `codex/operation-guidance-07` 实施。任务 06 已提供分类共用的“台账使用指引”；本任务直接在资源、部署和运维分类登记正文，没有重复增加分类按钮。
- “粘贴表格”旁新增“粘贴指引”，从正文打开时只导航到台账，不自动打开或提交批量对话框。系统“更多”菜单在“导出资料”旁新增“导出资料使用指引”，键盘循环与焦点返回已更新。
- 八篇功能正文均含用途、准备条件、实际入口、逐步动作与结果、完成结果及常见问题。截图为隔离示例资料下的真实 Electron 界面：[批量校对](../../content/guidance/assets/ledger-paste-review.png)、[导出选项](../../content/guidance/assets/system-export-options.png)。两张图已作为相应步骤的本地资源使用。

## 覆盖映射与事实核对

| 覆盖组 | 指引 ID／稳定步骤 | 按当前源码核对的实际行为 |
| --- | --- | --- |
| 06 资源 | `resource-server`: create、edit、fields、account、link | 服务器名称即能起步，IP、用途、操作系统与硬件字段可后补；资源地址、端口、附加字段及账号分别维护，只有 HTTP(S) 地址可“打开资源链接”。 |
| 06 资源 | `resource-datastores`: create、connect、extra、accounts | 数据库、Redis、其他资源可从同一新建入口选类型，默认 Redis；数据库专用配置及普通附加字段、账号归属、环境范围均按真实编辑器说明。桌面测试实际创建数据库并写入类型、版本。 |
| 06 资源 | `resource-copy-delete`: copy、secrets、confirm-copy、delete | 服务器副本可选目标系统，其他资源按目标环境；普通资料及账号元数据默认复制，秘密需显式勾选和解锁。资源被部署节点、运维记录、任务、文档或草稿引用时拒绝删除；资源删除没有任务／文档回收站。桌面测试覆盖跨系统副本、取消解锁及运维引用拒绝。 |
| 08 服务与部署 | `services-deployments`: service、scope、node、address、edit-delete-node、delete-service | 服务名称、代码仓库、范围及状态；节点须有环境，固定／按需调度只是资料描述；独立地址留空时展示关联服务器地址。桌面测试覆盖固定节点地址回退、改为按需调度及有节点时删除服务受阻。 |
| 09 运行维护 | `operations-maintenance`: create、kind-frequency、scope-related、filter、delete | 新建默认运行作业／待确认，编辑可选备份策略、频率、状态、环境、应用／资源与步骤文档；清单按类型和状态筛选。台账描述不会启动真实作业或完整备份。桌面测试创建备份策略并按类型、状态筛选。 |
| 09 相关工作 | `ledger-related-work`: open、document、task、reopen | 当前有效入口是系统顶部“相关工作”；对象详情提供“为当前对象写文档／记录工作任务”。任务业务归属仅系统，相关工作中的任务按系统展示。桌面测试从系统入口创建系统任务并核对归属。旧资源子页的内嵌区域不是当前 LedgerWorkspace 路由，正文已按实际路由修正。 |
| 10 表格粘贴 | `ledger-paste`: kind-owner、paste-source、layout-header、map-columns、review-rows、submit、leave | 覆盖入口、服务器、数据库、Redis、其他资源、服务、运行作业、备份策略、账号、部署节点十类；账号／节点有所属对象约束，支持清单与资料卡、表头及列映射、跳过／疑似重复逐行确认、离开前保留或丢弃。桌面测试实际录入一条、跳过一条，并在未提交资料卡中放弃。 |
| 11 系统导出 | `system-export`: select-system、choose-content、task-dates、choose-format、secrets、save-result | 当前源码支持文档／任务开关，任务按开始日期含首尾筛选；Markdown／Word／PDF 至少选一，单格式且无实际文档时单文件，否则 ZIP；秘密类型选择后以明文写入，需要解锁。导出前等待编辑保存；资料包只用于阅读交接，完整恢复须 `.cwb` 加密备份。桌面测试实际证明未提交资源说明出现在导出文件、取消解锁无输出、解锁后文件含明文秘密。 |

## 红绿验证与结果

- 已确认的测试边界：隔离资料下的 Electron 页面及公开桌面接口。先写导出菜单与粘贴入口用例，分别因找不到“导出资料使用指引”和“表格粘贴使用指引”呈红，再增加入口及正文使其转绿。后续按真实业务流程扩展用例；正文缺失或损坏分支报告警告，不转成发布阻断。
- `npm run build` 通过，包含 TypeScript、Vite 和 Electron 构建；两张本地截图都进入 `dist/assets`。`node scripts/check-operation-guidance.mjs --directory .` 退出码 0：38 篇有效功能指引，本任务新增八篇无正文或资源警告；仍有 10 条全局待发布说明的人工核对警告，保持原样。
- `python3 /tmp/cwb-guidance-run-electron.py npm run test:e2e -- tests/e2e/operations-guidance.spec.ts tests/e2e/ledger-system-actions.spec.ts tests/e2e/system-export.spec.ts`：**9 / 9 通过**。覆盖本任务六项新桌面用例、菜单键盘回归及系统导出的格式、日期、秘密与主题／窄窗口既有回归。测试均使用系统临时目录；macOS 显式测试模拟钥匙串，不涉及日常资料或生产钥匙串。
- 损坏正文实验：暂将 `resource-server.json` 写为无效 JSON；`npm run build` 仍通过，指引检查退出码 0 且新增 `invalid-json` 警告，资源桌面流程 **1 / 1 通过**并核对列表不显示损坏项。随后按字节恢复原文，`cmp` 一致，最终构建及检查再次通过。此实验不意味着坏正文已获人工接受。

## 留给任务 11 的联合验收

- 本项验证是本地开发构建下的实际 Electron 行为；最终安装包自身资源、原生鼠标、离线与全 26 组联合核对在任务 11 完成。没有替换 `/Applications` 中的日常应用，也没有推送、打 tag、发布 Release 或做真实导出到用户目录。
- 两张产品截图取自隔离示例，没有真实账号、真实地址或真实秘密；图片失效时共享指引组件保留文字替代，最终安装版需再查资源路径。
