import { test, expect } from 'vitest';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { execFileSync } from 'node:child_process';

const core = await import(new URL('../scripts/release-tools/core.mjs', import.meta.url).href);
const local = await import(new URL('../scripts/release-tools/local.mjs', import.meta.url).href);
const transport = await import(
  new URL('../scripts/release-tools/github.mjs', import.meta.url).href
);
const cloud = await import(new URL('../scripts/publish-release-cloud.mjs', import.meta.url).href);
const identity = { name: '本地发布测试用户', email: 'release-fixture@example.invalid' };
const g = (cwd: string, ...args: string[]) =>
  execFileSync('git', args, { cwd, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }).trim();

async function fixture(changes = true) {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'release-command-test-'));
  const remote = path.join(root, 'remote.git'),
    seed = path.join(root, 'seed'),
    working = path.join(root, 'working');
  await fs.mkdir(seed);
  g(root, 'init', '--bare', '--quiet', '--initial-branch=master', remote);
  g(seed, 'init', '--quiet', '--initial-branch=master');
  for (const [key, value] of Object.entries(identity)) g(seed, 'config', `user.${key}`, value);
  await fs.mkdir(path.join(seed, '.github/workflows'), { recursive: true });
  await fs.writeFile(
    path.join(seed, '.github/workflows/release.yml'),
    'run: node scripts/publish-release-cloud.mjs "$RELEASE_TAG"\n',
  );
  await fs.writeFile(
    path.join(seed, 'package.json'),
    JSON.stringify({ name: 'fixture', version: '0.1.4' }),
  );
  await fs.writeFile(
    path.join(seed, 'package-lock.json'),
    JSON.stringify({ version: '0.1.4', packages: { '': { name: 'fixture', version: '0.1.4' } } }),
  );
  await fs.writeFile(path.join(seed, 'app.txt'), '已发布源码');
  g(seed, 'add', '.');
  g(seed, 'commit', '--quiet', '-m', '初始化测试版本');
  g(seed, 'tag', 'v0.1.4');
  g(seed, 'remote', 'add', 'origin', remote);
  g(seed, 'push', '--quiet', '--atomic', 'origin', 'HEAD:master', 'refs/tags/v0.1.4');
  if (changes) {
    await fs.writeFile(path.join(seed, 'app.txt'), '仅远端功能');
    g(seed, 'add', '.');
    g(seed, 'commit', '--quiet', '-m', '完善远端功能和说明');
    g(seed, 'push', '--quiet', 'origin', 'master');
  }
  const sourceSha = g(seed, 'rev-parse', 'HEAD');
  g(root, 'clone', '--quiet', remote, working);
  for (const [key, value] of Object.entries(identity)) g(working, 'config', `user.${key}`, value);
  await fs.writeFile(path.join(working, 'local-only.txt'), '尚未推送的业务代码');
  g(working, 'add', '.');
  g(working, 'commit', '--quiet', '-m', '本地尚未推送的功能');
  await fs.writeFile(path.join(working, 'app.txt'), '未提交的本地修改');
  await fs.writeFile(path.join(working, 'private.txt'), '本地未跟踪资料');
  return {
    root,
    remote,
    seed,
    working,
    sourceSha,
    cleanup: () => fs.rm(root, { recursive: true, force: true }),
  };
}

function fakeLocalGitHub(f: Awaited<ReturnType<typeof fixture>>, failure = false, tag = 'v0.1.5') {
  let published = false,
    attempt = 1;
  const posts: string[] = [];
  const released = {
    id: 2,
    tag_name: tag,
    draft: false,
    prerelease: false,
    published_at: '2026-10-20T10:00:00Z',
    html_url: `https://github.com/fixture/app/releases/tag/${tag}`,
  };
  return {
    repository: 'fixture/app',
    posts,
    repo(route: string, options?: any): any {
      if (options?.method === 'POST') {
        posts.push(route);
        if (route.endsWith('/rerun')) {
          attempt++;
          failure = false;
        }
        return null;
      }
      if (route.startsWith('/releases/latest'))
        return published
          ? released
          : {
              id: 1,
              tag_name: 'v0.1.4',
              draft: false,
              prerelease: false,
              published_at: '2026-10-19T10:00:00Z',
            };
      if (route === '') return { permissions: { push: true } };
      if (route === '/actions/workflows/release.yml') return { state: 'active' };
      if (route === `/releases/tags/${tag}` && published) return released;
      throw new transport.GitHubError(404);
    },
    async pages(route: string) {
      if (route === '/releases')
        return [
          {
            id: 1,
            tag_name: 'v0.1.4',
            draft: false,
            prerelease: false,
            published_at: '2026-10-19T10:00:00Z',
          },
        ];
      if (route.includes('status=')) return [];
      if (route.includes('head_sha=')) {
        const sha = g(f.root, '--git-dir', f.remote, 'rev-parse', `${tag}^{commit}`);
        published = !failure;
        return [
          {
            id: 42,
            head_sha: sha,
            status: 'completed',
            conclusion: failure ? 'failure' : 'success',
            run_attempt: attempt,
            html_url: 'https://github.com/fixture/app/actions/runs/42',
          },
        ];
      }
      throw Error(`unexpected route ${route}`);
    },
  };
}

