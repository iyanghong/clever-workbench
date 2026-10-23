# 任务 11：安装版全流程与首批内容联合验收

Status: ready-for-human
Completion: verified

日期：2026-10-23。该状态表示本任务的代理验收、证据整理及隔离打包完成；维护者对拟正式发布源码的人工核对、GitHub 发布、真实在线更新和日常应用安装仍未进行。本任务分支为 `codex/operation-guidance-11`，待汇入 `codex/operation-guidance` 并接受最终两轴审查。

## 来源与隔离边界

- 最终被测业务源码：`319072ec799b686d9ad73ada0ca84780e21700d2`；从该提交独立克隆，使用现有 `prepareVersion` 在**仅本地**准备测试 tag `v99.4.13`，版本提交为 `b2f18e9e21d31371ffee5bf2796c4d388f02dd28`。该版本号只是验收夹具，不是仓库公开 Release。
- 最终应用：`/Users/kuku/code/.cwb-guidance-tickets/11-final/release/mac-arm64/Clever Workbench.app`，macOS arm64，Electron 44.9.0，版本 `99.4.13`。`npm run build`、`electron-builder --mac --arm64 --dir --publish never`、`codesign --verify --deep --strict` 均通过；无 Apple 公证。首次 final builder 因从 GitHub CDN 重新下载 Electron ZIP 进展缓慢被精确终止，失败日志保留；随后指定已存在且 `unzip -t -q` 通过的本机 Electron 缓存 ZIP，完成同一已构建源码的打包。见[构建](evidence/11/final-build.log)、[首次打包尝试](evidence/11/final-package.log)、[成功打包](evidence/11/final-package-cache.log)。
- 所有运行使用系统临时目录中的 `CLEVER_WORKBENCH_DATA_DIR`。安装版 Playwright 和原生点击的专用实例显式使用严格受隔离目录约束的 `CWB_TEST_MOCK_KEYCHAIN=1`／`--use-mock-keychain`；这不是生产 Keychain 授权测试。未读取真实业务资料、未打开或替换 `/Applications` 中的日常副本。

## 26 组正文与实际入口

[覆盖清单](coverage.md)逐组列出实际附近入口、关键操作与任务证据；[全步骤映射](evidence/11/coverage-map.json)精确登记 **26 组 → guideId → 每个稳定 stepId**，另列指引功能自身 `using-guidance` 四步。跨任务复用共用编辑器，47 篇正文覆盖这 26 组及指引自身说明，没有仅为凑数而保留空标题。

最终安装版从“设置 → 查看全部使用指引”逐篇打开 47 篇，按顺序翻阅 **269 个步骤**，检查每步标题、动作后的预期结果及最后完成结果；三张包内图片实际解码成功。列表、步骤和图片核对结果见[逐篇阅读记录](evidence/11/final-installed-all-guides.json)。它验证了内容确实能在离开源码目录的 `.app` 中展示；每个业务动作是否实测、哪些仅按控件和处理链静态核对，分别见[任务 05](implementation-05.md)、[06](implementation-06.md)、[07](implementation-07.md)、[08](implementation-08.md)、[09](implementation-09.md)、[10](implementation-10.md)，不能把“269 步可读”说成“269 项业务动作逐个执行”。

最终包中 47 篇原始 JSON 与版本准备目录源码逐字一致，三张图片均存在于渲染资产；运行版本、`releases/99.4.13.json` 的 `version`／`tag`／业务 `sourceSha`、发布正文生成函数中的用户摘要及功能引用一致。当前包的绑定记录为 `pending`，用于当前版本自身说明；没有经 GitHub 确认的旧 `published` 历史，不能凭本地 tag 编造历史。详见[包内一致性结果](evidence/11/final-bundle-verification.json)、[版本准备结果](evidence/11/final-binding-result.json)。

本次内容检查在最终绑定目录读取到 47 篇有效功能指引、1 条当前版本记录。警告只涉及 `pending.json` 和绑定记录中尚无维护者人工核对：`missing-review` 两条、`unreviewed-step` 十八条；没有功能 JSON、图片、入口或步骤引用警告。检查退出码为 0，警告的位置见[汇总](evidence/11/guidance-report-summary.json)，原始文字及修正建议见[检查日志](evidence/11/final-bound-check.log)。没有伪造审核人或把缺失说明改写为“无新增操作”。

## 安装版组合行为与原生鼠标

