import { test, expect } from 'vitest';
import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { createHash } from 'node:crypto';
const run = promisify(execFile);
const script = path.resolve('scripts/prepare-release.mjs');
test('upload verification requires matching sizes and GitHub SHA-256 digests', async () => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'release-upload-'));
  const verify = path.resolve('scripts/verify-release-upload.mjs');
  try {
    await fs.mkdir(path.join(root, 'release'));
    for (const name of [
      'Clever-Workbench-0.2.0-arm64.zip',
      'Clever-Workbench-0.2.0-arm64.dmg',
      'SHA256SUMS',
    ])
      await fs.writeFile(path.join(root, 'release', name), '123');
    await fs.writeFile(path.join(root, 'uploaded.json'), JSON.stringify({ assets: [] }));
    await expect(
      run(process.execPath, [verify, 'v0.2.0', 'uploaded.json'], { cwd: root }),
    ).rejects.toThrow('远程发布资产数量不匹配');
    await fs.writeFile(
      path.join(root, 'uploaded.json'),
      JSON.stringify({
        assets: [
          'Clever-Workbench-0.2.0-arm64.zip',
          'Clever-Workbench-0.2.0-arm64.dmg',
          'SHA256SUMS',
        ].map((name) => ({
          name,
          size: 3,
          state: 'uploaded',
          digest: `sha256:${createHash('sha256').update('123').digest('hex')}`,
        })),
      }),
    );
    await expect(
      run(process.execPath, [verify, 'v0.2.0', 'uploaded.json'], { cwd: root }),
    ).resolves.toMatchObject({ stdout: 'All release assets uploaded; ready to publish\n' });
    const metadata = JSON.parse(await fs.readFile(path.join(root, 'uploaded.json'), 'utf8'));
    metadata.assets[0].digest = `sha256:${'0'.repeat(64)}`;
    await fs.writeFile(path.join(root, 'uploaded.json'), JSON.stringify(metadata));
    await expect(
      run(process.execPath, [verify, 'v0.2.0', 'uploaded.json'], { cwd: root }),
    ).rejects.toThrow('SHA-256 不匹配');
  } finally {
    await fs.rm(root, { recursive: true, force: true });
  }
});
test('release preparation requires complete assets before producing checksums', async () => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'release-script-'));
  try {
    await fs.writeFile(path.join(root, 'package.json'), JSON.stringify({ version: '0.2.0' }));
    await fs.mkdir(path.join(root, 'release'));
    await fs.writeFile(path.join(root, 'release/Clever-Workbench-0.2.0-arm64.zip'), 'zip');
    await expect(run(process.execPath, [script, 'v0.2.0'], { cwd: root })).rejects.toThrow();
    await expect(fs.access(path.join(root, 'release/SHA256SUMS'))).rejects.toThrow();
    await fs.writeFile(path.join(root, 'release/Clever-Workbench-0.2.0-arm64.dmg'), 'dmg');
    await run(process.execPath, [script, 'v0.2.0'], { cwd: root });
    const sums = await fs.readFile(path.join(root, 'release/SHA256SUMS'), 'utf8');
    expect(sums).toMatch(
      /^[a-f0-9]{64}  Clever-Workbench-0.2.0-arm64.zip\n[a-f0-9]{64}  Clever-Workbench-0.2.0-arm64.dmg\n$/,
    );
  } finally {
    await fs.rm(root, { recursive: true, force: true });
  }
});
test('release preparation rejects a tag that differs from the application version', async () => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'release-script-'));
  try {
    await fs.writeFile(path.join(root, 'package.json'), JSON.stringify({ version: '0.2.0' }));
    await expect(
      run(process.execPath, [script, 'v0.3.0', '--check-version'], { cwd: root }),
    ).rejects.toThrow('版本与 tag 不一致');
  } finally {
    await fs.rm(root, { recursive: true, force: true });
  }
});