test('stable versions, occupied tags and GitHub origin parsing are validated', () => {
  expect(core.nextVersion('v0.1.4')).toBe('v0.1.5');
  expect(core.nextVersion('v0.1.4', ['v0.1.5'])).toBe('v0.1.6');
  expect(core.nextVersion('v0.1.4', [], '1.0.0')).toBe('v1.0.0');
  expect(core.compareVersions('v0.10.0', 'v0.9.9')).toBe(1);
  for (const tag of ['v01.2.3', 'v0.2.0-beta', '0.2.0', 'v1.2.3;touch /tmp/x'])
    expect(() => core.versionParts(tag)).toThrow();
  for (const origin of [
    'https://github.com/owner/project.git',
    'git@github.com:owner/project.git',
    'ssh://git@github.com/owner/project.git',
  ])
    expect(core.repositoryFromOrigin(origin)).toBe('owner/project');
  for (const origin of [
    'https://token@github.com/owner/project',
    'https://github.com.evil.invalid/owner/project',
    'file:///tmp/repo',
  ])
    expect(() => core.repositoryFromOrigin(origin)).toThrow();
});

test('preview reads only remote commits and preserves dirty files and unpushed local commits', async () => {
  const f = await fixture();
  try {
    const before = g(f.working, 'status', '--porcelain'),
      head = g(f.working, 'rev-parse', 'HEAD');
    const result = await local.runRelease({
      directory: f.working,
      origin: f.remote,
      identity,
      github: fakeLocalGitHub(f),
      dryRun: true,
      ask: () => {
        throw Error('preview must not prompt');
      },
      log: () => {},
    });
    expect(result.status).toBe('preview');
    expect(result.sourceSha).toBe(f.sourceSha);
    expect(result.commits.map((item: any) => item.subject)).toEqual(['完善远端功能和说明']);
    expect(g(f.working, 'status', '--porcelain')).toBe(before);
    expect(g(f.working, 'rev-parse', 'HEAD')).toBe(head);
    expect(g(f.root, '--git-dir', f.remote, 'rev-parse', 'master')).toBe(f.sourceSha);
    expect(() => g(f.root, '--git-dir', f.remote, 'rev-parse', 'v0.1.5')).toThrow();
  } finally {
    await f.cleanup();
  }
});

test('发布预览汇总实际远端指引与警告，本地修正不掩盖远端缺项且不产生发布副作用', async () => {
  const f = await fixture();
  try {
    const content = path.join(f.seed, 'content/guidance');
    await fs.mkdir(path.join(content, 'features'), { recursive: true });
    await fs.writeFile(path.join(content, 'features/broken.json'), '{ bad json');
    await fs.writeFile(
      path.join(content, 'pending.json'),
      JSON.stringify({
        schemaVersion: 1,
        kind: 'release-draft',
        operationChange: 'changed',
        summary: '远端新增系统资料导出。',
        changes: [{ id: 'export', summary: '从系统菜单导出资料。', guideIds: ['missing-export'] }],
      }),
    );
    g(f.seed, 'add', '.');
    g(f.seed, 'commit', '--quiet', '-m', '加入远端待核对操作说明');
    g(f.seed, 'push', '--quiet', 'origin', 'master');
    const sourceSha = g(f.seed, 'rev-parse', 'HEAD');
    await fs.mkdir(path.join(f.working, 'content/guidance'), { recursive: true });
    await fs.writeFile(
      path.join(f.working, 'content/guidance/pending.json'),
      JSON.stringify({
        schemaVersion: 1,
        kind: 'release-draft',
        operationChange: 'none',
        summary: '只存在本地的说明。',
        noOperationReason: '未修改操作。',
        changes: [],
      }),
    );
    const before = g(f.working, 'status', '--porcelain');
    const logs: string[] = [];
    const github = fakeLocalGitHub(f);
    const result = await local.runRelease({
      directory: f.working,
      origin: f.remote,
      identity,
      github,
      dryRun: true,
      ask: () => {
        throw Error('preview must not prompt');
      },
      log: (line: string) => logs.push(line),
    });
    expect(result.status).toBe('preview');
    expect(result.guidance.content.summary).toBe('远端新增系统资料导出。');
    expect(result.guidance.warnings.map((item: any) => item.code)).toEqual(
      expect.arrayContaining(['invalid-json', 'missing-guide', 'missing-review']),
    );
    expect(logs.join('\n')).toContain('content/guidance/features/broken.json');
    expect(logs.join('\n')).toContain('修正建议');
    expect(logs.join('\n')).not.toContain('只存在本地的说明');
    expect(result.guidance.sourceSha).toBe(sourceSha);
    expect(g(f.working, 'status', '--porcelain')).toBe(before);
    expect(g(f.root, '--git-dir', f.remote, 'rev-parse', 'master')).toBe(sourceSha);
    expect(github.posts).toEqual([]);
    expect(() => g(f.root, '--git-dir', f.remote, 'rev-parse', 'v0.1.5')).toThrow();
  } finally {
    await f.cleanup();
  }
});

