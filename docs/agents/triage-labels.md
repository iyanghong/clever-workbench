# 问题分流标签

相关技能使用五种固定的问题分流状态。下表列出每种状态在问题文件的 `Status:` 行中对应的取值。

| 分流状态 | `Status:` 取值 | 含义 |
| --- | --- | --- |
| `needs-triage` | `needs-triage` | 等待维护者评估 |
| `needs-info` | `needs-info` | 等待报告人补充信息 |
| `ready-for-agent` | `ready-for-agent` | 信息齐全，可交由智能体处理 |
| `ready-for-human` | `ready-for-human` | 需要人工处理 |
| `wontfix` | `wontfix` | 不予处理 |

技能提到某种分流状态时，使用表中对应的取值。
