import { electron } from './launch';
import { test, expect } from '@playwright/test';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import type { UpdateSnapshot } from '../../src/update-types';

test('安装失败只显示可操作的原因，不泄露 IPC 错误包装', async () => {
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), 'workbench-update-location-'));
  const env: Record<string, string> = { ...process.env, CLEVER_WORKBENCH_DATA_DIR: directory };
  delete env.ELECTRON_RUN_AS_NODE;
  const app = await electron.launch({ args: ['.'], env });
  const message =
    'macOS 正在从只读隔离位置运行此应用。请退出应用，通过 Finder 安装到“应用程序”后重新打开。';
  try {
    const page = await app.firstWindow();
    await page.getByRole('button', { name: '设置', exact: true }).click();
    const { currentVersion } = await page.evaluate(() => window.desktop.updateSnapshot());
    await expect(
      page.getByText(`Clever Workbench v${currentVersion}`, { exact: true }),
    ).toBeVisible();
    await expect
      .poll(async () => (await page.evaluate(() => window.desktop.updateSnapshot())).status, {
        timeout: 30000,
      })
      .not.toBe('checking');
    await app.evaluate(({ BrowserWindow, ipcMain }, reason) => {
      ipcMain.removeHandler('update-install');
      ipcMain.handle('update-install', () => {
        throw Error(reason);
      });
      BrowserWindow.getAllWindows()[0].webContents.send('update-state', {
        status: 'ready',
        currentVersion: '0.1.4',
      } satisfies UpdateSnapshot);
    }, message);
    await page.getByRole('button', { name: '重启并更新', exact: true }).click();
    await expect(page.getByRole('alert')).toHaveText(message);
    await expect(page.getByRole('button', { name: '工作台', exact: true })).toBeEnabled();
  } finally {
    await app.close();
    await fs.rm(directory, { recursive: true, force: true });
  }
});

test('更新弹窗支持鼠标关闭，重新打开后仍能按 Esc 关闭', async () => {
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), 'workbench-update-close-'));
  const env: Record<string, string> = { ...process.env, CLEVER_WORKBENCH_DATA_DIR: directory };
  delete env.ELECTRON_RUN_AS_NODE;
  const app = await electron.launch({ args: ['.'], env });
  try {
    const page = await app.firstWindow();
    await expect(page.getByRole('button', { name: '工作台', exact: true })).toBeVisible();
    await app.evaluate(({ BrowserWindow }) => {
      BrowserWindow.getAllWindows()[0].setContentSize(1000, 620);
    });
    await expect
      .poll(async () => (await page.evaluate(() => window.desktop.updateSnapshot())).status, {
        timeout: 30000,
      })
      .not.toBe('checking');
    const { currentVersion } = await page.evaluate(() => window.desktop.updateSnapshot());
    await app.evaluate(({ BrowserWindow }, version) => {
      BrowserWindow.getAllWindows()[0].webContents.send('update-state', {
        status: 'available',
        currentVersion: version,
        release: {
          version: '0.2.0',
          notes: '更新说明。'.repeat(150),
          publishedAt: '2026-10-19T12:00:00Z',
          pageUrl: 'https://github.com/iyanghong/clever-workbench/releases/tag/v0.2.0',
          zip: {
            name: 'update.zip',
            size: 1,
            url: 'https://github.com/iyanghong/clever-workbench/releases/download/v0.2.0/update.zip',
          },
          checksums: {
            name: 'SHA256SUMS',
            size: 1,
            url: 'https://github.com/iyanghong/clever-workbench/releases/download/v0.2.0/SHA256SUMS',
          },
        },
      } satisfies UpdateSnapshot);
    }, currentVersion);
    const badge = page.getByRole('button', { name: '查看可用更新', exact: true });
    const dialog = page.getByRole('dialog', { name: '应用更新', exact: true });
    await badge.click();
    await expect(dialog).toBeVisible();
    const close = dialog.getByRole('button', { name: '关闭应用更新', exact: true });
    const closeBounds = await close.boundingBox();
    const toolbar = await page.locator('.window-toolbar').boundingBox();
    const closeCenter = closeBounds!.y + closeBounds!.height / 2;
    expect(closeCenter).toBeGreaterThanOrEqual(toolbar!.y);
    expect(closeCenter).toBeLessThan(toolbar!.y + toolbar!.height);
    // Browser automation bypasses Electron's native drag hit testing. The modal
    // must exclude the toolbar drag region even when its close button overlaps it.
    await expect
      .poll(() => dialog.evaluate((el) => getComputedStyle(el).getPropertyValue('app-region')))
      .toBe('no-drag');
    await close.click({ timeout: 3000 });
    await expect(dialog).toHaveCount(0, { timeout: 1500 });
    await expect(badge).toBeFocused();
    await badge.click();
    await expect(dialog).toBeVisible();
    await page.keyboard.press('Escape');
    await expect(dialog).toHaveCount(0);
    await expect(badge).toBeFocused();
  } finally {
    await app.close();
    await fs.rm(directory, { recursive: true, force: true });
  }
});

