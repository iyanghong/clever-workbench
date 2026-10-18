import { test, expect, _electron as electron } from '@playwright/test';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
test('设置中首次导出要求主密码，锁定导出可用，备份密码预检不修改当前资料', async () => {
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), 'workbench-backup-ui-'));
  const env: Record<string, string> = { ...process.env, CLEVER_WORKBENCH_DATA_DIR: directory };
  delete env.ELECTRON_RUN_AS_NODE;
  const app = await electron.launch({ args: ['.'], env });
  try {
    const page = await app.firstWindow();
    await page.getByLabel('快速新增任务').fill('备份中的工作');
    await page.getByLabel('快速新增任务').press('Enter');
    await page.getByRole('button', { name: '设置', exact: true }).click();
    const filename = path.join(directory, 'portable.cwb');
    await app.evaluate(({ dialog }, filePath) => {
      dialog.showSaveDialog = (async () => ({
        canceled: false,
        filePath,
      })) as typeof dialog.showSaveDialog;
    }, filename);
    await page.getByRole('button', { name: '导出完整备份', exact: true }).click();
    await expect(page.getByRole('dialog', { name: '设置主密码', exact: true })).toBeVisible({
      timeout: 3000,
    });
    await page.getByLabel('主密码', { exact: true }).fill('fictional-backup-master-password');
    await page.getByLabel('确认主密码').fill('fictional-backup-master-password');
    await page.getByRole('button', { name: '设置并解锁', exact: true }).click();
    await expect(page.getByRole('status').filter({ hasText: '备份已保存' })).toBeVisible();
    expect((await fs.readFile(filename)).subarray(0, 2).toString()).not.toBe('PK');
    await page.evaluate(() => window.desktop.lockVault());
    await page.getByRole('button', { name: '导出完整备份', exact: true }).click();
    await expect(page.getByRole('status').filter({ hasText: '备份已保存' })).toBeVisible();
    expect((await page.evaluate(() => window.desktop.vaultStatus())).unlocked).toBe(false);
    await page.evaluate(() =>
      window.desktop.mutate({
        type: 'task.create',
        draft: {
          title: '预检前新记录',
          markdown: '',
          content: { type: 'doc', content: [{ type: 'paragraph' }] },
          projectId: null,
        },
      }),
    );
    await app.evaluate(({ dialog }, filePath) => {
      dialog.showOpenDialog = (async () => ({
        canceled: false,
        filePaths: [filePath],
      })) as typeof dialog.showOpenDialog;
    }, filename);
    await page.getByRole('button', { name: '从备份恢复', exact: true }).click();
    await page.getByLabel('备份密码', { exact: true }).fill('wrong-password');
    await page.getByRole('button', { name: '校验备份', exact: true }).click();
    await expect(page.getByRole('dialog').getByRole('alert')).toContainText('密码');
    await page.getByLabel('备份密码', { exact: true }).fill('fictional-backup-master-password');
    await page.getByRole('button', { name: '校验备份', exact: true }).click();
    await expect(page.getByRole('dialog', { name: '恢复这份备份', exact: true })).toContainText(
      '1 条任务',
    );
    expect((await page.evaluate(() => window.desktop.snapshot())).tasks).toHaveLength(2);
    expect((await page.evaluate(() => window.desktop.vaultStatus())).unlocked).toBe(false);
    await page.getByRole('button', { name: '取消', exact: true }).click();
    expect((await page.evaluate(() => window.desktop.snapshot())).tasks).toHaveLength(2);
  } finally {
    await app.close();
    await fs.rm(directory, { recursive: true, force: true });
  }
});
