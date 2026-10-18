import { test, expect, _electron as electron } from '@playwright/test';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

test('首次保存秘密设置主密码，手动锁定及重启后按需解锁，普通元数据仍可查', async ({}, testInfo) => {
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), 'workbench-vault-ui-'));
  const env: Record<string, string> = { ...process.env, CLEVER_WORKBENCH_DATA_DIR: directory };
  delete env.ELECTRON_RUN_AS_NODE;
  let app = await electron.launch({ args: ['.'], env });
  try {
    let page = await app.firstWindow();
    await page.evaluate(async () => {
      const systemId = (await window.desktop.mutate({ type: 'system.save', name: '订单平台' }))
        .createdId!;
      const environmentId = (
        await window.desktop.mutate({ type: 'environment.save', systemId, name: '生产' })
      ).createdId!;
      await window.desktop.mutate({
        type: 'account.save',
        environmentId,
        name: '超管',
        username: 'admin',
      });
    });
    await page.getByRole('button', { name: '台账', exact: true }).click();
    await page.getByRole('tab', { name: '账号', exact: true }).click();
    await page.getByRole('button', { name: '添加密码', exact: true }).click({ timeout: 3000 });
    await page.getByLabel('主密码', { exact: true }).fill('fictional-master-password-2026');
    await page.getByLabel('确认主密码').fill('fictional-master-password-2026');
    await page.getByRole('button', { name: '设置并解锁', exact: true }).click();
    await page.getByLabel('秘密内容', { exact: true }).fill('fictional-redis-password');
    await page.getByRole('button', { name: '保存秘密', exact: true }).click();
    await expect(page.getByText('fictional-redis-password', { exact: true })).toHaveCount(0);
    await page.getByRole('button', { name: '查看密码', exact: true }).click();
    await expect(page.getByLabel('已显示的密码')).toHaveValue('fictional-redis-password');
    await page.getByRole('button', { name: '锁定秘密', exact: true }).click();
    await expect(page.getByLabel('已显示的密码')).toHaveCount(0);
    await expect(page.getByLabel('账号用户名', { exact: true })).toHaveValue('admin');
    await page.getByRole('button', { name: '查看密码', exact: true }).click();
    await page.getByLabel('主密码', { exact: true }).fill('wrong-master-password');
    await page.getByRole('button', { name: '解锁', exact: true }).click();
    await expect(page.getByRole('dialog').getByRole('alert')).toContainText('主密码');
    await page.getByLabel('主密码', { exact: true }).fill('fictional-master-password-2026');
    await page.getByRole('button', { name: '解锁', exact: true }).click();
    await expect(page.getByLabel('已显示的密码')).toHaveValue('fictional-redis-password');
    await app.close();
    app = await electron.launch({ args: ['.'], env });
    page = await app.firstWindow();
    await page.getByRole('button', { name: '台账', exact: true }).click();
    await page.getByRole('tab', { name: '账号', exact: true }).click();
    await expect(page.getByLabel('账号用户名', { exact: true })).toHaveValue('admin');
    expect(await page.evaluate(() => window.desktop.vaultStatus())).toEqual({
      initialized: true,
      unlocked: false,
    });
    const direct = await page.evaluate(async () => {
      const account = (await window.desktop.snapshot()).accounts[0];
      try {
        await window.desktop.readSecret(account.id, 'password');
        return 'unexpected access';
      } catch (error) {
        return String(error);
      }
    });
    expect(direct).toContain('解锁');
    await page.getByRole('button', { name: '查看密码', exact: true }).click();
    await expect(page.getByRole('dialog', { name: '解锁秘密' })).toBeVisible();
    await page.getByRole('button', { name: '取消', exact: true }).click();
    await expect(page.getByLabel('已显示的密码')).toHaveCount(0);
    await page.screenshot({ path: testInfo.outputPath('vault-locked.png') });
  } finally {
    await app.close();
    await fs.rm(directory, { recursive: true, force: true });
  }
});
