# 任务 10：ZIP 文本归档四种模式指引实施证据

状态：开发运行验收通过，安装版与原生窗口总验收由任务 11 汇总。测试均使用系统临时目录中的示例资料，未读取日常应用资料。`ZIP_TOOL_REFERENCE` 与独立 Python 环境未提供，旧工具双向互通的两个可选用例保持跳过；本任务未修改 `ZTXT1` 算法。

## 覆盖映射

| 组 | 指引与入口 | 已核对步骤及实际结果 |
| --- | --- | --- |
| 23 文件归档 | [`zip-archive-files`](../../content/guidance/features/zip-archive-files.json)；工具卡片、首页收藏、工具页“归档文件” | `select-source` 文件／目录、取消选取及隐藏文件；`choose-output` 1～200 MB、默认 50 MB 和新建 `.txtparts`；`password-run` 两次密码、进度与不保存；`check-result` 完整片、打开／复制路径、后台切页和退出保护。失败清理与目标不覆盖见 FAQ 和既有 ZIP 测试。 |
| 24 Git 筛选归档 | [`zip-archive-git`](../../content/guidance/features/zip-archive-git.json)；工具页“Git 筛选归档” | `repository` 本地 Git 与分支、无 Git 降级；`filter` 作者／日期／快捷范围及应用筛选；`select-preview` 全选／反选／清空、缺失路径；`pack` 输出和密码。重点是**提交只确定路径，当前磁盘内容含未提交修改，工具不 fetch 或导出历史快照**。既有桌面用例用本地测试仓库将提交内容改成 `current content`，还原后核对此文字。 |
| 25 目录还原 | [`zip-restore-directory`](../../content/guidance/features/zip-restore-directory.json)；工具页“目录还原” | `parts-directory` 完整分片、取消选取、无须原分片大小；`output-password` 原密码与新的 `restored`；`run-check` 结果、后台及退出；`recover-failure` 缺片／损坏／密码错误和重试。既有桌面用例核对 32 MB 示例二进制文件的哈希。 |
| 26 剪贴板还原 | [`zip-restore-clipboard`](../../content/guidance/features/zip-restore-clipboard.json)；工具页“剪贴板还原” | `collect` 完整 TXT、⌘V／Ctrl+V、乱序与重复跳过；`repair` 异常片替换、移除、清空、混包与缺片；`output-password` 必选输出、错误密码后保留收集项、同名目标不覆盖；`check` 成功结果、切页继续、退出阻止及密码不保存。既有桌面用例还验证 10 片乱序与混包错误。 |

四篇均使用统一的用途、准备条件、入口、动作／预期结果、完成结果及常见问题模板。界面控件、阶段和输出路径均能由文字明确辨认，因此本轮没有给正文附示意截图；截图仅作为界面核对证据。

## 红绿与验证

- 工具目录、当前模式和首页收藏的按钮先分别在 Electron 桌面用例中失败于入口缺失，再接入 `GuidanceButton`，三条变绿。功能入口导航用例先实际落在工具目录，随后将受控目的地固定到 `tools/zip-text`，变绿；导航未执行归档命令。
- `npm run build` 通过；`npm run typecheck` 通过。`node scripts/check-operation-guidance.mjs --directory .` 报 34 篇有效功能正文，没有 ZIP 新增正文警告；已有待发布说明的人工核对警告仍按规范保留。
- `python3 /tmp/cwb-guidance-run-electron.py npm run test:e2e -- tests/e2e/zip-guidance.spec.ts`：5/5 通过。覆盖工具目录、四模式离线阅读／Esc／焦点、首页收藏、正确工具目的地，以及取消文件选择后原路径不变和任务未开始。
- 同一互斥入口执行 `tests/e2e/tools.spec.ts`：4/4 通过。覆盖真实临时文件目录归档／还原、Git 当前磁盘内容、剪贴板分片乱序与重复、错误密码和混包、后台切页及退出阻止。`npm test -- tests/zip-tools.test.ts`：9 通过、2 个需独立 Python 参考工具的可选用例跳过；涵盖文件保护、分片认证、旧样例及控制器生命周期。
- 将 `zip-archive-git.json` 暂时替换为坏 JSON，在 `finally` 中恢复原文件后重新构建：[降级记录](evidence/10/bad-guide-fallback.txt)显示坏正文时 build 0、检查器发 `invalid-json` 警告且退出 0、上述 5 项桌面用例全部通过，恢复后 build 0。测试读取**实际被测包**的原始指引内容，坏正文走“此指引暂不可用”路径，不会把质量警告变成发布硬门槛。
- [首页收藏附近入口](evidence/10/zip-favorite-help.png)与[剪贴板还原指引弹窗](evidence/10/zip-paste-guide.png)截图来自临时资料下的真实开发应用。正文长行可换行，关闭按钮及底部“前往功能”可见。

任务 11 尚需在同一最终安装包上复核四篇正文和入口，以及 macOS 原生鼠标、主题／窄窗口和用户真实系统钥匙串边界；本证据不等同于正式发布或日常应用安装。
