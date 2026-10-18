# 后续实施

用户持续授权至完成，goal 保持 active。功能任务 01–20 已提交，21–23 未验收。

用户随后确认访问入口与服务器扩展，并追加操作系统、CPU、内存、硬盘字段。当前工作以 `.scratch/ledger-access-entries/implementation-plan.md` 为准；新增实现完整回归为 64 项单元测试、29 项桌面流程通过，正在审查及更新产物。旧的安装包证据只能证明扩展前版本。

打包脚本、README／安装说明、模块按需加载和图标均已完成。完整单元测试 56 项通过，Mac 安装包 27 项流程通过；两轴 code-review 的 4 项实现问题已修复并复核。固定审查起点 d5167e4bde1881c39ee12ef7390fb12cc9cd7ed4。当前在核验 ad-hoc 签名后的 Mac 包、真实 15 分钟闲置和 CI 平台运行；最新证据统一记录在 release-verification.md。

用户已确认当前没有 Windows 11 x64 验证环境，不再重复询问。GitHub Actions 使用 windows-2025（Server），必须如实区分，不能把交叉打包或 Server runner 等同 Windows 11。Mac 系统锁屏／休眠目前仅验证原生事件边界，未实际锁定用户电脑。

Playwright 命令保持顺序运行，避免共享 test-results 相互覆盖。多次真实密码派生／RSA 测试可需要 15–20 秒；最终套件应限制并行度，避免同时分配多份 128 MiB scrypt 工作内存造成非功能超时。
