# 工作任务编辑器：即时渲染内核实施选项

调研日期：2026-10-20。目标已明确为同时实现清爽页面与 Typora 式 Markdown 语法自动显隐。本轮只读取官方资料和源码，没有安装依赖、修改应用或运行编辑器原型。本文取代上一份调研中“只调整界面也可以先交付”的范围判断。

## 初步选择

优先验证 **Vditor 的 IR 模式**。它有可嵌入的浏览器 API，源码实际保留 Markdown 标记并按选区显隐，符合这次的核心要求。若本地图片协议、Markdown 往返和中文输入验收通过，再采用它替换共享编辑器的交互内核。

这是一项有明确验证条件的技术推荐，不代表已经证明 Vditor 与 Typora 手感一致。主界面、保存协议和编辑器内核分开处理；不因引入 Vditor 就同步引入它的默认工具栏、云上传、缓存和全部扩展语法。

| 方案 | 语法显隐证据 | 结论 |
| --- | --- | --- |
| Vditor IR | 源码按 Range 展开活动节点，非活动标记隐藏，失焦收起。 | 首选验证。无需自行发明核心语法显隐机制，但需要适配数据和桌面环境。 |
| Milkdown / Crepe | 已核实文本选区工具栏和块菜单；本轮未找到官方现成的可编辑 Markdown 标记回显能力。 | 不能仅凭 WYSIWYG 或 Typora 灵感介绍判定满足要求；不作为直接替换首选。 |
| Muya | 行内渲染器保留标记，结合光标决定样式；现已迁入 MarkText 单仓库。 | 有相关实现基础，可作次选。官方仍提示 API 可能在次版本变化、不建议生产使用。 |
| 保留 Tiptap 自建显隐 | 当前输入规则会删除标记，再转换为节点或 mark。 | 可以开发，但会自行承担选区、撤销、输入法及语法映射的长期维护；不是最小方案。 |

## Vditor IR：已确认的行为