test('手动检查仅在设置中，新版按钮显示在品牌旁并保留下载与安装入口', async ({}, info) => {
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), 'workbench-update-dialog-'));
  const env: Record<string, string> = { ...process.env, CLEVER_WORKBENCH_DATA_DIR: directory };
  delete env.ELECTRON_RUN_AS_NODE;
  const app = await electron.launch({ args: ['.'], env });
  try {
    const page = await app.firstWindow();
    const currentVersion = await page.evaluate(
      async () => (await window.desktop.updateSnapshot()).currentVersion,
    );
    // Exercise renderer state through its existing main-to-window subscription.
    // No fixture download or install is executed against the real application.
    const show = (state: UpdateSnapshot) =>
      app.evaluate(({ BrowserWindow }, next) => {
        BrowserWindow.getAllWindows()[0].webContents.send('update-state', next);
      }, state);
    const badge = page.locator('.brand .update-badge');
    await expect
      .poll(async () => (await page.evaluate(() => window.desktop.updateSnapshot())).status, {
        timeout: 30000,
      })
      .not.toBe('checking');
    await page.getByRole('button', { name: '设置', exact: true }).click();
    await expect(
      page.getByText(`Clever Workbench v${currentVersion}`, { exact: true }),
    ).toBeVisible();
    await show({ status: 'up-to-date', currentVersion });
    const settings = page.locator('.settings-page');
    await expect(settings.getByRole('status')).toHaveText('已是最新版本');
    await expect(badge).toHaveCount(0);
    await expect(settings.getByRole('button', { name: '检查更新', exact: true })).toBeEnabled();
    await expect(page.locator('.sidebar-bottom .update-badge')).toHaveCount(0);
    await page.screenshot({
      path: info.outputPath('update-settings-current-light.png'),
      animations: 'disabled',
    });
    const release: NonNullable<UpdateSnapshot['release']> = {
      version: '0.2.0',
      publishedAt: '2026-10-19T12:00:00Z',
      pageUrl: 'https://github.com/iyanghong/clever-workbench/releases/tag/v0.2.0',
      notes:
        '让每一次更新更清晰\n\n• 更新状态、下载进度和安装操作一目了然。\n• 保留工作资料，安装前创建完整加密备份。\n• 改善深色模式和小窗口下的阅读体验。\n\n' +
        '详细说明与兼容性记录。'.repeat(50),
      zip: {
        name: 'Clever-Workbench-0.2.0-arm64.zip',
        size: 128000000,
        url: 'https://github.com/iyanghong/clever-workbench/releases/download/v0.2.0/Clever-Workbench-0.2.0-arm64.zip',
      },
      checksums: {
        name: 'SHA256SUMS',
        size: 198,
        url: 'https://github.com/iyanghong/clever-workbench/releases/download/v0.2.0/SHA256SUMS',
      },
    };
    await show({ status: 'available', currentVersion, release });
    await expect(
      page.locator('.brand').getByRole('button', { name: '查看可用更新' }),
    ).toBeVisible();
    const caption = await page.getByText('个人工作台', { exact: true }).boundingBox();
    const updateButton = await badge.boundingBox();
    expect(updateButton!.x).toBeGreaterThan(caption!.x + caption!.width);
    expect(
      Math.abs(updateButton!.y + updateButton!.height / 2 - caption!.y - caption!.height / 2),
    ).toBeLessThan(2);
    await page.getByRole('button', { name: '工作台', exact: true }).click();
    await expect(page.getByRole('button', { name: '检查更新', exact: true })).toHaveCount(0);
    await page.locator('.brand').screenshot({ path: info.outputPath('update-entry-light.png') });
    await badge.click();
    const dialog = page.getByRole('dialog', { name: '应用更新', exact: true });
    await expect(dialog.getByRole('button', { name: '下载更新', exact: true })).toBeVisible();
    await expect(dialog.getByRole('button', { name: '检查更新', exact: true })).toHaveCount(0);
    await page.screenshot({
      path: info.outputPath('update-available-light.png'),
      animations: 'disabled',
    });
    await page.setViewportSize({ width: 850, height: 620 });
    await page.evaluate(() => window.desktop.mutate({ type: 'settings', theme: 'dark' }));
    await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark');
    await expect(dialog.getByRole('button', { name: '下载更新', exact: true })).toBeInViewport();
    const close = dialog.getByRole('button', { name: '关闭应用更新', exact: true });
    await expect(close).toBeInViewport();
    expect(await dialog.evaluate((el) => el.scrollWidth <= el.clientWidth + 1)).toBe(true);
    await page.screenshot({
      path: info.outputPath('update-available-dark-narrow.png'),
      animations: 'disabled',
    });
    await page.keyboard.press('Escape');
    await expect(badge).toBeFocused();
    const narrowButton = await badge.boundingBox();
    const sidebar = await page.locator('.sidebar').boundingBox();
    expect(narrowButton!.x + narrowButton!.width).toBeLessThanOrEqual(sidebar!.x + sidebar!.width);
    await page
      .locator('.brand')
      .screenshot({ path: info.outputPath('update-entry-dark-narrow.png') });
    await badge.click();
    await show({
      status: 'downloading',
      currentVersion,
      release,
      progress: { received: 64000000, total: 128000000 },
    });
    await expect(dialog.getByText('50%', { exact: true })).toBeVisible();
    await expect(dialog.getByRole('progressbar', { name: '更新下载进度' })).toHaveJSProperty(
      'value',
      64000000,
    );
    await expect(badge).toBeVisible();
    await page.keyboard.press('Escape');
    await expect(badge).toBeFocused();
    await badge.click();
    await expect(dialog.getByText('50%', { exact: true })).toBeVisible();
    await show({ status: 'ready', currentVersion, release });
    const restart = page.getByRole('dialog', { name: '更新已准备好', exact: true });
    await expect(
      restart.getByRole('button', { name: '立即重启并更新', exact: true }),
    ).toBeInViewport();
    await expect(dialog).toHaveCount(0);
    await restart.getByRole('button', { name: '稍后重启', exact: true }).click();
    await expect(badge).toBeVisible();
    await show({ status: 'error', currentVersion, release, message: '下载中断，请重试。' });
    await badge.click();
    await expect(dialog.getByRole('button', { name: '下载更新', exact: true })).toBeEnabled();
    await expect(badge).toBeVisible();
    await show({ status: 'manual', currentVersion, message: '新版启动确认超时，请查看恢复说明。' });
    await expect(dialog.getByText('新版启动确认超时，请查看恢复说明。')).toBeVisible();
    await expect(badge).toHaveCount(0);
    await dialog.getByText('更新历史（最近 30 次）', { exact: true }).click();
    await expect(dialog.getByText('尚无更新记录。')).toBeVisible();
    await page.keyboard.press('Escape');
    await expect(dialog).toHaveCount(0);
    await page.getByRole('button', { name: '设置', exact: true }).click();
    await expect(settings.getByRole('button', { name: '检查更新', exact: true })).toBeVisible();
    await show({ status: 'available', currentVersion, release });
    await expect(badge).toBeVisible();
    await show({
      status: 'error',
      currentVersion,
      message: '无法连接 GitHub，请稍后在设置中重试。',
    });
    await expect(settings.getByText('无法连接 GitHub，请稍后在设置中重试。')).toBeVisible();
    await expect(badge).toHaveCount(0);
    await expect(settings.getByRole('button', { name: '检查更新', exact: true })).toBeEnabled();
    await show({ status: 'available', currentVersion, release });
    await expect(badge).toBeVisible();
    await show({ status: 'up-to-date', currentVersion });
    await expect(settings.getByRole('status')).toHaveText('已是最新版本');
    await expect(badge).toHaveCount(0);
  } finally {
    await app.close();
    await fs.rm(directory, { recursive: true, force: true });
  }
});

