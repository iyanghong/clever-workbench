import { test, expect } from '@playwright/test';
import { electron } from './launch';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

test('真实系统加密支持无主密码凭据、独立备份密码与重启读取', async () => {
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), 'workbench-native-protection-'));
  const filename = path.join(directory, 'portable.cwb');
  const env: Record<string, string> = { ...process.env, CLEVER_WORKBENCH_DATA_DIR: directory };
  delete env.ELECTRON_RUN_AS_NODE;
  let app = await electron.launch({ args: ['.'], env });
  try {
    let page = await app.firstWindow();
    await expect
      .poll(() => page.evaluate(() => window.desktop.vaultStatus()))
      .toMatchObject({ mode: 'system', initialized: false });
    const accountId = await page.evaluate(async () => {
      const systemId = (await window.desktop.mutate({ type: 'system.save', name: '系统保护验证' }))
        .createdId!;
      const environmentId = (
        await window.desktop.mutate({ type: 'environment.save', systemId, name: '测试' })
      ).createdId!;
      const accountId = (
        await window.desktop.mutate({ type: 'account.save', environmentId, name: '连接' })
      ).createdId!;
      await window.desktop.saveSecret(accountId, 'password', 'fixture-native-system-secret');
      return accountId;
    });
    expect(await page.evaluate((id) => window.desktop.readSecret(id, 'password'), accountId)).toBe(
      'fixture-native-system-secret',
    );
    await app.evaluate(({ dialog }, target) => {
      dialog.showSaveDialog = async () => ({ canceled: false, filePath: target });
    }, filename);
    await page.getByRole('button', { name: '设置', exact: true }).click();
    await page.getByRole('button', { name: '导出完整备份', exact: true }).click();
    const setup = page.getByRole('dialog', { name: '设置备份密码', exact: true });
    await expect(setup).toBeVisible();
    await setup.getByRole('button', { name: '取消', exact: true }).click();
    await expect
      .poll(() => page.evaluate(() => window.desktop.vaultStatus()))
      .toMatchObject({ backupConfigured: false });
    await page.getByRole('button', { name: '导出完整备份', exact: true }).click();
    await setup.getByLabel('备份密码', { exact: true }).fill('fixture-native-backup-password');
    await setup.getByLabel('确认备份密码', { exact: true }).fill('fixture-native-backup-password');
    await setup.getByRole('button', { name: '保存并继续', exact: true }).click();
    await expect
      .poll(async () => {
        try {
          return (await fs.readFile(filename)).subarray(0, 8).toString();
        } catch (cause) {
          if ((cause as NodeJS.ErrnoException).code === 'ENOENT') return null;
          throw cause;
        }
      })
      .toBe('CWBK0002');
    await expect
      .poll(() => page.evaluate(() => window.desktop.vaultStatus()))
      .toMatchObject({ mode: 'system', initialized: false, backupConfigured: true });
    await page.getByRole('button', { name: '启用主密码', exact: true }).click();
    await page.getByLabel('主密码', { exact: true }).fill('fixture-optional-master');
    await page.getByLabel('确认主密码', { exact: true }).fill('fixture-optional-master');
    await page.getByRole('button', { name: '设置并解锁', exact: true }).click();
    await expect(page.getByRole('dialog')).toHaveCount(0);
    await page.getByRole('button', { name: '关闭主密码', exact: true }).click();
    await page.getByLabel('当前主密码', { exact: true }).fill('wrong-password');
    await page.getByRole('button', { name: '验证并关闭主密码', exact: true }).click();
    await expect(page.getByRole('dialog').getByRole('alert')).toContainText('密码错误');
    await page.getByLabel('当前主密码', { exact: true }).fill('fixture-optional-master');
    await page.getByRole('button', { name: '验证并关闭主密码', exact: true }).click();
    await expect(page.getByRole('dialog')).toHaveCount(0);
    await expect
      .poll(() => page.evaluate(() => window.desktop.vaultStatus()))
      .toMatchObject({ mode: 'system', backupConfigured: true });
    await app.close();
    app = await electron.launch({ args: ['.'], env });
    page = await app.firstWindow();
    expect(await page.evaluate((id) => window.desktop.readSecret(id, 'password'), accountId)).toBe(
      'fixture-native-system-secret',
    );
    await page.evaluate(() => window.desktop.lockVault());
    await app.evaluate(({ safeStorage, dialog }, filePath) => {
      const decrypt = safeStorage.decryptString;
      (globalThis as any).restoreSystemDecrypt = () => {
        safeStorage.decryptString = decrypt;
      };
      safeStorage.decryptString = () => {
        throw new Error('模拟旧系统保护材料不可用');
      };
      dialog.showOpenDialog = async () => ({ canceled: false, filePaths: [filePath] });
    }, filename);
    await page.getByRole('button', { name: '设置', exact: true }).click();
    await page.getByRole('button', { name: '从备份恢复', exact: true }).click();
    await page.getByLabel('备份密码', { exact: true }).fill('fixture-native-backup-password');
    await page.getByRole('button', { name: '校验备份', exact: true }).click();
    await page.getByRole('button', { name: '恢复备份', exact: true }).click();
    await expect(page.getByRole('status').filter({ hasText: '恢复完成' })).toBeVisible();
    await app.evaluate(() => (globalThis as any).restoreSystemDecrypt());
    expect(await page.evaluate((id) => window.desktop.readSecret(id, 'password'), accountId)).toBe(
      'fixture-native-system-secret',
    );
  } finally {
    await app.close();
    await fs.rm(directory, { recursive: true, force: true });
  }
});

test('准备保存期间取消密码配置不会在取消后开启保护或生成备份材料', async () => {
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), 'workbench-protection-cancel-'));
  const env: Record<string, string> = { ...process.env, CLEVER_WORKBENCH_DATA_DIR: directory };
  delete env.ELECTRON_RUN_AS_NODE;
  const app = await electron.launch({ args: ['.'], env });
  try {
    const page = await app.firstWindow();
    // Wait for React's save coordinator before replacing it with the held flush fixture.
    await expect(page.getByRole('button', { name: '快速新建', exact: true })).toBeEnabled();
    for (const operation of ['initializeVault', 'configureBackup'] as const) {
      await page.evaluate((operation) => {
        const state = window as typeof window & { release?: () => void; result?: Promise<string> };
        window.desktop.onFlush(
          () =>
            new Promise<void>((resolve) => {
              state.release = resolve;
            }),
        );
        state.result = window.desktop[operation]('fixture-cancelled-password').then(
          () => 'unexpected',
          String,
        );
      }, operation);
      await expect.poll(() => page.evaluate(() => typeof (window as any).release)).toBe('function');
      await page.evaluate(async () => {
        await window.desktop.lockVault();
        (window as any).release();
        delete (window as any).release;
      });
      expect(await page.evaluate(() => (window as any).result)).toContain('取消');
      expect(await page.evaluate(() => window.desktop.vaultStatus())).toMatchObject({
        mode: 'system',
        initialized: false,
        backupConfigured: false,
      });
    }
  } finally {
    const page = await app.firstWindow();
    await page.evaluate(() => {
      (window as any).release?.();
      window.desktop.onFlush(async () => {});
    });
    await app.close();
    await fs.rm(directory, { recursive: true, force: true });
  }
});
