# Ant Design 6 正式界面迁移记录

Status: resolved

基于 `cbc0e58a377284a177159ce84182818c21035643`（v0.1.23）的工作区实施。独立 Demo 保留在 `../antd6-workbench-demo/`；正式界面使用根目录锁定的 `antd@6.7.0` 和 `dayjs@1.11.19`。以下验证完成于源码提交与发布之前，未安装本机应用；后续发布范围以对应 GitHub Release 及构建记录为准。

## 实际实现

- Ant ConfigProvider、中文语言、系统字体、浅深主题及可访问性偏好；现有语义 CSS 变量与 Ant token 共用颜色。
- Layout／Sider／Menu、导航折叠、全局搜索、主题切换、统一新建、首页 Card／Statistic 和真实资料入口。
- 台账七类 Tabs、系统资料横幅、账号与对象 Table、系统配置 Tabs、批量录入与资料导出；宽窄窗口继续保留摘要／详情和返回清单行为。
- 任务、计划日期、标签、回收站、文档清单和图片预览；保留虚拟列表、现有编辑器、大纲、自动保存及 flush。
- 工作回顾 DatePicker／Segmented／Card／Statistic；时间图仍展示日历跨度。
- 项目档案 Table、设置五个 Tabs、六个工具的按钮／输入／选择／Card／进度及对比 Table。
- 共享 Modal 继续处理忙碌状态、未提交内容保护、独占指引、实际展示回调、键盘及焦点返回。

本轮没有修改数据库、主进程、preload、备份格式或凭据加密逻辑。验证均使用系统临时目录内的隔离资料；秘密相关回归显式使用测试钥匙串适配器。

## 验证结果

- `evidence/unit-tests-final.log`：37 个文件通过，247 项通过、3 项跳过。
- `evidence/build-final.log`：类型检查和生产构建通过；保留 Vditor 非 module 图标脚本及较大分块的构建提示。
- `evidence/electron-remaining.log`：修正后的重点回归 47 项通过、3 项因仅适用于安装包而跳过；使用开发构建及隔离资料。
- `evidence/electron-development-complete.log`：最终完整 Electron 回归 145 项通过、3 项因仅适用于打包应用而跳过，无失败；用时 11.6 分钟。覆盖自动保存、失败重试、图片与撤销、台账、凭据、备份恢复、全部工具及窗口交互。
- `evidence/visual-audit-final.log`：九个真实导航页面，1440 × 960 浅色／深色及 820 × 650 深色，共 27 张截图；等待实际数据、页面和编辑器就绪后截图，未出现 pageerror。已查看工作台、台账、任务、文档、工作回顾、工具及窄窗口设置，深色编辑区不再出现白底。
- `evidence/guidance-check.log`：检查退出码为 0，包含 48 项功能与 5 份版本记录；另有 57 条关于已有草稿／版本人工核对记录的提示，未将其伪记为已核对。更新了本轮涉及的设置路径及 3 张真实指引截图，没有变更待发布版本或历史发布来源。
- `evidence/package-mac-final.log`：macOS arm64 `.app` 目录构建成功，应用目录约 301 MiB，`app.asar` 约 12 MiB。`codesign --verify --deep --strict` 退出码为 0；使用临时签名，尚未生成安装器、安装或发布。
- `evidence/electron-package.log`：通过 `CWB_TEST_EXECUTABLE` 实际运行上述 `.app`，21 项通过、1 项因仅适用于开发模式而跳过，无失败。覆盖实际创建与保存、全部导航深浅主题和窄窗口、六个工具及 worker 路径、更新面板、版本信息、隔离路径检查和待确认健康记录夹具。健康记录夹具不代表已经完成一次真实升级安装。

早期 `electron-regression*.log`、`electron-full*.log` 及 `electron-final.log` 保留迁移中的失败结果。其中包括旧控件选择器不适用、实际浮层／焦点／主题问题，以及一次重复使用默认测试输出目录导致的产物冲突；不把这些历史日志改记为通过。最终回归使用独立输出目录。

复查页面可运行 `node .scratch/antd6-ui-migration/audit.mjs`；补充指引截图使用 `capture-guidance.mjs`。两者只创建系统临时目录内的测试资料，并在结束后清理各自目录。一次性代码转换脚本已移除。

发布准备时发现导出指引截图截取了动画中间状态，已使用上述 `.app` 重截 3 张图片，并检查实际图像。截图脚本开启减少动态效果，断言弹窗无变换且宽度完整后再截取；结果见 `evidence/guidance-images-release.log`。日志入库前只整理行尾空白，原有通过、失败和跳过结果保持不变。

开发运行使用 `npm run dev`，并设置临时 `CLEVER_WORKBENCH_DATA_DIR`；浏览器 Demo 仍使用 `npm run demo:antd`。本轮 `.app` 位于 `package/mac-arm64/Clever Workbench.app`，测试通过 `CWB_TEST_EXECUTABLE` 指向其可执行文件，不能把“在工作目录运行 `.app`”记为“已安装”。

## 已定位并修复的问题

- Modal 外壳继承 `pointer-events: none`，造成 Select 浮层可见但点不到；恢复 Ant 默认挂载位置。
- 替换原生输入后，下拉选择未标记新记录修改、日期键入后未立即保存；接回现有保护与保存链路。
- Ant Button 的布局影响任务行与时间轴；补齐业务布局，并压缩摘要长标题与长地址。
- 原生 dialog 替换后，指引提前关闭与内容切换的展示／焦点时序改变；共享组件继续协调这些边界，回归中验证。
- Ant 首次切换动态效果会插入 Provider 并重建子树；预先建立固定边界，保留当前页面和录入状态。
- 异步加载的第三方编辑器 CSS 覆盖深色主题；将其放入 `legacy.editor` 子层，使业务样式稳定生效。
- 折叠侧栏后仍保留品牌旁的更新按钮；不重新挂载更新组件，已打开的更新弹窗继续保留状态。

## 未验证范围

原生鼠标尚未验收：CUA 连接超时，当前执行进程的 `AXIsProcessTrusted()` 返回 false；不以 Playwright 点击或 elementFromPoint 检查替代原生鼠标。仍保留 no-drag 样式。

未执行本机安装、Windows 实机、真实远程更新及更新安装健康确认。`.app` 目录构建和开发回归不代表发布验收；macOS 秘密测试的模拟钥匙串也不代表真实系统钥匙串授权已验收。