test('confirmation publishes an isolated version commit with the local identity and only two version files', async () => {
  const f = await fixture();
  try {
    const answers = ['', 'yes'],
      before = g(f.working, 'status', '--porcelain');
    const result = await local.runRelease({
      directory: f.working,
      origin: f.remote,
      identity,
      github: fakeLocalGitHub(f),
      ask: async () => answers.shift(),
      log: () => {},
      watchOptions: { sleep: async () => {} },
    });
    expect(result.status).toBe('published');
    expect(answers).toEqual([]);
    const args = ['--git-dir', f.remote];
    expect(g(f.root, ...args, 'show', 'master:app.txt')).toBe('仅远端功能');
    expect(() => g(f.root, ...args, 'show', 'master:local-only.txt')).toThrow();
    expect(
      g(f.root, ...args, 'diff', '--name-only', f.sourceSha, 'master')
        .split('\n')
        .sort(),
    ).toEqual(['package-lock.json', 'package.json']);
    expect(g(f.root, ...args, 'show', '-s', '--format=%an <%ae>%n%cn <%ce>', 'master')).toBe(
      `${identity.name} <${identity.email}>\n${identity.name} <${identity.email}>`,
    );
    expect(g(f.root, ...args, 'show', '-s', '--format=%B', 'master')).toContain('准备发布 v0.1.5');
    expect(g(f.working, 'status', '--porcelain')).toBe(before);
    expect(
      core.releaseMetadata(g(f.root, ...args, 'show', '-s', '--format=%B', 'master')).sourceSha,
    ).toBe(f.sourceSha);
  } finally {
    await f.cleanup();
  }
});

test('发布准备绑定远端说明、实际版本与业务源码，保留核对来源', async () => {
  const f = await fixture();
  try {
    await fs.mkdir(path.join(f.seed, 'content/guidance/features'), { recursive: true });
    await fs.copyFile(
      path.resolve('content/guidance/features/application-update.json'),
      path.join(f.seed, 'content/guidance/features/application-update.json'),
    );
    const draft = {
      schemaVersion: 1,
      kind: 'release-draft',
      operationChange: 'changed',
      summary: '从设置阅读更新操作步骤。',
      changes: [
        { id: 'help', summary: '更新旁可打开离线指引。', guideIds: ['application-update'] },
      ],
      review: {
        status: 'pending',
        reviewer: '',
        checkedAt: '',
        source: 'a'.repeat(40),
        environment: '隔离发布测试',
        checks: [],
        knownGaps: ['尚待人工核对。'],
      },
    };
    await fs.writeFile(path.join(f.seed, 'content/guidance/pending.json'), JSON.stringify(draft));
    g(f.seed, 'add', '.');
    g(f.seed, 'commit', '--quiet', '-m', '提交真实待发布说明');
    g(f.seed, 'push', '--quiet', 'origin', 'master');
    const source = g(f.seed, 'rev-parse', 'HEAD');
    const answers = ['', 'yes'];
    await local.runRelease({
      directory: f.working,
      origin: f.remote,
      identity,
      github: fakeLocalGitHub(f),
      ask: async () => answers.shift(),
      log: () => {},
      watchOptions: { sleep: async () => {} },
    });
    const bound = JSON.parse(
      g(f.root, '--git-dir', f.remote, 'show', 'v0.1.5:content/guidance/releases/0.1.5.json'),
    );
    expect(bound).toMatchObject({
      ...draft,
      kind: 'release',
      version: '0.1.5',
      tag: 'v0.1.5',
      sourceSha: source,
      publication: 'pending',
    });
    expect(
      g(f.root, '--git-dir', f.remote, 'diff', '--name-only', source, 'v0.1.5').split('\n').sort(),
    ).toEqual(['content/guidance/releases/0.1.5.json', 'package-lock.json', 'package.json']);
    expect(
      core.releaseMetadata(g(f.root, '--git-dir', f.remote, 'show', '-s', '--format=%B', 'v0.1.5'))
        .sourceSha,
    ).toBe(source);
    g(f.seed, 'fetch', '--quiet', 'origin', '--tags');
    g(f.seed, 'checkout', '--quiet', '--detach', 'v0.1.5');
    const reportPath = path.join(f.root, 'ci-guidance.json');
    execFileSync(
      process.execPath,
      [
        path.resolve('scripts/check-operation-guidance.mjs'),
        '--directory',
        f.seed,
        '--release-tag',
        'v0.1.5',
        '--output',
        reportPath,
        '--github',
      ],
      { encoding: 'utf8' },
    );
    const ciReport = JSON.parse(await fs.readFile(reportPath, 'utf8'));
    expect(ciReport.sourceSha).toBe(source);
    expect(ciReport.content).toMatchObject({ tag: 'v0.1.5', sourceSha: source });
    await fs.writeFile(path.join(f.seed, 'content/guidance/pending.json'), '{ later edit');
    expect(() => local.releaseSourceContext(f.seed, 'v0.1.5')).toThrow('已跟踪源码已被修改');
  } finally {
    await f.cleanup();
  }
});

