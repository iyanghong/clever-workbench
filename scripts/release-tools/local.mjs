import { execFileSync } from 'node:child_process';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import { setTimeout as delay } from 'node:timers/promises';
import {
  inspectOperationGuidance,
  formatOperationGuidance,
  bindOperationGuidance,
} from './guidance.mjs';
import { loadGuidanceCatalog } from '../../src/guidance/catalog.ts';
import {
  compareVersions,
  nextVersion,
  releaseMetadata,
  releaseCommitMessage,
  versionParts,
  visibleText,
  workflowFile,
} from './core.mjs';

export function git(directory, args, { env = process.env, input, timeout = 120000 } = {}) {
  try {
    return execFileSync('git', args, {
      cwd: directory,
      env: { ...env, GIT_TERMINAL_PROMPT: '0' },
      input,
      encoding: 'utf8',
      timeout,
      maxBuffer: 16 * 1024 * 1024,
      stdio: ['pipe', 'pipe', 'pipe'],
    }).trim();
  } catch {
    throw Error(`Git ${args[0]} 操作失败。请检查网络、分支权限或本机 Git 配置后重试。`);
  }
}

export function localIdentity(directory, env = process.env) {
  if (Object.keys(env).some((key) => /^(GIT_AUTHOR_|GIT_COMMITTER_)/.test(key) && env[key]))
    throw Error('检测到 Git 作者／提交者环境变量覆盖。请清除覆盖后使用本地 Git 配置。');
  const name = git(directory, ['config', '--get', 'user.name'], { env });
  const email = git(directory, ['config', '--get', 'user.email'], { env });
  if (
    !name ||
    !email ||
    /[\r\n<>]/.test(name + email) ||
    /codex|\[bot\]/i.test(name) ||
    !/^[^\s@]+@[^\s@]+$/.test(email)
  )
    throw Error('请先配置有效的本地 Git 用户名和邮箱，使用本人的账号提交。');
  for (const kind of ['AUTHOR', 'COMMITTER'])
    if (!git(directory, ['var', `GIT_${kind}_IDENT`], { env }).startsWith(`${name} <${email}> `))
      throw Error('实际提交身份与本地 Git 配置不一致，请先处理配置冲突。');
  return { name, email };
}

export async function repositoryLock(directory) {
  const common = path.resolve(directory, git(directory, ['rev-parse', '--git-common-dir']));
  const lock = path.join(common, 'workbench-release.lock');
  const owner = { pid: process.pid, host: os.hostname(), nonce: randomUUID() };
  try {
    await fs.mkdir(lock, { mode: 0o700 });
  } catch (error) {
    if (error.code !== 'EEXIST') throw error;
    let previous;
    try {
      previous = JSON.parse(await fs.readFile(path.join(lock, 'owner.json'), 'utf8'));
    } catch {
      throw Error('另一个发布脚本正在初始化，请稍后重试。');
    }
    let dead = false;
    if (previous.host === os.hostname() && Number.isSafeInteger(previous.pid) && previous.pid > 0)
      try {
        process.kill(previous.pid, 0);
      } catch (cause) {
        dead = cause.code === 'ESRCH';
      }
    if (!dead) throw Error('本仓库已有发布脚本运行，请等待该终端结束后重试。');
    const abandoned = `${lock}.${randomUUID()}`;
    await fs.rename(lock, abandoned);
    await fs.rm(abandoned, { recursive: true });
    await fs.mkdir(lock, { mode: 0o700 });
  }
  await fs.writeFile(path.join(lock, 'owner.json'), JSON.stringify(owner), { mode: 0o600 });
  return async () => {
    const current = JSON.parse(await fs.readFile(path.join(lock, 'owner.json'), 'utf8'));
    if (current.nonce === owner.nonce) await fs.rm(lock, { recursive: true });
  };
}

export function commitsSince(directory, baseTag, sourceSha) {
  git(directory, ['merge-base', '--is-ancestor', baseTag, sourceSha]);
  return git(directory, ['log', '--reverse', '--format=%H%x00%s', `${baseTag}..${sourceSha}`, '--'])
    .split('\n')
    .filter(Boolean)
    .map((line) => {
      const [sha, subject] = line.split('\0');
      if (!/^[a-f0-9]{40}$/.test(sha)) throw Error('提交记录格式无效。');
      return { sha, subject: visibleText(subject) };
    });
}