- 修订前的隔离绑定包 `v99.4.11`（业务源码 `33b5822`）执行 49 项关联桌面用例，**48 通过、1 失败**，保留[首次日志](evidence/11/installed-guidance.log)。失败项在关闭手动指引后等待更新重启框，实际先出现该包当前版本的首次自动说明。原用例只在无绑定的开发包运行，没有处理真实绑定包的首启提示；这是测试前置状态不足，未发现产品互斥失效。
- 改为先从真实 UI 关闭首启说明并确认设备提示记录，再动态生成高于运行版本的更新目标与第二阶段版本夹具。受影响项对旧包[复测 1/1](evidence/11/installed-modal-retest.log)；最终 `v99.4.13` 包[再测 1/1](evidence/11/final-installed-modal.log)。其余 48 项没有因测试前置修订被记作重新执行。原 49 项涵盖首次／跨版本与无变化范围、重启去重、真实隔离业务备份恢复后设备记录保留、保存失败、中文输入、原生文件选择、安装提示互斥、长期内容与导航；跨版本历史使用受控桌面接口夹具，不宣称真实旧 Release 资产已升级。
- 深浅主题、减少透明度／增强对比、窄窗口、长内容、Esc、焦点返回、正常／失败保存和主要附近入口分别在上述安装版回归及各任务的隔离 Electron 用例中覆盖；最终包的集中目录、47 篇逐步阅读与更新窗口互斥另行复验。`editor-images` 的 Windows 文案从“Finder”改为通用“文件管理器”，没有改变操作行为。
- 根代理对独立包 `/Users/kuku/code/.cwb-guidance-tickets/11-package/release/mac-arm64/Clever Workbench.app` 使用 CUA 绑定**绝对应用路径**，AX 页面来源含该包 `app.asar/dist/index.html`；终端精确核对主进程 PID `39845` 与该路径和隔离临时资料。实际原生鼠标点击关闭“版本操作指引”按钮后窗口消失，工作台可见；再点击设置与“查看全部使用指引”，目录显示 47 项；鼠标点击关闭后目录消失，焦点回到“查看全部使用指引”按钮。此结果是修订前包的同一 Dialog 实现；最终修订只更改一个内容标题、待发布说明文字及测试前置，未改该窗口代码。CUA 图像只即时展示、未保存截图。PID `39845` 正常退出码 0，GUI 锁释放，临时资料经系统临时根路径检查后清理；日常应用未受影响。

## 内容故障与真正阻断边界

独立损坏夹具的业务源码 `7b4b420d0ba7f9957c1ace703a46655e11a855f3` 只在本地测试分支加入无效 `resource-server.json`、一张缺失图片及待发布说明中的不存在功能引用。发布预览与固定版本检查均退出 0，并同时报告 `invalid-json`、`missing-image`、`missing-guide` 及真实未审核警告；绑定生成本地 `v99.4.12`（版本提交 `18c57400e25d95c0a50a725274cdee75d1619aef`），GitHub 用户摘要模拟生成保留有效部分并明确写“暂未提供完整操作指引”。见[预览日志](evidence/11/bad-preview.log)、[绑定结果](evidence/11/bad-binding-result.json)、[固定版本检查](evidence/11/bad-bound-check.log)、[摘要](evidence/11/bad-generated-summary.md)。

损坏内容仍成功通过[生产构建](evidence/11/bad-build.log)、[macOS arm64 打包](evidence/11/bad-package.log)和 `codesign --verify --deep --strict`。该 `.app` 的 `app.asar` 确实保留坏 JSON，运行时当前版本变化展示失效引用说明、有效目录仍有 46 篇、坏正文不进入目录、缺图显示替代文字而保留该步预期结果、工作台可正常使用；见[隔离安装版故障烟测](evidence/11/bad-installed-smoke.json)。这只证明内容问题不阻断，不表示坏内容通过首批质量验收。

安全边界反例：在上述测试 clone 的固定 tag 上临时改动已跟踪 `package.json`，来源检查**非零退出**并明确拒绝混合源码，随后只恢复该测试文件；见[拒绝日志](evidence/11/source-integrity-rejected.log)。现有发布与共享契约[25 项测试](evidence/11/release-contracts.log)也通过；任务 03 已对真实 TypeScript 错误验证构建失败，任务 04 已验证资产与身份错误不会被内容容错掩盖。本任务没有通过忽略构建或签名错误来放行坏指引。

## 尚未验证的范围

- 没有执行真实 GitHub Actions、推送 tag、上传或公开 Release；生成的 GitHub 摘要是同源函数的本地模拟，不是远端页面。
- 没有在真实网络从旧正式安装版下载并自动替换，也没有证明生产 Keychain 授权、Gatekeeper 授权或更新健康启动；这些仍按既有发布与安装规范单独验收。
- 仅在本机 macOS arm64 验证隔离 `.app`；Windows、Intel macOS 实机、原生拖拽图片及逐个原生窗口菜单动作没有全部执行。首批正文对这些流程已编写或静态核对，不能标为跨平台实测。
- 待发布说明的人工作业核对仍为 `pending`；维护者须在真正发布前按版本源码、步骤、截图和入口留下真实核对记录。只警告规则仍允许继续发布，但不能据此宣称人工审核完成。
