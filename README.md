# clever-workbench

个人工作台。

## 开发约定

智能体协作入口见 [AGENTS.md](AGENTS.md)，相关技能按其中的约定读取项目配置。

- [问题跟踪](docs/agents/issue-tracker.md)：问题和需求规格保存在 `.scratch/` 下，随仓库进行版本管理。
- [问题分流标签](docs/agents/triage-labels.md)：使用五种默认状态。
- [领域文档](docs/agents/domain.md)：使用根目录的 `CONTEXT.md` 和 `docs/adr/`，在术语或决策明确后按需创建。

当前仓库包含协作配置和已确认的需求设计文档，应用尚未实现。

## 需求与设计

首版方案与 23 项任务已确认，用户已授权进入实现：

- [正式需求规格](.scratch/desktop-workbench/spec.md)（已确认并授权实施）
- [技术方案](.scratch/desktop-workbench/technical-plan.md)
- [正式开发任务](.scratch/desktop-workbench/ticket-plan.md)与[规格覆盖表](.scratch/desktop-workbench/ticket-coverage.md)（23 项，拆分已确认并发布）
- [领域词汇](CONTEXT.md)
- [访谈记录](.scratch/desktop-workbench/interview.md)与[调查依据](.scratch/desktop-workbench/research.md)
