import { electron } from './launch';
import { test, expect } from '@playwright/test';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { randomUUID } from 'node:crypto';

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
    await page.getByRole('button', { name: '应用版本与更新' }).click();
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
      target: path.resolve(process.env.CWB_TEST_EXECUTABLE!, '../../..'),
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
    await page.getByRole('button', { name: '应用版本与更新' }).click();
    await expect(page.getByText('上次更新：新版本、资料库、窗口与通信检查通过。')).toBeVisible();
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
    await page.getByRole('button', { name: '应用版本与更新' }).click();
    await expect(
      page.getByText('更新记录无法读取，在线更新暂不可用；本地工作空间仍可使用。'),
    ).toBeVisible();
  } finally {
    await app.close();
    await fs.rm(directory, { recursive: true, force: true });
  }
});
