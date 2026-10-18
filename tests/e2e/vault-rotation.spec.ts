import { electron } from './launch';
import { test, expect } from '@playwright/test';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
test('设置更改主密码验证旧密码与新密码确认，取消不变更，成功锁定且重启用新密码', async ({}, testInfo) => {
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), 'workbench-password-change-')),
    env: Record<string, string> = { ...process.env, CLEVER_WORKBENCH_DATA_DIR: directory };
  delete env.ELECTRON_RUN_AS_NODE;
  let app = await electron.launch({ args: ['.'], env });
  try {
    let page = await app.firstWindow();
    const accountId = await page.evaluate(async () => {
      const systemId = (await window.desktop.mutate({ type: 'system.save', name: '密码轮换平台' }))
        .createdId!;
      const environmentId = (
        await window.desktop.mutate({ type: 'environment.save', systemId, name: '生产' })
      ).createdId!;
      const accountId = (
        await window.desktop.mutate({ type: 'account.save', environmentId, name: '超管' })
      ).createdId!;
      await window.desktop.initializeVault('fictional-previous-password');
      await window.desktop.saveSecret(accountId, 'password', 'fictional-secret');
      return accountId;
    });
    await page.getByRole('button', { name: '设置', exact: true }).click();
    await page.getByRole('button', { name: '更改主密码', exact: true }).click();
    await page.getByLabel('当前主密码', { exact: true }).fill('fictional-previous-password');
    await page.getByLabel('新主密码', { exact: true }).fill('fictional-next-password');
    await page.getByLabel('确认新主密码', { exact: true }).fill('fictional-next-password');
    await page.screenshot({ path: testInfo.outputPath('password-change.png') });
    await page.getByRole('button', { name: '取消', exact: true }).click();
    await page.evaluate(() => window.desktop.lockVault());
    await page.evaluate(() => window.desktop.unlockVault('fictional-previous-password'));
    await page.getByRole('button', { name: '更改主密码', exact: true }).click();
    await expect(page.getByLabel('当前主密码', { exact: true })).toHaveValue('');
    await page.getByLabel('当前主密码', { exact: true }).fill('wrong-password');
    await page.getByLabel('新主密码', { exact: true }).fill('fictional-next-password');
    await page.getByLabel('确认新主密码', { exact: true }).fill('different-confirmation');
    await page.getByRole('button', { name: '保存新主密码', exact: true }).click();
    await expect(page.getByRole('dialog').getByRole('alert')).toContainText('不一致');
    await page.getByLabel('确认新主密码', { exact: true }).fill('fictional-next-password');
    await page.getByRole('button', { name: '保存新主密码', exact: true }).click();
    await expect(page.getByRole('dialog').getByRole('alert')).toContainText('当前主密码错误');
    expect(await page.evaluate((id) => window.desktop.readSecret(id, 'password'), accountId)).toBe(
      'fictional-secret',
    );
    await page.getByLabel('当前主密码', { exact: true }).fill('fictional-previous-password');
    await page.getByRole('button', { name: '保存新主密码', exact: true }).click();
    await expect(page.getByRole('status').filter({ hasText: '主密码已更改' })).toBeVisible();
    expect((await page.evaluate(() => window.desktop.vaultStatus())).unlocked).toBe(false);
    expect(
      await page.evaluate(() =>
        window.desktop.unlockVault('fictional-previous-password').then(
          () => 'unexpected',
          (cause) => String(cause),
        ),
      ),
    ).toContain('密码错误');
    await app.close();
    app = await electron.launch({ args: ['.'], env });
    page = await app.firstWindow();
    await page.evaluate(() => window.desktop.unlockVault('fictional-next-password'));
    expect(await page.evaluate((id) => window.desktop.readSecret(id, 'password'), accountId)).toBe(
      'fictional-secret',
    );
  } finally {
    await app.close();
    await fs.rm(directory, { recursive: true, force: true });
  }
});
