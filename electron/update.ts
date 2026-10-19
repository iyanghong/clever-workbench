import type { UpdateSnapshot, UpdateAsset } from '../src/update-types';
import fs from 'node:fs/promises';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { extractBundle, runCommand, type RunCommand } from './update-package';

export const RELEASES_URL = 'https://github.com/iyanghong/clever-workbench/releases';
const LATEST = 'https://api.github.com/repos/iyanghong/clever-workbench/releases/latest';
interface Options {
  stagingDirectory?: string;
  runCommand?: RunCommand;
  currentVersion: string;
  packaged: boolean;
  platform: string;
  arch: string;
  fetch?: typeof fetch;
  githubCredential?: () => Promise<string | undefined>;
  now?: () => number;
}
const version = (v: string) =>
  /^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)$/.test(v) ? v.split('.').map(BigInt) : null;
function newer(a: string, b: string) {
  const left = version(a),
    right = version(b);
  if (!left || !right) throw Error('版本号无效。');
  for (let i = 0; i < 3; i++) {
    if (left[i] !== right[i]) return left[i] > right[i];
  }
  return false;
}
export function trustedAsset(url: string, tag: string) {
  try {
    const u = new URL(url);
    return (
      u.origin === 'https://github.com' &&
      !u.username &&
      !u.password &&
      !u.search &&
      !u.hash &&
      u.pathname.startsWith(`/iyanghong/clever-workbench/releases/download/${tag}/`) &&
      !decodeURIComponent(u.pathname).includes('..')
    );
  } catch {
    return false;
  }
}
function trustedApiAsset(value: string) {
  try {
    const url = new URL(value);
    return (
      url.origin === 'https://api.github.com' &&
      !url.username &&
      !url.password &&
      !url.search &&
      !url.hash &&
      /^\/repos\/iyanghong\/clever-workbench\/releases\/assets\/[1-9]\d*$/.test(url.pathname)
    );
  } catch {
    return false;
  }
}
export class UpdateCoordinator {
  private githubToken?: string;
  private async readCredential() {
    const value = await this.options.githubCredential?.();
    if (value && (value.length > 4096 || /[\s\x00-\x1f\x7f]/.test(value)))
      throw Error('本机 GitHub 凭据格式无效，请重新登录。');
    this.githubToken = value || undefined;
  }
  finishHealthCheck(status: 'success' | 'manual', message: string, enableChecks: boolean) {
    this.setInstallationState({ status, message });
    this.setRecoverySummary(status, message);
    if (enableChecks) this.start();
  }
  private recovery?: UpdateSnapshot['recovery'];
  setRecoverySummary(outcome: string, message: string) {
    this.recovery = { outcome, message };
    this.set({ ...this.state, recovery: this.recovery });
  }
  private state: UpdateSnapshot;
  private listeners = new Set<(state: UpdateSnapshot) => void>();
  private pending?: Promise<UpdateSnapshot>;
  private downloading?: Promise<UpdateSnapshot>;
  private prepared?: { appPath: string; version: string; stageDirectory: string };
  preparedUpdate() {
    return this.state.status === 'ready' && this.prepared ? { ...this.prepared } : undefined;
  }
  setInstallationState(value: {
    status: 'preparing' | 'installing' | 'validating' | 'success' | 'manual' | 'error' | 'ready';
    message?: string;
  }) {
    return this.set({ ...this.state, ...value });
  }
  async download(): Promise<UpdateSnapshot> {
    if (this.downloading) return this.downloading;
    if (
      !this.state.release ||
      !['available', 'error'].includes(this.state.status) ||
      !this.options.stagingDirectory
    )
      return this.snapshot();
    this.downloading = this.downloadRelease().finally(() => {
      this.downloading = undefined;
    });
    return this.downloading;
  }
  private async downloadRelease() {
    const release = this.state.release!;
    let directory: string | undefined;
    this.prepared = undefined;
    try {
      await this.readCredential();
      await fs.mkdir(this.options.stagingDirectory!, { recursive: true, mode: 0o700 });
      directory = await fs.mkdtemp(path.join(this.options.stagingDirectory!, 'release-'));
      this.set({
        status: 'downloading',
        release,
        progress: { received: 0, total: release.zip.size },
      });
      const sums = (await this.downloadAsset(release.checksums, undefined, release)).toString(
        'utf8',
      );
      const matching = sums
        .split(/\r?\n/)
        .filter((line) => line.match(/^([a-fA-F0-9]{64}) [ *](.+)$/)?.[2] === release.zip.name);
      if (matching.length !== 1) throw Error('更新包缺少唯一的 SHA-256 校验。');
      const zipPath = path.join(directory, 'update.zip');
      const digest = (await this.downloadAsset(release.zip, zipPath, release)).toString();
      if (digest !== matching[0].slice(0, 64).toLowerCase())
        throw Error('更新包校验失败，请重新下载。');
      this.set({ status: 'verifying', release });
      const appPath = await extractBundle(
        zipPath,
        directory,
        release.version,
        this.options.runCommand ?? runCommand,
      );
      this.prepared = { appPath, version: release.version, stageDirectory: directory };
      return this.set({ status: 'ready', release });
    } catch (error) {
      if (directory) await fs.rm(directory, { recursive: true, force: true }).catch(() => {});
      return this.set({
        status: 'error',
        release,
        message: error instanceof Error ? error.message : '下载或校验更新失败。',
      });
    }
  }
  private async downloadAsset(
    asset: UpdateAsset,
    filename: string | undefined,
    release: NonNullable<UpdateSnapshot['release']>,
  ): Promise<Buffer> {
    if (!trustedAsset(asset.url, `v${release.version}`)) throw Error('更新来源无效。');
    if (this.githubToken && (!asset.apiUrl || !trustedApiAsset(asset.apiUrl)))
      throw Error('Release 缺少有效的 GitHub 授权下载地址。');
    let url = this.githubToken ? asset.apiUrl! : asset.url;
    let response: Response | undefined;
    for (let redirect = 0; redirect < 5; redirect++) {
      response = await (this.options.fetch ?? fetch)(url, {
        redirect: 'manual',
        signal: AbortSignal.timeout(10 * 60 * 1000),
        ...(trustedApiAsset(url)
          ? {
              headers: {
                Accept: 'application/octet-stream',
                'User-Agent': 'Clever-Workbench',
                ...(this.githubToken ? { Authorization: `Bearer ${this.githubToken}` } : {}),
              },
            }
          : {}),
      });
      if (![301, 302, 303, 307, 308].includes(response.status)) break;
      const location = response.headers.get('location');
      await response.body?.cancel();
      if (!location) throw Error('更新重定向无效。');
      const next = new URL(location, url);
      if (
        next.protocol !== 'https:' ||
        next.username ||
        next.port ||
        next.password ||
        ![
          'github.com',
          'api.github.com',
          'release-assets.githubusercontent.com',
          'objects.githubusercontent.com',
        ].includes(next.hostname) ||
        (next.hostname === 'github.com' && !trustedAsset(next.href, `v${release.version}`)) ||
        (next.hostname === 'api.github.com' && !trustedApiAsset(next.href))
      )
        throw Error('更新下载被重定向到不可信来源。');
      url = next.href;
    }
    if (!response?.ok || !response.body) throw Error('下载更新失败，请检查网络后重试。');
    const reader = response.body.getReader();
    const chunks: Buffer[] = [];
    const hash = createHash('sha256');
    let received = 0;
    const file = filename ? await fs.open(filename, 'wx', 0o600) : undefined;
    try {
      for (;;) {
        const next = await reader.read();
        if (next.done) break;
        received += next.value.length;
        if (received > asset.size) throw Error('下载内容超过声明大小。');
        hash.update(next.value);
        if (file) {
          await file.writeFile(next.value);
          this.set({ status: 'downloading', release, progress: { received, total: asset.size } });
        } else chunks.push(Buffer.from(next.value));
      }
      if (received !== asset.size) throw Error('下载未完成，请重新下载。');
    } finally {
      await reader.cancel().catch(() => {});
      await file?.close();
    }
    return file ? Buffer.from(hash.digest('hex')) : Buffer.concat(chunks);
  }
  private cachedUntil = 0;
  private retryUntil = 0;
  private timer?: ReturnType<typeof setInterval>;
  private now() {
    return (this.options.now ?? Date.now)();
  }
  constructor(private options: Options) {
    this.state = {
      status:
        options.packaged && options.platform === 'darwin' && options.arch === 'arm64'
          ? 'idle'
          : 'unsupported',
      currentVersion: options.currentVersion,
      ...(!options.packaged
        ? { message: '开发版本不支持在线更新。' }
        : options.platform !== 'darwin' || options.arch !== 'arm64'
          ? { message: '首版在线更新仅支持 macOS Apple Silicon。' }
          : {}),
    };
  }
  snapshot() {
    return structuredClone(this.state);
  }
  subscribe(listener: (state: UpdateSnapshot) => void) {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  }
  private set(value: Partial<UpdateSnapshot>) {
    this.state = {
      currentVersion: this.options.currentVersion,
      recovery: this.recovery,
      checkedAt: new Date(this.now()).toISOString(),
      ...value,
    } as UpdateSnapshot;
    for (const listener of this.listeners) listener(this.snapshot());
    return this.snapshot();
  }
  start() {
    if (this.timer) return;
    void this.check();
    this.timer = setInterval(
      () => {
        void this.check();
      },
      30 * 60 * 1000,
    );
    this.timer.unref?.();
  }
  stop() {
    if (this.timer) clearInterval(this.timer);
    this.timer = undefined;
  }
  async check(force = false): Promise<UpdateSnapshot> {
    if (
      this.downloading ||
      ['ready', 'preparing', 'installing', 'validating'].includes(this.state.status)
    )
      return this.snapshot();
    if (this.state.status === 'unsupported') return this.snapshot();
    if (this.pending) return this.pending;
    if (this.now() < this.retryUntil || (!force && this.now() < this.cachedUntil))
      return this.snapshot();
    this.pending = this.fetchRelease().finally(() => {
      this.pending = undefined;
    });
    return this.pending;
  }
  private async fetchRelease(): Promise<UpdateSnapshot> {
    this.set({ status: 'checking' });
    try {
      await this.readCredential();
      const response = await (this.options.fetch ?? fetch)(LATEST, {
        headers: {
          Accept: 'application/vnd.github+json',
          'User-Agent': 'Clever-Workbench',
          ...(this.githubToken ? { Authorization: `Bearer ${this.githubToken}` } : {}),
        },
        redirect: 'error',
        signal: AbortSignal.timeout(15000),
      });
      this.cachedUntil = this.now() + 20 * 60 * 1000;
      if (response.status === 404)
        return this.set({
          status: 'no-release',
          message: this.githubToken
            ? '未找到可访问的正式 Release，请确认本机 GitHub 账号有仓库读取权限。'
            : '尚无可匿名访问的正式 Release。私有仓库请先在本机 Git 中登录 GitHub。',
        });
      if (response.status === 401)
        return this.set({
          status: 'error',
          message: '本机 GitHub 登录已失效，请重新登录后检查更新。',
        });
      if (response.status === 403 || response.status === 429) {
        const seconds = Number(response.headers.get('retry-after'));
        const reset = Number(response.headers.get('x-ratelimit-reset')) * 1000;
        this.retryUntil = Math.max(this.now() + (seconds > 0 ? seconds * 1000 : 60000), reset || 0);
        return this.set({
          status: 'error',
          message: 'GitHub 暂时拒绝请求或请求过于频繁，请稍后重试。',
          retryAt: new Date(this.retryUntil).toISOString(),
        });
      }
      if (!response.ok) throw Error('检查更新失败，请稍后重试。');
      if (Number(response.headers.get('content-length')) > 1024 * 1024)
        throw Error('Release 信息过大。');
      const reader = response.body?.getReader();
      if (!reader) throw Error('Release 响应为空。');
      const chunks: Uint8Array[] = [];
      let size = 0;
      for (;;) {
        const next = await reader.read();
        if (next.done) break;
        size += next.value.length;
        if (size > 1024 * 1024) {
          await reader.cancel();
          throw Error('Release 信息过大。');
        }
        chunks.push(next.value);
      }
      const release = JSON.parse(Buffer.concat(chunks).toString('utf8'));
      const toAsset = (a: any): UpdateAsset => ({
        name: a.name,
        url: a.browser_download_url,
        size: a.size,
        ...(typeof a.url === 'string' && trustedApiAsset(a.url) ? { apiUrl: a.url } : {}),
      });
      if (
        release.draft !== false ||
        release.prerelease !== false ||
        typeof release.tag_name !== 'string' ||
        !release.tag_name.startsWith('v') ||
        !version(release.tag_name.slice(1))
      )
        return this.set({ status: 'no-release', message: '暂无可用的正式版本。' });
      if (!newer(release.tag_name.slice(1), this.options.currentVersion))
        return this.set({ status: 'up-to-date' });
      const assets = Array.isArray(release.assets) ? release.assets : [];
      const usable = (a: any) =>
        typeof a.name === 'string' &&
        typeof a.browser_download_url === 'string' &&
        trustedAsset(a.browser_download_url, release.tag_name) &&
        Number.isSafeInteger(a.size) &&
        a.size > 0;
      const zip = assets.find(
        (a: any) =>
          usable(a) &&
          a.name === `Clever-Workbench-${release.tag_name.slice(1)}-arm64.zip` &&
          a.size <= 1024 * 1024 * 1024,
      );
      const sums = assets.find(
        (a: any) => usable(a) && a.name === 'SHA256SUMS' && a.size <= 1024 * 1024,
      );
      if (!zip || !sums)
        return this.set({
          status: 'incompatible',
          message: '新版缺少兼容的 macOS arm64 更新包或校验文件。',
        });
      return this.set({
        status: 'available',
        release: {
          version: release.tag_name.slice(1),
          publishedAt: typeof release.published_at === 'string' ? release.published_at : '',
          notes: typeof release.body === 'string' ? release.body.slice(0, 50000) : '',
          pageUrl: `${RELEASES_URL}/tag/${release.tag_name}`,
          zip: toAsset(zip),
          checksums: toAsset(sums),
        },
      });
    } catch {
      this.cachedUntil = this.now() + 60000;
      return this.set({ status: 'error', message: '无法检查更新，请检查网络并重试。' });
    }
  }
}
