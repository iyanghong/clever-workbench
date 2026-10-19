# 发布 Clever Workbench

更新源固定为 `iyanghong/clever-workbench` 的正式 GitHub Releases，可保留仓库私有属性。客户端仅接受 `vX.Y.Z`，不接受 Draft、Prerelease 或任意仓库地址。macOS arm64 自动安装资产为 `Clever-Workbench-X.Y.Z-arm64.zip`，首次安装资产为同名 `.dmg`，两个资产的 SHA-256 写入 `SHA256SUMS`。

私有仓库更新复用当前电脑 Git 凭据助手保存的 GitHub HTTPS 登录（macOS 通常保存在 Keychain）。每台电脑的账号都须能读取该仓库，浏览器登录本身不等于 Git 已保存凭据。应用不保存新令牌，也不将令牌放入安装包、更新记录或页面状态。若单独配置 fine-grained token，只需对该仓库授予 Contents 读取权限。凭据读取不可用时会尝试匿名检查；私有仓库将提示先配置本机 Git 登录。

私有安装包通过 GitHub 资产 API 下载，Authorization 只发往固定仓库的 `api.github.com` 接口。API 跳转到 GitHub 文件服务器后不再携带凭据。来源：[GitHub Release assets API](https://docs.github.com/en/rest/releases/assets#get-a-release-asset)、[Git credential helpers](https://git-scm.com/docs/gitcredentials)。

## 本地验证

使用 Node.js 24 LTS，在 macOS Apple Silicon 上执行。先更新应用和 lockfile 版本（例如 `npm version 0.2.0 --no-git-tag-version`），提交审阅后再发布对应 tag。

```sh
npm ci
npm run setup:electron
npm test
npm run build
npx electron-builder --mac --arm64 --publish never
node scripts/prepare-release.mjs v0.2.0
CWB_UPDATE_ZIP="$PWD/release/Clever-Workbench-0.2.0-arm64.zip" npx vitest run tests/update-download.test.ts
```

将示例版本替换成 `package.json` 中的版本。准备脚本会拒绝 tag 不匹配、缺失或过大的资产。真实 bundle 校验测试通过应用更新接口解压并验证应用身份、版本、架构、签名及内部链接，写入 quarantine；它不证明公网下载后的系统启动授权已经通过。

## GitHub 发布

推送正式版本 tag 会启动 `Publish stable macOS Release`。工作流先校验 tag 与应用版本，运行单元测试、打包、原生包校验及已安装应用桌面测试。全部通过后创建 Draft，上传 ZIP、DMG、SHA256SUMS，核对远程资产名称、大小和上传状态，最后公开为 latest。中途失败保留 Draft，客户端无法发现半成品。

工作流用 GitHub Actions 自带的短期 token 和 job 级 `contents: write` 权限；客户端不含任何发布令牌。不覆盖已经公开的 Release。修正失败后重跑只允许更新尚未公开的 Draft；已经公开的版本应通过新版本号修复。只有维护者明确准备公开时才推送版本 tag。

macOS 维持 ad-hoc 签名，不需要 Apple Developer ID。默认 Electron 打包权限包含 JIT 和 disable-library-validation；实际签名和启动必须由打包测试验证。下载资产经过 SHA-256 完整性校验，但该校验不等同于开发者身份证明。安装助手不会清除 quarantine 或关闭 Gatekeeper；系统要求授权时用户按系统提示处理。

首个真实版本发布后，必须在隔离资料目录完成“旧安装版经 GitHub 下载 → 保存和备份 → 原位置替换 → 新版健康确认”的验收；本地包和 HTTP fixture 测试不能代替该验收。保留上一安装包和备份，迁移后的资料不应自动交给旧版读取。

真实网络模式不拦截请求、不替换 Release 元数据，也不修改检查时间。旧安装版须来自已发布资产，并单独保留下载和校验来源证明；命令本身只声明该次更新的真实网络经过，不自动证明调用方提供的旧应用来源。

```sh
node scripts/verify-installed-update.mjs --github /absolute/old/Clever\ Workbench.app 0.1.2
```

先确认目标正式版本已发布且旧版包含更新器；历史 v0.1.0 没有该能力，不能作为首次自动更新的基线。私有仓库的授权网络验收与匿名公开下载验收分别记录，不能混淆。
