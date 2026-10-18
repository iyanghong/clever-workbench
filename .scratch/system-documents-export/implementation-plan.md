# 实现计划

Status: resolved

起点：`5fa301bcebbb8ed323a53606317f02efd705d874`。需求与用户对密码、独立文档的选择见 [spec.md](spec.md)。

1. 文档页增加全部／通用／系统范围，详情显露系统关联，保留已有项目、环境和资源。任务快录与详情显露系统选择，项目明确可选。
2. 主进程统一收集某系统的台账、任务、有效文档及图片，生成独立文件和总览；提供 Markdown ZIP 的完整公开行为测试，再扩展 DOCX、PDF。
3. 系统详情接入导出弹层、格式选择、密码默认包含以及 Token／私钥显式选择；通过既有解锁入口，导出时保存当前编辑，取消和失败不留半成品。
4. 三种格式真实输出验证、DOCX／PDF 逐页渲染检查、完整测试、两轴审查及新安装包。

## 技术边界

导出只有一个类型化桌面入口，主进程自行选择保存位置并验证选项；文件内容不会回传渲染页面。实现使用现有 Store、Vault、图片目录与 ZIP 库，DOCX 使用 docx 的 OOXML 生成，PDF 使用隔离的 Electron 打印窗口。打印窗口禁用页面脚本和外部网络，原始 HTML 作为文本处理，图片仅从已验证的本地附件读取。

主进程先保存界面内容，获取一致资料视图；包含秘密的长操作在锁定、资料恢复或密钥更换后不得迟到输出，最后发布前再次检查会话。写入采用同目录临时文件及最终原子替换，失败清理本次临时输出。跨系统资料、通用文档和回收站不进入当前系统导出。

实现参考：[docx Packer](https://docx.js.org/api/classes/index.Packer.html)、[Electron printToPDF](https://www.electronjs.org/docs/latest/api/web-contents)、[Marked 扩展与 token](https://marked.js.org/using_pro)。已安装 docx 9.12.0，使用纯 JavaScript 打包到 Electron 主进程，运行时 Node.js 24 满足其依赖要求。

## 已验证

文档范围及任务入口各有一条真实桌面测试，均先在旧界面失败后通过；包含密码的系统导出也已通过真实 Electron 窗口和三种文件格式验证。72 项单元测试全部通过，覆盖系统边界、同名与特殊字符文件名、密码／Token／私钥选择、图片、锁定取消、恢复取消、原文件保留、写入失败与临时文件清理。

实际虚构资料包包含系统总览、2 份同名文档、1 项任务及图片，三种格式共 14 个文件。8 份 Word／PDF 共 22 页均已渲染检查，中文、32 行跨页表格、代码、嵌套列表、任务复选框及图片可读；复选框重复标记已先复现再修复。证据见 [evidence/verification.json](evidence/verification.json)，复验脚本为 [verify-export.mjs](verify-export.mjs)。

Word 验收使用随环境提供的 LibreOffice 和中文字体配置，不修改用户的 Office 配置；PDF 由应用的隔离打印窗口实际生成。完整开发构建和最终 Mac DMG 安装版各 37 项桌面流程通过；两轴审查发现已修复并复核，见 [code-review.md](code-review.md)。758f87a 的 Mac arm64 DMG／ZIP 与 Windows x64 安装包已生成，包内构建文件逐个匹配且双平台应用归档完全一致；Mac 严格签名完整性检查通过。最终 CI 在 Mac 与 Windows Server 2025 各通过 72 项单元及 37 项安装版流程；Windows PDF 中文与字体嵌入也已实际检查。Windows 11 继续保持未验收。
