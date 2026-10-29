import { test, expect } from 'vitest';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { ZipFile } from 'yazl';
import { UpdateCoordinator } from '../electron/update';
import { appendPartial, openPartial } from '../electron/update-partial';

async function bundle() {
  const zip = new ZipFile();
  zip.addBuffer(Buffer.from('plist'), 'Clever Workbench.app/Contents/Info.plist');
  zip.addBuffer(Buffer.from('executable'), 'Clever Workbench.app/Contents/MacOS/Clever Workbench', {
    mode: 0o100755,
  });
  zip.end();
  const chunks: Buffer[] = [];
  for await (const chunk of zip.outputStream) chunks.push(Buffer.from(chunk));
  return Buffer.concat(chunks);
}

function brokenStream(bytes: Buffer, count: number) {
  let sent = false;
  return new ReadableStream<Uint8Array>({
    pull(controller) {
      if (!sent) {
        controller.enqueue(bytes.subarray(0, count));
        sent = true;
      } else controller.error(Error('net::ERR_HTTP2_PROTOCOL_ERROR'));
    },
  });
}

function privateUpdater(
  root: string,
  zip: Buffer,
  onCdn: (range: string | null, call: number) => Response,
  policy: Partial<{ idleTimeoutMs: number; totalTimeoutMs: number }> = {},
  checksumFailures = 0,
) {
  const name = 'Clever-Workbench-0.2.0-arm64.zip';
  const sums = Buffer.from(`${createHash('sha256').update(zip).digest('hex')}  ${name}\n`);
  const api = 'https://api.github.com/repos/iyanghong/clever-workbench/releases/assets/';
  const cdn = 'https://release-assets.githubusercontent.com/resume.zip?signed=example';
  const asset = (name: string, size: number, id: number) => ({
    name,
    size,
    url: api + id,
    browser_download_url: `https://github.com/iyanghong/clever-workbench/releases/download/v0.2.0/${name}`,
  });
  const ranges: (string | null)[] = [];
  let checksumCalls = 0;
  const updates = new UpdateCoordinator({
    currentVersion: '0.1.0',
    packaged: true,
    platform: 'darwin',
    arch: 'arm64',
    stagingDirectory: root,
    downloadPolicy: { retryDelaysMs: [0, 0], ...policy },
    githubCredential: async () => 'fictional-private-token',
    fetch: async (input, init) => {
      const url = String(input),
        headers = new Headers(init?.headers);
      if (url.endsWith('/latest'))
        return Response.json({
          tag_name: 'v0.2.0',
          draft: false,
          prerelease: false,
          assets: [asset(name, zip.length, 91), asset('SHA256SUMS', sums.length, 92)],
        });
      if (url === api + '92') {
        checksumCalls++;
        return checksumCalls <= checksumFailures
          ? new Response(null, { status: 503 })
          : new Response(new Uint8Array(sums));
      }
      if (url === api + '91') {
        expect(headers.get('Authorization')).toBe('Bearer fictional-private-token');
        return new Response(null, { status: 302, headers: { location: cdn } });
      }
      if (url === cdn) {
        expect(headers.has('Authorization')).toBe(false);
        ranges.push(headers.get('Range'));
        return onCdn(headers.get('Range'), ranges.length);
      }
      throw Error('Unexpected update URL');
    },
    runCommand: async (command) =>
      command.endsWith('plutil')
        ? JSON.stringify({
            CFBundleIdentifier: 'com.cleverworkbench.desktop',
            CFBundleShortVersionString: '0.2.0',
            CFBundleExecutable: 'Clever Workbench',
          })
        : command.endsWith('lipo')
          ? 'arm64'
          : '',
  });
  return { updates, ranges, checksumCalls: () => checksumCalls };
}