test('no remote changes exits without prompting even when local commits exist', async () => {
  const f = await fixture(false);
  try {
    const result = await local.runRelease({
      directory: f.working,
      origin: f.remote,
      identity,
      github: fakeLocalGitHub(f),
      ask: () => {
        throw Error('unexpected prompt');
      },
      log: () => {},
    });
    expect(result.status).toBe('no-changes');
    expect(g(f.root, '--git-dir', f.remote, 'rev-parse', 'master')).toBe(f.sourceSha);
  } finally {
    await f.cleanup();
  }
});

test('cancel and remote changes during confirmation never push a version', async () => {
  const f = await fixture();
  try {
    let answers = ['', 'no'];
    const config = {
      directory: f.working,
      origin: f.remote,
      identity,
      github: fakeLocalGitHub(f),
      log: () => {},
    };
    expect((await local.runRelease({ ...config, ask: async () => answers.shift() })).status).toBe(
      'cancelled',
    );
    answers = ['', 'yes'];
    await expect(
      local.runRelease({
        ...config,
        ask: async () => {
          if (answers.length === 1) {
            await fs.writeFile(path.join(f.seed, 'another.txt'), '并发远端变更');
            g(f.seed, 'add', '.');
            g(f.seed, 'commit', '--quiet', '-m', '远端继续更新');
            g(f.seed, 'push', '--quiet', 'origin', 'master');
          }
          return answers.shift();
        },
      }),
    ).rejects.toThrow('远端源码或最新 Release 已变化');
    expect(() => g(f.root, '--git-dir', f.remote, 'rev-parse', 'v0.1.5')).toThrow();
  } finally {
    await f.cleanup();
  }
});

test('a failed workflow can resume the same remote version without another version commit', async () => {
  const f = await fixture();
  try {
    const github = fakeLocalGitHub(f, true);
    const config = {
      directory: f.working,
      origin: f.remote,
      identity,
      github,
      log: () => {},
      watchOptions: { sleep: async () => {} },
    };
    let answers = ['', 'yes'];
    await expect(local.runRelease({ ...config, ask: async () => answers.shift() })).rejects.toThrow(
      '云端发布未通过',
    );
    const prepared = g(f.root, '--git-dir', f.remote, 'rev-parse', 'master');
    answers = ['', 'yes'];
    expect((await local.runRelease({ ...config, ask: async () => answers.shift() })).status).toBe(
      'published',
    );
    expect(g(f.root, '--git-dir', f.remote, 'rev-parse', 'master')).toBe(prepared);
    expect(github.posts).toEqual(['/actions/runs/42/rerun']);
  } finally {
    await f.cleanup();
  }
});

test('已占用失败版本可重绑新号，同一 tag 重跑始终读取原绑定内容', async () => {
  const f = await fixture();
  try {
    await fs.mkdir(path.join(f.seed, 'content/guidance'), { recursive: true });
    const draft = {
      schemaVersion: 1,
      kind: 'release-draft',
      operationChange: 'none',
      summary: '修复排版。',
      noOperationReason: '现有操作方式没有变化。',
      changes: [],
    };
    await fs.writeFile(path.join(f.seed, 'content/guidance/pending.json'), JSON.stringify(draft));
    g(f.seed, 'add', '.');
    g(f.seed, 'commit', '--quiet', '-m', '添加待发布说明');
    g(f.seed, 'push', '--quiet', 'origin', 'master');
    const source = g(f.seed, 'rev-parse', 'HEAD');
    const config = {
      directory: f.working,
      origin: f.remote,
      identity,
      log: () => {},
      watchOptions: { sleep: async () => {} },
    };
    await expect(
      local.runRelease({
        ...config,
        requestedVersion: 'v0.1.5',
        github: fakeLocalGitHub(f, true),
        ask: async () => 'yes',
      }),
    ).rejects.toThrow('云端发布未通过');
    const original = g(
      f.root,
      '--git-dir',
      f.remote,
      'show',
      'v0.1.5:content/guidance/releases/0.1.5.json',
    );
    const failedHead = g(f.root, '--git-dir', f.remote, 'rev-parse', 'master');
    const preview = await local.runRelease({
      ...config,
      github: fakeLocalGitHub(f, true),
      dryRun: true,
      ask: async () => '',
    });
    expect(preview.resume).toBe(true);
    expect(preview.guidance.content).toMatchObject({
      kind: 'release',
      tag: 'v0.1.5',
      summary: '修复排版。',
    });
    expect(
      (
        await local.runRelease({
          ...config,
          requestedVersion: 'v0.1.6',
          github: fakeLocalGitHub(f, false, 'v0.1.6'),
          ask: async () => 'yes',
        })
      ).status,
    ).toBe('published');
    expect(
      g(f.root, '--git-dir', f.remote, 'show', 'v0.1.5:content/guidance/releases/0.1.5.json'),
    ).toBe(original);
    const next = JSON.parse(
      g(f.root, '--git-dir', f.remote, 'show', 'v0.1.6:content/guidance/releases/0.1.6.json'),
    );
    expect(next).toMatchObject({
      version: '0.1.6',
      tag: 'v0.1.6',
      sourceSha: source,
      publication: 'pending',
      summary: '修复排版。',
    });
    expect(g(f.root, '--git-dir', f.remote, 'rev-parse', 'master^')).toBe(failedHead);
  } finally {
    await f.cleanup();
  }
});

