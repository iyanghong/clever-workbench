import { test, expect } from '@playwright/test';
import { electron } from './launch';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

test('密码列显隐、当前范围批量展示与整行复制沿用解锁和清理', async ({}, info) => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'workbench-account-list-'));
  const env: Record<string, string> = { ...process.env, CLEVER_WORKBENCH_DATA_DIR: root };
  delete env.ELECTRON_RUN_AS_NODE;
  const app = await electron.launch({ args: ['.'], env });
  try {
    const page = await app.firstWindow();
    await page.getByRole('button', { name: '台账', exact: true }).waitFor();
    const ids = await page.evaluate(async () => {
      const api = window.desktop;
      const systemId = (
        await api.mutate({
          type: 'system.save',
          name: '协作平台',
          url: 'https://app.example.invalid',
        })
      ).createdId!;
      const prod = (await api.mutate({ type: 'environment.save', systemId, name: '生产' }))
        .createdId!;
      const test = (await api.mutate({ type: 'environment.save', systemId, name: '测试' }))
        .createdId!;
      const entry = (
        await api.mutate({
          type: 'access.save',
          systemId,
          environmentId: prod,
          name: 'Jenkins',
          addresses: [
            { label: '内网', url: 'https://internal.example.invalid' },
            { label: '常用', url: 'https://ci.example.invalid' },
          ],
        })
      ).createdId!;
      const access = (await api.snapshot()).accessEntries[0];
      await api.mutate({
        type: 'access.save',
        id: entry,
        preferredAddressId: access.addresses[1].id,
      });
      const admin = (
        await api.mutate({
          type: 'account.save',
          accessId: entry,
          environmentId: prod,
          name: '运维',
          username: 'operator',
        })
      ).createdId!;
      const reader = (
        await api.mutate({
          type: 'account.save',
          environmentId: test,
          name: '只读',
          username: 'reader',
        })
      ).createdId!;
      const token = (
        await api.mutate({
          type: 'account.save',
          environmentId: prod,
          name: '自动化',
          username: 'bot',
        })
      ).createdId!;
      await api.initializeVault('fixture-master');
      await api.saveSecret(admin, 'password', 'fixture-admin-password');
      await api.saveSecret(reader, 'password', 'fixture-reader-password');
      await api.saveSecret(token, 'token', 'fixture-token-not-password');
      await api.lockVault();
      return { admin, reader, prod, test };
    });
    await page.getByRole('button', { name: '台账', exact: true }).click();
    await page.getByRole('button', { name: '账号', exact: true }).click();
    const table = page.locator('.account-table');
    await expect(table.getByRole('columnheader', { name: '密码', exact: true })).toBeVisible();
    await expect(table.getByLabel('隐藏的密码 运维', { exact: true })).toHaveText('***');
    await expect(table).not.toContainText('fixture-admin-password');
    await expect(table).toContainText('未保存密码');
    await app.evaluate(({ clipboard }) => clipboard.writeText('clipboard-before-cancel'));
    await table.getByRole('button', { name: '复制整行 Jenkins / 运维', exact: true }).click();
    await page.getByRole('dialog').getByRole('button', { name: '取消', exact: true }).click();
    expect(await app.evaluate(({ clipboard }) => clipboard.readText())).toBe(
      'clipboard-before-cancel',
    );
    await expect(table).not.toContainText('fixture-admin-password');
    await page.getByRole('button', { name: '显示当前列表密码', exact: true }).click();
    await page.getByLabel('主密码', { exact: true }).fill('fixture-master');
    await page.getByRole('button', { name: '解锁', exact: true }).click();
    await expect(table.getByLabel('已显示的密码 运维', { exact: true })).toHaveText(
      'fixture-admin-password',
    );
    await expect(table.getByLabel('已显示的密码 只读', { exact: true })).toHaveText(
      'fixture-reader-password',
    );
    await page.screenshot({
      path: info.outputPath('account-list-visible.png'),
      animations: 'disabled',
    });
    await page.getByRole('button', { name: '隐藏当前列表密码', exact: true }).click();
    await expect(table).not.toContainText('fixture-admin-password');
    await table.getByRole('button', { name: '显示密码 运维', exact: true }).click();
    await expect(table.getByLabel('已显示的密码 运维', { exact: true })).toHaveText(
      'fixture-admin-password',
    );
    await expect(table.getByLabel('隐藏的密码 只读', { exact: true })).toHaveText('***');
    await page.getByLabel('台账环境筛选').selectOption(ids.prod);
    await expect(table).not.toContainText('fixture-admin-password');
    await page.getByRole('button', { name: '显示当前列表密码', exact: true }).click();
    await expect(table).toContainText('fixture-admin-password');
    await expect(table).not.toContainText('fixture-reader-password');
    await page.getByLabel('搜索台账清单').fill('运维');
    await expect(table).not.toContainText('fixture-admin-password');
    const row = table.getByRole('row').filter({ hasText: 'operator' });
    await row.locator('td').first().getByRole('button').click();
    await expect(table.getByRole('columnheader', { name: '密码', exact: true })).toBeVisible();
    await expect(
      row.getByRole('button', { name: '复制整行 Jenkins / 运维', exact: true }),
    ).toBeVisible();
    await page.getByRole('button', { name: '返回清单', exact: true }).click();
    await row.locator('.account-copy-field').first().hover();
    await row.getByRole('button', { name: '复制用户名 运维 operator', exact: true }).click();
    await expect.poll(() => app.evaluate(({ clipboard }) => clipboard.readText())).toBe('operator');
    await row.locator('.account-password-field').hover();
    await row.getByRole('button', { name: '复制密码 运维 operator', exact: true }).click();
    await expect
      .poll(() => app.evaluate(({ clipboard }) => clipboard.readText()))
      .toBe('fixture-admin-password');
    await row.getByRole('button', { name: '复制整行 Jenkins / 运维', exact: true }).click();
    await expect
      .poll(() => app.evaluate(({ clipboard }) => clipboard.readText()))
      .toBe('Jenkins / 运维\nhttps://ci.example.invalid\noperator\nfixture-admin-password');
    await page.getByRole('button', { name: '显示当前列表密码', exact: true }).click();
    await expect(table).toContainText('fixture-admin-password');
    await app.evaluate(({ powerMonitor }) => {
      powerMonitor.emit('lock-screen');
    });
    await expect(table).not.toContainText('fixture-admin-password');
    await expect.poll(() => app.evaluate(({ clipboard }) => clipboard.readText())).toBe('');
    await page.getByLabel('搜索台账清单').fill('自动化');
    await table.getByRole('button', { name: '复制整行 协作平台 / 自动化', exact: true }).click();
    await expect
      .poll(() => app.evaluate(({ clipboard }) => clipboard.readText()))
      .toBe('协作平台 / 自动化\nhttps://app.example.invalid\nbot\n');
    await expect(page.getByRole('dialog')).toHaveCount(0);
    await expect(
      table.getByRole('button', { name: '复制Token 自动化 bot', exact: true }),
    ).toBeVisible();
    await expect(table).not.toContainText('fixture-token-not-password');
    await page.getByLabel('搜索台账清单').fill('');
    await page.getByLabel('台账环境筛选').selectOption('all');
    await page.screenshot({
      path: info.outputPath('account-list-masked.png'),
      animations: 'disabled',
    });
    expect(await page.evaluate(() => Object.values(localStorage).join(''))).not.toContain(
      'fixture-admin-password',
    );
    // Hold a renderer read after the main-process boundary to exercise stale responses.
    await page.evaluate(() => window.desktop.unlockVault('fixture-master'));
    await app.evaluate(({ ipcMain }) => {
      ipcMain.removeHandler('secret-read');
      ipcMain.handle(
        'secret-read',
        () =>
          new Promise<string>((resolve) => {
            (globalThis as any).accountListReleaseRead = () => resolve('fixture-late-password');
          }),
      );
    });
    for (const action of ['filter', 'lock'] as const) {
      await app.evaluate(() => {
        (globalThis as any).accountListReleaseRead = null;
      });
      await page.getByRole('button', { name: '显示当前列表密码', exact: true }).click();
      await expect
        .poll(() => app.evaluate(() => typeof (globalThis as any).accountListReleaseRead))
        .toBe('function');
      if (action === 'filter') await page.getByLabel('搜索台账清单').fill('运维');
      else await page.evaluate(() => window.desktop.lockVault());
      await app.evaluate(() => (globalThis as any).accountListReleaseRead());
      await expect(table).not.toContainText('fixture-late-password');
      await expect(
        page.getByRole('button', { name: '显示当前列表密码', exact: true }),
      ).toBeVisible();
    }
    await page.setViewportSize({ width: 960, height: 680 });
    await page.screenshot({
      path: info.outputPath('account-list-narrow.png'),
      animations: 'disabled',
    });
  } finally {
    await app.close();
    await fs.rm(root, { recursive: true, force: true });
  }
});
