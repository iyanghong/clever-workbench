# 内置工具接入

工具属于整个工作台。“工具”菜单展示工具目录，首页常用入口保存工具的稳定标识；两处共用登记信息。工具的输入、输出文件不自动进入工作台资料库。

## 增加工具

1. 在 `src/tool-types.ts` 的 `toolCatalog` 登记稳定 ID、标题、用途，声明该工具的状态和命令类型。ID 是收藏引用，发布后不要随显示名称一起修改。
2. 在 `src/features/tools/` 实现页面，并在 `registry.tsx` 登记图标和延迟加载的页面。目录与首页常用选择器会自动出现入口，无需修改首页展示逻辑。
3. 有本地文件或耗时操作时，在 `electron/tools/` 实现控制器，并在 `index.ts` 登记实例。控制器负责校验输入、保存运行状态和管理暂存，提供 `busy`、`snapshot`、`command`、`dispose`；文件处理放入 worker，通过 `runner.ts` 执行。
4. 新 worker 在 `scripts/build-electron.mjs` 增加构建入口。新持久化设置同时增加备份恢复校验，再验证收藏、跨页运行、失败清理和打包后运行。

页面通过 `window.desktop.tools` 使用受控 IPC。公共接口只处理工具标识、明确命令、路径选择和结果打开；具体工具的参数、文件格式和处理过程留在各自模块。渲染页面只接收进度、元信息和短预览。

## 运行与退出

每个工具一次处理一项操作。控制器由主进程持有，页面卸载不会结束任务；worker 每次操作启动一次，结束后退出。正在处理时阻止应用退出和工作台备份恢复，以免丢失运行状态或切换资料代次。

worker 向主进程登记本次创建的目录或文件，异常退出后清理这些资源。新工具须只登记自己以排他方式新建的资源，不能将用户原有目录交给失败清理。正常关闭时清理暂存；本轮没有任务队列、运行历史或断点恢复。

## ZIP 文本归档

- `zip-archive.ts`：ZIP 压缩、加密分片、认证解密、路径校验与解压，兼容 `ZTXT1`。
- `git-files.ts`：只读查询本地 Git 历史，以提交确定路径范围，打包时读取当前磁盘文件；范围变化需重新预览，内容变化直接读取最新内容。
- `clipboard-parts.ts`：macOS 通过 `pbpaste`、Windows 通过系统 PowerShell 和 Win32 剪贴板接口流式读取。大文本留在工作进程和私有暂存中。
- `zip-tool.ts`：一次处理一项操作，保留本次结果及粘贴分片，记忆目录和分片大小。密码只用于本次任务，不写偏好或备份。

归档与还原随工作台安装，无需 Python。Git 筛选依赖本机 Git；没有 Git 时其他操作仍可使用。

## 验证

默认单元测试包含旧 Python 产物样例、往返还原、文件保护、分片输入、Git 行为和后台生命周期；桌面测试位于 `tests/e2e/tools.spec.ts`。

```sh
npm test -- tests/zip-tools.test.ts tests/home.test.ts tests/restore.test.ts
npm run build
npm run test:e2e -- tests/e2e/tools.spec.ts tests/e2e/home.spec.ts
```

双向互通需要在测试环境提供原项目和带 `cryptography` 的 Python。下面的路径应替换为实际位置；这些依赖不进入工作台运行环境。

```sh
ZIP_TOOL_REFERENCE=/path/to/zip-to-txt-transfrom \
ZIP_TOOL_PYTHON=/path/to/python3 \
ZIP_TOOL_LARGE=1 \
npm test -- tests/zip-tools.test.ts
```

`ZIP_TOOL_LARGE=1` 会生成 151 MB 随机文件，验证真实 200 MB 分片的生成、流式粘贴校验及还原，同时检查主线程仍可响应。测试结束清理临时数据。Windows 原生验证情况和本次打包验证结果见[实施记录](../.scratch/tools/implementation.md)。
