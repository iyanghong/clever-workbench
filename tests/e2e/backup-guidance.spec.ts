import { test, expect, type ElectronApplication, type Page } from '@playwright/test';
import { electron } from './launch';
import {
  expectedFeatureGuide,
  expectGuidanceDestination,
  verifyUnavailableOrNoTarget,
} from './guidance-content';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

async function start(options: { history?: boolean } = {}) {
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), 'workbench-backup-guide-'));
  if (options.history) {
    await fs.mkdir(path.join(directory, 'updates'));
    await fs.writeFile(
      path.join(directory, 'updates', 'history.json'),
      JSON.stringify([
        {
          id: 'isolated-update-history',
          currentVersion: '0.1.10',
          targetVersion: '0.1.11',
          createdAt: '2026-10-20T00:00:00.000Z',
          updatedAt: '2026-10-20T00:01:00.000Z',
          phase: 'manual',
          phaseStartedAt: Date.now(),
          durations: { downloading: 1000, installing: 2000 },
          outcome: 'manual',
          message: '隔离资料：系统授权需要人工处理。',
          backup: path.join(directory, 'missing-backup.cwb'),
          previousApp: path.join(directory, 'missing-previous.app'),
          transactionDirectory: path.join(directory, 'updates', 'transactions', 'missing'),
        },
      ]),
    );
  }
  const env: Record<string, string> = { ...process.env, CLEVER_WORKBENCH_DATA_DIR: directory };
  delete env.ELECTRON_RUN_AS_NODE;
  const app = await electron.launch({ args: ['.'], env });
  const page = await app.firstWindow();
  return {
    app,
    page,
    directory,
    async close() {
      await app.close();
      await fs.rm(directory, { recursive: true, force: true });
    },
  };
}

async function openNearby(app: ElectronApplication, page: Page, label: string, guideId: string) {
  const feature = await expectedFeatureGuide(app, guideId);
  await page.getByRole('button', { name: label, exact: true }).click({ timeout: 5000 });
  if (await verifyUnavailableOrNoTarget(page, feature)) return;
  const dialog = page.getByRole('dialog', { name: feature!.title, exact: true });
  await expect(
    dialog.getByRole('heading', { name: feature!.steps[0].title, exact: true }),
  ).toBeVisible();
  await dialog.getByRole('button', { name: '前往功能', exact: true }).click();
  await expectGuidanceDestination(page, feature!);
}

test('备份密码指引从设置就近打开；取消与保存各自保持独立备份配置', async () => {
  const fixture = await start();
  const { app, page } = fixture;
  try {
    await page.getByRole('button', { name: '设置', exact: true }).click();
    await openNearby(app, page, '备份密码使用指引', 'backup-password');
    expect((await page.evaluate(() => window.desktop.vaultStatus())).backupConfigured).toBe(false);
    await page.getByRole('button', { name: '设置备份密码', exact: true }).click();
    await expect(page.getByRole('dialog', { name: '设置备份密码', exact: true })).toBeVisible();
    await page.getByRole('button', { name: '取消', exact: true }).click();
    expect((await page.evaluate(() => window.desktop.vaultStatus())).backupConfigured).toBe(false);
    await page.getByRole('button', { name: '设置备份密码', exact: true }).click();
    await page.getByLabel('备份密码', { exact: true }).fill('fictional-independent-backup');
    await page.getByLabel('确认备份密码', { exact: true }).fill('fictional-independent-backup');
    await page.getByRole('button', { name: '保存并继续', exact: true }).click();
    await expect(page.getByRole('button', { name: '更改备份密码', exact: true })).toBeVisible();
    expect((await page.evaluate(() => window.desktop.vaultStatus())).backupConfigured).toBe(true);
  } finally {
    await fixture.close();
  }
});