test('下载校验后主动询问重启，稍后不打断工作且再次打开无需滚动', async ({}, info) => {
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), 'workbench-update-prompt-'));
  const env: Record<string, string> = { ...process.env, CLEVER_WORKBENCH_DATA_DIR: directory };
  delete env.ELECTRON_RUN_AS_NODE;
  const app = await electron.launch({ args: ['.'], env });
  try {
    const page = await app.firstWindow();
    await expect(page.getByRole('button', { name: '工作台', exact: true })).toBeVisible();
    await expect
      .poll(async () => (await page.evaluate(() => window.desktop.updateSnapshot())).status, {
        timeout: 30000,
      })
      .not.toBe('checking');
    const { currentVersion } = await page.evaluate(() => window.desktop.updateSnapshot());
    const release: NonNullable<UpdateSnapshot['release']> = {
      version: '0.2.0',
      notes: '很长的版本说明。\n'.repeat(500),
      publishedAt: '',
      pageUrl: 'https://github.com/iyanghong/clever-workbench/releases/tag/v0.2.0',
      zip: {
        name: 'update.zip',
        size: 1,
        url: 'https://github.com/iyanghong/clever-workbench/releases/download/v0.2.0/update.zip',
      },
      checksums: {
        name: 'SHA256SUMS',
        size: 1,
        url: 'https://github.com/iyanghong/clever-workbench/releases/download/v0.2.0/SHA256SUMS',
      },
    };
    const show = (status: UpdateSnapshot['status'], preparedId = 'first-download') =>
      app.evaluate(
        ({ BrowserWindow }, state) => {
          BrowserWindow.getAllWindows()[0].webContents.send('update-state', state);
        },
        { status, currentVersion, release, preparedId },
      );
    await app.evaluate(({ ipcMain }) => {
      (globalThis as any).updateInstallRequests = 0;
      ipcMain.removeHandler('update-install');
      ipcMain.handle('update-install', () => {
        (globalThis as any).updateInstallRequests++;
        throw Error('备份目录不可写，请在设置中更换目录后重试。');
      });
    });
    const requests = () => app.evaluate(() => (globalThis as any).updateInstallRequests);
    const prompt = page.getByRole('dialog', { name: '更新已准备好', exact: true });
    const badge = page.getByRole('button', { name: '查看可用更新', exact: true });
    await show('downloading');
    await show('verifying');
    await expect(prompt).toHaveCount(0);
    await show('ready');
    await expect(prompt).toBeVisible();
    await expect(prompt.getByText('v0.2.0 已下载并通过校验')).toBeVisible();
    await expect(prompt.getByRole('button', { name: '稍后重启', exact: true })).toBeInViewport();
    await expect(
      prompt.getByRole('button', { name: '立即重启并更新', exact: true }),
    ).toBeInViewport();
    await page.screenshot({ path: info.outputPath('restart-prompt-light.png') });
    await prompt.getByRole('button', { name: '稍后重启', exact: true }).click();
    await expect(prompt).toHaveCount(0);
    expect(await requests()).toBe(0);
    await page.getByRole('button', { name: '工作台', exact: true }).click();
    await show('ready');
    await expect(prompt).toHaveCount(0);
    await page.evaluate(() =>
      window.desktop.mutate({
        type: 'settings',
        theme: 'dark',
        reduceMotion: true,
        reduceTransparency: true,
        highContrast: true,
      }),
    );
    await app.evaluate(({ BrowserWindow }) =>
      BrowserWindow.getAllWindows()[0].setContentSize(850, 620),
    );
    await badge.click();
    await expect(
      prompt.getByRole('button', { name: '立即重启并更新', exact: true }),
    ).toBeInViewport();
    expect(await prompt.evaluate((el) => el.scrollHeight <= el.clientHeight + 1)).toBe(true);
    await page.screenshot({ path: info.outputPath('restart-prompt-dark-narrow.png') });
    await page.keyboard.press('Escape');
    await expect(prompt).toHaveCount(0);
    await expect(badge).toBeFocused();
    await badge.click();
    await prompt.getByRole('button', { name: '立即重启并更新', exact: true }).click();
    await expect(prompt.getByRole('alert')).toHaveText(
      '备份目录不可写，请在设置中更换目录后重试。',
    );
    expect(await requests()).toBe(1);
    await prompt.getByRole('button', { name: '关闭更新已准备好', exact: true }).click();
    await expect(prompt).toHaveCount(0);
    await show('ready');
    await expect(prompt).toHaveCount(0);
    await show('downloading');
    await show('ready', 'second-download');
    await expect(prompt).toBeVisible();
  } finally {
    await app.close();
    await fs.rm(directory, { recursive: true, force: true });
  }
});

