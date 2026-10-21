import { test, expect } from '@playwright/test';
import { electron } from './launch';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {
  expectedUpdateGuide,
  verifyUnavailableOrNoTarget,
  expectGuidanceDestination,
} from './guidance-content';
import { guidanceTarget } from '../../src/guidance/registry';

test('离线从设置和更新旁阅读同一指引，步骤、关闭与安全前往功能可用', async ({}, info) => {
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), 'workbench-guidance-'));
  const env: Record<string, string> = { ...process.env, CLEVER_WORKBENCH_DATA_DIR: directory };
  delete env.ELECTRON_RUN_AS_NODE;
  const app = await electron.launch({ args: ['.'], env });
  try {
    const expected = await expectedUpdateGuide(app);
    const page = await app.firstWindow();
    await page.context().setOffline(true);
    await page.getByRole('button', { name: '设置', exact: true }).click();
    const open = page.getByRole('button', { name: '查看全部使用指引', exact: true });
    await open.click({ timeout: 5000 });
    const catalog = page.getByRole('dialog', { name: '使用指引', exact: true });
    if (!expected) {
      await expect(catalog).toBeVisible();
      await page.keyboard.press('Escape');
      await page.getByRole('button', { name: '应用更新使用指引', exact: true }).click();
      await verifyUnavailableOrNoTarget(page);
      await expect(page.getByRole('button', { name: '检查更新', exact: true })).toBeVisible();
      return;
    }
    await catalog.getByRole('button', { name: expected.title, exact: true }).click();
    const guide = page.getByRole('dialog', { name: expected.title, exact: true });
    await expect(
      guide.getByRole('heading', { name: expected.steps[0].title, exact: true }),
    ).toBeVisible();
    await expect(
      guide.getByText(`第 1 步，共 ${expected.steps.length} 步`, { exact: true }),
    ).toBeVisible();
    if (expected.steps[0].image) {
      const alt = expected.steps[0].image.alt;
      await expect
        .poll(async () => {
          const image = guide.getByRole('img', { name: alt, exact: true });
          if (await image.count())
            return image.evaluate((element) => (element as HTMLImageElement).naturalWidth > 0);
          return guide.getByText(`图片暂不可用：${alt}`, { exact: true }).isVisible();
        })
        .toBe(true);
    }
    if (expected.steps.length > 1) {
      await guide.getByRole('button', { name: '下一步', exact: true }).click();
      await expect(
        guide.getByRole('heading', { name: expected.steps[1].title, exact: true }),
      ).toBeVisible();
      await guide.getByRole('button', { name: '上一步', exact: true }).click();
      await expect(
        guide.getByRole('heading', { name: expected.steps[0].title, exact: true }),
      ).toBeVisible();
    } else await expect(guide.getByRole('button', { name: '下一步', exact: true })).toBeDisabled();
    await page.keyboard.press('Escape');
    await expect(guide).toHaveCount(0);
    await expect(open).toBeFocused();
    const nearby = page.getByRole('button', { name: '应用更新使用指引', exact: true });
    await nearby.click();
    await expect(guide).toBeVisible();
    await app.evaluate(({ BrowserWindow }) =>
      BrowserWindow.getAllWindows()[0].setContentSize(800, 600),
    );
    await page.emulateMedia({ colorScheme: 'dark' });
    await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark');
    await expect(
      guide.getByRole('button', { name: `关闭${expected.title}`, exact: true }),
    ).toBeInViewport();
    await expect(guide.getByRole('button', { name: '前往功能', exact: true })).toBeInViewport();
    expect(await guide.evaluate((el) => el.scrollWidth <= el.clientWidth + 1)).toBe(true);
    await page.screenshot({ path: info.outputPath('guidance-dark-narrow.png') });
    if (!guidanceTarget(expected.entry.target)) {
      await verifyUnavailableOrNoTarget(page, expected);
      return;
    }
    await guide.getByRole('button', { name: '前往功能', exact: true }).click();
    await expect(guide).toHaveCount(0);
    await expectGuidanceDestination(page, expected);
    await expect(page.getByRole('dialog')).toHaveCount(0);
  } finally {
    await app.close();
    await fs.rm(directory, { recursive: true, force: true });
  }
});

