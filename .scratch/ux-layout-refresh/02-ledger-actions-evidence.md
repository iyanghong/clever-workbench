# 任务 02：系统菜单与按需批量操作验证记录

2026-10-21。实现工作区：`/Users/kuku/.codex/worktrees/ux-ledger-actions/9-workbench`；分支：`codex/ux-ledger-actions`。基于集成分支 `codex/ux-layout-refresh` 的 `dcf6d0803178ae9b478326a7c2aeaa5897321ee6`，交付前再次合并确认已是最新基线。

## 实际改动

- 当前系统的“更多”菜单收纳系统信息和导出资料；保留系统收藏。菜单支持 Enter、上下方向键、Home／End、Tab、Esc，关闭返回稳定触发按钮；菜单与触发区域显式排除原生窗口拖拽。
- 新增系统放入既有系统选择弹窗；保留搜索、常用／最近顺序、无系统时的新建入口，以及原有保存保护。搜索获得初始焦点，从选择器打开新增系统时先关闭选择器；取消或创建后焦点回到系统切换按钮。
- 未勾选时仅显示选择入口和数量；勾选后显示复制、包含账号及取消选择。取消后清空真实勾选，并把焦点返回选择入口。
- 继续使用既有 `LedgerCopyProvider`、保存协调、复制 IPC、范围校验及秘密解锁。摘要与完整清单切换保留勾选，筛选变化清除失效选择；没有修改数据库、IPC、凭据、导出格式或安装逻辑。
- 更新系统信息／导出相关旧 Electron 用例的操作入口，保留原有业务断言；新增菜单与选择器焦点链，扩展批量复制及系统动作的保存失败检查。

## 红 → 绿过程

1. 新增 `ledger-system-actions.spec.ts` 后先运行旧界面，因缺少“当前系统更多操作”失败，见 [红测试日志](../../release/ux-layout-refresh/task02/red-system.log) 与 `release/ux-layout-refresh/task02/red-system/` 下的 trace。
2. 菜单接入后的第一次验证发现旧选择器的 `autoFocus` 没有在共享 Dialog 打开后落到搜索框，见 [焦点失败日志](../../release/ux-layout-refresh/task02/green-system.log)。在选择器打开后显式聚焦搜索，菜单／选择器连续焦点链通过，见 [首次绿测试](../../release/ux-layout-refresh/task02/green-system-focus.log)。
3. 扩展原资料复制用例，旧界面未勾选时仍存在批量按钮，得到 [批量红测试](../../release/ux-layout-refresh/task02/red-batch.log)。按真实勾选条件显示后，真实复制、取消选择、附账号、解锁取消与锁定清理通过，见 [批量绿测试](../../release/ux-layout-refresh/task02/green-batch.log)。
4. 定向回归首轮 11/12 通过。新增“打开详情且编辑保存失败时从更多导出”的检查发现详情固定工具栏遮挡导出菜单；trace 中明确记录 `workspace-inspector-toolbar` 拦截 pointer events。该次测试超时，失败清理也触发 worker teardown 超时，原结论保留于 [首轮回归日志](../../release/ux-layout-refresh/task02/regression.log) 和 `release/ux-layout-refresh/task02/regression/ledger-copy-台账资料单条、多选、附账号与编辑保存失败不覆盖剪贴板/trace.zip`。
5. 将台账顶部工具栏的层级置于详情固定工具栏上方后，仅复跑受影响的资料复制与系统菜单两项，**2/2 通过**，见 [修复后日志](../../release/ux-layout-refresh/task02/green-menu-layer.log)。

## 实际验证结果

- `npm run typecheck` 通过，见 [类型检查日志](../../release/ux-layout-refresh/task02/typecheck.log)。
- `npm run build` 通过；最终菜单层级修复后的生产构建见 [构建日志](../../release/ux-layout-refresh/task02/build-menu-layer.log)。
- `git diff --check` 通过。
- 现有 Playwright Electron 入口中累计 **12 条不同用例通过**，其中 11 条在首轮回归通过，菜单／复制两条在最终层级修复后再次通过。范围包括：菜单与选择器的键盘／Esc／Tab／焦点返回、真实新建系统、收藏、系统信息保存和失败保护、无系统创建、系统／环境及历史项目背景、资料复制／批量附账号／解锁取消／锁定清理、资源编辑复制、系统资料 Markdown／Word／PDF 导出、文档保存与图片、粘贴保护。
- 页面检查覆盖 1380×850 浅色及 880×620 深色的系统菜单与选择器；查看截图确认菜单可见、操作未溢出。批量操作还覆盖摘要与完整清单的实际勾选和复制。
- 所有 Electron 运行均通过原子 `mkdir /tmp/cwb-ux-layout-verification-VApleh/electron.lock` 获得独占锁，退出时只释放自己取得的锁。使用临时 `CLEVER_WORKBENCH_DATA_DIR`，未使用真实用户资料。
- 首轮超时后确认没有遗留 Electron／Playwright 进程；将临时目录创建时间与失败起点对应，并检查 `SingletonLock` 所指 PID 76762 已不存在，只删除本次的 `workbench-ledger-copy-pR1yeU`。未终止其他进程，见 [清理记录](../../release/ux-layout-refresh/task02/cleanup.log)。

最终必要复跑命令：

```text
npm run test:e2e -- tests/e2e/ledger-copy.spec.ts tests/e2e/ledger-system-actions.spec.ts --output=release/ux-ledger-actions/green-menu-layer
```

## 截图与剩余边界

最终截图及全部运行日志已复制到集成工作区 `release/ux-layout-refresh/task02/`，57 个文件逐一校验与实现工作区内容一致。上述复跑命令保留实际执行时的原工作区参数；以下链接指向集成目录中的最终截图：

- [system-menu-light.png](../../release/ux-layout-refresh/task02/green-menu-layer/ledger-system-actions-系统动作收纳后支持键盘、保存及弹窗关闭焦点链/system-menu-light.png)
- [system-menu-dark-narrow.png](../../release/ux-layout-refresh/task02/green-menu-layer/ledger-system-actions-系统动作收纳后支持键盘、保存及弹窗关闭焦点链/system-menu-dark-narrow.png)
- [system-picker-dark-narrow.png](../../release/ux-layout-refresh/task02/green-menu-layer/ledger-system-actions-系统动作收纳后支持键盘、保存及弹窗关闭焦点链/system-picker-dark-narrow.png)
- [batch-copy-summary.png](../../release/ux-layout-refresh/task02/green-menu-layer/ledger-copy-台账资料单条、多选、附账号与编辑保存失败不覆盖剪贴板/batch-copy-summary.png)
- [copy-with-accounts.png](../../release/ux-layout-refresh/task02/green-menu-layer/ledger-copy-台账资料单条、多选、附账号与编辑保存失败不覆盖剪贴板/copy-with-accounts.png)
- [ledger-copy-details.png](../../release/ux-layout-refresh/task02/green-menu-layer/ledger-copy-台账资料单条、多选、附账号与编辑保存失败不覆盖剪贴板/ledger-copy-details.png)

本项为开发产物上的 Electron 验证。**原生鼠标点击、完整测试集、外观偏好与跨任务集成验收仍留任务 04**；特别应以原生鼠标验证打开详情后的“更多 → 导出资料”。未进行安装包、真实安装、推送或发布。使用文档及 AGENTS 布局断点说明由任务 04 统一更新。日志与截图已复制至集成工作区的忽略目录保留，未纳入 Git 提交。
