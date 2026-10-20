import { execFileSync } from 'node:child_process';
import fs from 'node:fs/promises';

export function systemProxy(directory, env = process.env) {
  for (const key of ['HTTPS_PROXY', 'https_proxy', 'ALL_PROXY', 'all_proxy'])
    if (env[key]) return env[key];
  try {
    const value = execFileSync(
      'git',
      ['config', '--get-urlmatch', 'http.proxy', 'https://github.com'],
      { cwd: directory, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] },
    ).trim();
    if (value) return value;
  } catch {
    /* Git may have no proxy configuration. */
  }
  if (process.platform !== 'darwin') return undefined;
  try {
    const settings = execFileSync('/usr/sbin/scutil', ['--proxy'], {
      encoding: 'utf8',
      timeout: 5000,
    });
    for (const prefix of ['HTTPS', 'HTTP']) {
      const get = (name) =>
        settings.match(new RegExp(`^\\s*${prefix}${name} : (.+)$`, 'm'))?.[1].trim();
      const host = get('Proxy'),
        port = get('Port');
      if (
        get('Enable') === '1' &&
        /^[\w.-]+$/.test(host ?? '') &&
        /^\d+$/.test(port ?? '') &&
        Number(port) > 0 &&
        Number(port) <= 65535
      )
        return `http://${host}:${port}`;
    }
  } catch {
    /* A direct connection remains available. */
  }
  return undefined;
}

export function gitCredential(directory, repository) {
  try {
    const raw = execFileSync('git', ['-c', 'credential.interactive=false', 'credential', 'fill'], {
      cwd: directory,
      input: `protocol=https\nhost=github.com\npath=${repository}.git\n\n`,
      encoding: 'utf8',
      timeout: 15000,
      stdio: ['pipe', 'pipe', 'pipe'],
      env: {
        ...process.env,
        GIT_TERMINAL_PROMPT: '0',
        GCM_INTERACTIVE: 'never',
        GIT_ASKPASS: '',
        SSH_ASKPASS: '',
      },
    });
    const token = raw
      .split('\n')
      .find((line) => line.startsWith('password='))
      ?.slice(9);
    if (token && token.length <= 4096 && !/[\s\x00-\x1f\x7f]/.test(token)) return token;
  } catch {
    /* Never expose credential helper output. */
  }
  throw Error(
    '没有可用的本机 GitHub HTTPS 登录。请先通过 Git 凭据助手登录，并授予仓库 Contents 和 Actions 写权限，再重新运行。',
  );
}

export class GitHubError extends Error {
  constructor(status) {
    super(`GitHub 请求失败（HTTP ${status}）。请检查网络、仓库权限与 GitHub Actions 权限。`);
    this.status = status;
  }
}

