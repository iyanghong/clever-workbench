# 台账字段完善实施记录

2026-10-22。依据[已确认规格](spec.md)的 Q1～Q11 实施，保留原工作区中的服务器端口修复和用户未跟踪资料。没有访问或修改真实用户资料目录，没有引入依赖、创建提交、发布或安装应用。

## 实际改动

- 数据库／中间件新增和详情支持产品字段模板、多组具名连接、常用选择、排序和可选服务器关联；地址可继承服务器，端口独立填写。跨系统复制保留当前地址并解除原系统服务器关联。
- 应用新增可选同时创建首个部署节点，补充版本、部署方式、程序／镜像、路径、启停说明、健康检查及 Kubernetes 相关信息；固定／按需运行安排与部署技术分开。
- 运行作业与备份策略补充各自的可选资料。账号新增可直接填写用户名和三类凭据；入口可录具名多地址、账号角色及说明；服务器、系统和环境补齐确认过的普通字段。
- 应用和节点通过引用复用本系统或通用文档。正文不复制，移除引用不删除正文；删除和改变归属保护服务、节点及既有运维引用。
- 搜索、资料复制、系统导出、完整备份和恢复覆盖新字段与关系。导出只增加被本系统引用的通用文档，同一正文一份，Markdown、Word、PDF 均生成对应包内目标。
- 新增采用整体提交，失败保留输入，提交期间禁用编辑。关闭、切页、原生退出或更新前检查未提交内容；等待解锁时不允许放弃正在处理的录入。
- 资料结构升级为 13。旧地址和端口迁移为默认连接，保留原对象和账号身份；读取历史普通字段不套用新运维日期校验，部分更新不清空新资料。已有秘密字段仍走原加密接口。

## 验证结果

| 验证 | 结果与范围 |
| --- | --- |
| 生产构建 | `npm run build` 通过，包含 TypeScript、Vite 与 Electron 构建。Vite 仍有既有编辑器图标脚本的非模块提示，不影响产物生成 |
| 相关业务测试 | 13 个文件、81 项通过，覆盖台账、文档、搜索、复制、导出、加密备份与恢复，以及新增连接和引用边界 |
| Electron 回归 | 6 个文件、21 项通过，在 macOS 上运行生产构建和隔离临时资料目录；覆盖全局新建、数据库多连接、应用首节点、十类批量录入、原生关闭、秘密及实际三格式导出 |
| 最后的小幅调整 | 日期输入兼容只填日期、清理已替代的旧资源快录分支后，14 项对应业务测试和 5 项对应 Electron 用例通过；等待解锁的关闭保护补充后，3 项台账 Electron 用例再次通过 |
| 旧资料兼容 | 真实 v7 备份恢复用例、模拟 v12 单地址／仅端口资料升级、重复启动不重复迁移、新结构完整备份恢复均通过 |
| PDF 独立检查 | `pdfinfo` 可读取生成的 4 页 PDF；`pypdf` 严格解析通过，2 个远程文档跳转均指向包内实际存在的同一份 PDF |
| 文档与差异 | 校对新文档相对链接、`git diff --check`；源文件按项目 Prettier 规则检查 |

业务测试命令：

```sh
npm test -- tests/ledger-details.test.ts tests/system-ledger.test.ts tests/ledger.test.ts tests/ledger-workspace.test.ts tests/ledger-batch.test.ts tests/documents.test.ts tests/ledger-copy.test.ts tests/system-export.test.ts tests/export-documents.test.ts tests/search.test.ts tests/restore.test.ts tests/encrypted-backup.test.ts tests/store.test.ts
```

Electron 测试命令：

```sh
npm run test:e2e -- tests/e2e/ledger-details.spec.ts tests/e2e/system-ledger.spec.ts tests/e2e/ledger-bulk-entry.spec.ts tests/e2e/system-export.spec.ts tests/e2e/shell-create.spec.ts tests/e2e/vault.spec.ts
```

初轮回归曾发现弹窗关闭回调作用域错误和运维类型标签缺失；另一个新导出测试使用了错误的 ZIP 目录前缀。均已修正并复测通过。只读复核发现的历史字段读取、继承地址部分更新、空连接、类型切换、秘密字段名、文档改归属、引用搜索、文档跳转和提交期间编辑问题，也已修复并补充对应回归，不把先前失败直接当成通过。

## 留存证据和限制

- [数据库连接详情](evidence/database-connections.png)
- [深色窄窗口应用部署录入](evidence/deployment-dark-narrow.png)
- [PDF 跳转样本](evidence/overview-links.pdf)、[Word 跳转样本](evidence/overview-links.docx)

样本全部为虚构资料。Word 关系文件与 PDF 文件规格中的目标均和包内文件对应；没有宣称已人工验证所有阅读器的跳转行为。PDF 适配使用当前 Chromium 打印的链接结构，升级 Electron 时须继续运行真实导出回归。

功能验收阶段没有运行安装包验证、Windows 实机验证或不相关的全仓库测试，尚未提交、推送、发布或替换本机安装版。旧版应用不能直接打开升级至结构 13 的资料；需要回退时应使用升级前的完整备份与兼容应用。

## 发布前补充验证

2026-10-22，用户授权提交、推送并发布。全量 `npm test` 通过：31 个文件、199 项通过，3 项按现有条件跳过（真实更新 ZIP、大文件归档、独立 ZIP 工具互通）。真实更新 ZIP 检查由后续安装包发布验证覆盖；本次未改动 ZIP 归档格式。保留原有未跟踪的 `docs/资料/` 用户文档，不将其加入源码提交。
