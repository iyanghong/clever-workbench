import { electron } from './launch';
import { test, expect } from '@playwright/test';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { Store } from '../../electron/store';
import { emptyContent } from '../../src/domain';
test('设置目录与自动策略持久化，失败重试保留已有副本，重启检查有变更的跨日备份', async () => {
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), 'workbench-automatic-ui-')),
    folder = path.join(directory, 'chosen-backups');
  await fs.mkdir(folder);
  const env: Record<string, string> = { ...process.env, CLEVER_WORKBENCH_DATA_DIR: directory };
  delete env.ELECTRON_RUN_AS_NODE;
  let app = await electron.launch({ args: ['.'], env });
  try {
    let page = await app.firstWindow();
    await page.evaluate(() => window.desktop.initializeVault('fictional-automatic-ui-password'));
    await page.getByRole('button', { name: '设置', exact: true }).click();
    await page.getByRole('switch', { name: '自动备份' }).uncheck();
    await app.evaluate(({ dialog }, folder) => {
      dialog.showOpenDialog = (async () => ({
        canceled: false,
        filePaths: [folder],
      })) as typeof dialog.showOpenDialog;
    }, folder);
    await page.getByRole('button', { name: '更改目录', exact: true }).click();
    await expect(page.locator('.path-text')).toHaveText(folder);
    await page.evaluate(() => window.desktop.lockVault());
    await page.getByRole('button', { name: '立即备份', exact: true }).click();
    await expect(page.getByRole('status').filter({ hasText: '自动备份已完成' })).toBeVisible();
    expect(await fs.readdir(folder)).toHaveLength(1);
    const first = await page.evaluate(() => window.desktop.snapshot());
    await fs.rename(folder, `${folder}-saved`);
    await fs.writeFile(folder, 'simulate unusable destination');
    await page.getByRole('button', { name: '立即备份', exact: true }).click();
    await expect(page.getByRole('alert')).toContainText('备份目录无法使用');
    expect((await page.evaluate(() => window.desktop.snapshot())).settings.lastBackupAt).toBe(
      first.settings.lastBackupAt,
    );
    expect(await fs.readdir(`${folder}-saved`)).toHaveLength(1);
    await fs.rm(folder);
    await fs.rename(`${folder}-saved`, folder);
    await page.getByRole('button', { name: '立即备份', exact: true }).click();
    await expect(page.getByRole('status').filter({ hasText: '自动备份已完成' })).toBeVisible();
    expect(await fs.readdir(folder)).toHaveLength(2);
    expect((await page.evaluate(() => window.desktop.vaultStatus())).unlocked).toBe(false);
    await page.getByRole('switch', { name: '自动备份' }).check();
    await expect
      .poll(async () => (await page.evaluate(() => window.desktop.snapshot())).settings.autoBackup)
      .toBe(true);
    await app.close();
    const store = new Store(path.join(directory, 'data'));
    store.set('lastBackupAt', Date.now() - 86400000);
    store.mutate({
      type: 'task.create',
      draft: { title: '等待启动备份', markdown: '', content: emptyContent(), projectId: null },
    });
    store.close();
    app = await electron.launch({ args: ['.'], env });
    page = await app.firstWindow();
    await expect.poll(async () => (await fs.readdir(folder)).length).toBe(3);
    await page.getByRole('button', { name: '设置', exact: true }).click();
    await expect(page.locator('.path-text')).toHaveText(folder);
    await expect(page.getByRole('switch', { name: '自动备份' })).toBeChecked();
    const after = await page.evaluate(() => window.desktop.snapshot());
    expect(after.settings.lastBackupError).toBeNull();
    expect(after.settings.lastBackupAt).toBeGreaterThan(first.settings.lastBackupAt!);
    expect((await page.evaluate(() => window.desktop.vaultStatus())).unlocked).toBe(false);
  } finally {
    await app.close();
    await fs.rm(directory, { recursive: true, force: true });
  }
});
