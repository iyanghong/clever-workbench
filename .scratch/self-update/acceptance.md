# Installed application acceptance

## Real GitHub Release pair: 2026-10-19

**Completed the real private-repository acceptance, with an explicit manual startup outcome.** Both releases are published in the unchanged private `iyanghong/clever-workbench` repository: [v0.1.1](https://github.com/iyanghong/clever-workbench/releases/tag/v0.1.1) at `709715b` and [v0.1.2](https://github.com/iyanghong/clever-workbench/releases/tag/v0.1.2) at `1f36c04`.

The baseline ZIP was downloaded again from the published v0.1.1 asset API, matched against remote SHA256SUMS and GitHub's digest, extracted, and checked for version 0.1.1 and its native signature. Its SHA-256 is `c2f329d69c539ff411d9dc6793a694e3bb76be39135b3b47b7d8f4e8fee3279a`. Baseline source receipt: `release/acceptance/github/v0.1.1/baseline-origin.json`. The harness directly launches this executable in an isolated copy; this is not proof of initial DMG installation or first-launch Gatekeeper approval.

```sh
node scripts/verify-installed-update.mjs --github '/Users/kuku/code/9-workbench/release/acceptance/github/v0.1.1/installed/Clever Workbench.app' 0.1.2
```

The command exited 0. No network responses, release metadata, asset bodies or check times were substituted. It used the installed baseline's normal Git credential provider, GitHub API, authenticated private asset API and credential-free CDN path. The staged target ZIP is 128914853 bytes, SHA-256 `6d2b65e261ac86d0d6ee4e69e6ee57e321e2f5a11d21ad70f5e1bf2793909196`, matching the actually published v0.1.2 asset 656423725. Native HTTP 302 credential separation is also covered by the dedicated Electron regression and the earlier real private-asset preflight; no secret headers are recorded in the full acceptance report.

Verified results:

- Missing master password prevented installation. After initializing the isolated vault, the saved document and image were included in a new full encrypted update backup.
- The current application location contains 0.1.2, while `.previous` contains 0.1.1. Both native signatures verify.
- Quarantine remained `0083;6ad62190;Clever Workbench;`; no Gatekeeper setting or security attribute was removed.
- The new application produced no health receipt. The independent helper recorded `needs-attention:health-timeout`, outcome `manual`, retained the prior application and encrypted backup, and provided readable `RECOVERY.txt` outside the application. This does **not** establish healthy unattended startup.
- Restoring the encrypted backup through a separate full packaged app returned the exact document title and rendered the attached image with natural width 1. All disposable application processes were stopped.

Raw report: `/var/folders/73/c35nxr410f11hfh3ls36xjlc0000gn/T/cwb-installed-update-Sd7RMK/report.json`. Transaction: `d59b22be-19d3-4f7d-bb5d-7eef650e10fc`. A stable local copy is `release/acceptance/github/v0.1.2/real-upgrade-report.json`; combined baseline, publication, downloaded ZIP, installed versions and recovery proof is `release/acceptance/github/real-upgrade-evidence.json`.

This verifies **authorized private GitHub transport**, not anonymous public download: `gitHubTransportVerified: true`, `publicGitHubReleaseVerified: false`. Full release asset hashes, publication gates and CI limitations are in [GitHub verification](github-verification.md). v0.1.1 passed all CI verification gates before its draft lookup failure was finalized locally; v0.1.2 used locally tested artifacts because account billing/spending limits prevented any CI step from starting. A separate legacy Windows migration fixture comparison still fails. Neither limitation is reported as green CI.

## Historical local fixture scope

This exercises full packaged Clever Workbench applications, not only the small helper fixture. macOS 27.0 (26A428), Apple Silicon, Electron 44.9.0. Both versions use the existing ad-hoc-signing packaging configuration; no Developer ID or notarization is added.

These earlier runs substituted Electron `net.fetch` in the external Playwright harness. It mapped the exact fixed GitHub API and asset URLs to local responses containing a real packaged ZIP and its SHA-256 checksum. No production alternate-source switch was introduced. An initial real startup request could encounter GitHub rate limiting before the harness attached; the harness temporarily advanced the external clock solely to make its explicit fixture check eligible, then restored it before downloading/installing. The current default fixture additionally handles `net.request` header probes; `--github` bypasses all fixture and clock substitutions.

The following historical fixture evidence is **not GitHub Release acceptance**. At that stage, the published pair and real asset transport remained unverified. The subsequent real private-repository result is recorded above; the harness itself does not create releases.

## Reproduction

1. Run the normal application build.
2. In two newly allocated disposable output directories, use the normal electron-builder macOS arm64 packaging command with version 0.1.0 and `extraMetadata.version=0.1.1` respectively. Build the new version's `zip` target. Keep signing and security attributes unchanged.
3. Run `node scripts/verify-installed-update.mjs OLD_APP NEW_ZIP 0.1.1` with absolute artifact paths. The harness copies the old app into its own temporary directory and creates private test data, so supplied original packages and real user data remain untouched.
4. Run `tests/e2e/update.spec.ts` with `CWB_TEST_EXECUTABLE` pointing to the old packaged executable. Its installed-health fixture uses the canonical application path to match the real process.

The harness exercises the public bridge to check, download and install. It verifies a missing master password blocks installation, initializes a test vault, saves a document and image, requests installation, and inspects the transaction/health evidence. It preserves the quarantine attribute added by the real downloader. Finally it restores the encrypted pre-update backup into a separate private data directory through a full packaged old app and checks the document and image content.

## Findings and evidence

- Installed version display, installed nonce/window/IPC health confirmation, and damaged-history availability checks: **3 passed**, with the development-only check correctly skipped.
- Initial full update run correctly went red on a product defect hidden by Node-only extraction tests: Electron's ASAR filesystem interception rejected writing the staged `Contents/Resources/app.asar` (`Invalid package`). Reproduced with both a ditto ZIP and the official electron-builder ZIP. Official artifact: `/tmp/cwb-acceptance-new/Clever-Workbench-0.1.1-arm64.zip`, 128907853 bytes; failed isolated run: `/var/folders/73/c35nxr410f11hfh3ls36xjlc0000gn/T/cwb-installed-update-TIzJkt`.
- The production fix uses Electron's raw filesystem for bundle extraction. A subsequent real run reached LaunchServices, which relocated the quarantined app under AppTranslocation. No health receipt appeared. Strict installed-path matching was also identified as a gap; a unit-tested fix now reports a manual outcome when a translocated app reaches its health logic. This does not prove that the actual translocated process reached that logic.
- A later rerun caught a quarantine-preservation regression introduced by staging cleanup hardening: precreating the destination directory before `ditto` lost the source bundle-root quarantine attribute. The staged bundle still carried `0083;6ad5f78e;Clever Workbench;`, while the installed bundle had only `com.apple.provenance`. This run produced a health success receipt but **failed acceptance** because the security attribute was lost. Evidence: `/var/folders/73/c35nxr410f11hfh3ls36xjlc0000gn/T/cwb-installed-update-wIrZSe`; transaction `cf54168f-d929-4738-a460-142a86665ef8`, staged bundle `user-data/updates/staging/release-538yz4/Clever Workbench.app`. This must not count as a valid successful update.
- After fixing root quarantine preservation, the full run at `/var/folders/73/c35nxr410f11hfh3ls36xjlc0000gn/T/cwb-installed-update-tGHZRC` retained `0083;6ad5fb1f;Clever Workbench;` and restored the real encrypted backup into a separate profile: document title matched and the attached image rendered at its expected 1-pixel width. LaunchServices started a translocated process, but no app health receipt appeared within 75 seconds. The harness rejected the indefinite pending outcome. This demonstrates why the independent helper also needs a bounded no-receipt/manual outcome when the new app cannot reach its own health logic.
- **Final full packaged run passed (exit 0), with an explicit manual outcome rather than false success.** Evidence: `/var/folders/73/c35nxr410f11hfh3ls36xjlc0000gn/T/cwb-installed-update-32VeSZ/report.json`; transaction `4a7d21f0-7251-4795-b702-7cc62fe7117d`. The independent helper reached `needs-attention:health-timeout` after no app receipt arrived within its bounded wait. Readable `RECOVERY.txt`, previous application and encrypted backup remained available. Quarantine remained present (`00c3;6ad5fec2;Clever\\x20Workbench;` after macOS processing). The separate full-app restore returned the exact saved document title and rendered its attached image at width 1. All disposable app processes were stopped by the harness.
- Final old package included source `d541643` with the independent helper deadline. Candidate 0.1.1 ZIP was the prior `6a1cdfe` package with the same application/health code and quarantine-preservation fix; only the helper used for a future update differs. Rebuilding the old package was sufficient to exercise the changed helper in this transaction. Public release builds must package the complete final source normally.

## Delivery interpretation

Local helper happy-path replacement/relaunch and actual rename-failure recovery pass. Full packaged application download, extraction, password prerequisite, data save, encrypted backup, same-location replacement, quarantine preservation, explicit external-helper manual outcome and actual data/image restore pass. Installed application health confirmation also passes when the application can initialize.

In these historical local runs, the real quarantined full application did **not** produce a healthy startup receipt through LaunchServices; the updater correctly retained recovery material and reported manual intervention. That did not prove unattended successful upgrade or GitHub transport. Ticket 07 subsequently completed the published private-version pair and real network experiment above, retaining the same explicit manual-outcome limitation.

## Security and recovery boundaries

The helper fixture already demonstrated local same-path replacement/relaunch and restoration after an actual filesystem rename refusal. The full-app acceptance adds the real save, encrypted backup, download extraction and startup-health path. Gatekeeper rejection of a quarantined ad-hoc package is an allowed **manual** outcome, never reported as healthy success. Neither the harness nor updater removes quarantine or changes Gatekeeper settings. App package restoration and backup restoration are separate operations; the harness restores data only into a new disposable profile with its known test password.

## 2026-10-30：提前提示安装位置限制

基于 `984e19a` 的工作区改动，应用版本仍为 0.1.15，未发布或替换本机正式应用。新增回归先确认旧实现没有提前传递安装限制、界面仍显示“有新版本”；修改后，版本检查、下载前及安装请求复用实际运行位置预检，快照单独保留 `installationIssue`。受限时界面提供正式版本页与继续工作入口；位置恢复后保留已下载的包。

- `npm run build` 和 `npm run typecheck` 通过。构建仍有既有的编辑器图标脚本未按模块打包提示。
- 更新检查、下载、安装、恢复四组 Vitest：40 项通过，真实 ZIP 验证用例因未设置 `CWB_UPDATE_ZIP` 跳过。本轮未修改包校验、替换助手或加密格式。
- Electron 开发运行的更新回归：7 项通过，3 项安装版用例按条件跳过。
- 通过 `electron-builder --mac --arm64 --dir --publish never` 在 `release/location-preflight-check/` 生成独立 ad-hoc 测试包，使用 `CWB_TEST_EXECUTABLE` 和临时资料目录运行：9 项通过，1 项开发模式用例跳过。覆盖浅色、深色高对比度、减少透明度、减少动态效果、窄窗口、关闭与 Esc、焦点返回、正式版本页目标以及安装失败后的按钮切换。
- 打包应用另复制到临时 `AppTranslocation/fixture/` 路径，实际启动后通过真实 IPC 确认下载前返回位置限制，且不创建下载暂存文件。这是路径夹具，不能当作 macOS 实际隔离挂载或 Finder 恢复验收。
- 首次打包回归中，旧的安装错误呈现用例在配置备份密码前访问真实钥匙串，发生授权弹窗及一次点击超时；随后重试通过。这暴露了测试隔离不足，不能把超时抹去。现已让该界面用例使用临时主密码资料，拦截并断言系统加密调用为零；最终完整打包回归通过。

未执行真实 GitHub 下载、实际应用替换、Gatekeeper 授权或跨版本钥匙串免授权验收，也未重复原生鼠标拖拽命中检查。本轮未修改拖拽区域。现有 ad-hoc 签名在不同构建间身份会变化，更新后可能再次请求钥匙串授权；这项限制没有由本轮界面优化解决。历史人工恢复和失败结果保持原结论。

### 2026-10-31：同步最新源码后的验证

已快进到 `8e7c7a9`（应用版本 0.1.18），恢复本轮改动并处理四个重叠文件的冲突，保留远端的下载重试、续传、取消与独占指引弹窗行为。合并后类型检查、构建及格式检查通过；更新检查、下载、续传、安装、恢复与系统保护六组测试共 72 项通过，未提供真实 ZIP 的用例跳过；Electron 开发运行的更新回归 7 项通过、3 项安装版用例按条件跳过。此处记录同步后的结果，不替代上面的旧基线打包证据；未重新执行安装包或真实升级验收。

应用内更新、备份密码和秘密保护指引已同步本轮操作变化，下一次发布的待发布说明保留人工核对待办。源码提交与推送不代表已发布新版或已替换本机应用。
