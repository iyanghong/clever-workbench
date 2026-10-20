import fs from 'node:fs/promises';
import { createReadStream } from 'node:fs';
import { createHash } from 'node:crypto';
import path from 'node:path';

export const workflowFile = 'release.yml';
export const releaseMarker = 'CWB-Release: ';

export function versionParts(tag) {
  if (!/^v(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)$/.test(tag ?? ''))
    throw Error('版本号必须使用 vX.Y.Z 格式，例如 v0.1.5。');
  const parts = tag.slice(1).split('.').map(Number);
  if (!parts.every(Number.isSafeInteger)) throw Error('版本号超出支持范围。');
  return parts;
}

export function compareVersions(left, right) {
  const a = versionParts(left),
    b = versionParts(right);
  for (let i = 0; i < 3; i++) if (a[i] !== b[i]) return a[i] > b[i] ? 1 : -1;
  return 0;
}

export function nextVersion(latest, occupied = [], applicationVersion = latest.slice(1)) {
  let parts = versionParts(latest);
  parts[2]++;
  let candidate = `v${parts.join('.')}`;
  if (compareVersions(candidate, `v${applicationVersion}`) < 0) {
    candidate = `v${applicationVersion}`;
    parts = versionParts(candidate);
  }
  while (occupied.includes(candidate)) {
    parts[2]++;
    candidate = `v${parts.join('.')}`;
    versionParts(candidate);
  }
  return candidate;
}

export function repositoryFromOrigin(origin) {
  let value;
  if (origin.startsWith('git@github.com:')) value = origin.slice('git@github.com:'.length);
  else {
    let url;
    try {
      url = new URL(origin);
    } catch {
      throw Error('origin 必须是 GitHub HTTPS 或 SSH 仓库地址。');
    }
    if (
      url.hostname !== 'github.com' ||
      url.port ||
      url.search ||
      url.hash ||
      !['https:', 'ssh:'].includes(url.protocol) ||
      url.password ||
      (url.username && !(url.protocol === 'ssh:' && url.username === 'git'))
    )
      throw Error('origin 必须是不含凭据的 GitHub HTTPS 或 SSH 仓库地址。');
    value = url.pathname.slice(1);
  }
  value = value.replace(/\.git$/, '');
  if (!/^[a-zA-Z0-9][\w-]*\/[a-zA-Z0-9_][\w.-]*$/.test(value))
    throw Error('GitHub 仓库地址格式不正确。');
  return value;
}

export function visibleText(value) {
  return String(value)
    .replace(/\x1b\[[0-?]*[ -/]*[@-~]/g, '')
    .replace(/[\x00-\x1f\x7f-\x9f]/g, ' ');
}

export function releaseMetadata(message) {
  const line = message.split('\n').find((item) => item.startsWith(releaseMarker));
  if (!line) return null;
  let meta;
  try {
    meta = JSON.parse(line.slice(releaseMarker.length));
  } catch {
    throw Error('发布提交的恢复信息损坏。');
  }
  if (!meta || typeof meta !== 'object') throw Error('发布提交的恢复信息无效。');
  versionParts(meta.tag);
  versionParts(meta.baseTag);
  if (
    meta.schema !== 1 ||
    !/^[a-f0-9]{40}$/.test(meta.sourceSha) ||
    compareVersions(meta.tag, meta.baseTag) <= 0
  )
    throw Error('发布提交的恢复信息无效。');
  return { schema: 1, tag: meta.tag, baseTag: meta.baseTag, sourceSha: meta.sourceSha };
}

export function releaseCommitMessage(meta) {
  return `准备发布 ${meta.tag}\n\n基于远端 master 的已提交源码准备 macOS 正式版本。\n完整测试、打包与发布由 GitHub Actions 执行。\n\n${releaseMarker}${JSON.stringify(meta)}\n`;
}

export function releaseNotes({ repository, tag, baseTag, sourceSha, releaseSha, commits, runUrl }) {
  const title = (text) => visibleText(text).replace(/[\\`*_[\]<>]/g, (char) => `\\${char}`);
  return [
    `## ${tag} 更新内容`,
    '',
    ...commits.map(
      (commit) =>
        `- ${title(commit.subject)}（[${commit.sha.slice(0, 7)}](https://github.com/${repository}/commit/${commit.sha})）`,
    ),
    '',
    `提交范围：[${baseTag} → 发布前源码](https://github.com/${repository}/compare/${baseTag}...${sourceSha})。包含该范围内的全部提交，文档提交也保留。`,
    '',
    '## 下载与校验',
    '',
    `- macOS M 系列（arm64，macOS 13+）：\`Clever-Workbench-${tag.slice(1)}-arm64.dmg\` 用于首次安装，ZIP 用于应用内更新。`,
    '- `SHA256SUMS` 包含 ZIP 和 DMG 的 SHA-256。',
    '- 使用 ad-hoc 签名，未经 Apple 公证；系统授权与健康启动结果以实际运行验证为准。',
    '',
    '## 构建与验证',
    '',
    `发布源码：\`${releaseSha}\`；业务源码：\`${sourceSha}\`。`,
    `GitHub Actions 完成单元测试、生产构建、真实 ZIP 校验、Electron 解压与传输验证、DMG 完整性校验，以及 macOS 安装版桌面回归后发布。[查看运行记录](${runUrl})。`,
    '远程资产大小、SHA-256 及下载回来的校验清单核对通过后才公开。构建回归不等于真实网络自动替换后的健康启动验收。',
    '',
  ].join('\n');
}

export async function digestFile(filename) {
  const hash = createHash('sha256');
  for await (const chunk of createReadStream(filename)) hash.update(chunk);
  return hash.digest('hex');
}

export async function localAssets(tag, directory = 'release') {
  versionParts(tag);
  return Promise.all(
    [
      `Clever-Workbench-${tag.slice(1)}-arm64.zip`,
      `Clever-Workbench-${tag.slice(1)}-arm64.dmg`,
      'SHA256SUMS',
    ].map(async (name) => {
      const filename = path.join(directory, name),
        stat = await fs.lstat(filename);
      if (!stat.isFile() || stat.isSymbolicLink() || stat.size < 1 || stat.size > 1024 ** 3)
        throw Error(`发布资产无效：${name}`);
      return { name, filename, size: stat.size, digest: `sha256:${await digestFile(filename)}` };
    }),
  );
}

export function verifyUploadedAssets(expected, actual) {
  if (!Array.isArray(actual) || actual.length !== expected.length)
    throw Error('远程发布资产数量不匹配。');
  for (const asset of expected) {
    const matches = actual.filter((item) => item.name === asset.name);
    if (
      matches.length !== 1 ||
      matches[0].state !== 'uploaded' ||
      matches[0].size !== asset.size ||
      matches[0].digest !== asset.digest
    )
      throw Error(`上传资产缺失或大小／SHA-256 不匹配：${asset.name}`);
  }
}
