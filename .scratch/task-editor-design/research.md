# 工作任务详情与编辑器改版调研

调研日期：2026-10-20。

本轮用于讨论界面方向，不改应用代码。参考官方文档与公开源码；外部项目的事实和针对本工作台的建议分开记录。

同日补充：用户进一步指定 Typora 作为参考。以下推荐已据此调整为连续书写、隐藏常驻工具和局部对象操作；精简常驻工具栏保留为对比方案，不再作为首选。

## 现有实现决定了改动可以很小

本地 `package.json` 和已安装包均为 Tiptap 3.32.0。`src/components/Editor.tsx` 已具备标题、列表、清单、引用、代码块、表格、本地图片、源码切换和安全转换失败提示。现有 `@tiptap/react` 暴露 `@tiptap/react/menus`，锁文件中已有同版 BubbleMenu、FloatingMenu 及 Floating UI。问题首先可以通过界面重排解决，没有必要为外观更换编辑器。

`src/shared/markdown.ts` 明确限制表格结构、外部图片及不支持的 Markdown；无法安全往返转换时保留源码。这使“Markdown 源码”同时承担内容保护的职责：入口可以降低视觉权重，但不能删除回退能力，也不能在不支持的内容上强制进入排版模式。

领域边界沿用 `CONTEXT.md` 与 ADR 0007：工作任务只有一个可选系统归属。既有 `.scratch/task-time-and-appearance/spec.md` 已确认预计完成时间、临期和任务颜色标签，布局应容纳这些属性；外部项目的负责人、团队优先级、项目流程不在本轮范围内。

## 参考项目与产品

| 参考 | 已核实的交互 | 本工作台适合借鉴什么 | 不适合直接照搬什么 |
| --- | --- | --- | --- |
| Plane | 详情默认从列表侧边打开，也能展开；标题下有常用属性行；描述可编辑并自动保存。 | 标题、紧凑属性、正文构成连续层次；保留侧边快览与展开写作。 | 团队属性侧栏、订阅、评论、工作流等完整项目管理界面。 |
| Milkdown Crepe | 文本选区触发格式浮层；块插入与文字格式分开组织。 | 区分“修改选中文字”与“插入表格、代码、图片”。 | 为获得其外观整体替换本地编辑器，或一次加入所有块类型。 |
| Tiptap | 现有框架直接提供选区菜单、空行菜单。 | 保留现有命令、数据与保存路径，只改工具入口和显示条件。 | 把商业 UI 套件或完整块编辑器模板当成本轮前提。 |
| Outline | 公开源码按选区、链接、代码等上下文选择菜单；另有可筛选的 `/` 块菜单。 | 正文占据主体，操作贴近当前内容；复杂块操作按需出现。 | 整套协作文档平台、扩展注册架构及其源码。当前项目许可证明确为 BSL 1.1，不能混称为标准开源组件。 |
| Typora | 即时渲染，行内 Markdown 随光标展开，表格提供局部操作，保留源码模式。 | 连续书写、让正文优先、编辑对象时才出现相关操作。 | 将它视为开源可嵌入组件，或认为隐藏工具栏便能复制完整语法显隐行为。 |

### Plane：借详情层次，不借团队流程