test('新版本仅纳入已确认正式发布的固定历史，草稿和失败记录不冒充正式历史', async () => {
  const f = await fixture();
  try {
    const pendingPath = path.join(f.seed, 'content/guidance/pending.json');
    await fs.mkdir(path.dirname(pendingPath), { recursive: true });
    const draft = (summary: string) => ({
      schemaVersion: 1,
      kind: 'release-draft',
      operationChange: 'none',
      summary,
      noOperationReason: '修复不改变操作步骤。',
      changes: [],
    });
    await fs.writeFile(pendingPath, JSON.stringify(draft('已正式发布的原始说明。')));
    g(f.seed, 'add', '.');
    g(f.seed, 'commit', '--quiet', '-m', '为首版准备操作说明');
    const first = await local.prepareVersion(
      f.seed,
      { tag: 'v0.1.5', baseTag: 'v0.1.4', sourceSha: g(f.seed, 'rev-parse', 'HEAD') },
      identity,
    );
    const original = g(f.seed, 'show', 'v0.1.5:content/guidance/releases/0.1.5.json');
    await fs.writeFile(pendingPath, JSON.stringify(draft('失败版本的说明。')));
    g(f.seed, 'add', '.');
    g(f.seed, 'commit', '--quiet', '-m', '准备下一版内容');
    await local.prepareVersion(
      f.seed,
      { tag: 'v0.1.6', baseTag: 'v0.1.5', sourceSha: g(f.seed, 'rev-parse', 'HEAD') },
      identity,
    );
    const forged = JSON.parse(original);
    forged.summary = '后改历史不得进入包。';
    forged.publication = 'published';
    await fs.writeFile(
      path.join(f.seed, 'content/guidance/releases/0.1.5.json'),
      JSON.stringify(forged),
    );
    const falseHistory = { ...forged, version: '0.1.7', tag: 'v0.1.7' };
    await fs.writeFile(
      path.join(f.seed, 'content/guidance/releases/0.1.7.json'),
      JSON.stringify(falseHistory),
    );
    await fs.writeFile(pendingPath, JSON.stringify(draft('本次准备版本的说明。')));
    g(f.seed, 'add', '.');
    g(f.seed, 'commit', '--quiet', '-m', '更新待发布说明');
    g(f.seed, 'push', '--quiet', 'origin', 'master', '--tags');
    const github = fakeLocalGitHub(f, false, 'v0.1.8');
    const repo = github.repo.bind(github),
      pages = github.pages.bind(github);
    const formal = {
      id: 5,
      tag_name: 'v0.1.5',
      draft: false,
      prerelease: false,
      published_at: '2026-10-20T00:00:00Z',
    };
    github.repo = (route: string, options?: any) => {
      const result = repo(route, options);
      return route.startsWith('/releases/latest') && result.id === 1 ? formal : result;
    };
    github.pages = async (route: string) =>
      route === '/releases'
        ? ([
            formal,
            { ...formal, id: 6, tag_name: 'v0.1.6', draft: true },
            { ...formal, id: 7, tag_name: 'v0.1.7', prerelease: true },
          ] as any)
        : pages(route);
    const result = await local.runRelease({
      directory: f.working,
      origin: f.remote,
      identity,
      github,
      requestedVersion: 'v0.1.8',
      ask: async () => 'yes',
      log: () => {},
      watchOptions: { sleep: async () => {} },
    });
    expect(result.status).toBe('published');
    const historic = JSON.parse(
      g(f.root, '--git-dir', f.remote, 'show', 'master:content/guidance/releases/0.1.5.json'),
    );
    expect(historic).toMatchObject({
      summary: '已正式发布的原始说明。',
      publication: 'published',
      sourceSha: first.sourceSha,
    });
    expect(
      g(f.root, '--git-dir', f.remote, 'show', 'v0.1.5:content/guidance/releases/0.1.5.json'),
    ).toBe(original);
    expect(() =>
      g(f.root, '--git-dir', f.remote, 'show', 'master:content/guidance/releases/0.1.6.json'),
    ).toThrow();
    expect(() =>
      g(f.root, '--git-dir', f.remote, 'show', 'master:content/guidance/releases/0.1.7.json'),
    ).toThrow();
  } finally {
    await f.cleanup();
  }
});

