import { electron } from './launch';
import { test, expect } from '@playwright/test';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

test('development application exposes version details and disables online installation', async () => {
  test.skip(Boolean(process.env.CWB_TEST_EXECUTABLE), 'Development-mode check');
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), 'workbench-update-'));
  const env: Record<string, string> = { ...process.env, CLEVER_WORKBENCH_DATA_DIR: directory };
  delete env.ELECTRON_RUN_AS_NODE;
  const app = await electron.launch({ args: ['.'], env });
  try {
    const page = await app.firstWindow();
    await page.getByRole('button', { name: '应用版本与更新' }).click();
    await expect(page.getByText('开发版本不支持在线更新。')).toBeVisible();
    await expect(page.getByRole('button', { name: '检查更新', exact: true })).toBeDisabled();
    await expect(page.getByRole('button', { name: '历史版本', exact: true })).toBeVisible();
  } finally {
    await app.close();
    await fs.rm(directory, { recursive: true, force: true });
  }
});