function verifyPreparedCommit(directory, head, meta) {
  const parent = meta.preparedFromSha || meta.sourceSha;
  if (git(directory, ['rev-parse', `${head}^`]) !== parent)
    throw Error('发布版本提交与原始源码不一致。');
  const files = git(directory, ['diff', '--name-only', parent, head]).split('\n').filter(Boolean);
  const allowed = ['package-lock.json', 'package.json', ...(meta.guidanceFiles || [])];
  if (files.some((file) => !allowed.includes(file))) throw Error('版本准备包含意外文件。');
  const application = JSON.parse(git(directory, ['show', `${head}:package.json`]));
  const lock = JSON.parse(git(directory, ['show', `${head}:package-lock.json`]));
  if (
    `v${application.version}` !== meta.tag ||
    lock.version !== application.version ||
    lock.packages?.['']?.version !== application.version
  )
    throw Error('版本提交的应用与锁文件版本不一致。');
  if (parent !== meta.sourceSha) {
    const previous = releaseMetadata(git(directory, ['show', '-s', '--format=%B', parent]));
    if (!previous || previous.sourceSha !== meta.sourceSha)
      throw Error('重新绑定版本的业务源码不一致。');
    verifyPreparedCommit(directory, parent, previous);
  }
}

/** Verify the fixed checkout and retain business source independently from its version commit. */
export function releaseSourceContext(directory, tag) {
  versionParts(tag);
  const releaseSha = git(directory, ['rev-parse', 'HEAD']);
  if (git(directory, ['rev-parse', `${tag}^{commit}`]) !== releaseSha)
    throw Error('当前构建源码与发布 tag 不一致。');
  if (git(directory, ['status', '--porcelain', '--untracked-files=no']))
    throw Error('固定 tag 的已跟踪源码已被修改，停止使用混合来源。');
  const meta = releaseMetadata(git(directory, ['show', '-s', '--format=%B', 'HEAD']));
  if (meta) {
    if (meta.tag !== tag) throw Error('发布提交的 tag 不一致。');
    verifyPreparedCommit(directory, releaseSha, meta);
  }
  const application = JSON.parse(git(directory, ['show', 'HEAD:package.json']));
  if (`v${application.version}` !== tag) throw Error('当前应用版本与发布 tag 不一致。');
  return { ...meta, tag, sourceSha: meta?.sourceSha || releaseSha, releaseSha };
}

export async function prepareVersion(
  directory,
  { tag, baseTag, sourceSha, preparedFromSha = sourceSha, guidanceHistory },
  identity,
) {
  const meta = { schema: 1, tag, baseTag, sourceSha };
  versionParts(tag);
  if (
    git(directory, ['rev-parse', 'HEAD']) !== preparedFromSha ||
    git(directory, ['status', '--porcelain'])
  )
    throw Error('隔离目录的源码状态已变化，停止准备版本。');
  if (preparedFromSha !== sourceSha) {
    const previous = releaseMetadata(git(directory, ['show', '-s', '--format=%B', 'HEAD']));
    if (!previous || previous.sourceSha !== sourceSha)
      throw Error('重新绑定版本的业务源码不一致。');
    verifyPreparedCommit(directory, preparedFromSha, previous);
  }
  for (const filename of ['package.json', 'package-lock.json']) {
    const file = path.join(directory, filename),
      stat = await fs.lstat(file);
    if (!stat.isFile() || stat.isSymbolicLink()) throw Error(`版本文件必须是普通文件：${filename}`);
    const data = JSON.parse(await fs.readFile(file, 'utf8'));
    data.version = tag.slice(1);
    if (filename === 'package-lock.json') {
      if (!data.packages?.['']) throw Error('锁文件缺少根项目版本。');
      data.packages[''].version = data.version;
    }
    await fs.writeFile(file, JSON.stringify(data, null, 2) + '\n');
  }
  const guidance = await bindOperationGuidance(directory, {
    tag,
    sourceSha,
    history: guidanceHistory,
  });
  if (preparedFromSha !== sourceSha) meta.preparedFromSha = preparedFromSha;
  if (guidance.files.length) meta.guidanceFiles = guidance.files;
  // Copy the already verified user identity only into this disposable repository.
  for (const [key, value] of Object.entries(identity))
    git(directory, ['config', `user.${key}`, value]);
  git(directory, ['config', 'user.useConfigOnly', 'true']);
  const allowedFiles = [...guidance.files, 'package.json', 'package-lock.json'].sort();
  git(directory, ['add', '--', ...allowedFiles]);
  // A pre-versioned source with unavailable guidance still needs immutable release provenance.
  git(directory, ['commit', '--allow-empty', '--file', '-'], {
    input: releaseCommitMessage(meta),
    timeout: 30000,
  });
  const actual = git(directory, ['show', '-s', '--format=%an%x00%ae%x00%cn%x00%ce', 'HEAD']).split(
    '\0',
  );
  if (
    JSON.stringify(actual) !==
    JSON.stringify([identity.name, identity.email, identity.name, identity.email])
  )
    throw Error('版本提交署名与本地 Git 账号不一致，停止推送。');
  if (git(directory, ['show', '-s', '--format=%B', 'HEAD']) !== releaseCommitMessage(meta).trim())
    throw Error('版本提交说明被修改，未满足已确认的中文提交格式，停止推送。');
  const files = git(directory, ['diff-tree', '--no-commit-id', '--name-only', '-r', 'HEAD'])
    .split('\n')
    .filter(Boolean)
    .sort();
  if (files.some((file) => !allowedFiles.includes(file)))
    throw Error('版本提交包含非版本文件，停止推送。');
  const releaseSha = git(directory, ['rev-parse', 'HEAD']);
  git(directory, ['tag', '-a', tag, '--file', '-'], {
    input: `发布 ${tag}：macOS 正式版本\n\n${releaseCommitMessage(meta)}`,
  });
  return { ...meta, releaseSha, guidance };
}

