# 任务 09：备份、迁移与更新失败处理指引实施记录

Status: ready-for-human
Completion: verified

日期：2026-10-23。实施分支：`codex/operation-guidance-09`。本记录的 verified 指本任务内容、就近入口、隔离开发 Electron 操作核对及文案一致性已完成；最终安装版、真实 macOS 原生鼠标和真实在线安装健康验收归任务 11，不据此声称已发布。

## 覆盖与入口

新增 5 篇功能指引、23 个图文弹窗中的文字步骤，复用现有 JSON 解释器、受控页面导航和集中指引列表。指引只带用户到设置区域，不自动导出、恢复、安装或打开恢复文件；这些流程的确认仍由原业务界面完成。步骤没有必须依赖的截图，离线文字可独立阅读。

| 覆盖组 | guideId 与步骤 ID | 实际就近入口、核对依据 |
| --- | --- | --- |
| 18 独立备份密码、首次触发、取消、更改及旧备份密码 | `backup-password`：`open`、`enter`、`cancel`、`change` | 设置 → 备份与迁移 → 独立备份密码；`VaultProvider.tsx`、ADR 0011 |
| 19 手动 `.cwb` 导出、范围、锁定时备份、密码和文件保管 | `full-backup`：`start`、`choose-file`、`keep`、`verify-scope` | 导出完整备份按钮旁；`SettingsPage.tsx`、`electron/backup.ts` |
| 19 自动备份开关、目录、结果、立即重试与同一序列最近 7 份 | `automatic-backup`：`enable`、`directory`、`result`、`retention` | 自动备份开关旁；`electron/backup.ts`、`docs/usage.md` |
| 20 选择、旧／新格式密码预检、取消、目标解锁、整份替换、恢复前副本与换机 | `restore-and-migrate`：`choose`、`password`、`preview`、`confirm`、`verify` | 从备份恢复按钮旁；`SettingsPage.tsx`、`electron/backup.ts`、ADR 0011 |
| 22 最近 30 次更新记录、三种材料、隔离与授权、健康确认、清理及人工恢复 | `update-history-and-recovery`：`open-history`、`interpret-health`、`locate-materials`、`isolation`、`recover`、`cleanup` | 设置 → 关于 → 更新历史旁；品牌更新弹窗中同样可打开，先关闭原弹窗；`AppUpdate.tsx`、`electron/update-recovery.ts`、`docs/releases.md` |

组 21 的检查、下载和更新安装流程继续使用任务 01 的 `application-update`；本任务不复制该指引或变更更新器状态机。全部新指引也出现在设置的集中查阅列表。更正根 `AGENTS.md` 的旧主密码表述，并在 `docs/usage.md` 明确新旧格式密码与提示按钮；更新助手保留的人工恢复说明同步说明独立备份密码。没有改动密码派生、备份格式、更新事务或真实用户资料。

## 行为核对

在已确认的隔离 Electron／DesktopAPI 外部边界先写四条行为测试。每条在对应附近指引按钮尚不存在时先因入口缺失而失败，再接入正文和入口通过；首轮尚未构建的工作区和未启用测试钥匙串导致的启动失败另行诊断，未冒充产品红测。测试为每个案例新建系统临时目录，仅在该目录使用受保护的测试钥匙串开关；退出后关闭该实例并清理资料。

- 备份密码：打开指引不配置密码；取消首次设置仍未配置，保存后显示更改入口。
- 手动／自动备份：指引不生成文件；真实 UI 导出加密 `.cwb`、立即备份成功；把所选目录临时变为不可用文件后，失败原因可见，旧成功时间和旧备份文件保留。
- 恢复迁移：指引不替换资料；错误密码预检失败、摘要取消后保留两条任务；目标已锁定时先要求本机主密码解锁，确认后整份替换为备份内一条任务，并有恢复前加密副本。该测试覆盖新格式独立密码；历史格式规则由既有迁移测试与源码核对，本任务没有制作虚构旧文件。
- 更新历史：隔离目录中的真实历史文件经主进程读入，页面显示阶段、材料定位与人工处理状态；不存在的备份定位给出错误提示。品牌更新弹窗中的历史指引会先关闭原弹窗再展示，避免弹窗叠加。

生产构建、四条新增桌面测试和内容检查通过，日志分别见 [build.log](evidence/09/build.log)、[desktop.log](evidence/09/desktop.log)、[guidance-check.log](evidence/09/guidance-check.log)。内容检查本次有 **35 篇可用功能指引、0 篇已发布历史记录、10 条警告**；警告均来自待发布记录尚无维护者人工核对，本任务没有伪造核对人，也没有把警告改成发布门槛。

另将 `backup-password.json` 临时替换为损坏 JSON：`guidance:check` 以 0 退出并报告 `invalid-json`，生产构建成功，备份密码桌面测试通过“指引暂不可用”降级分支并继续验证密码业务；结束后通过退出 trap 恢复原文件、重新构建并核对 JSON 可解析。损坏版本未提交。

## 验收边界

本任务未执行真实 GitHub 下载、应用原位替换、健康确认或系统钥匙串授权，也未在最终安装包中人工点击原生窗口。`CWB_TEST_MOCK_KEYCHAIN=1` 仅用于临时测试资料目录，不能证明生产钥匙串权限已通过。最终安装版资源、主题／窄窗口／键盘联合回归由任务 11 完成。此处使用的历史记录和密码均为隔离测试示例。