test('development application exposes version details and disables online installation', async () => {
  test.skip(Boolean(process.env.CWB_TEST_EXECUTABLE), 'Development-mode check');
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), 'workbench-update-'));
  const env: Record<string, string> = { ...process.env, CLEVER_WORKBENCH_DATA_DIR: directory };
  delete env.ELECTRON_RUN_AS_NODE;
  const app = await electron.launch({ args: ['.'], env });
  try {
    const page = await app.firstWindow();
    await expect(page.getByRole('button', { name: '查看可用更新' })).toHaveCount(0);
    await page.getByRole('button', { name: '设置', exact: true }).click();
    await expect(page.getByText('开发版本不支持在线更新。')).toBeVisible();
    await expect(page.getByRole('button', { name: '检查更新', exact: true })).toBeDisabled();
    await expect(page.getByRole('button', { name: '历史版本', exact: true })).toBeVisible();
  } finally {
    await app.close();
    await fs.rm(directory, { recursive: true, force: true });
  }
});

test('installed application exposes its packaged version and update checks', async () => {
  test.skip(
    !process.env.CWB_TEST_EXECUTABLE || process.platform !== 'darwin',
    'Installed macOS check',
  );
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), 'workbench-update-installed-'));
  const env: Record<string, string> = { ...process.env, CLEVER_WORKBENCH_DATA_DIR: directory };
  delete env.ELECTRON_RUN_AS_NODE;
  const app = await electron.launch({ args: ['.'], env });
  try {
    const page = await app.firstWindow();
    const state = await page.evaluate(() => window.desktop.updateSnapshot());
    expect(state.status).not.toBe('unsupported');
    await page.getByRole('button', { name: '设置', exact: true }).click();
    await expect(
      page.getByText(`Clever Workbench v${state.currentVersion}`, { exact: true }),
    ).toBeVisible();
    await expect(page.getByRole('button', { name: '检查更新', exact: true })).toBeVisible();
  } finally {
    await app.close();
    await fs.rm(directory, { recursive: true, force: true });
  }
});

