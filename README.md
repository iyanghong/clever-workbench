# clever-workbench

个人工作台。

## 开发约定

智能体协作入口见 [AGENTS.md](AGENTS.md)，相关技能按其中的约定读取项目配置。

- [问题跟踪](docs/agents/issue-tracker.md)：问题和需求规格保存在 `.scratch/` 下，随仓库进行版本管理。
- [问题分流标签](docs/agents/triage-labels.md)：使用五种默认状态。
- [领域文档](docs/agents/domain.md)：使用根目录的 `CONTEXT.md` 和 `docs/adr/`，在术语或决策明确后按需创建。

项目目前仅包含仓库和协作配置，尚未引入应用框架或构建、测试命令。
