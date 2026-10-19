import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import path from 'node:path';
import fs from 'node:fs/promises';
import { ordinaryPath, inspectFiles } from './zip-archive';
import type { GitCommit, GitFilter, GitPreview } from '../../src/tool-types';
const execute = promisify(execFile);
async function git(source: string, ...args: string[]) {
  const env: NodeJS.ProcessEnv = { ...process.env, GIT_TERMINAL_PROMPT: '0' };
  for (const name of Object.keys(env))
    if (name.startsWith('GIT_') && name !== 'GIT_TERMINAL_PROMPT') delete env[name];
  try {
    return (
      await execute('git', ['--no-pager', '--literal-pathspecs', '-C', source, ...args], {
        env,
        timeout: 60_000,
        maxBuffer: 128 * 1024 * 1024,
        windowsHide: true,
        encoding: 'utf8',
      })
    ).stdout;
  } catch (error) {
    const cause = error as NodeJS.ErrnoException & { stderr?: string; killed?: boolean };
    if (cause.code === 'ENOENT') throw new Error('未找到本机 Git；完整归档和还原仍可使用。');
    if (cause.killed) throw new Error('Git 查询超时，请缩小范围后重试。');
    throw new Error(`Git 查询失败：${cause.stderr?.trim() || cause.message}`);
  }
}
async function repository(source: string) {
  source = await ordinaryPath(source, true);
  const root = await ordinaryPath(
    (await git(source, 'rev-parse', '--show-toplevel')).trimEnd(),
    true,
  );
  await git(source, 'rev-parse', '--verify', 'HEAD^{commit}');
  const scope = path.relative(root, source).split(path.sep).join('/') || '.';
  if (scope.startsWith('../') || path.isAbsolute(scope))
    throw new Error('所选目录不在 Git 工作树内。');
  return { root, source, scope };
}
export async function gitBranches(input: string) {
  const { source } = await repository(input);
  const rows = await git(
    source,
    'for-each-ref',
    '--format=%(refname)\t%(symref)',
    'refs/heads',
    'refs/remotes',
  );
  const branches = rows
    .trimEnd()
    .split('\n')
    .filter(Boolean)
    .flatMap((line) => {
      const [ref, symbolic] = line.replace(/\r$/, '').split('\t');
      if (symbolic) return [];
      const local = ref.startsWith('refs/heads/');
      return [
        {
          ref,
          label: `${local ? '本地' : '远程'}：${ref.replace(/^refs\/(heads|remotes)\//, '')}`,
        },
      ];
    });
  const current = (await git(source, 'rev-parse', '--symbolic-full-name', 'HEAD')).trim();
  if (current === 'HEAD') branches.unshift({ ref: 'HEAD', label: '当前检出：HEAD' });
  return {
    branches,
    branch: branches.some((b) => b.ref === current) ? current : branches[0]?.ref || '',
  };
}
export function dateBounds(start: string, end: string) {
  const parse = (value: string) => {
    if (!value) return null;
    if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) throw new Error('日期格式必须为 YYYY-MM-DD。');
    const [year, month, day] = value.split('-').map(Number);
    const date = new Date(year, month - 1, day);
    if (date.getFullYear() !== year || date.getMonth() !== month - 1 || date.getDate() !== day)
      throw new Error('日期无效。');
    return date;
  };
  const first = parse(start),
    last = parse(end);
  if (first && last && first > last) throw new Error('开始日期不能晚于结束日期。');
  last?.setDate(last.getDate() + 1);
  return {
    first: first ? first.getTime() / 1000 : null,
    last: last ? last.getTime() / 1000 : null,
  };
}
export async function gitCommits(filter: GitFilter) {
  const { root, scope } = await repository(filter.source);
  const { branches } = await gitBranches(filter.source);
  if (!branches.some((b) => b.ref === filter.branch))
    throw new Error('所选分支已不存在，请刷新分支。');
  if (![0, 24, 48].includes(filter.recentHours)) throw new Error('最近时间范围无效。');
  let { first, last } = dateBounds(filter.start, filter.end);
  const now = Date.now() / 1000;
  if (filter.recentHours) {
    first = now - filter.recentHours * 3600;
    last = null;
  }
  // shortcut: read local metadata once; paginate in Git if histories outgrow the 128 MB query limit.
  const fields = (
    await git(
      root,
      'log',
      '--full-history',
      '-z',
      '--no-color',
      '--no-decorate',
      '--format=%H%x00%ct%x00%an%x00%ae%x00%s',
      filter.branch,
      '--',
      scope,
    )
  ).split('\0');
  if (fields.at(-1) === '') fields.pop();
  if (fields.length % 5) throw new Error('无法读取 Git 提交信息。');
  const commits: GitCommit[] = [];
  const needle = filter.author.trim().toLocaleLowerCase();
  for (let i = 0; i < fields.length; i += 5) {
    const [sha, stamp, author, email, subject] = fields.slice(i, i + 5),
      timestamp = Number(stamp);
    if (
      (first !== null && timestamp < first) ||
      (last !== null && timestamp >= last) ||
      (filter.recentHours && timestamp > now) ||
      !`${author} <${email}>`.toLocaleLowerCase().includes(needle)
    )
      continue;
    commits.push({ sha, timestamp, author, email, subject });
  }
  return commits.sort((a, b) => b.timestamp - a.timestamp);
}
export async function gitPreview(input: string, commits: string[]): Promise<GitPreview> {
  const { root, source, scope } = await repository(input);
  if (
    !Array.isArray(commits) ||
    !commits.length ||
    commits.some((sha) => !/^(?:[a-f0-9]{40}|[a-f0-9]{64})$/.test(sha))
  )
    throw new Error('请至少选择一个有效提交。');
  const names = new Set<string>();
  for (const sha of new Set(commits)) {
    const parents = (await git(source, 'rev-list', '--parents', '-n', '1', sha, '--'))
      .trim()
      .split(/\s+/);
    const raw =
      parents.length > 1
        ? await git(
            root,
            'diff',
            '--no-ext-diff',
            '--no-renames',
            '--name-only',
            '-z',
            parents[1],
            sha,
            '--',
            scope,
          )
        : await git(
            root,
            'diff-tree',
            '--root',
            '--no-commit-id',
            '--no-ext-diff',
            '--no-renames',
            '--name-only',
            '-r',
            '-z',
            sha,
            '--',
            scope,
          );
    for (const name of raw.split('\0').filter(Boolean)) {
      if (name.startsWith('/') || name.split('/').includes('..') || name.includes('\\'))
        throw new Error('Git 返回不安全路径。');
      if (scope !== '.' && !name.startsWith(`${scope}/`))
        throw new Error('Git 返回目录范围之外的路径。');
      names.add(scope === '.' ? name : name.slice(scope.length + 1));
    }
  }
  const inspected = await inspectFiles(source, [...names]);
  const sizes: Record<string, number> = Object.create(null);
  for (const name of inspected.available)
    sizes[name] = (await fs.stat(path.join(source, name))).size;
  return {
    source: input,
    commits: [...new Set(commits)].sort(),
    ...inspected,
    sizes,
    bytes: Object.values(sizes).reduce((sum, size) => sum + size, 0),
  };
}
