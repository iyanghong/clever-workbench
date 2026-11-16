# 共享外观规范

正式界面采用 Ant Design 6，与 `.scratch/antd6-workbench-demo/` 中已确认的演示稿保持同一套蓝色强调色、中性背景、系统字体和紧凑控件。窗口控制仍由 Electron 和操作系统负责；界面控件不是原生 AppKit 控件。

## 修改入口

| 文件                            | 职责                                                                     |
| ------------------------------- | ------------------------------------------------------------------------ |
| `src/shared/WorkbenchUI.tsx`    | Ant ConfigProvider、中文语言、浅深主题算法、尺寸、动态效果及语义颜色映射 |
| `src/shared/antd-workbench.css` | 应用壳、Ant 组件与业务布局衔接、弹窗滚动和 no-drag 边界                  |
| `src/shared/theme.css`          | 系统字体、间距、标签色、编辑器语义色和平台回退值                         |
| `src/shared/WorkspaceUI.tsx`    | 页面标题、数量与 Ant Segmented；保留 Home／End 键操作                    |
| `src/shared/Dialog.tsx`         | Ant Modal；关闭、Esc、焦点返回、新记录保护和独占指引展示                 |
| `src/shared/useAppearance.ts`   | 合并用户与系统外观偏好，监听变化并设置页面标识                           |
| `src/styles.css`、模块 CSS      | 业务布局、虚拟列表、编辑器和窄窗口；既有规则置于 legacy CSS 层           |

新增按钮、输入、选择、日期、数字、复选、开关、表格、页签、折叠、菜单和弹窗优先使用 Ant 对应组件。应用层不重复实现控件的颜色、边框、禁用和键盘行为。数据仍由现有 hooks 和类型化 IPC 管理，组件库不另建业务存储。

`WorkbenchUI` 是主题入口；`ThemeVariables` 将 Ant token 映射为 `--bg`、`--panel`、`--text`、`--secondary`、`--muted`、`--line`、`--accent` 等共享变量。业务样式继续引用这些变量。减少透明度、增强对比及减少动态效果与系统偏好一起生效。表单控件默认高 32 px，正文 13 px，辅助信息沿用现有字号层级。

Provider 的外层动态边界在首次渲染时固定，避免切换“减少动态效果”时重建编辑页面。编辑器第三方样式位于 `legacy.editor` 子层，业务覆盖位于 `legacy` 的普通层，避免异步样式加载顺序让深色编辑区变回白色。

任务的混合高度虚拟列表、文档富文本／Markdown 编辑器和工作回顾的日历跨度图继续使用专项实现；周围的操作、筛选、日期与统计采用 Ant 组件。任务分组 34 px、正常行 68 px、紧凑行 44 px 的虚拟滚动契约保持一致。时间跨度不表示实际工时。

颜色标签只表示用户分类。逾期与临期使用独立语义色、图标和时间文字，不能仅靠颜色传达状态。主要按钮填充色与文字链接色分开，深色主题保持按钮文字对比。

## 弹层与表单

业务弹窗使用共享 `Dialog`，由它协调焦点和未提交内容。需要延迟确认的独占指引，只有在实际显示后才调用 `onShown`。忙碌阶段仍由业务状态决定是否允许关闭。

Select 和日期选择器等浮层使用 Ant 默认挂载位置。不要将浮层挂在 `pointer-events: none` 的 Modal 外壳上，也不要靠提高 z-index 掩盖点击问题。弹窗、菜单、输入与工具栏操作保留 `app-region: no-drag`。

现有表单的自动保存、flush 和新记录保护继续有效。Ant Select 的值变化应调用 `markNewRecordChanged`；日期字段键入完整合法值后仍需进入保存链路。使用 Ant Collapse 时按需保留 `forceRender`，避免折叠时卸载已登记的编辑和保存能力。

## 验证

`antd-workbench.spec.ts` 验证弹窗内下拉选择、只修改选择值时的放弃保护、焦点返回、创建及本地保存。`appearance.spec.ts` 验证主题跟随、偏好持久化与系统可访问性事件；`unified-appearance.spec.ts` 覆盖全导航、深浅主题和窄窗口。台账、编辑器、任务日期、秘密、备份及工具继续运行各自的 Electron 行为回归。

本轮的实际结果、截图和未验证项见[迁移记录](../.scratch/antd6-ui-migration/implementation.md)。开发运行、安装包、原生鼠标和 Windows 实机应分别记录；自动化点击不代替原生鼠标验收。
