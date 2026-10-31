import { describe, expect, it, vi } from 'vitest';
import { UpdateCoordinator } from '../electron/update';
import { resolveUpdateTarget } from '../electron/update-launcher';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

const asset = (name: string) => ({
  name,
  size: 123,
  browser_download_url: `https://github.com/iyanghong/clever-workbench/releases/download/v0.10.0/${name}`,
});
const release = {
  tag_name: 'v0.10.0',
  draft: false,
  prerelease: false,
  published_at: '2026-10-19T00:00:00Z',
  body: 'New release',
  html_url: 'https://github.com/iyanghong/clever-workbench/releases/tag/v0.10.0',
  assets: [asset('Clever-Workbench-0.10.0-arm64.zip'), asset('SHA256SUMS')],
};
const create = (fetcher: typeof fetch = async () => Response.json(release)) =>
  new UpdateCoordinator({
    currentVersion: '0.9.0',
    packaged: true,
    platform: 'darwin',
    arch: 'arm64',
    fetch: fetcher,
  });
describe('application update operations', () => {
  it('reports an unusable installation before download and rechecks the location before fetching assets', async () => {
    const directory = await fs.mkdtemp(path.join(os.tmpdir(), 'cwb-update-location-'));
    const translocated =
      '/private/var/folders/test/AppTranslocation/nonce/d/Clever Workbench.app/Contents/MacOS/Clever Workbench';
    let executable = translocated;
    const requested: string[] = [];
    const updates = new UpdateCoordinator({
      currentVersion: '0.9.0',
      packaged: true,
      platform: 'darwin',
      arch: 'arm64',
      stagingDirectory: path.join(directory, 'staging'),
      preflight: async () => {
        await resolveUpdateTarget(executable);
      },
      fetch: async (url) => {
        requested.push(String(url));
        return Response.json(release);
      },
    });
    try {
      expect(await updates.check()).toMatchObject({
        status: 'available',
        release: { version: '0.10.0' },
        installationIssue: expect.stringMatching(/macOS.*隔离/),
      });
      expect(await updates.download()).toMatchObject({
        status: 'available',
        installationIssue: expect.stringMatching(/macOS.*隔离/),
      });
      executable = path.join(directory, 'Installed.app/Contents/MacOS/App');
      await fs.mkdir(path.dirname(executable), { recursive: true });
      expect((await updates.check(true)).installationIssue).toBeUndefined();
      executable = translocated;
      expect((await updates.download()).installationIssue).toMatch(/macOS.*隔离/);
      expect(requested.every((url) => url.endsWith('/releases/latest'))).toBe(true);
      expect(await fs.readdir(directory)).toEqual(['Installed.app']);
    } finally {
      await fs.rm(directory, { recursive: true, force: true });
    }
  });
  it('checks the fixed private repository with the local GitHub credential without exposing it in state', async () => {
    let authorization: string | null = null;
    const updates = new UpdateCoordinator({
      currentVersion: '0.9.0',
      packaged: true,
      platform: 'darwin',
      arch: 'arm64',
      githubCredential: async () => 'fictional-private-release-token',
      fetch: async (url, init) => {
        expect(String(url)).toBe(
          'https://api.github.com/repos/iyanghong/clever-workbench/releases/latest',
        );
        authorization = new Headers(init?.headers).get('Authorization');
        return Response.json(release);
      },
    });
    expect((await updates.check()).status).toBe('available');
    expect(authorization).toBe('Bearer fictional-private-release-token');
    expect(JSON.stringify(updates.snapshot())).not.toContain('fictional-private-release-token');
  });
  it('reports expired GitHub login without exposing the credential or claiming no update', async () => {
    const updates = new UpdateCoordinator({
      currentVersion: '0.9.0',
      packaged: true,
      platform: 'darwin',
      arch: 'arm64',
      githubCredential: async () => 'fictional-expired-token',
      fetch: async () => new Response('', { status: 401 }),
    });
    expect(await updates.check()).toMatchObject({
      status: 'error',
      message: '本机 GitHub 登录已失效，请重新登录后检查更新。',
    });
    expect(JSON.stringify(updates.snapshot())).not.toContain('fictional-expired-token');
  });
  it('resumes startup and periodic checks after health confirmation and keeps its recovery summary', async () => {
    vi.useFakeTimers();
    const updates = create();
    try {
      updates.setInstallationState({ status: 'validating' });
      updates.finishHealthCheck('success', 'Healthy', true);
      await vi.advanceTimersByTimeAsync(1);
      expect(updates.snapshot()).toMatchObject({
        status: 'available',
        recovery: { outcome: 'success', message: 'Healthy' },
      });
      const checked = updates.snapshot().checkedAt;
      await vi.advanceTimersByTimeAsync(30 * 60 * 1000);
      expect(updates.snapshot().checkedAt).not.toBe(checked);
    } finally {
      updates.stop();
      vi.useRealTimers();
    }
  });
  it('keeps network and rate limit failures distinct and respects retry time even on manual checks', async () => {
    let online = false;
    let now = 1000000;
    const updates = new UpdateCoordinator({
      currentVersion: '0.1.0',
      packaged: true,
      platform: 'darwin',
      arch: 'arm64',
      now: () => now,
      fetch: async () =>
        online
          ? Response.json(release)
          : new Response('', { status: 429, headers: { 'retry-after': '60' } }),
    });
    expect(await updates.check()).toMatchObject({
      status: 'error',
      retryAt: new Date(1060000).toISOString(),
    });
    online = true;
    expect((await updates.check(true)).status).toBe('error');
    now += 60001;
    expect((await updates.check(true)).status).toBe('available');
    expect(
      (
        await create(async () => {
          throw Error('offline');
        }).check()
      ).status,
    ).toBe('error');
    expect((await create(async () => new Response('', { status: 404 })).check()).status).toBe(
      'no-release',
    );
  });
  it('shares concurrent checks and caches their observable result', async () => {
    let resolve!: (response: Response) => void;
    const response = new Promise<Response>((done) => {
      resolve = done;
    });
    const updates = create(() => response);
    const a = updates.check(),
      b = updates.check();
    resolve(Response.json(release));
    await expect(Promise.all([a, b])).resolves.toHaveLength(2);
    expect((await updates.check()).status).toBe('available');
  });
  it.each([
    [{ ...release, tag_name: 'v0.8.0' }, 'up-to-date'],
    [{ ...release, prerelease: true }, 'no-release'],
    [{ ...release, tag_name: 'v1.0.0-beta' }, 'no-release'],
    [{ ...release, assets: [] }, 'incompatible'],
    [
      {
        ...release,
        assets: [
          asset('evil-arm64.zip'),
          { ...asset('SHA256SUMS'), browser_download_url: 'https://evil.com/file' },
        ],
      },
      'incompatible',
    ],
  ])(
    'distinguishes release availability without promising an unusable update',
    async (body, status) => {
      expect((await create(async () => Response.json(body)).check()).status).toBe(status);
    },
  );
  it('disables development and unsupported architecture without networking', async () => {
    const updates = new UpdateCoordinator({
      currentVersion: '0.1.0',
      packaged: false,
      platform: 'darwin',
      arch: 'arm64',
      fetch: async () => {
        throw Error('must not fetch');
      },
    });
    expect((await updates.check()).status).toBe('unsupported');
  });
  it('discovers a newer stable version through numeric version ordering and notifies subscribers', async () => {
    const updates = create();
    const seen: string[] = [];
    updates.subscribe((value) => seen.push(value.status));
    expect(await updates.check()).toMatchObject({
      status: 'available',
      currentVersion: '0.9.0',
      release: { version: '0.10.0', notes: 'New release' },
    });
    expect(seen).toEqual(['checking', 'available']);
  });
});
