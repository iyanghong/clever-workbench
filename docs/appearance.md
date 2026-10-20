# 共享外观规范

界面以 macOS 27 的材质层次和访达式列表、分栏为参照。Electron 窗口继续使用原生窗口控制，渲染区使用共享 CSS；macOS 侧栏结合窗口 vibrancy，Windows 保留自身窗口和字体习惯。

设计依据为 Apple 的[材质指南](https://developer.apple.com/design/human-interface-guidelines/materials)与 [WWDC26：Modernize your AppKit app](https://developer.apple.com/videos/play/wwdc2026/289/) 中的 macOS 27 设计更新。侧栏和工具栏承担材质层次，正文、表格和编辑区使用稳定背景；不将 Web 控件描述成原生 AppKit 控件。

## 修改入口

| 文件 | 职责 |
| --- | --- |
| `src/shared/theme.css` | 系统字体、六档字号、行高、间距、圆角、边框、深浅语义色、状态色、标签色、材质、阴影及层级 |
| `src/shared/controls.css` | 原生输入、按钮、分段选择、弹窗、焦点、禁用和按下状态 |
| `src/shared/WorkspaceUI.tsx` | 页面标题与分段选择，支持方向键、Home、End |
| `src/shared/Dialog.tsx` | 模态焦点、Esc、关闭和焦点返回；保留 no-drag 原生点击边界 |
| `src/shared/useAppearance.ts` | 用户和系统外观偏好合并、主题切换及平台标识 |
| `src/styles.css` | 页面布局、列表、详情、编辑器及响应式规则 |
| 工具与更新模块 CSS | 各自布局，字体、颜色和尺寸引用共享变量 |

新增控件优先使用已有类：`primary-button`、`secondary-button`、`text-button`、`icon-button`、`field-label`。表单默认采用 32 px 控件高度；正文和密集列表使用 13 px，辅助文字至少 11 px。任务的 34 px 分组标题、68 px 正常行和 44 px 紧凑行与虚拟列表高度契约一致，修改时同时核对虚拟滚动。

颜色标签只表示用户分类。逾期与临期使用独立语义色、图标和时间文字，不能仅靠颜色传达状态。主要按钮填充色与文字链接色分开，深色主题保持按钮文字对比。

## 验证

`tests/e2e/unified-appearance.spec.ts` 覆盖全部导航页面、任务详情、台账录入、工具和快速新建，保存深浅主题及 820 × 600 窗口截图。`appearance.spec.ts` 验证主题跟随、偏好持久化、系统可访问性事件和键盘焦点。编辑器、搜索、台账导出、更新和凭据流程继续由对应行为用例验证。

原生鼠标和打包应用验证范围、截图位置及平台缺口统一记录在[实施记录](../.scratch/task-time-and-appearance/implementation.md)，未实际执行的平台不能按截图模拟宣称通过。
