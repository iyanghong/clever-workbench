# 任务 08：外观、秘密保护与回收站实施记录

Status: ready-for-human
Completion: verified

日期：2026-10-22。实施基线：`803bc7d`；分支：`codex/operation-guidance-08`。本记录的 verified 指本任务正文、接入和隔离开发 Electron 验证完成；安装版与真实原生鼠标总验收仍由任务 11 承担。

## 实际交付

新增五篇功能指引、23 个步骤，分别覆盖下表。全部复用现有共享 JSON 解释器、Dialog、GuidanceButton、主题偏好和受控导航，不新增密码业务逻辑、数据字段或备份格式。正文使用简体中文及实际按钮名称；这些流程可通过文字完整说明，因此未新增操作截图依赖。

| 覆盖组／操作 | guideId／步骤 ID | 实际入口与核对源码 |
| --- | --- | --- |
| 15 任务只读查看、恢复、单条永久删除、清空、转文档回收站 | `recycle-tasks`：`read`、`restore`、`purge`、`empty`、`documents` | 任务回收站顶部；`TaskWorkspace.tsx`、`Detail.tsx`、`electron/store.ts` |
| 15 文档独立回收站、只读查看、逐篇恢复与永久删除 | `recycle-documents`：`open`、`read`、`restore`、`purge` | 文档回收站顶部；`DocumentsPage.tsx`、`electron/documents.ts` |
| 16 固定浅深主题／跟随系统、减少透明度、增强对比、减少动态、系统偏好合并 | `appearance`：`theme`、`transparency`、`contrast`、`motion`、`system-preferences` | 设置 → 外观；`SettingsPage.tsx`、`useAppearance.ts` |
| 17 默认系统加密、可选主密码启用、按需解锁、显示复制与隐藏、锁定影响 | `secret-protection`：`system`、`enable`、`unlock`、`hide-copy`、`lock` | 设置 → 秘密保护主题列表；`VaultProvider.tsx`、`electron/vault.ts`、`electron/main.ts`、`secret-clipboard.ts` |
| 17 更改主密码、取消、成功后锁定、关闭并回到系统保护 | `master-password-manage`：`change`、`cancel`、`save`、`disable` | 同一秘密保护主题列表；`PasswordChange.tsx`、ADR 0010／0011 |

全部指引自动出现在设置的“查看全部使用指引”中。“前往功能”只进入设置区域或相应回收站，不触发解锁、删除或恢复。文档和任务的正文明确区分回收站边界：文档没有批量清空；台账直接删除不进入这两个回收站。普通正文和图片不自动加密，主密码与独立备份密码、ZIP 归档密码分别说明。

根规范中的旧备份密码表述属于任务 09 的既定同步修正范围，本任务按已实施 ADR 0011 编写当前用法，未修改密码实现或另行改写根规范。

## 红绿与验证

采用用户已确认的 Electron 桌面／DesktopAPI 外部边界，所有测试使用 `os.tmpdir()` 下新建的隔离资料目录，结束后关闭该测试实例并清理目录。GUI 测试通过 `/tmp/cwb-guidance-run-electron.py` 串行锁执行，未访问真实用户资料或日常安装应用。

四个垂直切片均先写行为测试：外观、秘密保护、任务回收站、文档回收站分别因缺少对应附近入口而失败；接入正文与入口后各自通过。

正常内容的生产构建通过；以下 Electron 套件共 **12 项通过**：

```sh
python3 /tmp/cwb-guidance-run-electron.py npm run test:e2e -- \
  tests/e2e/maintenance-guidance.spec.ts tests/e2e/appearance.spec.ts \
  tests/e2e/vault-rotation.spec.ts tests/e2e/vault.spec.ts tests/e2e/documents.spec.ts
```

- 新增 4 项：离线打开、浅深主题、辅助偏好、窄窗口主要按钮、Esc 焦点返回、集中入口与安全导航；真实主密码启用／更改／关闭和取消；任务只读、恢复、单条确认删除与清空确认；文档只读、逐篇恢复／确认删除、无批量清空。
- 现有 8 项：系统主题与辅助偏好、文档保存／图片／恢复、主密码错误／成功锁定／重启解锁、秘密显示清除、30 秒受保护剪贴板清理及取消解锁、秘密复制的明确选择。
- 本任务检查更改／关闭主密码后独立备份配置仍存在；完整备份密码的真实导出恢复验证属于任务 09／11，不把这一状态断言扩张为完整恢复通过。
- 已查看窄窗口深色高对比截图，长文可滚动、关闭与前往功能可达。测试请求内容尺寸 800×600，实际窗口遵守应用最小宽度；截图为 Retina 1640×1200 像素。

## 内容异常不阻断

测试从被测应用本身读取原始内容，正文不存在时验证不可用反馈及关闭；附近主题列表为空时验证空列表反馈。有效指引才断言其实际标题和导航目的地，不将具体正文标题作为新发布门槛。

曾临时将本任务五个实际 JSON 全部改为损坏 JSON，然后重新生产构建：

- 构建通过；`guidance:check` 输出五条 `invalid-json` 警告及基线尚无待发布说明的警告，退出码为 0。
- 本任务 4 项 Electron 用例全部通过降级分支，基础外观、凭据和回收站操作仍执行并通过，没有跳过业务机制验证。
- 随后在 finally 中逐字恢复五个正文文件，并核对每个文件可解析；损坏内容未提交。

## 可复查证据与限制

运行证据保存在 [evidence/08](evidence/08/)，原始红测日志另保存在 `/tmp/cwb-operation-guidance-evidence/08/`：

- `cwb-guidance-08-red-appearance.log`、`cwb-guidance-08-red-vault.log`、`cwb-guidance-08-red-trash.log`、`cwb-guidance-08-red-documents-trash.log`：四轮入口缺失红测。
- [regression.log](evidence/08/regression.log)：12 项正常内容回归。
- [degraded-build.log](evidence/08/degraded-build.log)、[degraded-check.log](evidence/08/degraded-check.log)、[degraded-e2e.log](evidence/08/degraded-e2e.log)：实际损坏正文构建、警告和 4 项降级验证。
- [appearance-guide-dark-narrow.png](evidence/08/appearance-guide-dark-narrow.png)：实际 Electron 窄窗口、深色／高对比／减少透明度下的指引。

这些是开发 Electron 实际运行结果；尚未在最终安装包验证，也未执行原生鼠标点击、真实系统钥匙串授权或 Windows 实机验证。原生菜单、最终安装内容及完整跨任务覆盖由任务 11 汇总。没有推送、发布、替换日常应用或使用真实秘密。

## 集成复核

代码提交 `17c05d7` 后，将最新集成 `0f81de6` 合入本分支（合并提交 `1209553`），无冲突。合并后生产构建与本任务四项 Electron 用例再次通过：[构建](evidence/08/merged-build.log)、[4 项复核](evidence/08/merged-e2e.log)。[指引检查](evidence/08/merged-check.log)无本任务正文警告；待发布说明保留 10 项尚缺人工核对的既有警告，未伪造核对结果，也未阻断构建或测试。