test('远端已填写目标版本且缺少指引时仍能生成版本来源提交', async () => {
  const f = await fixture();
  try {
    for (const name of ['package.json', 'package-lock.json']) {
      const file = path.join(f.seed, name),
        data = JSON.parse(await fs.readFile(file, 'utf8'));
      data.version = '0.1.5';
      if (data.packages) data.packages[''].version = data.version;
      await fs.writeFile(file, JSON.stringify(data, null, 2) + '\n');
    }
    g(f.seed, 'add', '.');
    g(f.seed, 'commit', '--quiet', '-m', '预先填写目标应用版本');
    g(f.seed, 'push', '--quiet', 'origin', 'master');
    const source = g(f.seed, 'rev-parse', 'HEAD');
    const result = await local.runRelease({
      directory: f.working,
      origin: f.remote,
      identity,
      github: fakeLocalGitHub(f),
      requestedVersion: 'v0.1.5',
      ask: async () => 'yes',
      log: () => {},
      watchOptions: { sleep: async () => {} },
    });
    expect(result.status).toBe('published');
    expect(g(f.root, '--git-dir', f.remote, 'rev-parse', 'master')).not.toBe(source);
    expect(g(f.root, '--git-dir', f.remote, 'diff', '--name-only', source, 'master')).toBe('');
  } finally {
    await f.cleanup();
  }
});

test('local identity overrides and concurrent local or cloud publishers are rejected', async () => {
  const f = await fixture();
  try {
    expect(local.localIdentity(f.working)).toEqual(identity);
    expect(() =>
      local.localIdentity(f.working, { ...process.env, GIT_AUTHOR_NAME: 'Codex' }),
    ).toThrow('环境变量覆盖');
    const unlock = await local.repositoryLock(f.working);
    try {
      await expect(local.repositoryLock(f.working)).rejects.toThrow('已有发布脚本运行');
    } finally {
      await unlock();
    }
    const github = fakeLocalGitHub(f);
    github.pages = async () =>
      [{ status: 'in_progress', html_url: 'https://github.com/fixture/app/actions/runs/9' }] as any;
    expect(
      (
        await local.runRelease({
          directory: f.working,
          origin: f.remote,
          identity,
          github,
          ask: () => {
            throw Error('unexpected prompt');
          },
          log: () => {},
        })
      ).status,
    ).toBe('busy');
  } finally {
    await f.cleanup();
  }
});

test.skipIf(process.platform === 'win32')(
  'version preparation refuses symlinks that leave the isolated directory',
  async () => {
    const f = await fixture();
    try {
      const outside = path.join(f.root, 'outside.json');
      const content = JSON.stringify({ version: '0.1.4', privateData: 'fixture-only' });
      await fs.writeFile(outside, content);
      await fs.rm(path.join(f.seed, 'package.json'));
      await fs.symlink('../outside.json', path.join(f.seed, 'package.json'));
      g(f.seed, 'add', '.');
      g(f.seed, 'commit', '--quiet', '-m', '测试符号链接边界');
      await expect(
        local.prepareVersion(
          f.seed,
          { tag: 'v0.1.5', baseTag: 'v0.1.4', sourceSha: g(f.seed, 'rev-parse', 'HEAD') },
          identity,
        ),
      ).rejects.toThrow('必须是普通文件');
      expect(await fs.readFile(outside, 'utf8')).toBe(content);
    } finally {
      await f.cleanup();
    }
  },
);

test('GitHub credentials stay in curl stdin and are omitted after a CDN redirect', async () => {
  const calls: any[] = [],
    root = await fs.mkdtemp(path.join(os.tmpdir(), 'release-transport-'));
  try {
    const destination = path.join(root, 'sums');
    const execute = (_command: string, args: string[], options: any) => {
      calls.push({ args, config: options.input });
      return calls.length === 1
        ? '\n302\nhttps://release-assets.githubusercontent.com/fixture'
        : '\n200\n';
    };
    const client = transport.githubClient(
      'fixture/app',
      'fixture-private-token',
      undefined,
      execute,
    );
    await client.download({ id: 123 }, destination);
    expect(calls).toHaveLength(2);
    expect(calls[0].config).toContain('Authorization: Bearer fixture-private-token');
    expect(calls[1].config).not.toContain('Authorization');
    for (const call of calls) expect(call.args.join(' ')).not.toContain('fixture-private-token');
    const badClient = transport.githubClient(
      'fixture/app',
      'fixture-token',
      undefined,
      () => '\n302\nhttps://evil.invalid/stolen',
    );
    await expect(badClient.download({ id: 123 }, destination)).rejects.toThrow('未授权地址');
  } finally {
    await fs.rm(root, { recursive: true, force: true });
  }
});