async function confirmedGuidanceHistory(directory, github, baseTag) {
  const records = [],
    warnings = [];
  const warn = (tag, message) =>
    warnings.push({
      code: 'history-guidance-unavailable',
      file: `content/guidance/releases/${tag.slice(1)}.json`,
      field: 'publication',
      message,
      suggestion: '保留历史缺口；只纳入已确认正式发布且与固定 tag 相符的说明，不补造历史。',
    });
  let releases;
  try {
    releases = await github.pages('/releases');
  } catch {
    warn(baseTag, '未能获取正式发布历史，本次不生成未经确认的历史说明。');
    return { records, warnings };
  }
  for (const release of releases) {
    const tag = release.tag_name;
    if (
      !/^v(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)$/.test(tag || '') ||
      release.draft ||
      release.prerelease ||
      !release.published_at ||
      compareVersions(tag, baseTag) > 0
    )
      continue;
    try {
      const releaseSha = git(directory, ['rev-parse', `${tag}^{commit}`]);
      const meta = releaseMetadata(git(directory, ['show', '-s', '--format=%B', tag]));
      if (meta) verifyPreparedCommit(directory, releaseSha, meta);
      const file = `releases/${tag.slice(1)}.json`;
      const text = git(directory, ['show', `${tag}:content/guidance/${file}`]);
      const record = loadGuidanceCatalog([{ file, text }]).releases[0];
      if (
        !record ||
        record.tag !== tag ||
        record.sourceSha !== (meta?.sourceSha || releaseSha) ||
        (meta && meta.tag !== tag)
      )
        throw Error('历史来源不符');
      records.push({
        ...record,
        publication: 'published',
        publicationEvidence: {
          releaseId: release.id,
          publishedAt: release.published_at,
          releaseSha,
        },
      });
    } catch {
      warn(tag, '已发布版本缺少可确认的固定操作说明。');
    }
  }
  return { records, warnings };
}

async function pendingVersion(directory, head, latestTag) {
  const meta = releaseMetadata(git(directory, ['show', '-s', '--format=%B', head]));
  if (!meta || meta.baseTag !== latestTag || compareVersions(meta.tag, latestTag) <= 0) return null;
  releaseSourceContext(directory, meta.tag);
  return { ...meta, releaseSha: head };
}

export async function activeRuns(github) {
  const runs = [];
  for (const status of ['in_progress', 'queued', 'waiting', 'pending', 'requested'])
    runs.push(
      ...(await github.pages(
        `/actions/workflows/${workflowFile}/runs?status=${status}`,
        'workflow_runs',
      )),
    );
  return runs.filter((run) => run.status !== 'completed');
}