test('更新历史指引只导航；历史显示恢复材料、阶段和缺失文件的处理反馈', async () => {
  const fixture = await start({ history: true });
  const { app, page } = fixture;
  try {
    await page.getByRole('button', { name: '设置', exact: true }).click();
    expect(await page.evaluate(() => window.desktop.updateHistory())).toHaveLength(1);
    await openNearby(app, page, '更新历史使用指引', 'update-history-and-recovery');
    const history = page.locator('.update-history');
    await history.getByText('更新历史（最近 30 次）').click();
    await expect(history).toContainText('隔离资料：系统授权需要人工处理。');
    await expect(history).toContainText('阶段耗时');
    for (const name of ['定位备份', '定位旧应用', '查看日志文件'])
      await expect(history.getByRole('button', { name, exact: true })).toBeVisible();
    await history.getByRole('button', { name: '定位备份', exact: true }).click();
    await expect(history.getByRole('alert')).toContainText('恢复资料不存在或无法打开');
    expect((await page.evaluate(() => window.desktop.updateHistory()))[0].outcome).toBe('manual');

    await page.getByRole('button', { name: '工作台', exact: true }).click();
    const currentVersion = (await page.evaluate(() => window.desktop.updateSnapshot()))
      .currentVersion;
    await app.evaluate(({ BrowserWindow }, version) => {
      BrowserWindow.getAllWindows()[0].webContents.send('update-state', {
        status: 'available',
        currentVersion: version,
        release: {
          version: '9.9.9',
          notes: '隔离的更新入口示例。',
          zip: { name: 'example.zip', size: 1, url: 'https://example.invalid/example.zip' },
          checksums: { name: 'SHA256SUMS', size: 1, url: 'https://example.invalid/SHA256SUMS' },
        },
      });
    }, currentVersion);
    await page.getByRole('button', { name: '查看可用更新', exact: true }).click();
    const updateDialog = page.getByRole('dialog', { name: '应用更新', exact: true });
    await updateDialog.getByRole('button', { name: '更新历史使用指引', exact: true }).click();
    await expect(updateDialog).toHaveCount(0);
    const expected = await expectedFeatureGuide(app, 'update-history-and-recovery');
    if (!(await verifyUnavailableOrNoTarget(page, expected))) {
      await expect(page.getByRole('dialog', { name: expected!.title, exact: true })).toBeVisible();
      await page.keyboard.press('Escape');
    }
  } finally {
    await fixture.close();
  }
});

test('手动与自动备份指引只导航；导出、立即备份及目录失败反馈可见', async () => {
  const fixture = await start();
  const { app, page, directory } = fixture;
  try {
    await page.getByLabel('快速新增任务').fill('隔离备份示例');
    await page.getByLabel('快速新增任务').press('Enter');
    await page.getByRole('button', { name: '设置', exact: true }).click();
    const manual = path.join(directory, 'manual.cwb');
    await openNearby(app, page, '完整备份使用指引', 'full-backup');
    await expect(
      fs.stat(manual).then(
        () => true,
        () => false,
      ),
    ).resolves.toBe(false);
    await app.evaluate(({ dialog }, filePath) => {
      dialog.showSaveDialog = (async () => ({
        canceled: false,
        filePath,
      })) as typeof dialog.showSaveDialog;
    }, manual);
    await page.getByRole('button', { name: '导出完整备份', exact: true }).click();
    await page.getByLabel('备份密码', { exact: true }).fill('fictional-portable-password');
    await page.getByLabel('确认备份密码', { exact: true }).fill('fictional-portable-password');
    await page.getByRole('button', { name: '保存并继续', exact: true }).click();
    await expect(page.getByRole('status').filter({ hasText: '备份已保存' })).toBeVisible();
    expect((await fs.readFile(manual)).subarray(0, 2).toString()).not.toBe('PK');

    await openNearby(app, page, '自动备份使用指引', 'automatic-backup');
    const autoDirectory = path.join(directory, 'automatic');
    await fs.mkdir(autoDirectory);
    await app.evaluate(({ dialog }, folder) => {
      dialog.showOpenDialog = (async () => ({
        canceled: false,
        filePaths: [folder],
      })) as typeof dialog.showOpenDialog;
    }, autoDirectory);
    await page.getByRole('button', { name: '更改目录', exact: true }).click();
    await page.getByRole('button', { name: '立即备份', exact: true }).click();
    await expect(page.getByRole('status').filter({ hasText: '自动备份已完成' })).toBeVisible();
    expect(await fs.readdir(autoDirectory)).toHaveLength(1);
    const lastSuccess = (await page.evaluate(() => window.desktop.snapshot())).settings
      .lastBackupAt;
    await fs.rename(autoDirectory, `${autoDirectory}-saved`);
    await fs.writeFile(autoDirectory, '示例：目录暂不可写');
    await page.getByRole('button', { name: '立即备份', exact: true }).click();
    await expect(page.getByRole('alert')).toContainText('备份目录无法使用');
    expect((await page.evaluate(() => window.desktop.snapshot())).settings.lastBackupAt).toBe(
      lastSuccess,
    );
    expect(await fs.readdir(`${autoDirectory}-saved`)).toHaveLength(1);
  } finally {
    await fixture.close();
  }
});

