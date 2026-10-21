import { electron } from './launch';
import { test, expect } from '@playwright/test';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
test('设置中首次导出要求独立备份密码，锁定导出可用，备份密码预检不修改当前资料', async () => {
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
    await expect(page.getByRole('dialog', { name: '设置备份密码', exact: true })).toBeVisible({
      timeout: 3000,
    });
    await page.getByLabel('备份密码', { exact: true }).fill('fictional-backup-master-password');
    await page.getByLabel('确认备份密码').fill('fictional-backup-master-password');
    await page.getByRole('button', { name: '保存并继续', exact: true }).click();
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

test('恢复成功重建当前页面并锁定秘密，恢复前未返回的图片选择不能写入新资料', async () => {
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), 'workbench-restore-boundary-'));
  const env: Record<string, string> = { ...process.env, CLEVER_WORKBENCH_DATA_DIR: directory };
  delete env.ELECTRON_RUN_AS_NODE;
  const app = await electron.launch({ args: ['.'], env });
  try {
    const page = await app.firstWindow(),
      filename = path.join(directory, 'portable.cwb'),
      picture = path.join(directory, 'late.png');
    await fs.writeFile(
      picture,
      Buffer.from(
        'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR4nGNgqPr/HwAEcAJ5Qhlc0gAAAABJRU5ErkJggg==',
        'base64',
      ),
    );
    await page.evaluate(async () => {
      await window.desktop.initializeVault('fictional-restoration-password');
      await window.desktop.configureBackup('fictional-restoration-password');
      await window.desktop.mutate({
        type: 'task.create',
        draft: {
          title: '备份中的工作',
          markdown: '',
          content: { type: 'doc', content: [{ type: 'paragraph' }] },
          projectId: null,
        },
      });
    });
    await app.evaluate(({ dialog }, filePath) => {
      dialog.showSaveDialog = (async () => ({
        canceled: false,
        filePath,
      })) as typeof dialog.showSaveDialog;
    }, filename);
    await page.getByRole('button', { name: '设置', exact: true }).click();
    await page.getByRole('button', { name: '导出完整备份', exact: true }).click();
    await expect(page.getByRole('status').filter({ hasText: '备份已保存' })).toBeVisible();
    await page.evaluate(() =>
      window.desktop.mutate({
        type: 'task.create',
        draft: {
          title: '恢复前新增',
          markdown: '',
          content: { type: 'doc', content: [{ type: 'paragraph' }] },
          projectId: null,
        },
      }),
    );
    await app.evaluate(
      ({ dialog }, { filename, picture }) => {
        dialog.showOpenDialog = (async (...args: any[]) => {
          const options = args.at(-1);
          if (options.filters?.[0]?.name === '图片')
            return new Promise((resolve) => {
              (globalThis as any).releaseImageChoice = () =>
                resolve({ canceled: false, filePaths: [picture] });
            });
          return { canceled: false, filePaths: [filename] };
        }) as typeof dialog.showOpenDialog;
      },
      { filename, picture },
    );
    await page.evaluate(() => {
      (window as any).lateImage = window.desktop.chooseImages().then(
        () => 'unexpected success',
        (cause) => String(cause),
      );
    });
    await expect
      .poll(() => app.evaluate(() => typeof (globalThis as any).releaseImageChoice))
      .toBe('function');
    await page.getByRole('button', { name: '从备份恢复', exact: true }).click();
    await page.getByLabel('备份密码', { exact: true }).fill('fictional-restoration-password');
    await page.getByRole('button', { name: '校验备份', exact: true }).click();
    await expect(page.getByRole('dialog', { name: '恢复这份备份', exact: true })).toContainText(
      '1 条任务',
    );
    await page.getByRole('button', { name: '恢复备份', exact: true }).click();
    await expect(page.getByRole('status').filter({ hasText: '恢复完成' })).toBeVisible();
    expect(
      (await page.evaluate(() => window.desktop.snapshot())).tasks.map((task) => task.title),
    ).toEqual(['备份中的工作']);
    expect((await page.evaluate(() => window.desktop.vaultStatus())).unlocked).toBe(false);
    await app.evaluate(() => {
      (globalThis as any).releaseImageChoice();
      delete (globalThis as any).releaseImageChoice;
    });
    expect(await page.evaluate(() => (window as any).lateImage)).toContain('资料已切换');
    const generation = (await fs.readFile(path.join(directory, 'data', 'CURRENT'), 'utf8')).trim();
    expect(
      await fs.readdir(path.join(directory, 'data', 'vaults', generation, 'assets')),
    ).toHaveLength(0);
    await page.getByLabel('快速新增任务').fill('恢复后继续工作');
    await page.getByLabel('快速新增任务').press('Enter');
    await expect
      .poll(async () => (await page.evaluate(() => window.desktop.snapshot())).tasks.length)
      .toBe(2);
  } finally {
    await app.close();
    await fs.rm(directory, { recursive: true, force: true });
  }
});