test('a transient private asset stream failure resumes only after verified range and full hash', async () => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'update-resume-'));
  const zip = await bundle();
  const name = 'Clever-Workbench-0.2.0-arm64.zip';
  const sums = Buffer.from(`${createHash('sha256').update(zip).digest('hex')}  ${name}\n`);
  const api = 'https://api.github.com/repos/iyanghong/clever-workbench/releases/assets/';
  const cdn = 'https://release-assets.githubusercontent.com/resume.zip?signed=example';
  const asset = (name: string, size: number, id: number) => ({
    name,
    size,
    url: api + id,
    browser_download_url: `https://github.com/iyanghong/clever-workbench/releases/download/v0.2.0/${name}`,
  });
  const ranges: string[] = [];
  let calls = 0;
  const updates = new UpdateCoordinator({
    currentVersion: '0.1.0',
    packaged: true,
    platform: 'darwin',
    arch: 'arm64',
    stagingDirectory: root,
    githubCredential: async () => 'fictional-private-token',
    fetch: async (input, init) => {
      const url = String(input),
        headers = new Headers(init?.headers);
      if (url.endsWith('/latest'))
        return Response.json({
          tag_name: 'v0.2.0',
          draft: false,
          prerelease: false,
          assets: [asset(name, zip.length, 91), asset('SHA256SUMS', sums.length, 92)],
        });
      if (url === api + '92') return new Response(new Uint8Array(sums));
      if (url === api + '91') {
        expect(headers.get('Authorization')).toBe('Bearer fictional-private-token');
        return new Response(null, { status: 302, headers: { location: cdn } });
      }
      if (url === cdn) {
        expect(headers.has('Authorization')).toBe(false);
        ranges.push(headers.get('Range') || '');
        calls++;
        if (calls === 1) return new Response(brokenStream(zip, 16));
        return new Response(new Uint8Array(zip.subarray(16)), {
          status: 206,
          headers: { 'Content-Range': `bytes 16-${zip.length - 1}/${zip.length}` },
        });
      }
      throw Error('Unexpected update URL');
    },
    runCommand: async (command) =>
      command.endsWith('plutil')
        ? JSON.stringify({
            CFBundleIdentifier: 'com.cleverworkbench.desktop',
            CFBundleShortVersionString: '0.2.0',
            CFBundleExecutable: 'Clever Workbench',
          })
        : command.endsWith('lipo')
          ? 'arm64'
          : '',
  });
  try {
    await updates.check();
    expect((await updates.download()).status).toBe('ready');
    expect(ranges).toEqual(['', 'bytes=16-']);
    expect(
      await fs.readFile(path.join(updates.preparedUpdate()!.stageDirectory, 'update.zip')),
    ).toEqual(zip);
  } finally {
    await fs.rm(root, { recursive: true, force: true });
  }
});

test('unfinished bytes survive a restart only for the same verified release', async () => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'update-restart-'));
  const zip = await bundle();
  try {
    const first = privateUpdater(root, zip, (range) => {
      const offset = range ? Number(range.slice('bytes='.length, -1)) : 0;
      return new Response(
        brokenStream(zip.subarray(offset), 16),
        offset
          ? {
              status: 206,
              headers: { 'Content-Range': `bytes ${offset}-${zip.length - 1}/${zip.length}` },
            }
          : undefined,
      );
    });
    await first.updates.check();
    expect((await first.updates.download()).status).toBe('error');
    const partial = path.join(root, 'partial-v0.2.0');
    expect((await fs.stat(path.join(partial, 'update.zip'))).size).toBe(48);
    const manifest = await fs.readFile(path.join(partial, 'manifest.json'), 'utf8');
    expect(manifest).not.toContain('fictional-private-token');
    expect(manifest).not.toContain('signed=example');
    const second = privateUpdater(root, zip, (range) => {
      expect(range).toBe('bytes=48-');
      return new Response(new Uint8Array(zip.subarray(48)), {
        status: 206,
        headers: { 'Content-Range': `bytes 48-${zip.length - 1}/${zip.length}` },
      });
    });
    await second.updates.check();
    expect((await second.updates.download()).status).toBe('ready');
    expect(
      await fs.readFile(path.join(second.updates.preparedUpdate()!.stageDirectory, 'update.zip')),
    ).toEqual(zip);
    expect(await fs.readdir(root)).toHaveLength(1);
  } finally {
    await fs.rm(root, { recursive: true, force: true });
  }
});