test('从更新弹窗切换到指引后可关闭，导航不会遗留更新弹窗', async () => {
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), 'workbench-guidance-update-'));
  const env: Record<string, string> = { ...process.env, CLEVER_WORKBENCH_DATA_DIR: directory };
  delete env.ELECTRON_RUN_AS_NODE;
  const app = await electron.launch({ args: ['.'], env });
  try {
    const expected = await expectedUpdateGuide(app);
    const page = await app.firstWindow();
    await page.getByRole('button', { name: '工作台', exact: true }).waitFor();
    await app.evaluate(({ BrowserWindow, ipcMain }) => {
      const state = {
        status: 'available',
        currentVersion: '0.1.0',
        release: {
          version: '0.2.0',
          notes: '验收示例',
          pageUrl: 'https://github.com/iyanghong/clever-workbench/releases/tag/v0.2.0',
          publishedAt: '',
          zip: { name: 'example.zip', size: 1, url: 'https://github.com/example.zip' },
          checksums: { name: 'SHA256SUMS', size: 1, url: 'https://github.com/SHA256SUMS' },
        },
      };
      ipcMain.removeHandler('update-snapshot');
      ipcMain.handle('update-snapshot', () => state);
      BrowserWindow.getAllWindows()[0].webContents.send('update-state', state);
    });
    const badge = page.getByRole('button', { name: '查看可用更新', exact: true });
    await badge.click();
    const update = page.getByRole('dialog', { name: '应用更新', exact: true });
    await update.getByRole('button', { name: '应用更新使用指引', exact: true }).click();
    if (await verifyUnavailableOrNoTarget(page, expected)) {
      await expect(update).toHaveCount(0);
      return;
    }
    const guide = page.getByRole('dialog', { name: expected!.title, exact: true });
    await expect(guide).toBeVisible({ timeout: 4000 });
    await expect(update).toHaveCount(0);
    await guide.getByRole('button', { name: '前往功能', exact: true }).click();
    await expect(page.getByRole('dialog')).toHaveCount(0);
    await expectGuidanceDestination(page, expected!);
  } finally {
    await app.close();
    await fs.rm(directory, { recursive: true, force: true });
  }
});

test('指引导航保存失败保留输入，恢复保存后可以重试', async () => {
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), 'workbench-guidance-save-'));
  const env: Record<string, string> = { ...process.env, CLEVER_WORKBENCH_DATA_DIR: directory };
  delete env.ELECTRON_RUN_AS_NODE;
  const app = await electron.launch({ args: ['.'], env });
  const { DatabaseSync } = await import('node:sqlite');
  let database: InstanceType<typeof DatabaseSync> | undefined;
  try {
    const expected = await expectedUpdateGuide(app);
    const page = await app.firstWindow();
    await page.getByRole('button', { name: '工作任务', exact: true }).click();
    const generation = (await fs.readFile(path.join(directory, 'data', 'CURRENT'), 'utf8')).trim();
    database = new DatabaseSync(
      path.join(directory, 'data', 'vaults', generation, 'database.sqlite'),
    );
    database.exec(
      "CREATE TRIGGER guidance_draft_failure BEFORE INSERT ON preferences WHEN NEW.key='draft' BEGIN SELECT RAISE(ABORT,'指引验收保存失败'); END",
    );
    await page.getByLabel('快速新增任务').fill('导航失败也要保留的任务草稿');
    await expect(page.getByRole('alert')).toContainText('指引验收保存失败');
    await app.evaluate(({ BrowserWindow }) => {
      BrowserWindow.getAllWindows()[0].webContents.send('update-state', {
        status: 'available',
        currentVersion: '0.1.0',
        release: {
          version: '0.2.0',
          notes: '示例',
          pageUrl: '',
          publishedAt: '',
          zip: { name: 'example.zip', size: 1, url: '' },
          checksums: { name: 'SHA256SUMS', size: 1, url: '' },
        },
      });
    });
    await page.getByRole('button', { name: '查看可用更新', exact: true }).click();
    await page.getByRole('button', { name: '应用更新使用指引', exact: true }).click();
    if (await verifyUnavailableOrNoTarget(page, expected)) {
      await expect(page.getByLabel('快速新增任务')).toHaveValue('导航失败也要保留的任务草稿');
      return;
    }
    const guide = page.getByRole('dialog', { name: expected!.title, exact: true });
    await guide.getByRole('button', { name: '前往功能', exact: true }).click();
    await expect(guide.getByRole('alert')).toContainText('指引验收保存失败');
    await expect(page.getByLabel('快速新增任务')).toHaveValue('导航失败也要保留的任务草稿');
    await expect(
      page.getByRole('button', { name: '工作任务', exact: true, includeHidden: true }),
    ).toHaveAttribute('aria-current', 'page');
    database.exec('DROP TRIGGER guidance_draft_failure');
    await guide.getByRole('button', { name: '前往功能', exact: true }).click();
    await expect(guide).toHaveCount(0);
    await expectGuidanceDestination(page, expected!);
    await page.getByRole('button', { name: '工作任务', exact: true }).click();
    await expect(page.getByLabel('快速新增任务')).toHaveValue('导航失败也要保留的任务草稿');
  } finally {
    database?.exec('DROP TRIGGER IF EXISTS guidance_draft_failure');
    database?.close();
    await app.close();
    await fs.rm(directory, { recursive: true, force: true });
  }
});

