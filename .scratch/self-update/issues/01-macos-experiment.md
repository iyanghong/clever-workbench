# 01: 验证 macOS 自动替换与重启

What to build: 两个真实隔离测试安装包验证原位置替换、自动重启、替换失败恢复，记录权限与 Gatekeeper 行为。

Blocked by: 无

Status: ready-for-agent

规格：[自更新](../spec.md)

- [ ] 使用测试副本与独立资料目录，不操作用户安装或业务数据。
- [ ] 正常替换和恢复有可复现命令及证据。
- [ ] 记录系统限制，不能通过移除 quarantine 绕过验证。