test('恢复指引只前往入口；错误密码、取消及目标解锁后整份恢复各有反馈', async () => {
  const fixture = await start();
  const { app, page, directory } = fixture;
  try {
    await page.evaluate(async () => {
      await window.desktop.initializeVault('fictional-local-master');
      await window.desktop.configureBackup('fictional-restore-password');
      await window.desktop.mutate({
        type: 'task.create',
        draft: {
          title: '备份中的任务',
          markdown: '',
          content: { type: 'doc', content: [{ type: 'paragraph' }] },
          projectId: null,
        },
      });
    });
    await page.getByRole('button', { name: '设置', exact: true }).click();
    const filename = path.join(directory, 'restore-source.cwb');
    await app.evaluate(({ dialog }, filePath) => {
      dialog.showSaveDialog = (async () => ({
        canceled: false,
        filePath,
      })) as typeof dialog.showSaveDialog;
    }, filename);
    await page.getByRole('button', { name: '导出完整备份', exact: true }).click();
    await expect(page.getByRole('status').filter({ hasText: '备份已保存' })).toBeVisible();
    await page.evaluate(() =>
      window.desktop.mutate({
        type: 'task.create',
        draft: {
          title: '恢复前新增任务',
          markdown: '',
          content: { type: 'doc', content: [{ type: 'paragraph' }] },
          projectId: null,
        },
      }),
    );
    await openNearby(app, page, '恢复与迁移使用指引', 'restore-and-migrate');
    expect((await page.evaluate(() => window.desktop.snapshot())).tasks).toHaveLength(2);
    await app.evaluate(({ dialog }, filePath) => {
      dialog.showOpenDialog = (async () => ({
        canceled: false,
        filePaths: [filePath],
      })) as typeof dialog.showOpenDialog;
    }, filename);
    await page.getByRole('button', { name: '从备份恢复', exact: true }).click();
    await page.getByLabel('备份密码', { exact: true }).fill('wrong-password');
    await page.getByRole('button', { name: '校验备份', exact: true }).click();
    await expect(
      page.getByRole('dialog', { name: '输入备份密码' }).getByRole('alert'),
    ).toContainText('密码');
    expect((await page.evaluate(() => window.desktop.snapshot())).tasks).toHaveLength(2);
    await page.getByLabel('备份密码', { exact: true }).fill('fictional-restore-password');
    await page.getByRole('button', { name: '校验备份', exact: true }).click();
    const preview = page.getByRole('dialog', { name: '恢复这份备份', exact: true });
    await expect(preview).toContainText('1 条任务');
    await preview.getByRole('button', { name: '取消', exact: true }).click();
    expect((await page.evaluate(() => window.desktop.snapshot())).tasks).toHaveLength(2);
    await page.getByRole('button', { name: '从备份恢复', exact: true }).click();
    await page.getByLabel('备份密码', { exact: true }).fill('fictional-restore-password');
    await page.getByRole('button', { name: '校验备份', exact: true }).click();
    await page.evaluate(() => window.desktop.lockVault());
    await preview.getByRole('button', { name: '恢复备份', exact: true }).click();
    const unlock = page.getByRole('dialog', { name: '解锁秘密', exact: true });
    await expect(unlock).toBeVisible();
    await unlock.getByLabel('主密码', { exact: true }).fill('fictional-local-master');
    await unlock.getByRole('button', { name: '解锁', exact: true }).click();
    await expect(page.getByRole('status').filter({ hasText: '恢复完成' })).toBeVisible();
    expect(
      (await page.evaluate(() => window.desktop.snapshot())).tasks.map((task) => task.title),
    ).toEqual(['备份中的任务']);
    expect((await page.evaluate(() => window.desktop.vaultStatus())).mode).toBe('password');
    expect((await fs.readdir(path.join(directory, 'data', 'recovery'))).length).toBeGreaterThan(0);
  } finally {
    await fixture.close();
  }
});