test('原生文件选择期间不打开指引，结束后允许重新查看', async () => {
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), 'workbench-guidance-native-'));
  const env: Record<string, string> = { ...process.env, CLEVER_WORKBENCH_DATA_DIR: directory };
  delete env.ELECTRON_RUN_AS_NODE;
  const app = await electron.launch({ args: ['.'], env });
  try {
    const page = await app.firstWindow();
    await page.getByRole('button', { name: '设置', exact: true }).click();
    await expect(page.getByRole('button', { name: '查看全部使用指引', exact: true })).toBeVisible();
    await app.evaluate(({ dialog }) => {
      const original = dialog.showOpenDialog;
      (globalThis as any).guidanceRestoreDialog = () => {
        dialog.showOpenDialog = original;
      };
      dialog.showOpenDialog = (() =>
        new Promise((resolve) => {
          (globalThis as any).guidanceCancelDialog = () =>
            resolve({ canceled: true, filePaths: [] });
        })) as typeof dialog.showOpenDialog;
    });
    await page.getByRole('button', { name: '从备份恢复', exact: true }).click();
    await expect
      .poll(() => app.evaluate(() => typeof (globalThis as any).guidanceCancelDialog))
      .toBe('function');
    expect(await page.evaluate(() => window.desktop.guidanceAvailability())).toMatchObject({
      available: false,
    });
    await page.getByRole('button', { name: '查看全部使用指引', exact: true }).click();
    await expect(
      page.getByRole('status').filter({ hasText: '请等待当前保存、文件选择' }),
    ).toBeVisible();
    await expect(page.getByRole('dialog')).toHaveCount(0);
    await app.evaluate(() => {
      (globalThis as any).guidanceCancelDialog();
      (globalThis as any).guidanceRestoreDialog();
    });
    await expect
      .poll(() => page.evaluate(() => window.desktop.guidanceAvailability()))
      .toMatchObject({ available: true });
    await page.getByRole('button', { name: '查看全部使用指引', exact: true }).click();
    await expect(page.getByRole('dialog', { name: '使用指引', exact: true })).toBeVisible();
  } finally {
    await app.evaluate(() => {
      (globalThis as any).guidanceCancelDialog?.();
      (globalThis as any).guidanceRestoreDialog?.();
    });
    await app.close();
    await fs.rm(directory, { recursive: true, force: true });
  }
});

test('前往功能等待期间关闭指引，不执行迟到导航', async () => {
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), 'workbench-guidance-cancel-'));
  const env: Record<string, string> = { ...process.env, CLEVER_WORKBENCH_DATA_DIR: directory };
  delete env.ELECTRON_RUN_AS_NODE;
  const app = await electron.launch({ args: ['.'], env });
  try {
    const expected = await expectedUpdateGuide(app);
    const page = await app.firstWindow();
    await page.getByRole('button', { name: '工作任务', exact: true }).click();
    await app.evaluate(({ BrowserWindow, ipcMain }) => {
      let count = 0;
      ipcMain.removeHandler('guidance-availability');
      ipcMain.handle('guidance-availability', () => {
        count++;
        if (count === 3)
          return new Promise((resolve) => {
            (globalThis as any).releaseGuidanceAvailability = () => resolve({ available: true });
          });
        return { available: true };
      });
      BrowserWindow.getAllWindows()[0].webContents.send('update-state', {
        status: 'available',
        currentVersion: '0.1.0',
        release: {
          version: '0.2.0',
          notes: '示例',
          pageUrl: '',
          publishedAt: '',
          zip: { name: 'example.zip', size: 1, url: '' },
          checksums: { name: 'SHA256SUMS', size: 1, url: '' },
        },
      });
    });
    await page.getByRole('button', { name: '查看可用更新', exact: true }).click();
    await page.getByRole('button', { name: '应用更新使用指引', exact: true }).click();
    if (await verifyUnavailableOrNoTarget(page, expected)) {
      await expect(page.getByRole('button', { name: '工作任务', exact: true })).toHaveAttribute(
        'aria-current',
        'page',
      );
      return;
    }
    const guide = page.getByRole('dialog', { name: expected!.title, exact: true });
    await guide.getByRole('button', { name: '前往功能', exact: true }).click();
    await expect
      .poll(() => app.evaluate(() => typeof (globalThis as any).releaseGuidanceAvailability))
      .toBe('function');
    await page.keyboard.press('Escape');
    await expect(guide).toHaveCount(0);
    await app.evaluate(() => (globalThis as any).releaseGuidanceAvailability());
    // Await the independent availability roundtrip, then observe the visible page (no private state).
    await page.evaluate(() => window.desktop.guidanceAvailability());
    await page.getByLabel('快速新增任务').fill('关闭指引后继续工作', { timeout: 3000 });
    await expect(page.getByRole('button', { name: '工作任务', exact: true })).toHaveAttribute(
      'aria-current',
      'page',
    );
  } finally {
    await app.evaluate(() => (globalThis as any).releaseGuidanceAvailability?.());
    await app.close();
    await fs.rm(directory, { recursive: true, force: true });
  }
});