test('installed updated application confirms a private pending transaction only after its window and IPC work', async () => {
  test.skip(
    !process.env.CWB_TEST_EXECUTABLE || process.platform !== 'darwin',
    'Installed macOS check',
  );
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), 'workbench-health-installed-'));
  const id = randomUUID(),
    tx = path.join(directory, 'updates', 'transactions', id);
  await fs.mkdir(tx, { recursive: true, mode: 0o700 });
  const { version } = JSON.parse(await fs.readFile('package.json', 'utf8'));
  await fs.writeFile(
    path.join(tx, 'transaction.json'),
    JSON.stringify({
      id,
      createdAt: new Date().toISOString(),
      currentVersion: '0.0.0',
      targetVersion: version,
      target: await fs.realpath(path.resolve(process.env.CWB_TEST_EXECUTABLE!, '../../..')),
      backup: path.join(directory, 'retained.cwb'),
      stageDirectory: path.join(directory, 'stage'),
      userDataDirectory: directory,
    }),
    { mode: 0o600 },
  );
  await fs.writeFile(path.join(tx, 'helper-status'), 'awaiting-health');
  const env: Record<string, string> = { ...process.env, CLEVER_WORKBENCH_DATA_DIR: directory };
  delete env.ELECTRON_RUN_AS_NODE;
  const app = await electron.launch({ args: ['.'], env });
  try {
    const page = await app.firstWindow();
    await expect
      .poll(
        async () =>
          JSON.parse(await fs.readFile(path.join(tx, 'health.json'), 'utf8').catch(() => '{}'))
            .outcome,
      )
      .toBe('success');
    await page.getByRole('button', { name: '设置', exact: true }).click();
    await expect(page.getByText('上次更新：新版本、资料库、窗口与通信检查通过。')).toBeVisible();
    await page.getByText('更新历史（最近 30 次）', { exact: true }).click();
    await expect(page.getByRole('button', { name: '定位旧应用', exact: true })).toBeVisible();
    await fs.writeFile(
      path.join(tx, 'cleanup.json'),
      JSON.stringify({
        previousRemoved: true,
        retiredRemoved: true,
        stageRemoved: true,
      }),
      { mode: 0o600 },
    );
    await expect(
      page.getByText('旧应用和本次下载文件已清理；完整加密备份与更新日志已保留。'),
    ).toBeVisible();
    await expect(page.getByRole('button', { name: '定位旧应用', exact: true })).toHaveCount(0);
    await expect(page.getByRole('button', { name: '定位备份', exact: true })).toBeVisible();
  } finally {
    await app.close();
    await fs.rm(directory, { recursive: true, force: true });
  }
});

test('damaged updater history leaves the local workspace available', async () => {
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), 'workbench-history-damaged-'));
  await fs.mkdir(path.join(directory, 'updates'));
  await fs.writeFile(path.join(directory, 'updates/history.json'), '{damaged');
  const env: Record<string, string> = { ...process.env, CLEVER_WORKBENCH_DATA_DIR: directory };
  delete env.ELECTRON_RUN_AS_NODE;
  const app = await electron.launch({ args: ['.'], env });
  try {
    const page = await app.firstWindow();
    await page.getByRole('button', { name: '设置', exact: true }).click();
    await expect(
      page.getByText('更新记录无法读取，在线更新暂不可用；本地工作空间仍可使用。'),
    ).toBeVisible();
  } finally {
    await app.close();
    await fs.rm(directory, { recursive: true, force: true });
  }
});
