import fs from 'node:fs/promises';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { githubClient } from './release-tools/github.mjs';
import { commitsSince, releaseSourceContext } from './release-tools/local.mjs';
import { inspectOperationGuidance, formatOperationGuidance } from './release-tools/guidance.mjs';
import {
  versionParts,
  compareVersions,
  releaseNotes,
  localAssets,
  verifyUploadedAssets,
} from './release-tools/core.mjs';

export async function publishMacRelease({
  github,
  context,
  directory = 'release',
  sourceDirectory = process.cwd(),
  log = console.log,
}) {
  const { tag } = context;
  versionParts(tag);
  const expected = await localAssets(tag, directory);
  const sums =
    expected
      .filter((asset) => asset.name !== 'SHA256SUMS')
      .map((asset) => `${asset.digest.slice(7)}  ${asset.name}`)
      .join('\n') + '\n';
  if ((await fs.readFile(path.join(directory, 'SHA256SUMS'), 'utf8')) !== sums)
    throw Error('本机 SHA256SUMS 与实际安装包不一致。');
  const currentLatest = () => {
    const latest = github.repo('/releases/latest');
    if (compareVersions(tag, latest.tag_name) <= 0)
      throw Error('该版本不高于最新正式 Release，禁止覆盖或回退 latest。');
    return latest;
  };
  const latest = currentLatest();
  if (latest.tag_name !== context.baseTag) throw Error('基准 Release 已变化，停止发布旧计划。');
  const guidance = await inspectOperationGuidance(sourceDirectory, {
    sourceSha: context.sourceSha,
    releaseTag: tag,
  });
  log(formatOperationGuidance(guidance));
  await fs.writeFile(
    path.join(directory, 'guidance-check.json'),
    JSON.stringify(guidance, null, 2) + '\n',
  );
  const body = releaseNotes({ repository: github.repository, ...context, guidance });
  const releases = await github.pages('/releases');
  let release = releases.find((item) => item.tag_name === tag);
  if (release && !release.draft) throw Error('禁止覆盖已正式发布的版本。');
  if (!release)
    release = github.repo('/releases', {
      method: 'POST',
      body: {
        tag_name: tag,
        target_commitish: context.releaseSha,
        name: tag,
        body,
        draft: true,
        prerelease: false,
      },
    });
  const freshDraft = () => {
    const current = github.repo(`/releases/${release.id}`);
    if (!current.draft || current.tag_name !== tag)
      throw Error('Release 不再是本次草稿，停止修改资产。');
    if (current.assets.some((asset) => !expected.some((item) => item.name === asset.name)))
      throw Error('草稿中存在非本次发布资产，请人工检查。');
    return current;
  };
  for (const asset of expected) {
    const draft = freshDraft();
    const previous = draft.assets.filter((item) => item.name === asset.name);
    if (previous.length > 1) throw Error('草稿资产名称重复。');
    if (
      previous[0]?.state === 'uploaded' &&
      previous[0].digest === asset.digest &&
      previous[0].size === asset.size
    ) {
      log(`复用已校验草稿资产：${asset.name}`);
      continue;
    }
    if (previous[0]) github.repo(`/releases/assets/${previous[0].id}`, { method: 'DELETE' });
    log(`上传：${asset.name}`);
    const uploaded = await github.upload(release.id, asset);
    verifyUploadedAssets([asset], [uploaded]);
  }
  release = freshDraft();
  verifyUploadedAssets(expected, release.assets);
  const remoteSums = path.join(directory, 'remote-SHA256SUMS');
  await github.download(
    release.assets.find((asset) => asset.name === 'SHA256SUMS'),
    remoteSums,
  );
  if ((await fs.readFile(remoteSums, 'utf8')) !== sums)
    throw Error('远程 SHA256SUMS 与实际安装包不一致。');
  await fs.writeFile(
    path.join(directory, 'uploaded.json'),
    JSON.stringify(release, null, 2) + '\n',
  );
  await fs.writeFile(
    path.join(directory, 'verification.json'),
    JSON.stringify(
      {
        ...context,
        source: 'GitHub Actions macOS',
        assets: expected.map(({ name, size, digest }) => ({ name, size, digest })),
        checksumsDownloadedAndMatched: true,
      },
      null,
      2,
    ) + '\n',
  );
  currentLatest();
  freshDraft();
  release = github.repo(`/releases/${release.id}`, {
    method: 'PATCH',
    body: { body, draft: false, prerelease: false, make_latest: 'true' },
  });
  if (
    release.draft ||
    release.prerelease ||
    !release.published_at ||
    github.repo(`/releases/latest?verify=${Date.now()}`).id !== release.id
  )
    throw Error('未确认正式发布或 latest 状态，请核查本次运行，勿覆盖已发布资产。');
  log(`正式发布完成：${release.html_url}`);
  return release;
}

if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
  try {
    if (process.env.GITHUB_ACTIONS !== 'true')
      throw Error('此入口仅供已完成验证的 GitHub Actions 发布任务使用，请在 Mac 双击发布脚本。');
    const tag = process.argv[2];
    versionParts(tag);
    const selected = releaseSourceContext(process.cwd(), tag);
    const github = githubClient(process.env.GITHUB_REPOSITORY, process.env.GH_TOKEN);
    const baseTag = selected.baseTag || github.repo('/releases/latest').tag_name;
    const { sourceSha, releaseSha } = selected;
    const context = {
      tag,
      baseTag,
      sourceSha,
      releaseSha,
      commits: commitsSince(process.cwd(), baseTag, sourceSha),
      runUrl: `https://github.com/${github.repository}/actions/runs/${process.env.GITHUB_RUN_ID}`,
    };
    await publishMacRelease({ github, context });
  } catch (error) {
    console.error(error.message);
    process.exitCode = 1;
  }
}
