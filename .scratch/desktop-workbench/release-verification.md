# 首版交付验证

版本：0.1.0。功能任务 01–20 及访问入口、服务器配置扩展已完成。用户最新追加的文档归属、系统任务与三种格式导出已实现，最终 Mac 安装包已通过复验；Windows 11 验收保持未完成。

实际本机：macOS 27.0.1（26A434）、Apple Silicon arm64；Electron 44.9.0，运行时 Node.js 24.22.0。所有测试使用独立的虚构资料目录。

## 当前证据

| 范围 | 证据 | 结果 |
| --- | --- | --- |
| 新功能完整单元检查 | 18 个文件、72 项（2026-10-19） | 全部通过 |
| 新功能完整桌面检查 | 开发构建、37 项真实 Electron 流程 | 全部通过 |
| Word／PDF 阅读检查 | 8 份文件、22 页，中文、32 行表格、代码、复选框与图片 | 全部通过，见补充规格证据 |
| 最终双平台 CI | 758f87a，Mac 与 Windows Server 2025，各 72 项单元和 37 项安装包流程 | 全部通过，包含本轮导出 |
| 最终 Mac／Windows 安装包 | 758f87a 的 DMG／ZIP 与 NSIS 已生成；Mac 从 DMG 安装并通过严格签名检查，双平台安装运行通过 | 通过，Windows 11 仍未验收 |
| Windows 11 x64 | 用户确认目前没有可用环境 | 未验收 |
| 双向加密备份迁移 | Mac → Windows Server 2025 → Mac，含继续编辑和再次备份 | 通过；Windows 11 待验收 |
| 原生闲置与锁屏 | 909468 ms 真正闲置锁定；另一次观察到真实系统锁屏后立即锁定 | 通过，原生休眠仅有事件边界验证 |
| 两轴审查 | 原规格、台账扩展、文档／导出三轮发现均已修复并复核 | 已通过 |

CI 链接：[758f87a / run 39148983022](https://github.com/iyanghong/clever-workbench/actions/runs/39148983022)。Windows runner 实际为 Windows Server 2025 Datacenter x64（10.0.26100），不能替代 Windows 11。

## 导出与页面验收

本轮功能与边界见[补充规格](../system-documents-export/spec.md)，三种格式的虚构样例、页面和渲染证据见 [verification.json](../system-documents-export/evidence/verification.json)。每份文档和任务单独成文件，系统总览包含项目历史、部署、服务器硬件、多地址入口和用户选择的秘密。包内密码全部为虚构值。

DOCX 由应用生成 OOXML，再以随环境提供的 LibreOffice 渲染；指定其字体配置后中文正常。PDF 由应用的禁用脚本、隔离网络的隐藏窗口生成。逐页检查期间发现的 Word 任务复选框重复标记已经修复，修复后的文档重新渲染检查通过。

## 备份与锁定

迁移样例 `evidence/migration/mac-seed.cwb` 包含 2 个项目、服务双环境部署、6 项秘密、多地址 GitLab、服务器硬件、任务、文档、草稿、回收站和图片。`windows-return` 与 `mac-return` 保存原往返恢复结果；`final-windows-return` 与 `final-mac-return` 对应758f87a最终Windows CI返回及Mac继续编辑后再次备份，仍逐项核对6项秘密和图片。旧版 7 样例独立保留，升级及恢复测试通过。

真实闲置与锁屏证据分别见 `evidence/real-idle.json` 和 `evidence/native-lock.json`，来自 1d87213 的隔离安装包。普通资料始终可读，锁定后的秘密读取被拒绝。未替用户物理锁定电脑；原生休眠仍只通过事件边界验证。

## 集成问题及修复

已修复任务编辑器的分包循环依赖、快速导航后的旧页面状态和新建背景、备份写入在 Windows 的读写句柄要求，以及繁忙渲染时账号元数据携带过时环境的问题。最近 CI 还发现启动自动备份与退出竞争；5fa301b 让退出等待落盘，并在保存后再次检查关闭与资料保护状态。对应真实流程和两轴复核均已通过。

## 安装包与依赖

最终产物与源提交、SHA-256、ASAR 内容比对、签名和安装结果统一记录在 `evidence/release-artifacts.json`。当前源提交为 758f87a，包含新导出及审查修复。Mac 与 Windows 的应用 ASAR 完全一致，15 份包内构建文件逐一匹配本地生产构建。Mac 为 ad-hoc 签名，无 Developer ID 和公证；Windows 无发布者签名，属于个人使用版本。

2026-10-19，`npm audit --omit=dev` 为 0 项漏洞。8 项 moderate 均来自 electron-builder 构建依赖中的 sprintf-js 链，不进入应用运行时；当前审计建议降级 builder，未直接采用。首页初始脚本约 331 kB，编辑器和各业务模块按需加载。

## 仍需目标设备补验

Windows 11 x64：安装同版本 NSIS，验证启动／退出、中文输入、原生窗口与快捷键、账号和图片、备份恢复及锁屏／休眠。可用 `CWB_TEST_EXECUTABLE` 指向安装后的程序执行相同桌面流程。用户已确认没有可用设备，不重复请求环境，也不把 Server 2025 结果写成 Windows 11 通过。

Mac 原生休眠仍需实际执行：先解锁一项虚构秘密，休眠后唤醒，确认普通台账可读、秘密要求重新解锁。当前仅有原生事件边界验证。

最新两轴报告见 [system-documents-export/code-review.md](../system-documents-export/code-review.md)。零起点步骤、跨行标题和原始 HTML 的明确失败也已补充测试并经复核。

Windows CI 实际生成的 PDF 总览两页均已渲染检查，中文正常，Microsoft YaHei 与 Consolas 字体已嵌入；样例和记录见补充规格的 `evidence/windows-verification.json`。