async function cloudFixture() {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'release-cloud-'));
  await fs.writeFile(path.join(root, 'Clever-Workbench-0.1.5-arm64.zip'), 'zip-payload');
  await fs.writeFile(path.join(root, 'Clever-Workbench-0.1.5-arm64.dmg'), 'dmg-payload');
  await fs.writeFile(path.join(root, 'SHA256SUMS'), 'temporary');
  const assets = await core.localAssets('v0.1.5', root);
  const sums =
    assets
      .filter((item: any) => item.name !== 'SHA256SUMS')
      .map((item: any) => `${item.digest.slice(7)}  ${item.name}`)
      .join('\n') + '\n';
  await fs.writeFile(path.join(root, 'SHA256SUMS'), sums);
  let release: any,
    latest: any = { id: 1, tag_name: 'v0.1.4' };
  const mutations: string[] = [],
    uploads: string[] = [];
  const controls = { failUpload: '', corruptDigest: false, corruptSums: false };
  const github = {
    repository: 'fixture/app',
    async pages() {
      return release ? [structuredClone(release)] : [];
    },
    repo(route: string, options?: any): any {
      if (route.startsWith('/releases/latest')) return structuredClone(latest);
      if (options?.method) mutations.push(`${options.method} ${route}`);
      if (route === '/releases' && options?.method === 'POST') {
        release = {
          id: 2,
          assets: [],
          html_url: 'https://github.com/fixture/app/releases/tag/v0.1.5',
          ...options.body,
        };
        return structuredClone(release);
      }
      if (route === '/releases/2' && options?.method === 'PATCH') {
        Object.assign(release, options.body, { published_at: new Date().toISOString() });
        latest = release;
      } else if (route.startsWith('/releases/assets/') && options?.method === 'DELETE')
        release.assets = release.assets.filter(
          (item: any) => item.id !== Number(route.split('/').at(-1)),
        );
      return structuredClone(release);
    },
    async upload(_id: number, asset: any) {
      uploads.push(asset.name);
      if (controls.failUpload === asset.name) throw Error('模拟连接中断');
      const uploaded = {
        id: 10 + uploads.length,
        name: asset.name,
        size: asset.size,
        digest: controls.corruptDigest ? `sha256:${'0'.repeat(64)}` : asset.digest,
        state: 'uploaded',
      };
      release.assets.push(uploaded);
      return structuredClone(uploaded);
    },
    async download(_asset: any, destination: string) {
      await fs.writeFile(destination, controls.corruptSums ? '篡改的校验清单' : sums);
    },
  };
  const context = {
    tag: 'v0.1.5',
    baseTag: 'v0.1.4',
    sourceSha: 'a'.repeat(40),
    releaseSha: 'b'.repeat(40),
    commits: [{ sha: 'a'.repeat(40), subject: '更新文档与功能' }],
    runUrl: 'https://github.com/fixture/app/actions/runs/42',
  };
  return {
    root,
    github,
    context,
    mutations,
    uploads,
    controls,
    current: () => release,
    cleanup: () => fs.rm(root, { recursive: true, force: true }),
  };
}

test('cloud publication verifies three assets and downloaded checksums before publishing latest', async () => {
  const f = await cloudFixture();
  try {
    const release = await cloud.publishMacRelease({
      github: f.github,
      context: f.context,
      directory: f.root,
      log: () => {},
    });
    expect(release.draft).toBe(false);
    expect(release.body).toContain('更新文档与功能');
    expect(f.uploads).toHaveLength(3);
    expect(f.mutations.at(-1)).toBe('PATCH /releases/2');
    const receipt = JSON.parse(await fs.readFile(path.join(f.root, 'verification.json'), 'utf8'));
    expect(receipt.checksumsDownloadedAndMatched).toBe(true);
    await expect(
      cloud.publishMacRelease({
        github: f.github,
        context: f.context,
        directory: f.root,
        log: () => {},
      }),
    ).rejects.toThrow('禁止覆盖');
  } finally {
    await f.cleanup();
  }
});

test('云端正文读取固定版本绑定而非后改草稿，缺失指引仅警告仍发布', async () => {
  const f = await cloudFixture();
  try {
    await fs.mkdir(path.join(f.root, 'content/guidance/releases'), { recursive: true });
    await fs.writeFile(
      path.join(f.root, 'content/guidance/releases/0.1.5.json'),
      JSON.stringify({
        schemaVersion: 1,
        kind: 'release',
        version: '0.1.5',
        tag: 'v0.1.5',
        sourceSha: f.context.sourceSha,
        publication: 'pending',
        operationChange: 'changed',
        summary: '固定版本的用户操作说明。',
        changes: [{ id: 'guide', summary: '在设置查阅操作步骤。', guideIds: ['missing-guide'] }],
      }),
    );
    await fs.writeFile(
      path.join(f.root, 'content/guidance/pending.json'),
      JSON.stringify({
        schemaVersion: 1,
        kind: 'release-draft',
        operationChange: 'none',
        summary: '后来修改的下一版说明。',
        noOperationReason: '没有变化。',
        changes: [],
      }),
    );
    const logs: string[] = [];
    const result = await cloud.publishMacRelease({
      github: f.github,
      context: f.context,
      directory: f.root,
      sourceDirectory: f.root,
      log: (s: string) => logs.push(s),
    });
    expect(result.body).toContain('固定版本的用户操作说明。');
    expect(result.body).toContain('在设置查阅操作步骤。');
    expect(result.body).toContain('暂未提供完整操作指引');
    expect(result.body).toContain('技术提交明细');
    expect(result.body).toContain('/blob/v0.1.5/content/guidance/releases/0.1.5.json');
    expect(result.body).not.toContain('后来修改的下一版说明');
    expect(logs.join('\n')).toContain('missing-guide');
    expect(result.draft).toBe(false);
    const report = JSON.parse(await fs.readFile(path.join(f.root, 'guidance-check.json'), 'utf8'));
    expect(report.sourceSha).toBe(f.context.sourceSha);
    expect(report.content.tag).toBe('v0.1.5');
  } finally {
    await f.cleanup();
  }
});

