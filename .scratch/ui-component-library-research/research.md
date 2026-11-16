# UI 组件库选型调研

核查日期：2026 年 11 月 16 日。本文针对 Clever Workbench 的 React、Electron 和中文桌面资料管理场景。库的功能、版本和兼容声明来自官网、官方仓库及 npm registry；“适合本项目”“迁移成本”“视觉风格”属于选型判断，不代表已完成接入验证。

建议把 **Ant Design 6 作为主候选，Semi Design 作为强备选**。Ant 的 React 19、全局密度和主题配置路径直接，更符合本次减少手写控件、统一中文台账的目标。Semi 也提供完整的中文业务组件，值得作为视觉对照。Mantine 是保留候选。没有必要为了选库把高级数据网格、Tree 或调度日历变成新需求。这是本轮建议，尚未形成采用组件库的架构决策。

## 当前仓库说明了什么

已执行 `git pull --ff-only`，远端返回 `Already up to date.`。分析基于 `master` 的 `cbc0e58a377284a177159ce84182818c21035643`，应用版本为 `0.1.23`。原有未跟踪设计稿和资料保持原样。

| 仓库事实 | 对选型的影响 |
| --- | --- |
| [package.json](../../package.json) 使用 React/ReactDOM `^19.3.1`、Electron、Vite 和 TypeScript，尚无通用 UI 组件库或 Tailwind。 | 优先选能直接接入现有 React 和 CSS 工程的方案；没有必要为了组件库更换构建工具。 |
| 已有 [主题变量](../../src/shared/theme.css)、[共享控件样式](../../src/shared/controls.css) 和 [外观状态](../../src/shared/useAppearance.ts)。 | 可以保留语义变量、外观偏好和窗口布局，逐步让组件库接管基础控件。当前并非完全缺少统一基础。 |
| 当前 8 个 CSS 文件共 6,578 行，其中 [src/styles.css](../../src/styles.css) 为 4,430 行；[台账局部样式](../../src/features/ledger/ledger-layout.css) 中仍有对前文规则的后续覆盖。 | 需要收敛手写控件和覆盖规则。这个行数也包括布局、编辑器和响应式规则，不能视为全部可删除的冗余。 |
| [SystemActionsMenu](../../src/features/ledger/SystemActionsMenu.tsx) 自行处理键盘、外部点击与焦点；多个页面直接使用原生输入框、选择器和表格。 | 组件库能接管一部分重复的控件行为和状态样式，减少各页面分别维护的工作。 |
| 真正登记的台账入口是 [LedgerWorkspace](../../src/app/modules.tsx)，并非名称相似的旧 `LedgerPage`。 | 样板和迁移应落在实际入口、现有详情及录入表单上。 |

本轮还查看了仓库已有的首页、任务详情和台账截图，作为布局与视觉的辅助材料；它们是历史截图，不能当作本次启动最新应用的实测结果。从源码可以确定，基础控件、布局和编辑器规则仍由项目共同维护。组件库能统一控件，但页面主次操作、筛选区占用和列表／详情密度还需一起调整。

## 六个主要候选

