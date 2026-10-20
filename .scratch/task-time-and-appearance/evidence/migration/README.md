# Mac 打包应用完整迁移验证

运行 scripts/verify-migration.mjs，三次均使用新建临时资料目录；没有复用应用数据库目录、源进程会话或传递系统加密密钥。所有名称、地址和秘密都是脚本内的虚构测试值。此记录证明同一台 Mac 上独立资料目录间的实际打包应用往返，不代表 Windows 或第二台物理设备已验收。

| 输出 | 目标保护 | 输入 | 凭据 | 任务 | 文档 | 附件 |
| --- | --- | --- | --- | --- | --- | --- |
| [mac-system](mac-system.json) | system | 新建 | 6 | 3 | 2 | 1 |
| [mac-password](mac-password.json) | password | mac-system | 6 | 3 | 2 | 1 |
| [mac-system-roundtrip](mac-system-roundtrip.json) | system | mac-password | 6 | 3 | 2 | 1 |

运行环境：macOS 27.0.1，Apple Silicon，应用 0.1.6，Electron 44.9.0，Node 24.22.0。应用为本次源码构建的 ad-hoc 签名 .app，位于临时输出目录，没有替换真实安装版。

首次与其他打包测试并行运行时，系统加密报告暂不可用，备份配置安全失败；随后单独运行三段往返均通过。没有加入明文降级或跳过系统校验。

历史格式兼容由 tests/fixtures/backups/legacy-v9.cwb 验证，新格式产物如下：

- [mac-password.cwb](mac-password.cwb)：SHA-256 `881b91b71b9ba436f36779a13e2891d9f4ea4c5636d5f50e64248be361e8f318`。
- [mac-system-roundtrip.cwb](mac-system-roundtrip.cwb)：SHA-256 `291d344c55682ed09d92f2165de8b8d303c1eabce6abb64687dc8b9694ddd230`。
- [mac-system.cwb](mac-system.cwb)：SHA-256 `167aac478c718496f6576803609df5e6eb72594dd74a48ae8481e8eb8bc191ff`。