export async function watchWorkflow(
  github,
  prepared,
  { log, sleep = delay, timeout = 50 * 60000, resume = false, now = Date.now } = {},
) {
  const started = now();
  let run,
    previousAttempt = 0,
    rerunRequested = false,
    lastStatus = '';
  while (now() - started < timeout) {
    const runs = await github.pages(
      `/actions/workflows/${workflowFile}/runs?head_sha=${prepared.releaseSha}`,
      'workflow_runs',
    );
    run = runs
      .filter((item) => item.head_sha === prepared.releaseSha)
      .sort((a, b) => b.id - a.id)[0];
    if (run) {
      const summary = `${run.status}/${run.conclusion || '等待结果'}/${run.run_attempt}`;
      if (summary !== lastStatus) {
        log(`云端状态：${summary}\n${run.html_url}`);
        lastStatus = summary;
      }
      if (run.status === 'completed' && (!rerunRequested || run.run_attempt > previousAttempt)) {
        if (run.conclusion === 'success') {
          const release = github.repo(`/releases/tags/${prepared.tag}`);
          if (release.draft || release.prerelease || !release.published_at)
            throw Error('云端任务结束，但正式 Release 尚未发布。');
          const latest = github.repo(`/releases/latest?verify=${now()}`);
          if (latest.id !== release.id)
            throw Error('发布完成，但 latest 尚未指向本次版本，请检查运行记录。');
          log(`发布成功：${release.html_url}`);
          return {
            status: 'published',
            tag: prepared.tag,
            releaseUrl: release.html_url,
            runUrl: run.html_url,
          };
        }
        if (!resume)
          throw Error(
            `云端发布未通过：${run.conclusion}。失败日志：${run.html_url}；修复或重试后重新运行脚本。`,
          );
        previousAttempt = run.run_attempt;
        github.repo(`/actions/runs/${run.id}/rerun`, { method: 'POST' });
        resume = false;
        rerunRequested = true;
        log('已请求重试同一源码版本，等待新的运行尝试。');
      }
    } else if (resume) {
      github.repo(`/actions/workflows/${workflowFile}/dispatches`, {
        method: 'POST',
        body: { ref: prepared.tag, inputs: { tag: prepared.tag } },
      });
      resume = false;
      log('已重新触发同一 tag 的发布流程。');
    } else if (now() - started > 3 * 60000) {
      throw Error(
        '未发现 tag 对应的云端任务。请检查 Actions 是否启用，稍后重新运行以恢复本次发布。',
      );
    }
    await sleep(15000);
  }
  throw Error(
    `等待云端发布超时；任务仍可继续运行，请查看 ${run?.html_url || `https://github.com/${github.repository}/actions/workflows/${workflowFile}`} 后重新运行脚本。`,
  );
}