test('坏正文从版本准备到云端资产发布仅降级，来源错配不混入摘要', async () => {
  const f = await fixture();
  const assets = await cloudFixture();
  try {
    await fs.mkdir(path.join(f.seed, 'content/guidance/features'), { recursive: true });
    await fs.writeFile(path.join(f.seed, 'content/guidance/pending.json'), '{ invalid draft');
    await fs.writeFile(
      path.join(f.seed, 'content/guidance/features/broken.json'),
      '{ invalid feature',
    );
    g(f.seed, 'add', '.');
    g(f.seed, 'commit', '--quiet', '-m', '构造无效内容输入');
    g(f.seed, 'push', '--quiet', 'origin', 'master');
    const source = g(f.seed, 'rev-parse', 'HEAD');
    const logs: string[] = [];
    const result = await local.runRelease({
      directory: f.working,
      origin: f.remote,
      identity,
      github: fakeLocalGitHub(f),
      requestedVersion: 'v0.1.5',
      ask: async () => 'yes',
      log: (s: string) => logs.push(s),
      watchOptions: { sleep: async () => {} },
    });
    expect(result.status).toBe('published');
    expect(logs.join('\n')).toContain('invalid-json');
    g(f.seed, 'fetch', '--quiet', 'origin', '--tags');
    g(f.seed, 'checkout', '--quiet', '--detach', 'v0.1.5');
    const selected = local.releaseSourceContext(f.seed, 'v0.1.5');
    expect(selected.sourceSha).toBe(source);
    const context = { ...assets.context, ...selected };
    const published = await cloud.publishMacRelease({
      github: assets.github,
      context,
      directory: assets.root,
      sourceDirectory: f.seed,
      log: () => {},
    });
    expect(published.body).toContain('暂未提供完整操作指引');
    expect(published.body).not.toContain('无新增操作：');
    expect(assets.uploads).toHaveLength(3);
    const report = JSON.parse(
      await fs.readFile(path.join(assets.root, 'guidance-check.json'), 'utf8'),
    );
    expect(report.content).toBeNull();
    expect(report.warnings.some((item: any) => item.code === 'invalid-json')).toBe(true);
    await fs.mkdir(path.join(f.seed, 'content/guidance/releases'), { recursive: true });
    await fs.writeFile(
      path.join(f.seed, 'content/guidance/releases/0.1.5.json'),
      JSON.stringify({
        schemaVersion: 1,
        kind: 'release',
        version: '0.1.5',
        tag: 'v0.1.5',
        publication: 'pending',
        sourceSha: 'a'.repeat(40),
        operationChange: 'none',
        summary: '另一源码的说明。',
        noOperationReason: '另一源码没有变化。',
        changes: [],
      }),
    );
    const checked = await (
      await import(new URL('../scripts/release-tools/guidance.mjs', import.meta.url).href)
    ).inspectOperationGuidance(f.seed, { releaseTag: 'v0.1.5', sourceSha: source });
    expect(checked.content).toBeNull();
    expect(checked.warnings.some((item: any) => item.code === 'binding-source-mismatch')).toBe(
      true,
    );
  } finally {
    await f.cleanup();
    await assets.cleanup();
  }
});

test('an interrupted draft resumes matching assets without publishing partial uploads', async () => {
  const f = await cloudFixture();
  try {
    f.controls.failUpload = 'Clever-Workbench-0.1.5-arm64.dmg';
    const config = { github: f.github, context: f.context, directory: f.root, log: () => {} };
    await expect(cloud.publishMacRelease(config)).rejects.toThrow('模拟连接中断');
    expect(f.current().draft).toBe(true);
    expect(f.mutations).not.toContain('PATCH /releases/2');
    f.controls.failUpload = '';
    await cloud.publishMacRelease(config);
    expect(f.uploads.filter((name) => name.endsWith('.zip'))).toHaveLength(1);
    expect(f.current().draft).toBe(false);
  } finally {
    await f.cleanup();
  }
});

test.each(['corruptDigest', 'corruptSums'] as const)(
  'cloud publication retains the draft when %s is detected',
  async (kind) => {
    const f = await cloudFixture();
    try {
      f.controls[kind] = true;
      await expect(
        cloud.publishMacRelease({
          github: f.github,
          context: f.context,
          directory: f.root,
          log: () => {},
        }),
      ).rejects.toThrow();
      expect(f.current().draft).toBe(true);
      expect(f.mutations).not.toContain('PATCH /releases/2');
    } finally {
      await f.cleanup();
    }
  },
);
