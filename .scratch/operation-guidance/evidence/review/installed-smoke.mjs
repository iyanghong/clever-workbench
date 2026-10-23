import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { _electron, expect } from '@playwright/test';

const executable =
  '/Users/kuku/code/.cwb-guidance-tickets/review-package/release/mac-arm64/Clever Workbench.app/Contents/MacOS/Clever Workbench';
const directory = await fs.mkdtemp(path.join(os.tmpdir(), 'cwb-guidance-review-smoke-'));
const env = {
  ...process.env,
  CLEVER_WORKBENCH_DATA_DIR: directory,
  CWB_TEST_MOCK_KEYCHAIN: '1',
};
delete env.ELECTRON_RUN_AS_NODE;
delete env.VITE_DEV_SERVER_URL;
let app;
try {
  app = await _electron.launch({ executablePath: executable, args: ['--use-mock-keychain'], env });
  const page = await app.firstWindow();
  const prompt = page.getByRole('dialog', { name: '版本操作指引', exact: true });
  await expect(prompt).toBeVisible({ timeout: 12000 });
  const runtime = await page.evaluate(() => window.desktop.guidanceVersions());
  assert.equal(runtime.currentVersion, '99.4.15');
  assert.equal(runtime.releases.find((item) => item.version === '99.4.15')?.sourceSha,
    'eafdb571cf05206502e8b4249e4fa60cf3d26d2d');
  await expect.poll(() => page.evaluate(() => window.desktop.guidanceState())).toMatchObject({
    shownThrough: '99.4.15',
    persisted: true,
  });
  await page.keyboard.press('Escape');
  await expect(prompt).toHaveCount(0);
  await page.getByRole('button', { name: '设置', exact: true }).click();
  await page.getByRole('button', { name: '查看全部使用指引', exact: true }).click();
  const library = page.getByRole('dialog', { name: '使用指引', exact: true });
  await expect(library).toBeVisible();
  assert.equal(await library.locator('.guidance-list button').count(), 47);
  await page.keyboard.press('Escape');
  const result = {
    installedExecutable: executable,
    isolatedData: true,
    mockKeychain: true,
    currentVersion: runtime.currentVersion,
    currentSourceSha: runtime.releases.find((item) => item.version === '99.4.15')?.sourceSha,
    automaticShownAndAcknowledged: true,
    catalogCount: 47,
    escapeCloses: true,
  };
  await fs.writeFile(new URL('./installed-smoke.json', import.meta.url), JSON.stringify(result, null, 2)+'\n');
  console.log(JSON.stringify(result));
} finally {
  await app?.close();
  await fs.rm(directory, { recursive: true, force: true });
}