| 候选 | 已核实的能力与接入方式 | 对本项目的判断及代价 |
| --- | --- | --- |
| Ant Design | 带默认样式；`ConfigProvider` 管理主题、中文、尺寸和浮层容器；提供暗色、紧凑算法及关闭动效的 token。v6 要求 React ≥18，原生支持 React 19。表格、选择器、日期和菜单属于同一体系。见 [主题](https://ant.design/docs/react/customize-theme/)、[中文本地化](https://ant.design/docs/react/i18n/)、[v6 迁移说明](https://ant.design/docs/react/migration-v6/)。 | 适合尽快统一表单、筛选、列表和操作反馈。初始风格偏企业应用；要达到项目期望的克制桌面感，仍要统一字号、控件高度、留白和边框，不能照搬后台模板。 |
| Semi Design | 带默认样式；默认主题在 Vite 中通常无须额外编译插件。支持中文、浅深色及 `getPopupContainer`；React 19 使用同一 `semi-ui` 包并导入 adapter。见 [快速开始](https://semi.design/zh-CN/start/getting-started)、[国际化](https://semi.design/zh-CN/other/locale)、[深色模式](https://semi.design/zh-CN/advanced/dark-mode)、[全局配置](https://semi.design/zh-CN/other/configprovider)。 | 与 Ant 同属可直接减少手写基础控件的强候选。我认为它值得作为更符合生产力工具观感的对照方案；这个判断需要页面试样确认。React 19 adapter、定制主题和全局默认属性要按当前版本接入。 |
| Mantine | 有完整带样式的表单、选择器和浮层组件；官方提供 Vite 接入。当前 v9 要求 React 19.2+。核心包含 `Tree`、`MultiSelect`、`TreeSelect`，但 `Table` 主要提供表格展示样式，复杂排序、筛选等需要业务组织或额外方案。日期在 `@mantine/dates`，另需 `dayjs` 和日期样式。见 [Vite/入门](https://mantine.dev/getting-started/)、[v9](https://mantine.dev/changelog/9-0-0/)、[Table](https://mantine.dev/core/table/)、[Tree](https://mantine.dev/core/tree/)、[日期](https://mantine.dev/dates/getting-started/)。 | 外观可塑性较好，不必增加 Tailwind，适合较轻的桌面工具。若未来确需更复杂的数据表格，组合和维护工作会多一些；不能把社区 Mantine DataTable 当作官方核心组件。 |
| Arco Design | 当前 React 核心包仍发布 2.x；官方更新记录已包含 React 19 `findDOMNode` 兼容修复，不应误写成“不支持 React 19”。见 [官方更新记录](https://arco.design/react/docs/changelog)、[官方仓库](https://github.com/arco-design/arco-design)。 | 可作为中文企业组件库备选。本轮没有完成其当前主题、浮层和 React 19.3 全链路实测，也没有发现足以在本项目优先于 Ant/Semi 的依据；不根据“同属字节生态”推断二者可以互换。 |
| Radix Themes | 它是带样式的组件库，与无样式的 Radix Primitives 不同。通过 CSS 文件和 `Theme` 接入，配置颜色、圆角、缩放和深浅色；发布说明包含 React 19 支持。`Table` 是语义表格，当前官方组件清单没有完整日期选择器和 Tree。见 [入门](https://www.radix-ui.com/themes/docs/overview/getting-started)、[发布记录](https://www.radix-ui.com/themes/docs/overview/releases)、[Table 与组件清单](https://www.radix-ui.com/themes/docs/components/table)。 | 我认为默认风格适合简洁工具，但要补齐本项目的日期、搜索多选等场景，统一性和维护成本还要重新评估。适合愿意继续组合组件的路线。 |
| shadcn/ui | 采用可编辑组件源码的分发方式；当前官方 Vite 路线使用 Tailwind，组件已适配 React 19。Data Table 官方文档提供基于 TanStack Table 的组装方法，而非一个全包业务表格。见 [介绍](https://ui.shadcn.com/docs)、[Vite 接入](https://ui.shadcn.com/docs/installation/vite)、[Tailwind v4/React 19](https://ui.shadcn.com/docs/tailwind-v4)、[Data Table](https://ui.shadcn.com/docs/components/data-table)。 | 可以做出精细的工具界面，但项目目前没有 Tailwind，接入还要接管组件源码、依赖和业务组合。对“减少手写、统一样式”的这次目标，不是最省事的首选。不要把模板的外观直接等同于长期统一。 |

以上能力覆盖用于比较维护责任，不表示要把当前台账改造成高级网格。当前最有用的试样仍是：筛选 Select、常规表单、菜单、任务日期、表格中的选择与复制、创建弹窗。

## 另外两家成熟方案

**MUI** 的开源核心和生态很成熟，可以作为 Material 风格明确时的候选；本项目要求接近 macOS 桌面资料工具，其视觉方向并不优先。高级功能要区分开源核心与 MUI X 商业部分：Community 为 MIT，Pro/Premium 部分功能采用商业许可，包括某些范围日期选择、表格和 Tree 功能。不能把“全部收费”或“所有功能免费”作为结论。见 [MUI X 许可及功能分层](https://mui.com/x/introduction/licensing/)。

**Fluent UI React v9** 是 Microsoft 维护的另一套成熟核心，当前包声明覆盖 React 19。若目标是 Microsoft/Windows 风格可优先考虑；对本项目既定的 macOS 启发、双平台方向，我将它列为低优先候选。这个排序依据视觉定位和迁移价值，不是认为它不成熟。见 [官方仓库](https://github.com/microsoft/fluentui)、[React v9 核心包](https://www.npmjs.com/package/@fluentui/react-components)。

## 版本、维护和许可证据

以下是本次读取 npm 官方 registry 的 `latest` 标签结果。发布日期只能证明近期有发布，不能单独证明组件质量。peer 范围通过不等于项目实际回归通过。

| 核心包 | latest / 发布日期（UTC 日期） | React peer 声明 | 核心包许可及版本来源 |
| --- | --- | --- | --- |
| `antd` | 6.7.0 / 2026-11-04 | `>=18.0.0` | [MIT / registry](https://registry.npmjs.org/antd/6.7.0) |
| `@douyinfe/semi-ui` | 2.105.0 / 2026-11-12 | `>=16.0.0`，React 19 另需 adapter | [MIT / registry](https://registry.npmjs.org/@douyinfe%2Fsemi-ui/2.105.0) |
| `@mantine/core` | 9.8.1 / 2026-11-15 | `^19.2.0` | [MIT / registry](https://registry.npmjs.org/@mantine%2Fcore/9.8.1) |
| `@arco-design/web-react` | 2.66.18 / 2026-10-12 | `>=16` | [MIT / registry](https://registry.npmjs.org/@arco-design%2Fweb-react/2.66.18) |
| `@radix-ui/themes` | 3.3.0 / 2026-01-31 | 包含 `^19.0` | [MIT / registry](https://registry.npmjs.org/@radix-ui%2Fthemes/3.3.0) |
| `shadcn` | CLI 4.23.0 / 2026-10-27 | CLI 自身没有 React peer；以实际生成组件的依赖为准 | [MIT / registry](https://registry.npmjs.org/shadcn/4.23.0) |
| `@mui/material` | 9.5.0 / 2026-10-09 | 包含 `^19.0.0` | [MIT / registry](https://registry.npmjs.org/@mui%2Fmaterial/9.5.0) |
| `@fluentui/react-components` | 9.75.2 / 2026-11-10 | `>=16.14.0 <20.0.0` | [MIT / registry](https://registry.npmjs.org/@fluentui%2Freact-components/9.75.2) |

上述 MIT 指列出的核心包，不覆盖其全部模板、托管服务和额外商业产品；实际引入后仍以锁定依赖及其许可清单为准。本轮没有按未测量的包体积、星数或主观“流行度”排名。

Semi 的 React 19 接入额外核对了 2.105.0 registry manifest 和官方发布 tarball：确实导出 `./react19-adapter`，ESM/CJS 文件通过 `react-dom/client` 的 `createRoot` 注入 `semiGlobal`。目前不应按旧文章改装 `@douyinfe/semi-ui-19`。其 [React 19 专页](https://semi.design/zh-CN/ecosystem/react19) 还说明类组件触发器的 DOM 兼容回退依赖 React 内部 Fiber，建议自定义触发器转发真实 DOM ref。网页和搜索快照可能不同步，实施应以锁定版本源码及专页为准。

## 接入前必须解决的边界

这些约束对所有候选都适用，不能用“组件库自带”替代项目验证。

1. 原生 `dialog.showModal()` 位于 top layer，弹窗之外的节点会进入 inert 状态。结合库默认挂载位置判断，Select、日期和 Tooltip 传送到 `body` 时，可能被原生弹窗遮挡或不可交互。Ant 和 Semi 有浮层容器配置；Mantine 可调整 Portal。必须在项目 [shared/Dialog](../../src/shared/Dialog.tsx) 内试验浮层容器、定位和长内容滚动，单纯加大 z-index 不能作为解决办法。见 [HTML 模态规范](https://html.spec.whatwg.org/multipage/interaction.html#modal-dialogs-and-inert-subtrees)、[Ant ConfigProvider](https://ant.design/components/config-provider/)、[Semi ConfigProvider](https://semi.design/zh-CN/other/configprovider)、[Mantine Portal](https://mantine.dev/core/portal/)。
2. 组件库的表单机制不替代项目自动保存、离开页面前 flush 和资料代次检查。日期值转换还要保持“仅日期”和“精确到时分”的既有语义。
3. 沿用现有 `useAppearance` 作为外观状态来源，再映射库的主题。浅深色可配置不代表高对比度、减少透明度和减少动态效果已经满足。
4. 保留系统字体和已用的 Phosphor 图标。示例代码里的网络字体、远程图片和在线服务不应顺手复制。依赖打进本地包后仍要在禁网条件下检查资源加载；本轮未做任何候选的离线运行或体积测量。
5. 组件库解决控件样式和交互的一致性；页面信息层级、主次操作、列表密度和详情区布局仍需项目统一设计。

## 建议的迁移范围和顺序

采用一套主库，先在“台账 → 服务器列表、筛选、详情入口及新增服务器弹窗”做完整样板。它能同时检验密集资料、选择与复制、表单和浮层，价值高于单独做一页按钮展示。

1. **统一主题和基础控件。** 在 [渲染入口](../../src/main.tsx) 接入库的 Provider，复用外观状态作为唯一来源。以项目现有系统字体、蓝色强调色和 32 px 普通控件为起点，集中设置颜色、字号、圆角、密度和动效；紧凑算法作为试样调节项，不能直接等同于全部控件使用最小尺寸。先迁移 Button、Input、Select、Checkbox、Tabs／Segmented、Dropdown、Tag、反馈和空状态。按每次迁移范围删除或限定旧全局控件规则的作用域，保留布局和编辑器规则。普通控件直接使用库，不再为每个组件制造同名包装层。
2. **完成真实台账样板。** 修改实际使用的 `LedgerWorkspace`、录入表单、共享上下文选择器、菜单和台账 CSS；将表格展示接入库时保留既有对象身份、选择、复制与秘密接口。继续通过现有 `shared/Dialog` 入口使用弹窗，保留放弃录入保护、不可关闭阶段、排他提示、Esc 和焦点返回。首轮保留其原生机制并解决内部浮层挂载；后续如替换内部弹窗实现，须同步核查 App、任务详情和版本指引中对 `dialog[open]` 的判断，避免热键穿透或指引重叠。
3. **按模块扩展并删除旧规则。** 沿用同一样板迁移任务、文档周边控件、设置和工具。复用 `useAutosave`、`useSaveGroup`、`registerFlush`，不让库的 Form 状态接管已有保存链路。[任务列表](../../src/features/tasks/TaskWorkspace.tsx) 的分组／紧凑／普通行高为 34／44／68 px，与虚拟滚动契约相关，改密度时须同步核对。保留 Vditor／Tiptap 编辑器及任务日期的领域类型；不会因为引入通用 UI 库而自动更换存储、IPC 或凭据机制。

Ant 的入口建议采用 `ConfigProvider` 统一中文、主题和尺寸；如使用其消息、通知和确认接口，应使用能继承 Provider 上下文的方式，避免静态调用导致主题或中文丢失。日期控件还需按官方说明配置日期库本地化。见 [ConfigProvider](https://ant.design/components/config-provider/)、[主题与上下文说明](https://ant.design/docs/react/customize-theme/)。现有 CSP 允许内联样式，字体只允许本地来源，见 [index.html](../../index.html)；接入无需预先放宽这些边界。

后续实现会涉及依赖及锁文件、渲染入口、主题与控件样式、真实页面和共享控件调用方，以及对应回归用例。无需预先创建新的数据模型、后台接口或通用组件框架。

## 样板的完成条件

样板必须同时给出浅色、深色和窄窗口结果，证明控件高度、操作层级、表格与详情切换一致；键盘能到达主要操作，弹窗中的选择器和日期可正常打开、滚动和关闭。继续验证高对比度、减少透明度和减少动态效果，原生鼠标能点击拖拽区附近的控件。

复用 [外观回归](../../tests/e2e/unified-appearance.spec.ts)、[外观设置](../../tests/e2e/appearance.spec.ts)、[台账布局](../../tests/e2e/ledger-layout.spec.ts)、[菜单键盘行为](../../tests/e2e/ledger-system-actions.spec.ts)、[台账复制](../../tests/e2e/ledger-copy.spec.ts) 和 [弹窗](../../tests/e2e/dialog-polish.spec.ts) 用例；按样板改动补最小行为断言，验证保存失败保留输入和重试。实际实现后执行类型检查、生产构建与相关 Electron 回归，随后测量新增资源体积并检查禁网启动。Windows 和安装包路径须分别记录实际执行情况。

本轮完成了拉取、源码检查和官方资料调研，只新增这份研究记录；未安装组件库、修改业务代码或执行应用构建和 UI 回归。React peer 与官方适配声明是选型依据，不能替代 Electron 中的实际兼容验证。
