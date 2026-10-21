# 实施记录

2026-10-21：用户确认四项任务粒度和依赖：“合适，按这四项执行”。

基线：`81778de429153214396a705c1608f0840737b7ce`（v0.1.7）。集成分支：`codex/ux-layout-refresh`。规格与设计来源见 [规格](spec.md)。

| 任务 | 前置 | 当前完成情况 |
| --- | --- | --- |
| [01 台账浏览与宽详情](issues/01-ledger-layout.md) | 无 | 待实施 |
| [02 系统菜单与按需批量操作](issues/02-ledger-actions.md) | 01 | 等待前置 |
| [03 共用框架与分组新建](issues/03-shell-create.md) | 无 | 待实施 |
| [04 集成验收与视觉收尾](issues/04-integration-acceptance.md) | 02、03 | 等待前置 |

任务在独立工作区实施，再由集成代理合并。每项记录实际验证及局限，完成后保持 `Status: ready-for-human` 并以 `Completion: verified` 及勾选验收项标识本地任务完成；若仍有必要工作未做，则如实保留未完成状态。

主目录原有发布脚本改动保持独立；本轮没有推送、Release 发布或本机安装授权。
