# 修复任务紧凑列表标题裁切

Status: resolved

任务标题必须在正常与紧凑列表中完整显示字形；长标题保留横向省略。保持虚拟列表的 68px／44px 行高，不改任务数据和保存逻辑。

## 原因与修改

Ant 迁移后的通用 `.task-row .task-open.ant-btn` 使用上下各 8px 内边距，覆盖了 legacy 层紧凑模式的 2px。44px 行高内，标题被 flex 布局压到 7.234375px，而文字本身高 15px，导致纵向裁切。

在 Ant 衔接样式中为紧凑任务按钮恢复 `padding-block: 2px`。单条任务复现中，标题高度恢复为 19.234375px，文字高 15px、行高 44px、副标题高度均保持不变。临时探针只修改页面内边距，等待样式过渡完成后测量，未留下源代码调试逻辑。

## 验证

- 修改前运行 `CWB_TEST_MOCK_KEYCHAIN=1 npm run test:e2e -- tests/e2e/task-layout.spec.ts --output=.scratch/task-title-clipping/results-before`，5 秒内在深色、1380px、紧凑列表复现标题裁切；见 `evidence/before.log`。
- 新回归按实际字形范围判断是否被标题容器裁切，同时核对行高；覆盖深浅主题、1380px／820px 窗口、正常／紧凑模式及长短标题。
- `npm run build` 通过，包含类型检查；保留既有 Vditor 脚本与分块体积提示，见 `evidence/build-after.log`。
- `CWB_TEST_MOCK_KEYCHAIN=1 npm run test:e2e -- tests/e2e/task-layout.spec.ts tests/e2e/task-planning.spec.ts tests/e2e/workspace-redesign.spec.ts --output=.scratch/task-title-clipping/results-after`：8 项通过，见 `evidence/after.log`。
- 已查看修复前后的真实 Electron 截图，确认标题完整、窄窗口长标题正常省略。全部资料位于本次创建并清理的系统临时目录。

## 边界

本项只修改任务样式、回归测试及本记录。工作区并行任务的台账导入、版本号、文档和其他改动保持原样。验证为开发构建，未重新打包、安装或执行版本发布；未执行 Windows 实机验证。

## v0.1.28 安装版复核

在本机已安装的 v0.1.28 中检查打包样式，并用隔离资料复现。其任务按钮上下内边距仍为 8px，15px 高的文字只得到 7.23px 的标题空间。该发布标签没有包含紧凑模式的修正规则。

从 v0.1.28 标签（775e439）单独构建 macOS arm64 本机修复包，应用代码差异只有紧凑任务按钮的上下内边距。使用打包后的可执行文件通过深浅主题、宽窄窗口、正常及紧凑布局回归。另以 17 个示例任务复核，在浅色紧凑模式滚动查看两个月份下的 10 个未完成任务，标题空间恢复到 19.23px，字形高 15px。签名及 DMG 完整性已校验。

本机修复包沿用基础版本号 0.1.28，使用带 task-title-hotfix 标记的独立文件名。此次构建未改动正式更新源。
