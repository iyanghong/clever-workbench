# 操作指引实现契约

本页记录任务 01、02 交付给后续内容和发布任务的共同接口。任务 02 已接入版本提示与设备记录；正式发布绑定仍由发布任务完成，不能仅凭本页认为已发布或完成安装版总验收。

## 内容与资源

- 实际功能正文：`content/guidance/features/*.json`；随包历史：`content/guidance/releases/*.json`；下一次发布说明：`content/guidance/pending.json`（后续发布任务接入）。每个文件独立解析。
- 本地截图放在 `content/guidance/assets/`，步骤沿用 `image.src/alt/caption`，其中 src 形如 `assets/application-update-about.png`。支持 PNG、JPEG、WebP、GIF；不允许 URL、绝对路径、上级路径或脚本资源。
- 功能字段与编写模板一致：schemaVersion、kind、id、revision、title、platforms、placements、purpose、prerequisites、entry、steps、completion、faq。稳定步骤 ID 不随显示文案变更。准备条件及常见问题的 items 为空时必须给出具体不适用原因。
- 首批已交付 `application-update`（覆盖组 21）和 `using-guidance`（指引自身说明）。截图来自隔离资料下的真实开发界面，用受控更新状态展示按钮；版本号是示例，不是远端最新版断言。

## 共享解释边界

`src/guidance/catalog.ts` 导出的 `loadGuidanceCatalog(sources, { assets? })` 以 `{file, text}` 数组接收原始文件，返回 `features/releases/drafts/warnings`。输入损坏时不抛出内容异常。每条 warning 含 code、file、field、message、suggestion。这里的文件名仅用作诊断，不用于打开文件。

纯契约、类型和入口登记位于 `src/guidance/`，没有 React、Electron、Node 文件访问依赖；Node 发布脚本可用现有 Node 类型擦除能力直接导入。渲染层 `bundled.ts` 仅负责 Vite raw glob 和本地图片 URL，不能在发布脚本中引用。

解析器保留有效正文，排除未知格式、占位正文与重复身份；缺图保留替代文字，未登记入口保留正文但禁止跳转。正式内容质量由覆盖核对报告判断，不能用针对当前正文的强制测试断言重新引入发布阻断。

## 版本记录边界

待发布说明沿用 release-draft 模板。绑定记录使用 kind `release`，增加 version、tag、sourceSha、publication。version 为正式三段版本号，tag 与之对应；sourceSha 为选定业务源码的完整 SHA。tag 指向的版本准备提交 SHA 另存构建证据，避免把提交自身 SHA 写回。

publication 可为 `pending` 或 `published`：**当前实际运行版本可以展示本包自己的绑定记录，即使构建时尚为 pending**；只有经确认的既往 published 记录参与历史升级范围。不能把失败或草稿 tag 当作用户已经历的正式版本。发布确认的历史快照、固定 tag 重跑与源码绑定由发布任务负责，不能事后改写已经发布的安装包。

缺失、未知和 none 是不同状态。changed 的缺项生成警告，不自动改成 none。review 为真实核对记录，格式异常可省略并警告，不自动补造人员、日期或通过结果。

## 页面接入

- `GuidanceButton`：传 guideId 直接阅读；传 placement 打开该位置的主题列表；无参数打开全部列表。默认文字“使用指引”，可用 accessibleLabel 区分附近入口。
- `useGuidance()`：提供 openGuide(id)、openLibrary(placement?)，供现有菜单使用。不要直接操作底层 Dialog 状态。
- 在已有功能弹窗中提供帮助时，可给按钮 beforeOpen 回调关闭该功能弹窗；先保留来源焦点，再进入指引。不要在指引外绕过保存执行功能动作。
- 设置中的集中入口为 SettingsGuidance。功能正文登记由目录自动发现，新增 JSON 不需要修改中央 import 列表。
- 受控目的地和展示位置在 `registry.ts` 中登记。现有 ledger 类目的地先进入台账选择流程，不携带记忆对象 ID，不自动弹出创建、导出或删除对话框；后续功能任务可安全细化纯导航入口。
- 设置 route.section 支持 appearance、vault、backup、about、guidance，对应页面内锚点；未知 section 不执行任意选择器。

## 导航、模态和忙状态

App 保留原有 `navigate(): Promise<void>` 契约，并为指引提供显式 `{ok,message?}` 结果。指引前往功能等待页面登记的 flush；失败保留输入和当前页面。安装冻结、恢复代次、其他模态和已关闭请求在异步之后再次确认。仍有效的请求才能完成导航；关闭指引会使待处理导航取消。

`window.desktop.guidanceAvailability()` 经原有 secureHandler、preload generation 进入主进程，返回 `{available,reason?}`。该读接口检查更新冻结、恢复、凭据变更、关闭、备份和 activeOperations。原生文件选择位于活动 IPC 内，因而在没有 DOM dialog 的情况下也会阻止指引打开。它只报告时点状态，不授予永久锁；后续自动提示必须继续协调 DOM 模态、实际显示确认、页面就绪与输入空闲。

共享 Dialog 的 `exclusive` 用于指引及更新重启提示：显示前同步检查现有模态，忙时保持隐藏并等待；普通业务弹窗仍可嵌套，但会等待已显示的独占提示关闭。`onShown` 仅在 `showModal()` 成功且存在可见布局后触发，排队和显示失败不会消费提示。自动版本提示另检查页面 `aria-busy`、输入及中文组合空闲、保存结果和主进程可用性；异步检查后重新核对活动代次与 DOM 模态。

## 版本提示与设备记录

- `guidanceVersions()` 返回实际运行版本和随包版本记录。主进程通过同一内容解释器读取 `dist-electron/guidance` 的原始 JSON；构建保持 feature、release、pending 的相对路径，以便有效引用有同一解释上下文。坏 JSON 和缺文件不会成为新构建门槛，图片仍由渲染产物携带，不重复复制。
- `guidanceState()` 记录本次启动并返回设备状态；`guidanceAcknowledge(currentVersion)` 仅接受当前运行版本，在实际显示之后确认。两者沿用来源、主 frame、资料代次、更新冻结和写入保护，不能从渲染层指定文件路径。
- 设备记录位于隔离能力同样适用的 userData 下、业务 `data` 外。首次版本界定回看下界，已启动版本不会消费尚待显示的变化，已提示上界防止重启与降级后再升级重复。业务备份和恢复不携带这份记录。
- 当前版本可以读取本包自己的 pending 绑定；既往范围只使用 published 记录。同功能仅出现一个当前用法入口，不同变化保留；旧版缺口明确声明，缺失不能改写为无新增操作。
- 设备记录采用串行临时写入、同步及原子替换，正常关闭等待队列完成。`persisted: false` 表示只保证本进程去重，界面明确提醒重启后可能再次显示；损坏记录按首次处理，既不回放全部历史，也不把失败写入当成持久成功。
- 设置中的 `openVersions()` 提供手动历史入口；历史摘要保持原文，功能按钮使用当前有效指引。手动查看不重置自动去重状态，来源不可用时保持可理解的降级说明。
