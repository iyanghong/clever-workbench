# 问题跟踪：本地 Markdown

本仓库的问题和需求规格以 Markdown 文件存放在 `.scratch/` 中。

## 文件约定

- 每项功能使用一个目录：`.scratch/<feature-slug>/`。
- 需求规格写在 `.scratch/<feature-slug>/spec.md`。
- 每个实施问题单独成文，路径为 `.scratch/<feature-slug>/issues/<NN>-<slug>.md`，从 `01` 开始编号。
- 问题分流状态写在文件开头附近的 `Status:` 行，取值见 [问题分流标签](triage-labels.md)。
- 后续讨论追加到 `## Comments` 标题下。

## 发布问题

当技能要求“发布到问题跟踪系统”时，在 `.scratch/<feature-slug>/` 下创建文件；目录不存在时先创建目录。

## 读取问题

当技能要求“获取相关问题”时，读取所指路径的文件。

## `/wayfinder` 操作

`/wayfinder` 使用一份总览文件，每个子问题各有一份文件。

- 总览文件：`.scratch/<effort>/map.md`，包含 `Notes`、`Decisions-so-far` 和 `Fog`。
- 子问题：`.scratch/<effort>/issues/NN-<slug>.md`，从 `01` 开始编号，正文写明问题。`Type:` 填写 `research`、`prototype`、`grilling` 或 `task`；`Status:` 填写 `claimed` 或 `resolved`。
- 阻塞关系：在文件开头附近写 `Blocked by: NN, NN`。列出的文件全部处于 `resolved` 状态后，该问题才解除阻塞。
- 待办选择：扫描 `.scratch/<effort>/issues/`，找出尚未解决、没有阻塞且无人认领的文件，按编号选择第一个。
- 认领：开始工作前写入 `Status: claimed` 并保存。
- 解决：在 `## Answer` 下追加答案，改为 `Status: resolved`，再将摘要和链接追加到总览文件的 `Decisions-so-far` 部分。
