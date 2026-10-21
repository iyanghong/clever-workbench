# 任务 03：共用框架与分组新建实施记录

日期：2026-10-21。基线：`26821e00d9f840d6723c5db167f9e1fbf38d5b5d`。实现分支：`codex/ux-shell-create`。

## 改动

- 应用壳采用方案 B 的 208px 侧栏、对齐的品牌区域、62px 全局工具栏和较紧凑的搜索入口。沿用现有主题语义颜色、导航和模块入口，未调整台账内部布局。
- `QuickAction` 登记真实动作的展示分组，沿用原排序；“工作记录”保留新任务、新文档，“台账资料”保留其余七项。选择动作继续调用原表单或创建函数，保留创建背景、保存协调、错误提示和快捷键。
- 复用共享 `Dialog` 的滚动、固定关闭入口、Esc 与焦点返回；创建处理中将原先不可关闭的状态同步给关闭按钮。工具栏按钮明确保持 `no-drag`。
- 最小窗口回归发现 820×600 时设置入口仅约 29% 处于视口，针对不超过 700px 高的窗口减少侧栏分组留白后，全部导航完整可达。
- README 补充分组新建说明；未新增依赖、IPC、持久化字段、演示数据或原型入口。

## 红 → 绿

采用用户已确认的 Playwright Electron 公共边界与隔离临时资料目录。

| 回归 | 修改前观察 | 修改后观察 |
| --- | --- | --- |
| 两组九项直接可选、顺序、窄窗口滚动、键盘与关闭恢复 | 找不到“工作记录”区域，测试失败 | 两组完整、最后一项可滚动聚焦，进入真实服务表单、返回类型、Esc、快捷键与关闭均通过 |
| 820×600 中导航和全局入口完整可达、切页位置稳定 | 设置按钮视口比例约 0.289，测试失败 | 首页、任务、文档、设置可切换，搜索和新建完整可见且几何位置不变 |

红色追踪保留在 `release/ux-layout-refresh/task03/red/`：`grouping-trace.zip`、`minimum-navigation-trace.zip`。

## 实际验证

- `npm run build`：通过，包含 TypeScript 检查、Vite 生产构建及主进程／preload／worker 构建；独立 `npm run typecheck` 通过。
- 首轮定向 Electron：`shell-create`、`home`、`appearance`、`update`、`documents`、`desktop`、`search`，15 通过、1 失败、2 安装版专属跳过。唯一失败为旧更新关闭用例的严格坐标断言：新工具栏顶部与关闭按钮中心均为 y=62，按钮处于合法边界。
- 更新测试将顶部命中范围改为包含边界，保留关闭点击、`no-drag`、重开、Esc 和焦点恢复；与 `dialog-polish` 一并复跑 2 项通过。没有改变更新业务代码。
- 最小窗口修复后 `shell-create` 两项通过；补充截图等待实际深色主题生效，避免把偏好异步保存前的画面误标为深色。
- 合计 18 项不同的定向开发构建 Electron 检查通过；2 项安装版专属检查未运行。现有用例覆盖真实系统／环境／资源／账号／任务／文档新建与背景、任务正文草稿保留、首页操作、文档编辑与图片保存、搜索、设置外观及更新弹窗。
- 测试使用 Electron 44.9.0、Node 24.22.0，所有资料使用临时 `CLEVER_WORKBENCH_DATA_DIR`；通过共享锁串行运行。

## 图像证据与剩余边界

截图和红色追踪复制到集成工作区的 `release/ux-layout-refresh/task03/`，不纳入源代码提交。

- [分组新建，浅色](../../release/ux-layout-refresh/task03/green/create-groups-light.png)
- [分组新建，窄窗口深色滚动到底部](../../release/ux-layout-refresh/task03/green/create-groups-dark-narrow.png)
- [820×600 应用壳，浅色](../../release/ux-layout-refresh/task03/green/shell-minimum-light.png)
- [820×600 应用壳，深色](../../release/ux-layout-refresh/task03/green/shell-minimum-dark.png)
- [外观偏好](../../release/ux-layout-refresh/task03/green/settings-accessible.png)
- [首页回归](../../release/ux-layout-refresh/task03/green/home-workbench.png)
- [更新弹窗，窄窗口深色](../../release/ux-layout-refresh/task03/green/update-available-dark-narrow.png)

本项只验证开发工作区构建。原生鼠标命中测试由协调者在任务 04 集成后执行；浏览器点击和 `no-drag` 检查不能替代该项。最终完整测试集、两轴代码审查及跨任务集成验收仍属于任务 04。未推送、发布、打包安装或替换本机应用，也未声明 Windows 实机通过。