export async function runRelease({
  directory,
  origin,
  identity,
  github,
  ask,
  log,
  dryRun = false,
  requestedVersion,
  proxy,
  watchOptions = {},
}) {
  const releaseLock = await repositoryLock(directory);
  let temporary;
  try {
    const busy = await activeRuns(github);
    if (busy.length) {
      busy.forEach((run) => log(`已有发布任务运行，请等待完成：${run.html_url}`));
      return { status: 'busy' };
    }
    const latest = github.repo('/releases/latest');
    versionParts(latest.tag_name);
    if (latest.draft || latest.prerelease || !latest.published_at)
      throw Error('没有可用的最新正式 Release。');
    const repository = github.repo('');
    if (!repository.permissions?.push) throw Error('当前 GitHub 登录没有本仓库的推送权限。');
    const workflow = github.repo(`/actions/workflows/${workflowFile}`);
    if (workflow.state !== 'active') throw Error('发布工作流未启用，请先在 GitHub Actions 启用。');
    temporary = await fs.mkdtemp(path.join(os.tmpdir(), 'workbench-publish-'));
    const snapshot = path.join(temporary, 'source');
    const env = {
      ...process.env,
      ...(proxy
        ? { https_proxy: proxy, HTTPS_PROXY: proxy, http_proxy: proxy, HTTP_PROXY: proxy }
        : {}),
    };
    log('正在读取远端 master 的完整提交历史……');
    git(
      temporary,
      [
        'clone',
        '--quiet',
        '--no-checkout',
        '--single-branch',
        '--branch',
        'master',
        '--',
        origin,
        snapshot,
      ],
      { env },
    );
    git(snapshot, ['fetch', '--quiet', 'origin', 'refs/tags/v*:refs/tags/v*'], { env });
    const head = git(snapshot, ['rev-parse', 'refs/remotes/origin/master']);
    git(snapshot, ['checkout', '--quiet', '--detach', head]);
    const pending = await pendingVersion(snapshot, head, latest.tag_name);
    const sourceSha = pending?.sourceSha || head;
    const commits = commitsSince(snapshot, latest.tag_name, sourceSha);
    if (!commits.length) {
      log('没有需要发布的新提交。');
      return { status: 'no-changes' };
    }
    log(
      `仓库：${github.repository}\n基准：${latest.tag_name}\n源码：${sourceSha}\n提交身份：${identity.name} <${identity.email}>\n平台：macOS arm64（ZIP、DMG、SHA256SUMS）`,
    );
    for (const commit of commits) log(`  ${commit.sha.slice(0, 7)} ${commit.subject}`);
    const occupied = git(snapshot, ['tag', '--list', 'v*']).split('\n').filter(Boolean);
    const application = JSON.parse(git(snapshot, ['show', `${head}:package.json`]));
    const suggested = pending?.tag || nextVersion(latest.tag_name, occupied, application.version);
    let tag = requestedVersion || suggested;
    if (!dryRun && !requestedVersion)
      tag = (await ask(`新版本号 [${suggested}]：`)).trim() || suggested;
    versionParts(tag);
    if (
      compareVersions(tag, latest.tag_name) <= 0 ||
      compareVersions(tag, `v${application.version}`) < 0
    )
      throw Error('新版本必须高于最新正式 Release，且不能低于远端应用版本。');
    const resume = pending?.tag === tag;
    if (occupied.includes(tag) && !resume)
      throw Error('该 tag 已被占用，请指定更高的新版本；已有版本不会覆盖。');
    let published;
    try {
      published = github.repo(`/releases/tags/${tag}`);
    } catch (error) {
      if (error.status !== 404) throw error;
    }
    if (published && !published.draft) throw Error('该版本已经正式发布，禁止覆盖。');
    const workflowSource = git(snapshot, ['show', `${head}:.github/workflows/${workflowFile}`]);
    const workflowReady = workflowSource.includes('scripts/publish-release-cloud.mjs');
    if (!workflowReady && !dryRun)
      throw Error('远端 master 尚未包含新的发布流程。请先提交并推送本功能，再运行脚本。');
    if (!workflowReady)
      log('注意：远端 master 尚未包含新的发布流程，实际运行前需先提交并推送本功能。');
    log(`\n计划：${resume ? '恢复未完成的' : '准备'} ${tag}；完整测试通过后自动发布为 latest。`);
    const guidanceHistory = resume
      ? undefined
      : await confirmedGuidanceHistory(snapshot, github, latest.tag_name);
    const plan = {
      tag,
      baseTag: latest.tag_name,
      sourceSha,
      preparedFromSha: head,
      commits,
      resume,
      guidanceHistory,
    };
    const guidance = await inspectOperationGuidance(snapshot, {
      sourceSha,
      ...(resume ? { releaseTag: tag } : {}),
    });
    guidance.warnings.push(...(guidanceHistory?.warnings || []));
    log(formatOperationGuidance(guidance));
    if (dryRun) {
      log('预览完成；没有创建提交、tag、草稿或云端任务。');
      return { status: 'preview', workflowReady, ...plan, guidance };
    }
    if ((await ask('确认执行以上发布计划？输入 yes 继续：')).trim().toLowerCase() !== 'yes') {
      log('已取消发布。');
      return { status: 'cancelled' };
    }
    if ((await activeRuns(github)).length) throw Error('确认期间已有发布任务启动，请等待其完成。');
    const remoteHead = git(snapshot, ['ls-remote', 'origin', 'refs/heads/master'], { env }).split(
      /\s/,
    )[0];
    if (remoteHead !== head || github.repo('/releases/latest').id !== latest.id)
      throw Error('确认期间远端源码或最新 Release 已变化，请重新运行以更新计划。');
    let prepared = pending;
    if (!resume) {
      prepared = await prepareVersion(snapshot, plan, identity);
      log(formatOperationGuidance(prepared.guidance.report));
      log(`已创建本地版本提交 ${prepared.releaseSha.slice(0, 7)}，正在原子推送 master 与 ${tag}……`);
      git(
        snapshot,
        [
          'push',
          '--atomic',
          'origin',
          `${prepared.releaseSha}:refs/heads/master`,
          `refs/tags/${tag}:refs/tags/${tag}`,
        ],
        { env },
      );
    }
    const common = path.resolve(directory, git(directory, ['rev-parse', '--git-common-dir']));
    await fs.writeFile(
      path.join(common, 'workbench-release-state.json'),
      JSON.stringify(
        { repository: github.repository, ...prepared, updatedAt: new Date().toISOString() },
        null,
        2,
      ) + '\n',
      { mode: 0o600 },
    );
    return await watchWorkflow(github, prepared, { log, resume, ...watchOptions });
  } finally {
    if (temporary) await fs.rm(temporary, { recursive: true, force: true });
    await releaseLock();
  }
}