官方文档将标题、标题下属性行、描述、其余属性明确分层，并说明侧边快览可切换为居中或全屏。描述支持 Markdown 风格的结构输入和自动保存。这里参考的是信息组织方式；该文档涵盖商业产品能力，不能据此声称所有列出的功能都在社区版中。[详情官方文档](https://docs.plane.so/work-items/work-item-details)

社区仓库的 `DescriptionInput` 实际包含延迟保存及卸载时提交逻辑；编辑器包也有控制出现条件的 BubbleMenu。说明“轻量外观、随写随存、按选区显示格式工具”有公开实现可查。[描述输入源码](https://github.com/makeplane/plane/blob/6c16585c81bac84d8ce67110c70a69b1bf07f10b/apps/web/components/editor/rich-text/description-input/root.tsx)、[选区菜单源码](https://github.com/makeplane/plane/blob/6c16585c81bac84d8ce67110c70a69b1bf07f10b/packages/editor/src/components/menus/bubble-menu/root.tsx)

建议：系统改成可点击的紧凑属性，标题紧接其下或其上，开始时间与预计完成等属性组成可换行区域。不要为每个属性保留整行标签和大输入框，也不在窄侧栏内再复制一列属性侧栏。

### Milkdown Crepe：区分文字格式与块插入

Crepe 的 Toolbar 源码明确检查非空文本选区、编辑状态及焦点，符合条件才显示；BlockEdit 单独配置文本、列表与高级插入组，后者包含图片、代码块和表格。[Toolbar 源码](https://github.com/Milkdown/milkdown/blob/main/packages/crepe/src/feature/toolbar/index.ts)、[BlockEdit 源码](https://github.com/Milkdown/milkdown/blob/main/packages/crepe/src/feature/block-edit/index.ts)

建议：选中文字后的加粗、斜体可以归为一组；图片、表格、代码块归入“插入”。按 Typora 方向，常驻工具收起，保留菜单与快捷键入口，对象操作按需显示。不必同时加入 `/` 命令、块拖拽和完整块级菜单。Crepe 用于参考交互，其组件不是替换现有 Tiptap 的必要依赖。

### Tiptap：现有技术可以实现界面精简

当前官方文档支持从 `@tiptap/react/menus` 导入 BubbleMenu 与 FloatingMenu。前者用于文字选区附近的工具，后者默认在空行出现；React 组件负责注册对应插件，无须再次加入同一扩展。菜单的样式与内容由应用定义。[BubbleMenu 文档](https://tiptap.dev/docs/editor/extensions/functionality/bubble-menu)、[FloatingMenu 文档](https://tiptap.dev/docs/editor/extensions/functionality/floatingmenu)

结合 Typora 参考，建议分两步评估：

1. 先收起独立模式标签行和常驻格式工具，把源码模式与插入操作收进可发现的菜单；重排正文间距和焦点提示。表格、图片、代码操作贴近当前对象，沿用现有内容、图片和保存路径。
2. 只有需要选区格式操作时再使用 BubbleMenu；它不是 Typora 语法回显机制。光标进入后显示可编辑 Markdown 的能力需要单独验证，不能随同界面改版默认承诺。

本地安装包证实这些导出已存在，不需升级大版本。不过“已有依赖”不等于“直接复制示例即可完成”：窄侧栏中的浮层边界、滚动定位、键盘焦点和表格禁用规则仍需接入验证。

### Outline：源码可查的额外体验参考

`SelectionToolbar` 根据选区和节点类型切换链接、媒体及格式菜单，代码块等有专门路径；`BlockMenu` 使用 `/` 触发和过滤菜单。这是将少量常用操作留在当前内容附近的具体参考。[SelectionToolbar 源码](https://github.com/outline/outline/blob/main/app/editor/components/SelectionToolbar.tsx)、[BlockMenu 源码](https://github.com/outline/outline/blob/main/app/editor/components/BlockMenu.tsx)

本轮只借鉴交互。该仓库当前 `LICENSE` 写明 BSL 1.1，并明确说明其不是开源许可证；不把它列为可无条件复制的开源组件。[许可证原文](https://github.com/outline/outline/blob/main/LICENSE)

### Typora：连续书写与可逆语法显隐

官方快速入门区分两类行为：行内符号智能显示或隐藏，块级符号在结构渲染后隐藏。不能将其概括成“所有 Markdown 都随光标原样展开”。[Quick Start](https://support.typora.io/Quick-Start/)

对于行内元素，官方说明光标移入时展开 Markdown 源码；链接单击用于展开编辑，`Command + 单击` 才打开浏览器。因此它把编辑意图放在正文操作的第一位。[Markdown Reference](https://support.typora.io/Markdown-Reference/)

表格同时提供菜单、右键和快捷键；光标进入表格后，表头附近才显示局部工具。源码模式仍保留 `Command/Ctrl + /`，连续书写并不意味着彻底禁止源码。[Table Editing](https://support.typora.io/Table-Editing/)、[Shortcut Keys](https://support.typora.io/Shortcut-Keys/)

Typora 官方仓库明确说明产品为商业软件、非开源；该仓库用于问题反馈，不包含可嵌入的编辑器实现。本轮只能核实公开行为，不能声称读到了其内部实现。[官方仓库说明](https://github.com/typora/typora-issues)

本地 Tiptap 的输入规则已经能把 `**文字**` 转为粗体，把标题前缀转为标题；但其 3.32.0 `markInputRule` 会删除首尾标记，再添加文档 mark，`textblockTypeInputRule` 会删除匹配的前缀并改变块类型。这是输入时的结构转换，光标移回不会自动恢复可编辑的原始符号。[markInputRule 源码](https://github.com/ueberdosis/tiptap/blob/v3.32.0/packages/core/src/inputRules/markInputRule.ts)、[textblockTypeInputRule 源码](https://github.com/ueberdosis/tiptap/blob/v3.32.0/packages/core/src/inputRules/textblockTypeInputRule.ts)、[输入规则文档](https://tiptap.dev/docs/editor/api/input-rules)

由这些实现可以推断：完整复现 Typora 的可编辑语法回显，需要处理语法与结构的映射、选区、撤销、输入法及粘贴等编辑行为。CSS 可以改变显示，BubbleMenu 可以增加菜单，但两者本身都不能完成这套语义往返。应先用加粗和链接做受控原型，验证后再决定是否扩展；不为外观改版先更换引擎。

## 建议先讨论的方向

优先做“紧凑的任务页，加一块自然延展的正文”。标题、系统、时间和标签占据上方较小区域，正文获得主要空间。正文与标题共用左对齐线，不再呈现为大表单中的一个深层输入框。

按新增的 Typora 参考，首选让正文直接进入连续书写，收起常驻格式栏与模式标签，只留轻量菜单入口和快捷键。进入表格时显示行列操作，进入代码块时显示语言与复制，图片操作贴近图片；选区浮层只承担必要的格式操作，不作为主角。

源码切换放进更多菜单，但进入源码后必须明确显示当前模式及返回入口。不支持的内容继续自动回退源码，本地图片引用、导入限制和待完成保存仍需保留。现有链接单击直接打开浏览器，若采用 Typora 的“单击编辑、修饰键打开”，应视为明确的行为变化并提供提示。

“保留一条精简工具栏”仍可作为发现性更强的对比方案，但当前讨论以 Typora 式连续书写为主。完整的光标语法回显另行验证，不与第一步界面调整混为一个低成本改动。

截图中的高饱和蓝色整框应改成适合大正文的局部焦点提示；不能直接删除所有键盘焦点样式。页面标题、系统选择、正文区域的留白与字号应一起调整，仅换边框颜色不足以解决层级割裂。

本轮未运行外部项目，也未做真实任务输入的可用性测试。来源证明这些交互存在；适合本工作台的程度仍需用窄侧栏、长标题、表格与截图内容验证。
