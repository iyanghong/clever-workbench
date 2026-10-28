# v0.1.15 发布前验证

2026-10-22。用户授权提交所有代码、推送并发布。业务源码 `02a4f44` 已推送，包含台账可选字段、多组资源连接、应用部署与文档引用，完整范围见[实施记录](../../ledger-field-completeness/implementation.md)。保留原有未跟踪的 `docs/资料/` 用户文档，不上传。

## 首轮发布结果

v0.1.14 的版本提交为 `62935ea`。[云端任务](https://github.com/iyanghong/clever-workbench/actions/runs/39764742561)通过全量单元测试、生产构建、ZIP／DMG 打包、9 项真实 ZIP 更新测试、Electron 解压与传输、签名及 DMG 完整性校验。

安装版回归实际为 78 项通过、2 项按环境跳过、2 项失败，并有失败页面未退出导致的 worker 清理超时。流程没有创建或公开 Release，不将这轮记为发布成功：

- 资源复制测试仍查找旧的“资源端口／资源地址”，改用“连接 1 端口／地址”，保留复制前保存、目标环境和副本互不影响的断言。
- 全站外观测试填写账号密码后直接按 Esc 导航，未处理新增的放弃确认。补充确认弹窗可见、点击“放弃录入”、确认弹窗关闭，再继续原有主题与尺寸验证。

这两处仅修改测试，未改变产品行为。`npm run test:e2e -- tests/e2e/ledger.spec.ts tests/e2e/unified-appearance.spec.ts` 在本机隔离资料目录通过全部 5 项；Prettier 和 `git diff --check` 通过。

## 后续发布

保留已推送的 v0.1.14 标签和失败记录，不改写远端历史。修正测试后使用未占用的 v0.1.15，继续由原 GitHub Actions 流程重新完成全部验证，再公开 macOS Apple Silicon ZIP、DMG 和 SHA256SUMS。最终状态以该版本 Release 及链接的 Actions 记录为准。

未安装或替换本机正式应用，未验证 Windows 实机或真实网络自动更新。资料结构升级至 13 后，旧版应用不能直接打开，回退需使用升级前备份。
