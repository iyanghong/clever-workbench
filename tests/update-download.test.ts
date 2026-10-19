import { test, expect } from 'vitest';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { ZipFile } from 'yazl';
import { UpdateCoordinator } from '../electron/update';

test.skipIf(!process.env.CWB_UPDATE_ZIP)(
  'real release bundle passes native signature, architecture and identity checks',
  async () => {
    const zip = await fs.readFile(process.env.CWB_UPDATE_ZIP!);
    const { version } = JSON.parse(await fs.readFile('package.json', 'utf8'));
    const name = `Clever-Workbench-${version}-arm64.zip`;
    const sums = Buffer.from(`${createHash('sha256').update(zip).digest('hex')}  ${name}\n`);
    const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'real-update-download-'));
    const asset = (name: string, size: number) => ({
      name,
      size,
      browser_download_url: `https://github.com/iyanghong/clever-workbench/releases/download/v${version}/${name}`,
    });
    const updates = new UpdateCoordinator({
      currentVersion: '0.0.0',
      packaged: true,
      platform: 'darwin',
      arch: 'arm64',
      stagingDirectory: dir,
      fetch: async (input) =>
        String(input).endsWith('/latest')
          ? Response.json({
              tag_name: `v${version}`,
              draft: false,
              prerelease: false,
              assets: [asset(name, zip.length), asset('SHA256SUMS', sums.length)],
            })
          : new Response(new Uint8Array(String(input).endsWith('SHA256SUMS') ? sums : zip)),
    });
    try {
      await updates.check();
      expect(await updates.download()).toMatchObject({ status: 'ready' });
      expect(updates.preparedUpdate()?.version).toBe(version);
    } finally {
      await fs.rm(dir, { recursive: true, force: true });
    }
  },
  120000,
);

async function fixture() {
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
async function setup(
  zip: Buffer,
  checksum = createHash('sha256').update(zip).digest('hex'),
  bundleVersion = '0.2.0',
  redirect = false,
) {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'update-download-'));
  const name = 'Clever-Workbench-0.2.0-arm64.zip';
  const sums = Buffer.from(`${checksum}  ${name}\n`);
  const asset = (name: string, size: number) => ({
    name,
    size,
    browser_download_url: `https://github.com/iyanghong/clever-workbench/releases/download/v0.2.0/${name}`,
  });
  const update = new UpdateCoordinator({
    currentVersion: '0.1.0',
    packaged: true,
    platform: 'darwin',
    arch: 'arm64',
    stagingDirectory: dir,
    fetch: async (input) =>
      String(input).endsWith('/latest')
        ? Response.json({
            tag_name: 'v0.2.0',
            draft: false,
            prerelease: false,
            assets: [asset(name, zip.length), asset('SHA256SUMS', sums.length)],
          })
        : redirect
          ? new Response(null, {
              status: 302,
              headers: { location: 'https://evil.example/update.zip' },
            })
          : new Response(new Uint8Array(String(input).endsWith('SHA256SUMS') ? sums : zip)),
    runCommand: async (command) =>
      command.endsWith('plutil')
        ? JSON.stringify({
            CFBundleIdentifier: 'com.cleverworkbench.desktop',
            CFBundleShortVersionString: bundleVersion,
            CFBundleExecutable: 'Clever Workbench',
          })
        : command.endsWith('lipo')
          ? 'arm64'
          : '',
  });
  await update.check();
  return { update, dir };
}
test('download verifies a release and exposes a complete bundle only to main process', async () => {
  const { update, dir } = await setup(await fixture());
  try {
    expect((await update.download()).status).toBe('ready');
    const prepared = update.preparedUpdate()!;
    expect(prepared.version).toBe('0.2.0');
    expect(
      await fs.readFile(path.join(prepared.appPath, 'Contents/MacOS/Clever Workbench'), 'utf8'),
    ).toBe('executable');
    expect(JSON.stringify(update.snapshot())).not.toContain(dir);
  } finally {
    await fs.rm(dir, { recursive: true, force: true });
  }
});
test('hash mismatch preserves existing application and exposes no install candidate', async () => {
  const { update, dir } = await setup(await fixture(), '0'.repeat(64));
  try {
    expect(await update.download()).toMatchObject({
      status: 'error',
      message: '更新包校验失败，请重新下载。',
    });
    expect(update.preparedUpdate()).toBeUndefined();
    expect(await fs.readdir(dir)).toEqual([]);
  } finally {
    await fs.rm(dir, { recursive: true, force: true });
  }
});
test('archive symlinks cannot escape the application bundle', async () => {
  const zip = new ZipFile();
  zip.addBuffer(Buffer.from('../../../../outside'), 'Clever Workbench.app/Contents/escape', {
    mode: 0o120777,
  });
  zip.end();
  const chunks: Buffer[] = [];
  for await (const chunk of zip.outputStream) chunks.push(Buffer.from(chunk));
  const { update, dir } = await setup(Buffer.concat(chunks));
  try {
    expect((await update.download()).status).toBe('error');
    expect(update.preparedUpdate()).toBeUndefined();
    expect(await fs.readdir(dir)).toEqual([]);
  } finally {
    await fs.rm(dir, { recursive: true, force: true });
  }
});
test('a staged verified release is not replaced by automatic or manual checks', async () => {
  const { update, dir } = await setup(await fixture());
  try {
    const [a, b] = await Promise.all([update.download(), update.download()]);
    expect(a.status).toBe('ready');
    expect(b.status).toBe('ready');
    expect((await update.check(true)).status).toBe('ready');
  } finally {
    await fs.rm(dir, { recursive: true, force: true });
  }
});
test('wrong bundle version fails validation even when archive hash matches', async () => {
  const { update, dir } = await setup(await fixture(), undefined, '9.9.9');
  try {
    expect(await update.download()).toMatchObject({
      status: 'error',
      message: '更新包应用身份或版本不匹配。',
    });
    expect(update.preparedUpdate()).toBeUndefined();
  } finally {
    await fs.rm(dir, { recursive: true, force: true });
  }
});
test('download refuses redirects outside the GitHub asset hosts', async () => {
  const { update, dir } = await setup(await fixture(), undefined, undefined, true);
  try {
    expect(await update.download()).toMatchObject({
      status: 'error',
      message: '更新下载被重定向到不可信来源。',
    });
    expect(update.preparedUpdate()).toBeUndefined();
  } finally {
    await fs.rm(dir, { recursive: true, force: true });
  }
});