test('server ignoring Range restarts from byte zero without duplicating the old prefix', async () => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'update-range-200-'));
  const zip = await bundle();
  try {
    const { updates, ranges } = privateUpdater(root, zip, (_range, call) =>
      call === 1 ? new Response(brokenStream(zip, 16)) : new Response(new Uint8Array(zip)),
    );
    await updates.check();
    expect((await updates.download()).status).toBe('ready');
    expect(ranges).toEqual([null, 'bytes=16-']);
    expect(
      await fs.readFile(path.join(updates.preparedUpdate()!.stageDirectory, 'update.zip')),
    ).toEqual(zip);
  } finally {
    await fs.rm(root, { recursive: true, force: true });
  }
});

test('invalid Range response cannot be appended and falls back to a full download', async () => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'update-range-416-'));
  const zip = await bundle();
  try {
    const { updates, ranges } = privateUpdater(root, zip, (_range, call) =>
      call === 1
        ? new Response(brokenStream(zip, 16))
        : call === 2
          ? new Response(null, { status: 416 })
          : new Response(new Uint8Array(zip)),
    );
    await updates.check();
    expect((await updates.download()).status).toBe('ready');
    expect(ranges).toEqual([null, 'bytes=16-', null]);
    expect(
      await fs.readFile(path.join(updates.preparedUpdate()!.stageDirectory, 'update.zip')),
    ).toEqual(zip);
  } finally {
    await fs.rm(root, { recursive: true, force: true });
  }
});

test('a shorter valid partial response continues from its verified end', async () => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'update-short-range-'));
  const zip = await bundle();
  try {
    const { updates, ranges } = privateUpdater(root, zip, (_range, call) =>
      call === 1
        ? new Response(brokenStream(zip, 16))
        : call === 2
          ? new Response(new Uint8Array(zip.subarray(16, 32)), {
              status: 206,
              headers: { 'Content-Range': `bytes 16-31/${zip.length}` },
            })
          : new Response(new Uint8Array(zip.subarray(32)), {
              status: 206,
              headers: { 'Content-Range': `bytes 32-${zip.length - 1}/${zip.length}` },
            }),
    );
    await updates.check();
    expect((await updates.download()).status).toBe('ready');
    expect(ranges).toEqual([null, 'bytes=16-', 'bytes=32-']);
  } finally {
    await fs.rm(root, { recursive: true, force: true });
  }
});

test('a mismatched Content-Range is discarded before another full request', async () => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'update-bad-range-'));
  const zip = await bundle();
  try {
    const { updates, ranges } = privateUpdater(root, zip, (_range, call) =>
      call === 1
        ? new Response(brokenStream(zip, 16))
        : call === 2
          ? new Response(new Uint8Array(zip.subarray(17)), {
              status: 206,
              headers: { 'Content-Range': `bytes 17-${zip.length - 1}/${zip.length}` },
            })
          : new Response(new Uint8Array(zip)),
    );
    await updates.check();
    expect((await updates.download()).status).toBe('ready');
    expect(ranges).toEqual([null, 'bytes=16-', null]);
  } finally {
    await fs.rm(root, { recursive: true, force: true });
  }
});

test('a temporary service error retries but an authorization error stops immediately', async () => {
  const zip = await bundle();
  const retryRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'update-service-retry-'));
  const deniedRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'update-auth-denied-'));
  try {
    const temporary = privateUpdater(retryRoot, zip, (_range, call) =>
      call === 1 ? new Response(null, { status: 503 }) : new Response(new Uint8Array(zip)),
    );
    await temporary.updates.check();
    expect((await temporary.updates.download()).status).toBe('ready');
    expect(temporary.ranges).toHaveLength(2);

    const denied = privateUpdater(deniedRoot, zip, () => new Response(null, { status: 401 }));
    await denied.updates.check();
    expect(await denied.updates.download()).toMatchObject({
      status: 'error',
      downloadErrorCode: 'HTTP_401',
      downloadAttempt: { current: 1, maximum: 3 },
    });
    expect(denied.ranges).toHaveLength(1);
    expect(await fs.readdir(deniedRoot)).toEqual([]);
  } finally {
    await fs.rm(retryRoot, { recursive: true, force: true });
    await fs.rm(deniedRoot, { recursive: true, force: true });
  }
});

