import type { UpdateSnapshot, UpdateAsset } from '../src/update-types';
import fs from 'node:fs/promises';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import { setTimeout as delay } from 'node:timers/promises';
import { extractBundle, runCommand, type RunCommand } from './update-package';
import {
  appendPartial,
  digestPartial,
  discardPartial,
  openPartial,
  prunePartials,
  resetPartial,
} from './update-partial';

export const RELEASES_URL = 'https://github.com/iyanghong/clever-workbench/releases';
const LATEST = 'https://api.github.com/repos/iyanghong/clever-workbench/releases/latest';
interface Options {
  stagingDirectory?: string;
  runCommand?: RunCommand;
  currentVersion: string;
  packaged: boolean;
  platform: string;
  arch: string;
  preflight?: () => Promise<void>;
  fetch?: typeof fetch;
  githubCredential?: () => Promise<string | undefined>;
  now?: () => number;
  downloadPolicy?: Partial<{
    idleTimeoutMs: number;
    totalTimeoutMs: number;
    retryDelaysMs: [number, number];
  }>;
}
const retryCount = 3;
const defaultPolicy = {
  idleTimeoutMs: 2 * 60 * 1000,
  totalTimeoutMs: 2 * 60 * 60 * 1000,
  retryDelaysMs: [2000, 5000] as [number, number],
};
type FailureKind = 'retryable' | 'fatal' | 'cancelled' | 'limit' | 'restart';
class DownloadFailure extends Error {
  constructor(
    message: string,
    readonly kind: FailureKind,
    readonly code = '',
    readonly waitMs = 0,
  ) {
    super(message);
  }
}
function networkCode(error: unknown) {
  const message = error instanceof Error ? error.message : String(error);
  const chromium = message.match(/net::ERR_[A-Z0-9_]+/)?.[0];
  return chromium && chromium.length <= 64
    ? chromium
    : message.includes('Timeout')
      ? 'NETWORK_TIMEOUT'
      : 'NETWORK_INTERRUPTED';
}
function contentRange(value: string | null) {
  const match = value?.match(/^bytes (\d+)-(\d+)\/(\d+)$/);
  return match ? match.slice(1).map(Number) : null;
}
function retryAfter(value: string | null) {
  if (!value) return 0;
  const seconds = Number(value);
  const wait = Number.isFinite(seconds) ? seconds * 1000 : Date.parse(value) - Date.now();
  return Number.isFinite(wait) ? Math.max(0, Math.min(60000, wait)) : 0;
}
async function staging<T>(operation: () => Promise<T>): Promise<T> {
  try {
    return await operation();
  } catch {
    throw new DownloadFailure(
      '更新暂存文件读写失败，请检查磁盘空间与目录权限。',
      'fatal',
      'STAGING_IO',
    );
  }
}
async function readChunk(reader: ReadableStreamDefaultReader<Uint8Array>, signal: AbortSignal) {
  if (signal.aborted) throw Error('下载已中断。');
  let abort: (() => void) | undefined;
  const interrupted = new Promise<never>((_, reject) => {
    abort = () => reject(Error('下载已中断。'));
    signal.addEventListener('abort', abort, { once: true });
  });
  try {
    return await Promise.race([reader.read(), interrupted]);
  } finally {
    if (abort) signal.removeEventListener('abort', abort);
  }
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
  private downloadAbort?: AbortController;
  private prepared?: { appPath: string; version: string; stageDirectory: string };
  preparedUpdate() {
    return this.state.status === 'ready' && this.prepared ? { ...this.prepared } : undefined;
  }
  async preflight(): Promise<void> {
    try {
      await this.options.preflight?.();
    } catch (error) {
      const installationIssue =
        error instanceof Error ? error.message : '当前应用位置无法自动安装更新。';
      this.set({ ...this.state, installationIssue });
      throw error;
    }
    if (this.state.installationIssue) {
      this.set({
        ...this.state,
        message:
          this.state.message === this.state.installationIssue ? undefined : this.state.message,
        installationIssue: undefined,
      });
    }
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
    this.downloadAbort = new AbortController();
    this.downloading = this.downloadRelease(this.downloadAbort.signal).finally(() => {
      this.downloading = undefined;
      this.downloadAbort = undefined;
    });
    return this.downloading;
  }
  async cancelDownload(): Promise<UpdateSnapshot> {
    if (!this.downloading) return this.snapshot();
    this.downloadAbort?.abort('cancelled');
    return this.downloading;
  }
  private async downloadRelease(cancelSignal: AbortSignal) {
    try {
      await this.preflight();
    } catch {
      return this.snapshot();
    }
    const release = this.state.release!;
    let directory: string | undefined;
    let received = 0;
    let attempts = 0;
    let keepPartial = false;
    this.prepared = undefined;
    const policy = { ...defaultPolicy, ...this.options.downloadPolicy };
    const totalAbort = AbortSignal.timeout(policy.totalTimeoutMs);
    const taskSignal = AbortSignal.any([cancelSignal, totalAbort]);
    try {
      await this.readCredential();
      this.set({
        status: 'downloading',
        release,
        progress: { received: 0, total: release.zip.size },
      });
      const sums = (
        await this.downloadAsset(
          release.checksums,
          undefined,
          release,
          taskSignal,
          policy,
          (_value, attempt) => {
            attempts = attempt;
            this.set({
              status: 'downloading',
              release,
              progress: { received: 0, total: release.zip.size },
              downloadAttempt: { current: attempt, maximum: retryCount },
            });
          },
        )
      ).toString('utf8');
      const checksumAttempt = attempts;
      const matching = sums
        .split(/\r?\n/)
        .filter((line) => line.match(/^([a-fA-F0-9]{64}) [ *](.+)$/)?.[2] === release.zip.name);
      if (matching.length !== 1) throw Error('更新包缺少唯一的 SHA-256 校验。');
      const expectedHash = matching[0].slice(0, 64).toLowerCase();
      const partial = await openPartial(
        this.options.stagingDirectory!,
        {
          version: release.version,
          name: release.zip.name,
          size: release.zip.size,
          sha256: expectedHash,
          assetId: Number(release.zip.apiUrl?.match(/\/([1-9]\d*)$/)?.[1]) || null,
        },
        this.now(),
      );
      directory = partial.directory;
      received = partial.received;
      this.set({ status: 'downloading', release, progress: { received, total: release.zip.size } });
      const digest = (
        await this.downloadAsset(
          release.zip,
          partial.filename,
          release,
          taskSignal,
          policy,
          (value, attempt) => {
            received = value;
            attempts = attempt;
            this.set({
              status: 'downloading',
              release,
              progress: { received, total: release.zip.size },
              downloadAttempt: { current: attempt, maximum: retryCount },
            });
          },
          partial.received,
          retryCount - checksumAttempt + 1,
          checksumAttempt,
        )
      ).toString();
      if (digest !== expectedHash) throw Error('更新包校验失败，请重新下载。');
      if (cancelSignal.aborted) throw new DownloadFailure('下载已取消。', 'cancelled');
      this.set({ status: 'verifying', release });
      const appPath = await extractBundle(
        partial.filename,
        directory,
        release.version,
        this.options.runCommand ?? runCommand,
      );
      if (cancelSignal.aborted) throw new DownloadFailure('下载已取消。', 'cancelled');
      const preparedDirectory = path.join(
        this.options.stagingDirectory!,
        `release-${randomUUID()}`,
      );
      await fs.rename(directory, preparedDirectory);
      this.prepared = {
        appPath: path.join(preparedDirectory, path.relative(directory, appPath)),
        version: release.version,
        stageDirectory: preparedDirectory,
      };
      directory = undefined;
      return this.set({ status: 'ready', release, preparedId: randomUUID() });
    } catch (error) {
      const cancelled = cancelSignal.aborted;
      const limit = totalAbort.aborted && !cancelled;
      const failure = error instanceof DownloadFailure ? error : undefined;
      const ioFailure =
        !failure &&
        !!error &&
        typeof error === 'object' &&
        typeof (error as NodeJS.ErrnoException).code === 'string';
      keepPartial =
        !!directory &&
        !cancelled &&
        (limit || failure?.kind === 'retryable' || failure?.kind === 'limit');
      if (directory && !keepPartial) await discardPartial(directory).catch(() => {});
      if (cancelled && !directory && this.options.stagingDirectory)
        await discardPartial(
          path.join(this.options.stagingDirectory, `partial-v${release.version}`),
        ).catch(() => {});
      if (cancelled)
        return this.set({
          status: 'available',
          release,
          message: '已取消更新下载。',
          progress: undefined,
          downloadAttempt: undefined,
        });
      const code = failure?.code || (limit ? 'DOWNLOAD_TIME_LIMIT' : ioFailure ? 'STAGING_IO' : '');
      const message = limit
        ? '下载时间已达上限，可稍后继续或查看正式 Release 手动安装。'
        : failure?.kind === 'retryable'
          ? '下载连接中断，可重试或查看正式 Release 手动安装。'
          : ioFailure
            ? '更新文件读写失败，请检查磁盘空间与目录权限。'
            : error instanceof Error
              ? error.message
              : '下载或校验更新失败。';
      return this.set({
        status: 'error',
        release,
        message,
        progress: { received, total: release.zip.size },
        downloadAttempt: { current: attempts, maximum: retryCount },
        downloadErrorCode: code || undefined,
      });
    }
  }
  private async assetResponse(
    asset: UpdateAsset,
    release: NonNullable<UpdateSnapshot['release']>,
    offset: number,
    signal: AbortSignal,
  ): Promise<Response> {
    if (!trustedAsset(asset.url, `v${release.version}`))
      throw new DownloadFailure('更新来源无效。', 'fatal');
    if (this.githubToken && (!asset.apiUrl || !trustedApiAsset(asset.apiUrl)))
      throw new DownloadFailure('Release 缺少有效的 GitHub 授权下载地址。', 'fatal');
    let url = this.githubToken ? asset.apiUrl! : asset.url;
    for (let redirect = 0; redirect < 5; redirect++) {
      const headers: Record<string, string> = {};
      if (offset > 0) headers.Range = `bytes=${offset}-`;
      if (trustedApiAsset(url))
        Object.assign(headers, {
          Accept: 'application/octet-stream',
          'User-Agent': 'Clever-Workbench',
          ...(this.githubToken ? { Authorization: `Bearer ${this.githubToken}` } : {}),
        });
      let response: Response;
      try {
        response = await (this.options.fetch ?? fetch)(url, {
          redirect: 'manual',
          signal,
          headers,
        });
      } catch (error) {
        throw new DownloadFailure('下载连接中断。', 'retryable', networkCode(error));
      }
      if (![301, 302, 303, 307, 308].includes(response.status)) return response;
      const location = response.headers.get('location');
      await response.body?.cancel().catch(() => {});
      if (!location) throw new DownloadFailure('更新重定向无效。', 'fatal');
      let next: URL;
      try {
        next = new URL(location, url);
      } catch {
        throw new DownloadFailure('更新重定向无效。', 'fatal');
      }
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
        throw new DownloadFailure('更新下载被重定向到不可信来源。', 'fatal');
      url = next.href;
    }
    throw new DownloadFailure('更新重定向次数过多。', 'fatal');
  }
  private async downloadAsset(
    asset: UpdateAsset,
    filename: string | undefined,
    release: NonNullable<UpdateSnapshot['release']>,
    taskSignal: AbortSignal,
    policy: typeof defaultPolicy,
    onProgress?: (received: number, attempt: number) => void,
    initial = 0,
    maxAttempts = retryCount,
    firstAttemptNumber = 1,
  ): Promise<Buffer> {
    if (filename && initial === asset.size)
      return Buffer.from(await staging(() => digestPartial(filename)));
    let received = initial;
    for (let attempt = 1; attempt <= maxAttempts; attempt++) {
      if (taskSignal.aborted) throw new DownloadFailure('下载已停止。', 'limit');
      onProgress?.(received, firstAttemptNumber + attempt - 1);
      const idle = new AbortController();
      const signal = AbortSignal.any([taskSignal, idle.signal]);
      let timer: ReturnType<typeof setTimeout>;
      const resetIdle = () => {
        clearTimeout(timer);
        timer = setTimeout(() => idle.abort('idle'), policy.idleTimeoutMs);
        timer.unref?.();
      };
      resetIdle();
      let reader: ReadableStreamDefaultReader<Uint8Array> | undefined;
      try {
        const response = await this.assetResponse(asset, release, received, signal);
        if ([408, 429, 500, 502, 503, 504].includes(response.status)) {
          const wait = retryAfter(response.headers.get('retry-after'));
          await response.body?.cancel().catch(() => {});
          throw new DownloadFailure(
            'GitHub 暂时无法提供更新包。',
            'retryable',
            `HTTP_${response.status}`,
            wait,
          );
        }
        if ([401, 403, 404].includes(response.status)) {
          await response.body?.cancel().catch(() => {});
          throw new DownloadFailure(
            'GitHub 更新包不可访问，请检查本机账号权限。',
            'fatal',
            `HTTP_${response.status}`,
          );
        }
        if (response.status === 416 && filename && received > 0) {
          await response.body?.cancel().catch(() => {});
          if (received === asset.size)
            return Buffer.from(await staging(() => digestPartial(filename)));
          await staging(() => resetPartial(filename));
          received = 0;
          throw new DownloadFailure('下载范围已失效，重新获取完整更新包。', 'restart');
        }
        if (!response.ok || !response.body) {
          await response.body?.cancel().catch(() => {});
          throw new DownloadFailure(
            '下载更新失败，请检查网络后重试。',
            'fatal',
            `HTTP_${response.status}`,
          );
        }
        let expectedSegment: number | undefined;
        if (received > 0) {
          const range = contentRange(response.headers.get('content-range'));
          if (response.status === 200) {
            if (!filename) throw new DownloadFailure('更新响应范围无效。', 'fatal');
            await staging(() => resetPartial(filename));
            received = 0;
            onProgress?.(0, firstAttemptNumber + attempt - 1);
          } else if (
            response.status !== 206 ||
            !range ||
            range[0] !== received ||
            range[1] < received ||
            range[1] >= asset.size ||
            range[2] !== asset.size
          ) {
            await response.body.cancel().catch(() => {});
            if (filename) await staging(() => resetPartial(filename));
            received = 0;
            throw new DownloadFailure('下载范围无法核对，重新获取完整更新包。', 'restart');
          } else expectedSegment = range[1] - range[0] + 1;
        } else if (response.status !== 200) {
          await response.body.cancel().catch(() => {});
          throw new DownloadFailure('更新响应范围无效。', 'fatal');
        }
        reader = response.body.getReader();
        const chunks: Buffer[] = [];
        let segmentReceived = 0;
        for (;;) {
          const next = await readChunk(reader, signal);
          if (next.done) break;
          if (next.value.length === 0) continue;
          received += next.value.length;
          segmentReceived += next.value.length;
          if (received > asset.size) throw new DownloadFailure('下载内容超过声明大小。', 'fatal');
          if (expectedSegment !== undefined && segmentReceived > expectedSegment)
            throw new DownloadFailure('下载范围正文超出声明大小。', 'fatal');
          if (filename) await staging(() => appendPartial(filename, next.value));
          else chunks.push(Buffer.from(next.value));
          onProgress?.(received, firstAttemptNumber + attempt - 1);
          resetIdle();
        }
        if (
          (expectedSegment !== undefined && segmentReceived !== expectedSegment) ||
          received !== asset.size
        )
          throw new DownloadFailure('下载未完成。', 'retryable', 'INCOMPLETE_RESPONSE');
        return filename
          ? Buffer.from(await staging(() => digestPartial(filename)))
          : Buffer.concat(chunks);
      } catch (error) {
        if (taskSignal.aborted) throw new DownloadFailure('下载已停止。', 'limit');
        let failure =
          error instanceof DownloadFailure
            ? error
            : new DownloadFailure('下载连接中断。', 'retryable', networkCode(error));
        if (idle.signal.aborted)
          failure = new DownloadFailure('下载长时间没有进度。', 'retryable', 'NETWORK_IDLE');
        if (failure.kind === 'fatal' || attempt === maxAttempts) throw failure;
        if (filename) received = (await staging(() => fs.lstat(filename))).size;
        else received = 0;
        const wait = Math.max(policy.retryDelaysMs[attempt - 1] ?? 0, failure.waitMs);
        try {
          await delay(wait, undefined, { signal: taskSignal });
        } catch {
          throw new DownloadFailure('下载已停止。', 'limit');
        }
      } finally {
        clearTimeout(timer!);
        await reader?.cancel().catch(() => {});
      }
    }
    throw new DownloadFailure('下载重试次数已用完。', 'retryable');
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
      installationIssue: this.state.installationIssue,
      checkedAt: new Date(this.now()).toISOString(),
      ...value,
    } as UpdateSnapshot;
    for (const listener of this.listeners) listener(this.snapshot());
    return this.snapshot();
  }
  start() {
    if (this.timer) return;
    if (this.options.stagingDirectory)
      void prunePartials(this.options.stagingDirectory, undefined, this.now()).catch(() => {});
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
    if (this.state.status === 'ready') {
      if (force) await this.preflight().catch(() => {});
      return this.snapshot();
    }
    if (this.downloading || ['preparing', 'installing', 'validating'].includes(this.state.status))
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
    // Keep release discovery available even when this copy needs a manual installation.
    await this.preflight().catch(() => {});
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
      if (this.options.stagingDirectory)
        await prunePartials(
          this.options.stagingDirectory,
          release.tag_name.slice(1),
          this.now(),
        ).catch(() => {});
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
