# 内置工具接入

工具属于整个工作台。“工具”菜单展示工具目录，首页常用入口保存工具的稳定标识；两处共用登记信息。工具的输入、输出文件不自动进入工作台资料库。

## 增加工具

每个工具是 `tools/<工具 ID>/` 下的独立目录，前后端代码放在同一目录、按运行边界分层：

```text
tools/example-tool/
  manifest.ts          # 导出 manifest：稳定 ID、标题、说明、Phosphor 图标名和可选指引位置
  contract.ts          # 有主进程能力时导出 State、Command；纯前端工具可为空模块
  renderer/index.tsx   # 默认导出页面组件
  main/controller.ts   # 可选，导出 Controller 类
  main/worker.ts       # 可选，耗时文件处理
  main/preferences.ts  # 可选，导出 validatePreferences(key, value)
```

1. 新建目录和必需文件。ID 必须与目录名一致并使用小写连字符格式；它是收藏引用，发布后不要随显示名称一起修改。
2. 执行 `npm run tools:generate`，或直接运行开发、构建、类型检查和测试命令。生成器会自动登记目录、首页收藏、延迟加载页面、类型化 IPC、控制器、worker 构建入口、指引位置和备份偏好校验。`*.generated.*` 文件由生成器维护，不要手动修改。
3. 控制器负责校验输入、保存运行状态和管理暂存，提供 `busy`、`snapshot`、`command`、`dispose`；worker 通过 `electron/tools/runner.ts` 执行，构建产物位于 `dist-electron/tools/<工具 ID>/worker.cjs`。
4. 有持久化设置时通过 `main/preferences.ts` 校验恢复内容，再验证收藏、跨页运行、失败清理和打包后运行。

这是**源码级、构建时自动发现**，不是向已安装应用放入任意代码后运行时加载。生成器会拒绝缺少入口、ID 或指引冲突及无效清单，并生成静态导入供 Vite 和 esbuild 打包。

页面通过 `window.desktop.tools` 使用受控 IPC。公共接口只处理工具标识、明确命令、路径选择和结果打开；具体工具的参数、文件格式和处理过程留在各自模块。渲染页面只接收进度、元信息和短预览。

## 运行与退出

每个工具一次处理一项操作。控制器由主进程持有，页面卸载不会结束任务；worker 每次操作启动一次，结束后退出。正在处理时阻止应用退出和工作台备份恢复，以免丢失运行状态或切换资料代次。

worker 向主进程登记本次创建的目录或文件，异常退出后清理这些资源。新工具须只登记自己以排他方式新建的资源，不能将用户原有目录交给失败清理。正常关闭时清理暂存；本轮没有任务队列、运行历史或断点恢复。

## 本地效率工具

以下工具均为纯前端本地处理，不需要主进程控制器；输入不写入台账或备份：

- `tools/config-diff/`：文本、JSON、`.env` 对比；JSON 递归排序后比较，`.env` 忽略注释和空行。
- `tools/data-format/`：JSON 格式化、压缩、递归键排序、简单路径提取及字符串转义。
- `tools/time-cron/`：秒／毫秒时间戳和日期转换、相对时间、五段 Cron 解释及本机时区执行预测。
- `tools/text-transform/`：清理、去重、数字感知排序、前后缀、列提取、正则提取替换及行合并。
- `tools/table-data/`：CSV 与 JSON 双向转换，支持逗号、制表符、分号、表头、引号和字段内换行。

## ZIP 文本归档

- `zip-archive.ts`：ZIP 压缩、加密分片、认证解密、路径校验与解压，兼容 `ZTXT1`。
- `git-files.ts`：只读查询本地 Git 历史，以提交确定路径范围，打包时读取当前磁盘文件；范围变化需重新预览，内容变化直接读取最新内容。
- `clipboard-parts.ts`：macOS 通过 `pbpaste`、Windows 通过系统 PowerShell 和 Win32 剪贴板接口流式读取。大文本留在工作进程和私有暂存中。
- `main/controller.ts`：一次处理一项操作，保留本次结果及粘贴分片，记忆目录和分片大小。密码只用于本次任务，不写偏好或备份。

归档与还原随工作台安装，无需 Python。Git 筛选依赖本机 Git；没有 Git 时其他操作仍可使用。

## 验证

单元测试覆盖工具自动发现、效率工具处理逻辑、旧 Python 产物样例、往返还原、文件保护、分片输入、Git 行为和后台生命周期；桌面测试覆盖五个效率工具及 ZIP 的实际 Electron 操作。

```sh
npm test -- tests/tool-registry.test.ts tests/productivity-tools.test.ts tests/zip-tools.test.ts tests/home.test.ts tests/restore.test.ts
npm run build
npm run test:e2e -- tests/e2e/productivity-tools.spec.ts tests/e2e/tools.spec.ts tests/e2e/home.spec.ts
```

双向互通需要在测试环境提供原项目和带 `cryptography` 的 Python。下面的路径应替换为实际位置；这些依赖不进入工作台运行环境。

```sh
ZIP_TOOL_REFERENCE=/path/to/zip-to-txt-transfrom \
ZIP_TOOL_PYTHON=/path/to/python3 \
ZIP_TOOL_LARGE=1 \
npm test -- tests/zip-tools.test.ts
```

`ZIP_TOOL_LARGE=1` 会生成 151 MB 随机文件，验证真实 200 MB 分片的生成、流式粘贴校验及还原，同时检查主线程仍可响应。测试结束清理临时数据。Windows 原生验证情况和本次打包验证结果见[实施记录](../.scratch/tools/implementation.md)。