test('checksum retries and ZIP retries share one three-attempt task budget', async () => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'update-attempt-budget-'));
  const zip = await bundle();
  try {
    const { updates, ranges, checksumCalls } = privateUpdater(
      root,
      zip,
      () => new Response(brokenStream(zip, 16)),
      {},
      2,
    );
    await updates.check();
    expect(await updates.download()).toMatchObject({
      status: 'error',
      downloadAttempt: { current: 3, maximum: 3 },
    });
    expect(checksumCalls()).toBe(3);
    expect(ranges).toHaveLength(1);
  } finally {
    await fs.rm(root, { recursive: true, force: true });
  }
});

test('changing target version cleans only the updater-owned older partial', async () => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'update-version-change-'));
  const outside = await fs.mkdtemp(path.join(os.tmpdir(), 'update-not-owned-'));
  try {
    const old = await openPartial(root, {
      version: '0.2.0',
      name: 'Clever-Workbench-0.2.0-arm64.zip',
      size: 100,
      sha256: 'a'.repeat(64),
      assetId: null,
    });
    await appendPartial(old.filename, Buffer.from('partial'));
    await fs.symlink(outside, path.join(root, 'partial-v0.1.9'));
    const current = await openPartial(root, {
      version: '0.3.0',
      name: 'Clever-Workbench-0.3.0-arm64.zip',
      size: 100,
      sha256: 'b'.repeat(64),
      assetId: null,
    });
    expect(current.received).toBe(0);
    expect(await fs.readdir(root)).toEqual(['partial-v0.1.9', 'partial-v0.3.0']);
    expect((await fs.stat(outside)).isDirectory()).toBe(true);
  } finally {
    await fs.rm(root, { recursive: true, force: true });
    await fs.rm(outside, { recursive: true, force: true });
  }
});

test('a replaced partial-file symlink is rejected without touching its target', async () => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'update-symlink-'));
  const outside = path.join(
    await fs.mkdtemp(path.join(os.tmpdir(), 'update-outside-')),
    'user.txt',
  );
  const identity = {
    version: '0.2.0',
    name: 'Clever-Workbench-0.2.0-arm64.zip',
    size: 100,
    sha256: 'a'.repeat(64),
    assetId: null,
  };
  try {
    const partial = await openPartial(root, identity);
    await fs.writeFile(outside, 'keep user data');
    await fs.rm(partial.filename);
    await fs.symlink(outside, partial.filename);
    await expect(openPartial(root, identity)).rejects.toThrow('更新暂存文件不安全');
    expect(await fs.readFile(outside, 'utf8')).toBe('keep user data');
  } finally {
    await fs.rm(root, { recursive: true, force: true });
    await fs.rm(path.dirname(outside), { recursive: true, force: true });
  }
});

test('staging directory write failure is not retried or exposed as a raw local path', async () => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'update-readonly-'));
  const zip = await bundle();
  try {
    await fs.chmod(root, 0o500);
    const { updates, ranges } = privateUpdater(root, zip, () => new Response(new Uint8Array(zip)));
    await updates.check();
    const result = await updates.download();
    expect(result.status).toBe('error');
    expect(result.downloadErrorCode).toBe('STAGING_IO');
    expect(result.message).not.toContain(root);
    expect(ranges).toEqual([]);
  } finally {
    await fs.chmod(root, 0o700);
    await fs.rm(root, { recursive: true, force: true });
  }
});

test('a user cancellation stops the stream and removes only this incomplete download', async () => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'update-cancel-'));
  const zip = await bundle();
  try {
    const { updates } = privateUpdater(
      root,
      zip,
      () =>
        new Response(
          new ReadableStream({
            start(controller) {
              controller.enqueue(zip.subarray(0, 16));
            },
          }),
        ),
    );
    await updates.check();
    const running = updates.download();
    const deadline = Date.now() + 2000;
    while (updates.snapshot().progress?.received !== 16 && Date.now() < deadline)
      await new Promise((resolve) => setTimeout(resolve, 5));
    expect(updates.snapshot().progress?.received).toBe(16);
    expect((await updates.cancelDownload()).status).toBe('available');
    expect((await running).status).toBe('available');
    expect(await fs.readdir(root)).toEqual([]);
  } finally {
    await fs.rm(root, { recursive: true, force: true });
  }
});