export function githubClient(repository, token, proxy, execute = execFileSync) {
  if (!/^[\w-]+\/[\w.-]+$/.test(repository) || !token || /[\s\x00-\x1f\x7f]/.test(token))
    throw Error('GitHub 配置无效。');
  function request(
    url,
    { method = 'GET', body, upload, output, binary = false, authorize = true } = {},
  ) {
    const target = new URL(url);
    if (target.protocol !== 'https:' || target.username || target.password || target.port)
      throw Error('拒绝不安全的请求地址。');
    if (authorize && !['api.github.com', 'uploads.github.com'].includes(target.hostname))
      throw Error('拒绝向非 GitHub API 地址发送授权。');
    const headers = [
      'User-Agent: Clever-Workbench-Release',
      `Accept: ${binary ? 'application/octet-stream' : 'application/vnd.github+json'}`,
      ...(authorize ? [`Authorization: Bearer ${token}`, 'X-GitHub-Api-Version: 2022-11-28'] : []),
      ...(body ? ['Content-Type: application/json'] : []),
      ...(upload ? ['Content-Type: application/octet-stream'] : []),
    ];
    const config = [
      `url = ${JSON.stringify(url)}`,
      ...headers.map((header) => `header = ${JSON.stringify(header)}`),
      ...(proxy ? [`proxy = ${JSON.stringify(proxy)}`] : []),
    ].join('\n');
    let raw;
    try {
      raw = execute(
        'curl',
        [
          '--silent',
          '--show-error',
          '--connect-timeout',
          '15',
          '--max-time',
          upload || output ? '600' : '45',
          ...(method === 'GET' ? ['--retry', '2', '--retry-delay', '1', '--retry-all-errors'] : []),
          '--request',
          method,
          '--config',
          '-',
          ...(body ? ['--data-binary', JSON.stringify(body)] : []),
          ...(upload ? ['--upload-file', upload] : []),
          ...(output ? ['--output', output] : []),
          '--write-out',
          output ? '\n%{http_code}\n%{redirect_url}' : '\n%{http_code}',
        ],
        {
          input: config,
          encoding: 'utf8',
          maxBuffer: 20 * 1024 * 1024,
          timeout: upload || output ? 605000 : 150000,
          stdio: ['pipe', 'pipe', 'pipe'],
        },
      );
    } catch {
      throw Error('GitHub 网络请求未完成，请检查代理与连接后重试；已有提交或草稿将保留。');
    }
    if (output) {
      const [, code, redirect] = raw.split('\n');
      return { status: Number(code), redirect };
    }
    const split = raw.lastIndexOf('\n'),
      status = Number(raw.slice(split + 1));
    if (status < 200 || status >= 300) throw new GitHubError(status);
    try {
      return raw.slice(0, split) ? JSON.parse(raw.slice(0, split)) : null;
    } catch {
      throw Error('GitHub 响应格式无效。');
    }
  }
  const api = (route, options) => {
    if (!route.startsWith('/') || route.startsWith('//') || /[\r\n]/.test(route))
      throw Error('GitHub API 路径无效。');
    return request(`https://api.github.com${route}`, options);
  };
  const repo = (route, options) => api(`/repos/${repository}${route}`, options);
  return {
    repository,
    api,
    repo,
    async pages(route, field) {
      const all = [];
      for (let page = 1; ; page++) {
        const data = repo(`${route}${route.includes('?') ? '&' : '?'}per_page=100&page=${page}`);
        const items = field ? data[field] : data;
        if (!Array.isArray(items)) throw Error('GitHub 分页响应无效。');
        all.push(...items);
        if (items.length < 100) return all;
      }
    },
    upload(releaseId, asset) {
      if (!Number.isSafeInteger(releaseId) || releaseId < 1) throw Error('Release ID 无效。');
      return request(
        `https://uploads.github.com/repos/${repository}/releases/${releaseId}/assets?name=${encodeURIComponent(asset.name)}`,
        { method: 'POST', upload: asset.filename },
      );
    },
    async download(asset, destination) {
      if (!Number.isSafeInteger(asset.id) || asset.id < 1) throw Error('资产 ID 无效。');
      const source = `https://api.github.com/repos/${repository}/releases/assets/${asset.id}`;
      let url = source;
      try {
        for (let index = 0; index < 5; index++) {
          const result = request(url, {
            binary: true,
            authorize: url === source,
            output: destination,
          });
          if (result.status === 200) return;
          if (![301, 302, 303, 307, 308].includes(result.status) || !result.redirect)
            throw new GitHubError(result.status);
          const next = new URL(result.redirect);
          if (
            next.protocol !== 'https:' ||
            next.username ||
            next.password ||
            next.port ||
            !['release-assets.githubusercontent.com', 'objects.githubusercontent.com'].includes(
              next.hostname,
            )
          )
            throw Error('更新资产跳转到未授权地址。');
          url = next.href;
        }
        throw Error('资产重定向次数过多。');
      } catch (error) {
        await fs.rm(destination, { force: true });
        throw error;
      }
    },
  };
}
