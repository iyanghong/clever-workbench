import type { UpdateSnapshot, UpdateAsset } from '../src/update-types';

export const RELEASES_URL = 'https://github.com/iyanghong/clever-workbench/releases';
const LATEST = 'https://api.github.com/repos/iyanghong/clever-workbench/releases/latest';
interface Options {
  currentVersion: string;
  packaged: boolean;
  platform: string;
  arch: string;
  fetch?: typeof fetch;
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
export class UpdateCoordinator {
  private state: UpdateSnapshot;
  private listeners = new Set<(state: UpdateSnapshot) => void>();
  private pending?: Promise<UpdateSnapshot>;
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
      const response = await (this.options.fetch ?? fetch)(LATEST, {
        headers: { Accept: 'application/vnd.github+json', 'User-Agent': 'Clever-Workbench' },
        redirect: 'error',
        signal: AbortSignal.timeout(15000),
      });
      this.cachedUntil = this.now() + 20 * 60 * 1000;
      if (response.status === 404)
        return this.set({ status: 'no-release', message: '尚无公开的正式 Release。' });
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