Vditor 将 `ir`、`wysiwyg` 和 `sv` 明确作为不同模式，不能把它的富文本模式误作即时渲染。`expandMarker` 先收起原先展开节点，再检查当前 Range，将活动或紧邻的语法节点加上展开类；样式表让标记默认宽高为零，在展开状态恢复内联显示。[模式示例](https://b3log.org/vditor/demo/option-mode.html)、[expandMarker 源码](https://github.com/Vanessa219/vditor/blob/v4.0.1/src/ts/ir/expandMarker.ts)、[IR 样式](https://github.com/Vanessa219/vditor/blob/v4.0.1/src/assets/less/_ir.less)

IR 元素处理键盘、点击、复制、粘贴及 composition 事件，复制时也会从 IR DOM 转回 Markdown。这比产品介绍中的“类似 Typora”提供了更直接的行为证据；仍不能据此保证所有复杂嵌套与中文输入场景都正确。[IR 事件实现](https://github.com/Vanessa219/vditor/blob/v4.0.1/src/ts/ir/index.ts)

### 接入接口与生命周期

公开接口包括构造器的 `mode: 'ir'`、`value`、`input(value)`、`after`、`blur(value)`，实例的 `getValue()`、`setValue()`、`insertValue()`、`disabled()`、`destroy()`。官方也提供 React 接入示例。适合在 React 容器挂载后初始化，卸载时销毁，沿用本项目保存回调；无需引入另一个 React 包装库。[API 类型](https://github.com/Vanessa219/vditor/blob/v4.0.1/types/index.d.ts)、[实例实现](https://github.com/Vanessa219/vditor/blob/v4.0.1/src/index.ts)、[官方 React 示例入口](https://b3log.org/vditor/demo/react.html)

Electron 兼容目前是依据其浏览器库形态作出的工程判断，本轮没有验证当前 Electron 环境。`after` 前 Lute 等资源尚未完成初始化，不能提前调用依赖内核的方法。组件还要处理切换任务、只读状态及异步图片导入完成后编辑器已销毁的情况。

### Markdown 与自动保存

`getValue()` 的 IR 路径调用 `VditorIRDOM2Md`，并经过不换行空格处理；它是序列化结果，不是逐字保存的原始输入缓存。不同列表符号、空行等可能被规范化，不能承诺字节级无变化。[getMarkdown](https://github.com/Vanessa219/vditor/blob/v4.0.1/src/ts/markdown/getMarkdown.ts)

初始化的 `setEditMode` 和公开 `setValue` 在重绘时传入 `enableInput: false`；正常 `processAfterRender` 默认在延迟后以序列化 Markdown 触发 `input`。失焦处理会收起展开标记，并向 `blur` 提供 `getMarkdown()` 的结果。[模式切换](https://github.com/Vanessa219/vditor/blob/v4.0.1/src/ts/toolbar/EditMode.ts)、[渲染后回调](https://github.com/Vanessa219/vditor/blob/v4.0.1/src/ts/ir/process.ts)、[失焦事件](https://github.com/Vanessa219/vditor/blob/v4.0.1/src/ts/util/editorCommonEvent.ts)

因此适配层应保留加载时原文和初始化后的规范化基线，只在真实内容改变时触发保存；不能把 `blur(getValue())` 无条件当成用户修改。仅打开、移动光标、选中、失焦、切换模式不应改写已有任务。源码支持这一设计，但是否覆盖全部事件路径仍需原型验证。

本项目可继续以 Markdown 为持久化主体，调用已有 `loadMarkdown` 生成兼容 JSON 缓存；无法安全转换时继续使用已有源码回退语义。不能把 Vditor 的新 Markdown 与旧 ProseMirror JSON 一起保存。本轮没有理由同步修改数据库或删除 Tiptap 的转换依赖。

### 本地图片、上传与粘贴

`upload.handler(files)` 支持 Promise，源码会 `await` 它；返回字符串表示错误。该分支随后直接返回，位于默认上传 URL、文件变换、`validate`、大小检查和选区保存之前。自定义 handler 不是“替换网络请求地址”，应用需要自己完成文件验证、导入、插入及错误处理。[上传类型](https://github.com/Vanessa219/vditor/blob/v4.0.1/types/index.d.ts)、[uploadFiles 实现](https://github.com/Vanessa219/vditor/blob/v4.0.1/src/ts/upload/index.ts)

适配应调用现有 `window.desktop.importImage`，保留单图限制、本地引用、失败提示和 `pendingRef`；异步等待期间用户移动光标或切换任务，插图目标仍须明确。调用 `insertValue` 可以插入 Markdown，但 handler 路径是否保留预期选区必须验证，不能直接依赖内置上传的选区行为。

本轮没有证明 `workbench-asset://image/...` 能通过 Lute 的解析、清理、IR DOM 与序列化完整往返。它是首批验证项，失败时优先寻找受支持的 URL 处理接口；不能直接关闭 XSS 清理或放宽协议校验。

内置粘贴读取 HTML、纯文本和文件，并优先处理非空 HTML，其次才进入文件上传分支。公开 `IOptions` 未提供一个通用的 `onPaste` 取消/转换接口；`upload.renderLinkDest`、`base64ToLink` 等是特定路径的钩子。只配置 handler 不足以保留本项目“优先本地图片、文本经过安全 Markdown 转换”的策略。[粘贴实现](https://github.com/Vanessa219/vditor/blob/v4.0.1/src/ts/util/fixBrowserBehavior.ts)

若需由应用接管粘贴，可评估容器捕获阶段事件，但这属于待验证适配方案，不是已经确认的 Vditor 扩展 API。必须覆盖纯截图、HTML 与文件混合、文本表格、外部图片、纯 Markdown 和拖放。

### 完全离线与 CSP

默认按需资源地址指向公共 CDN；初始化实际加载语言、Lute、图标，内容主题和代码/图形渲染也有资源路径。官方提供自建 CDN 配置及复制构建产物的方法。[资源说明](https://github.com/Vanessa219/vditor/blob/v4.0.1/README.md#cdn-切换)、[资源加载实现](https://github.com/Vanessa219/vditor/blob/v4.0.1/src/index.ts)

本项目应将需要的静态资源随应用打包，通过本地同源路径加载，关闭不使用的功能，显式禁用 Vditor 自带本地缓存；不能为方便直接放宽现有 `script-src 'self'`。原型验收须断网启动并检查资源请求，确认没有 CDN、远程图表服务或外部图片请求。`_lutePath` 虽存在于类型和实现中，但完整离线还涉及语言、图标及主题，单改这一项不够。

### 许可证与维护

Vditor 的 `LICENSE` 为 MIT。调研时最新正式发布为 v4.0.1，发布于 2026-10-18；该版包含媒体渲染 XSS 修复，v4.0.0 还修复了保存不换行空格、上传失败改写内容等问题。这说明相关边界仍在修正，选型应固定版本并保留数据回归样本，不以版本新就推断风险已消失。[许可证](https://github.com/Vanessa219/vditor/blob/v4.0.1/LICENSE)、[正式发布记录](https://github.com/Vanessa219/vditor/releases)

## Milkdown 与 Muya 的取舍

Milkdown/Crepe 已核实的 Toolbar 是非空文本选区的工具浮层，BlockEdit 是块插入菜单。两者都没有证明存在“光标返回后恢复可编辑 Markdown 标记”的完整机制。因此本轮不推荐为了目标换到 Milkdown 再自行补回显；若另有官方扩展证据，可重新评估。[Toolbar 实现](https://github.com/Milkdown/milkdown/blob/main/packages/crepe/src/feature/toolbar/index.ts)、[BlockEdit 实现](https://github.com/Milkdown/milkdown/blob/main/packages/crepe/src/feature/block-edit/index.ts)

Muya 旧仓库已迁移到 MarkText 单仓库，不能依据旧仓库停止提交就判断内核停止维护。当前 `packages/muya` 提供 `getMarkdown`、`setContent`、`json-change` 和销毁 API，也有图像插件回调；行内渲染器对首尾标记单独渲染，并读取 cursor 决定 class。它值得作为备选，但当前 README 仍明确提示 API 可能在次版本变化、不建议生产使用。[迁移声明](https://github.com/marktext/muya)、[当前 Muya README](https://github.com/marktext/marktext/blob/develop/packages/muya/README.md)、[行内标记渲染器](https://github.com/marktext/marktext/blob/develop/packages/muya/src/inlineRenderer/renderer/delEmStrongFactory.ts)

Muya 当前源码仍在维护；本轮检出的 MarkText `develop` 包含 2026-10-20 的 Muya 只读模式提交。没有逐项验证其语法展开、公开包与仓库开发版的一致性、图片协议或生产稳定性，所以不把它提升为本次首选，也不建议抽取整个 MarkText 桌面应用。仓库 MIT 许可不等于免除这些适配与稳定性工作。[仓库许可证](https://github.com/marktext/marktext/blob/develop/LICENSE)

## 进入实施前需要通过的验证

1. 加粗、斜体、链接、行内代码、标题、列表、清单、代码块、表格的显隐与实际编辑；中文输入、跨节点选择、撤销和重做。
2. 既有 Markdown 样本往返，重点核验复杂嵌套、表格、本地图片与不支持结构；仅打开、聚焦、光标移动和失焦不得保存或丢内容。
3. 图片导入 Promise、导入失败、导入中切换任务与关闭窗口；混合剪贴板及拖放必须符合现有保护规则。
4. 完全断网、现有 CSP、深浅主题、窄侧栏及展开写作；同时核验 Mac 和 Windows。

这些验证用于决定 Vditor 是否真正适合替换，不是推迟用户已要求的语法显隐。若失败，应比较修复上游适配问题与改走另一内核的成本；不能用隐藏工具栏、浮动菜单或单纯 WYSIWYG 作为完成替代。

## 完整体验的交付范围

本轮讨论的完整体验同时包含版面和实际编辑行为。估算按工作台当前已支持的正文范围计算：标题、段落、加粗、斜体、删除线、链接、行内代码、引用、有序及无序列表、清单、代码块、表格、本地图片。公式、图表、脚注等 Typora 扩展能力尚未纳入本次估算；旧文档中存在这些内容时仍须保留原文并可编辑源码。

| 状态或操作 | 应观察到的行为 |
| --- | --- |
| 打开任务 | 标题优先，系统、时间和标签紧凑排列；正文与页面自然衔接，常驻模式标签和整排格式栏收起。 |
| 输入与离开行内语法 | 可直接写 Markdown，完成语法后显示排版；光标进入适用的行内元素时展开可编辑标记，离开后收起。 |
| 标题、列表、代码块、表格 | 按各自的编辑规则处理，不强求所有块与行内语法使用相同展开方式；对象工具只在需要时出现。 |
| 修改语法边界 | 删除一侧符号、输入尚未闭合标记、跨格式选择、粘贴、剪切和撤销都保留合理的原文；不能只在演示样例上表现正确。 |
| 中文输入 | 候选词组合期间不抢光标或重绘掉组合文本；上屏、换行、标点和撤销均正常。 |
| 点击链接 | 普通点击用于编辑；修饰键点击打开外部浏览器，保留现有 URL 校验。 |
| 查看源码 | 原文入口可发现；切换不丢选区上下文或内容，不无故清空撤销历史。 |
| 保存与离开 | 光标移动、显隐、聚焦和失焦本身不产生正文修改；真实编辑继续自动保存，图片导入和保存失败按现有规则处理。 |
| 键盘和窄窗口 | 保留可见焦点与可用菜单；窄窗口可展开编辑，不依赖缩小正文或隐藏必要操作。 |

具体显隐边界应以同一组语料在 Typora 和候选内核中的实际操作对照为准。无需复刻全部菜单、文件管理和导出产品功能，但不能用少量 CSS 演示代替实际输入行为。

## 本地改动范围

代码观察基于本轮仓库提交 `7c42405`，应用版本 0.1.6。

- `src/components/Editor.tsx`：替换编辑交互内核，承接菜单、源码模式、只读、图片预览、粘贴与拖放。保持编辑器实例稳定，不在每次 React 更新时重新装载正文；切换任务后不混用撤销历史或异步导入结果。
- `src/components/Detail.tsx`、`src/styles.css`：重排标题、系统、实际时间、预计完成时间和标签；调整正文排版、侧栏及展开状态、深浅主题和焦点样式。当前时间与标签已经实现，应保留已有行为。
- `src/features/documents/DocumentsPage.tsx`：它调用同一个 Editor，正文体验和回归范围必须一并覆盖；文档页面的其他业务信息组织不因此扩大改版。
- `src/shared/markdown.ts`：继续承担兼容解析与内容保护，明确新内核支持的语法和现有导出语法的交集。不能将“JSON 缓存无法转换”等同于“可以丢弃 Markdown”。
- `src/shared/useAutosave.ts` 及其调用处：保留 400 ms 防抖、串行保存、失败重试、等待图片导入及导航前 flush。需要评估新内核内部延迟尚未发出 input 时的关闭行为，保证最后一次输入被读取并保存。只有现有接口不足时才修改保存模块。
- `package.json`、锁文件和构建资源配置：增加固定版本的编辑器及所需本地资源，验证最终安装包断网可用。是否需要改 CSP 或 Electron 资源路径取决于验证结果；保留当前安全边界，不用加载公网脚本作为捷径。
- 测试：更新现有编辑器 E2E 入口，扩充语法显隐、真实编辑、保存及旧数据回归；复用 Markdown、文档、导出和附件备份测试。

目前 `Task`、`Draft`、`DocumentRecord` 仍持久化 `markdown` 和结构化 `content`。搜索、DOCX/PDF 与系统资料导出主要使用 Markdown；`Store.validateDraft` 会验证 JSON 结构，并检查两个字段中的本地图片引用。因此最小接入方案可保留数据库和 IPC，随真实修改重新生成兼容 JSON，无法安全解析时沿用现有空缓存与源码保留机制。旧记录不批量改写，附件 URI 保持不变。

这意味着第一轮不宜同时删除全部 Tiptap 包：显示内核虽然替换，旧 JSON 的兼容转换可能仍使用其解析模块。安装包大小与加载耗时需实测；不能提前宣称替换后依赖一定更少。

## 三条路线的工程判断

| 路线 | 主要投入 | 完整范围粗估 |
| --- | --- | --- |
| Vditor IR 接入 | 已有显隐内核；重点做桌面适配、视觉、图片、保存和兼容验证。 | 验证通过且无须大改上游时，15–25 人日。 |
| Tiptap 上定制可编辑语法回显 | 复用现有富文本能力，自行处理文本与节点转换、选区映射、撤销及输入法边界。 | 30–50 人日，估算置信度较低。 |
| CodeMirror 6 上构建 Markdown 实时预览 | 保留源文本，用装饰隐藏符号或替换为渲染组件；自行补齐表格、图片、跨组件选区及对象编辑。 | 35–60 人日，估算置信度较低。 |

CodeMirror 提供 mark、widget、replace 等显示装饰及独立的选区机制，因此可构建源码驱动的预览；这些基础能力本身不等于现成的 Typora 编辑器。[官方显示装饰 API](https://codemirror.net/docs/ref/#view.Decoration)、[官方源码](https://github.com/codemirror/view/blob/main/src/decoration.ts)。其 GitHub 仓库归档原因是迁往维护者的新托管站，不能解释成项目停更。[官方迁移说明](https://github.com/codemirror/dev)

以上工时是本轮工程推估，不来自项目官方，也不是已验证排期。假设一名熟悉 React/Electron 的工程师全职实施，有 macOS 和 Windows 实机可做输入法及安装包验证，范围限于上文正文能力，不增加多人协作、同步或全部 Typora 扩展功能。估算包含任务与文档两处接入、数据兼容、测试和稳定性修正，不是仅把编辑器显示出来的时间。

Vditor 路线可拆为：

| 工作包 | 估计投入 |
| --- | --- |
| 行为原型与选型验证：中文输入、显隐、撤销、图片协议、源码往返 | 2–3 人日 |
| 共享编辑器接入、任务详情布局、正文与主题样式、菜单及快捷键 | 4–6 人日 |
| 图片、粘贴、自动保存、兼容 JSON、旧数据、离线资源衔接 | 4–7 人日 |
| Mac/Windows、窄窗口、长正文、导出与备份回归及缺陷余量 | 5–9 人日 |
| 合计 | 15–25 人日 |

维护成本主要来自锁定版本的依赖升级、渲染语义变化和跨平台输入回归。暂不估具体包体积、运行内存、金钱或长期维护人日，这些均缺少实测或单价依据。若原型证明本地图片协议、撤销或中文输入必须修改大量上游内核，15–25 人日区间不再成立，应停止这一接入路线并重新比较方案。

## 推荐实施顺序

未来获得实施指令后，先做包含真实输入和本地保存链路的受控原型。通过中文输入、语法边界、选区、撤销、Markdown 往返及断网资源验证，再完成共享编辑器接入、布局和两处页面回归。这个原型用于尽早发现选型问题，最终交付仍包括完整连续书写体验。

本轮只整理方案与估算；未实测交互手感、浏览器性能或打包结果，也未修改应用代码。官方演示页的浏览器打开尝试超时，不能将源码核验写成已通过实际手感验证。