test('idle timeout retries three times and retains safe bytes for a later manual retry', async () => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'update-idle-'));
  const zip = await bundle();
  try {
    const { updates } = privateUpdater(
      root,
      zip,
      () =>
        new Response(
          new ReadableStream({
            start(controller) {
              controller.enqueue(zip.subarray(0, 16));
            },
          }),
        ),
      { idleTimeoutMs: 20, totalTimeoutMs: 1000 },
    );
    await updates.check();
    expect(await updates.download()).toMatchObject({
      status: 'error',
      downloadAttempt: { current: 3, maximum: 3 },
      downloadErrorCode: 'NETWORK_IDLE',
    });
    expect((await fs.stat(path.join(root, 'partial-v0.2.0', 'update.zip'))).size).toBe(16);
  } finally {
    await fs.rm(root, { recursive: true, force: true });
  }
});

test('total task limit preserves a partial download without claiming it is ready', async () => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'update-limit-'));
  const zip = await bundle();
  try {
    const { updates } = privateUpdater(
      root,
      zip,
      () =>
        new Response(
          new ReadableStream({
            start(controller) {
              controller.enqueue(zip.subarray(0, 16));
            },
          }),
        ),
      { idleTimeoutMs: 1000, totalTimeoutMs: 30 },
    );
    await updates.check();
    expect(await updates.download()).toMatchObject({
      status: 'error',
      downloadErrorCode: 'DOWNLOAD_TIME_LIMIT',
    });
    expect(updates.preparedUpdate()).toBeUndefined();
    expect((await fs.stat(path.join(root, 'partial-v0.2.0', 'update.zip'))).size).toBe(16);
  } finally {
    await fs.rm(root, { recursive: true, force: true });
  }
});

test('a partial download older than 24 hours is discarded before requesting the asset', async () => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'update-expired-'));
  const zip = await bundle();
  try {
    const first = privateUpdater(root, zip, () => new Response(brokenStream(zip, 16)));
    await first.updates.check();
    expect((await first.updates.download()).status).toBe('error');
    const manifestPath = path.join(root, 'partial-v0.2.0', 'manifest.json');
    const manifest = JSON.parse(await fs.readFile(manifestPath, 'utf8'));
    manifest.createdAt = Date.now() - 25 * 60 * 60 * 1000;
    await fs.writeFile(manifestPath, JSON.stringify(manifest));
    const second = privateUpdater(root, zip, () => new Response(new Uint8Array(zip)));
    await second.updates.check();
    expect((await second.updates.download()).status).toBe('ready');
    expect(second.ranges).toEqual([null]);
  } finally {
    await fs.rm(root, { recursive: true, force: true });
  }
});

test('a modified retained prefix cannot become an installable package', async () => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'update-corrupt-prefix-'));
  const zip = await bundle();
  try {
    const first = privateUpdater(root, zip, () => new Response(brokenStream(zip, 16)));
    await first.updates.check();
    expect((await first.updates.download()).status).toBe('error');
    const file = path.join(root, 'partial-v0.2.0', 'update.zip');
    const handle = await fs.open(file, 'r+');
    await handle.write(Buffer.from('x'), 0, 1, 0);
    await handle.close();
    const second = privateUpdater(
      root,
      zip,
      () =>
        new Response(new Uint8Array(zip.subarray(16)), {
          status: 206,
          headers: { 'Content-Range': `bytes 16-${zip.length - 1}/${zip.length}` },
        }),
    );
    await second.updates.check();
    expect(await second.updates.download()).toMatchObject({
      status: 'error',
      message: '更新包校验失败，请重新下载。',
    });
    expect(second.updates.preparedUpdate()).toBeUndefined();
    expect(await fs.readdir(root)).toEqual([]);
  } finally {
    await fs.rm(root, { recursive: true, force: true });
  }
});
