# 任务 03 实施证据

日期：2026-10-22。分支：`codex/operation-guidance-03`。任务从集成分支 `997a3a2` 开始。

## 已交付

- 发布预览读取隔离检出的实际远端快照，输出用户摘要、关联功能、核对状态、缺项和修正建议，不采用本地未提交或未推送内容。
- Node CLI 与本地发布共用内容契约，无新增依赖；JSON 报告保留全部有效正文、图片路径及警告，CI 输出 annotation、摘要并保存报告。内容问题退出成功，错误调用、报告写入和程序错误仍失败。
- 检查有变化／无新增操作、缺文件、格式、功能引用、重复身份、占位文字、图片及入口；补充失效核对步骤、未覆盖步骤、失败／未验证、整体状态冲突、时间及来源差异警告。不自动修改核对人、来源或结果。
- 桌面用例从被测安装包自身读取原始内容期望；坏正文或入口时严格验证不可用反馈、关闭及原功能可用，并注明正常导航未覆盖。有效正文仍验证完整路径。
- 增加显式 `CWB_TEST_MOCK_KEYCHAIN=1` 外部系统测试适配：仅 macOS 且资料真实路径在系统临时目录内的独立已创建目录时启用，默认关闭；生产代码和系统设置未改动。

## 红绿证据

1. 临时 Git 远端预览先失败于没有 guidance 报告；接入后通过，日志只含远端摘要和问题，不产生提交、tag 或发布副作用。
2. Node 检查先失败于入口不存在；接入后与本地规则得到一致警告和退出码 0，错误目录仍非零退出。
3. 核对记录先遗漏失效步骤和错误整体通过；补齐后保留原始 failed 结果与缺项并告警。
4. 暂时把实际更新正文改为坏 JSON，构建成功而旧 Electron 用例等待不存在标题超时；改为内容可用性分支后 5 条通过。还原正文后同样 5 条通过完整路径；临时内容已清除。
5. 模拟钥匙串隔离保护先未拒绝越界（负例使用不存在的可执行文件，未启动真实资料）；增加保护后缺目录、仓库目录、临时根目录、越界符号链接和未创建路径全部拒绝。

## 实际验证

- 发布、共享契约及测试隔离用例：4 文件、20 条通过。命令：`npm test -- tests/release-command.test.ts tests/release-guidance.test.ts tests/guidance-catalog.test.ts tests/electron-test-isolation.test.ts`。使用临时 Git 仓库与 GitHub 响应替身，没有真实推送或发布。
- `npm run build` 及类型检查通过，保留已有 Vditor 图标 script 非 module 提示。临时 TypeScript 错误反例确认真正代码错误仍失败，随后删除夹具。
- `npm run test:e2e -- tests/e2e/guidance.spec.ts`：正常正文 5 条通过；坏更新正文降级输入 5 条通过并附未覆盖路径说明。全部使用隔离资料，正常路径覆盖离线、步骤、焦点、深色窄窗口、保存失败、文件选择避让和迟到导航取消。
- 额外坏 JSON 与缺图夹具完成实际 `electron-builder --mac --arm64 --dir --publish never`，通过 `codesign --verify --deep --strict`；生成的 v0.1.12 `.app` 断网可打开指引，缺图保留正文及替代说明。临时源码已删除、正常开发输出已重建。
- 集成基线 `997a3a2` 的真实 v0.1.12 包也通过模拟钥匙串启动烟测：`isPackaged=true`、`use-mock-keychain=true`、主界面可见。临时资料在退出后清理。
- `git diff --check` 通过。提交前核对本地配置及实际 author／committer 为 `ikuku-tt`，不覆盖身份。

## 接续与边界

- 任务 04 复用 `inspectOperationGuidance(directory, { sourceSha?, releaseTag? })` 与 `formatOperationGuidance(report)`。报告含 `content/catalog/assets/warnings`；无 tag 选择有效 pending，有 tag 选择绑定记录。固定 tag 重跑、实际版本绑定和同源正文仍由 04 接入。
- 任务 02 提供安装包原始 JSON 目录；旧包缺此元信息时 helper 明确报告无法核对，不用另一份源码替代。最终集成包全部回归由 11 承接。
- CI 调用已配置、相同 CLI 已本地验证，没有运行真实 GitHub Actions。本机包验证为 `.app` 打包与运行，不是 DMG／ZIP 正式发布，未替换 `/Applications` 应用。
- 模拟钥匙串属于操作系统适配夹具，不能当作真实 Keychain 授权、生产秘密保护或系统打开授权验收；依据见[发布测试说明](../../docs/releases.md)。未执行真实下载、自动安装替换或健康升级。
