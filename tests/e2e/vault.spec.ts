import { openLedgerRecord } from './ledger-actions';
import { electron } from './launch';
import { test, expect } from '@playwright/test';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

test('可选启用主密码后保存秘密，手动锁定及重启后按需解锁，普通元数据仍可查', async ({}, testInfo) => {
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
    await page.getByRole('menuitem', { name: '设置', exact: true }).click();
    await page.getByRole('tab', { name: '凭据保护', exact: true }).click();
    const idleTime = page.getByRole('combobox', { name: '闲置后自动锁定' });
    await expect(idleTime).toHaveCount(0);
    await page.getByRole('button', { name: '启用主密码', exact: true }).click();
    await expect(page.getByRole('dialog')).toContainText('至少 6 个字符');
    await page.getByLabel('主密码', { exact: true }).fill('test1');
    await page.getByLabel('确认主密码').fill('test1');
    await expect(page.getByRole('button', { name: '设置并解锁', exact: true })).toBeDisabled();
    await page.getByLabel('主密码', { exact: true }).fill('test12');
    await page.getByLabel('确认主密码').fill('test12');
    await page.getByRole('button', { name: '设置并解锁', exact: true }).click();
    await expect(page.getByText('15 分钟', { exact: true })).toBeVisible();
    await idleTime.click();
    await page.getByText('1 小时', { exact: true }).click();
    await expect
      .poll(() =>
        page.evaluate(async () => (await window.desktop.snapshot()).settings.vaultIdleMinutes),
      )
      .toBe(60);
    await page.getByRole('tabpanel', { name: '凭据保护' }).screenshot({
      path: testInfo.outputPath('vault-idle-setting.png'),
      animations: 'disabled',
    });
    await page.getByRole('tab', { name: '备份与恢复', exact: true }).click();
    await page.getByRole('button', { name: '设置备份密码', exact: true }).click();
    await page
      .getByRole('dialog', { name: '设置备份密码' })
      .getByRole('button', { name: '取消' })
      .click();
    expect((await page.evaluate(() => window.desktop.vaultStatus())).unlocked).toBe(true);
    await page.getByRole('menuitem', { name: '台账', exact: true }).click();
    await openLedgerRecord(page, '账号', undefined, true);
    await page.getByRole('button', { name: '添加密码', exact: true }).click({ timeout: 3000 });
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
    await page.getByLabel('主密码', { exact: true }).fill('test12');
    await page.getByRole('button', { name: '解锁', exact: true }).click();
    await expect(page.getByLabel('已显示的密码')).toHaveValue('fictional-redis-password');
    await app.close();
    app = await electron.launch({ args: ['.'], env });
    page = await app.firstWindow();
    expect(
      await page.evaluate(async () => (await window.desktop.snapshot()).settings.vaultIdleMinutes),
    ).toBe(60);
    await page.getByRole('menuitem', { name: '台账', exact: true }).click();
    await openLedgerRecord(page, '账号', undefined, true);
    await expect(page.getByLabel('账号用户名', { exact: true })).toHaveValue('admin');
    expect(await page.evaluate(() => window.desktop.vaultStatus())).toMatchObject({
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

test('解锁框在明暗主题下只有外层焦点，显示按钮支持键盘操作', async ({}, testInfo) => {
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), 'workbench-vault-focus-'));
  const env: Record<string, string> = { ...process.env, CLEVER_WORKBENCH_DATA_DIR: directory };
  delete env.ELECTRON_RUN_AS_NODE;
  const app = await electron.launch({ args: ['.'], env });
  try {
    const page = await app.firstWindow();
    await expect(page.getByRole('button', { name: '快速新建', exact: true })).toBeEnabled();
    await page.evaluate(async () => {
      await window.desktop.initializeVault('fictional-master-password');
      await window.desktop.lockVault();
    });
    for (const [theme, highContrast] of [
      ['dark', false],
      ['light', true],
    ] as const) {
      await app.evaluate(
        ({ BrowserWindow }, width) => BrowserWindow.getAllWindows()[0].setSize(width, 720),
        highContrast ? 820 : 1220,
      );
      await page.evaluate(
        ([theme, highContrast]) =>
          window.desktop.mutate({
            type: 'settings',
            theme,
            highContrast,
            reduceMotion: true,
          }),
        [theme, highContrast] as const,
      );
      await expect(page.locator('html')).toHaveAttribute('data-theme', theme);
      const trigger = page.getByRole('button', { name: '解锁秘密', exact: true });
      await trigger.click();
      const dialog = page.getByRole('dialog', { name: '解锁秘密' });
      const input = dialog.getByLabel('主密码', { exact: true });
      const enrollment = dialog.getByRole('checkbox', { name: '启用指纹或 Mac 登录密码解锁' });
      const canEnroll = await page.evaluate(() => window.desktop.canUseMacUnlock());
      if (canEnroll) await expect(enrollment).toBeVisible();
      await expect(input).toBeFocused();
      await expect(input).toHaveCSS('outline-style', 'none');
      const field = dialog.locator('.ant-input-password');
      const activeBorder = await field.evaluate((el) => getComputedStyle(el).borderColor);
      await dialog.screenshot({
        path: testInfo.outputPath(`unlock-${theme}.png`),
        animations: 'disabled',
      });
      if (highContrast) {
        await page.emulateMedia({ forcedColors: 'active' });
        await expect(field).toHaveCSS('outline-style', 'solid');
        await expect(input).toHaveCSS('outline-style', 'none');
        await page.emulateMedia({ forcedColors: 'none' });
      }
      await page.keyboard.press('Tab');
      const reveal = dialog.getByRole('button', { name: '显示', exact: true });
      await expect(reveal).toBeFocused();
      await expect(reveal).toHaveCSS('outline-style', 'solid');
      await page.keyboard.press('Space');
      await expect(input).toHaveAttribute('type', 'text');
      await page.keyboard.press('Space');
      await expect(input).toHaveAttribute('type', 'password');
      await page.keyboard.press('Tab');
      if (canEnroll) {
        await expect(enrollment).toBeFocused();
        await page.keyboard.press('Tab');
      }
      await expect(dialog.getByRole('button', { name: '取消', exact: true })).toBeFocused();
      await expect(field).not.toHaveCSS('border-color', activeBorder);
      await page.keyboard.press('Escape');
      await expect(dialog).toHaveCount(0);
      await expect(trigger).toBeFocused();
    }
  } finally {
    await app.close();
    await fs.rm(directory, { recursive: true, force: true });
  }
});

test('鼠标活动延续解锁，延长期限不会恢复已过期的会话，缩短期限立即生效', async () => {
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), 'workbench-vault-idle-'));
  const env: Record<string, string> = { ...process.env, CLEVER_WORKBENCH_DATA_DIR: directory };
  delete env.ELECTRON_RUN_AS_NODE;
  const app = await electron.launch({ args: ['.'], env });
  try {
    const page = await app.firstWindow();
    const start = Date.now();
    await page.clock.install({ time: start - 1000 });
    async function atMinute(minute: number, seconds = 0) {
      const time = start + minute * 60_000 + seconds * 1000;
      await app.evaluate((_, time) => {
        Date.now = () => time;
      }, time);
      await page.clock.pauseAt(time);
    }
    await expect(page.getByRole('button', { name: '快速新建', exact: true })).toBeEnabled();
    await atMinute(0);
    await page.evaluate(() => window.desktop.initializeVault('fictional-master-password'));
    await expect(page.getByRole('button', { name: '锁定秘密', exact: true })).toBeVisible();
    await atMinute(14);
    await page.mouse.move(120, 180);
    await atMinute(14, 7);
    await page.mouse.move(140, 180);
    await atMinute(14, 10);
    await atMinute(16);
    expect((await page.evaluate(() => window.desktop.vaultStatus())).unlocked).toBe(true);
    await atMinute(29, 6);
    expect((await page.evaluate(() => window.desktop.vaultStatus())).unlocked).toBe(true);
    await atMinute(29, 7);
    await page.evaluate(() => window.desktop.mutate({ type: 'settings', vaultIdleMinutes: 60 }));
    await expect(page.getByRole('button', { name: '解锁秘密', exact: true })).toBeVisible();
    await page.evaluate(() => window.desktop.unlockVault('fictional-master-password'));
    await expect(page.getByRole('button', { name: '锁定秘密', exact: true })).toBeVisible();
    await atMinute(35);
    await page.evaluate(() => window.desktop.mutate({ type: 'settings', vaultIdleMinutes: 5 }));
    await expect(page.getByRole('button', { name: '解锁秘密', exact: true })).toBeVisible();
    await page.evaluate(() => window.desktop.mutate({ type: 'settings', vaultIdleMinutes: 480 }));
    for (const event of ['suspend', 'lock-screen'] as const) {
      await page.evaluate(() => window.desktop.unlockVault('fictional-master-password'));
      await app.evaluate(({ powerMonitor }, event) => powerMonitor.emit(event), event);
      expect((await page.evaluate(() => window.desktop.vaultStatus())).unlocked).toBe(false);
    }
  } finally {
    await app.close();
    await fs.rm(directory, { recursive: true, force: true });
  }
});

test('秘密在可信侧复制，30 秒清理及锁屏事件撤销访问，取消解锁不改剪贴板', async () => {
  test.setTimeout(90_000);
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), 'workbench-secret-copy-ui-'));
  const env: Record<string, string> = { ...process.env, CLEVER_WORKBENCH_DATA_DIR: directory };
  delete env.ELECTRON_RUN_AS_NODE;
  const app = await electron.launch({ args: ['.'], env });
  try {
    const page = await app.firstWindow();
    const accountId = await page.evaluate(async () => {
      const systemId = (await window.desktop.mutate({ type: 'system.save', name: '订单平台' }))
        .createdId!;
      const environmentId = (
        await window.desktop.mutate({ type: 'environment.save', systemId, name: '生产' })
      ).createdId!;
      const account = (
        await window.desktop.mutate({ type: 'account.save', environmentId, name: '超管' })
      ).createdId!;
      await window.desktop.initializeVault('fictional-master-password');
      await window.desktop.saveSecret(account, 'password', 'fictional-clipboard-secret');
      return account;
    });
    await page.getByRole('menuitem', { name: '台账', exact: true }).click();
    await openLedgerRecord(page, '账号', undefined, true);
    await page.getByRole('button', { name: '复制密码', exact: true }).click({ timeout: 3000 });
    await expect
      .poll(() => app.evaluate(({ clipboard }) => clipboard.readText()))
      .toBe('fictional-clipboard-secret');
    await expect
      .poll(() => app.evaluate(({ clipboard }) => clipboard.readText()), {
        timeout: 35_000,
        intervals: [1000],
      })
      .toBe('');
    await page.getByRole('button', { name: '复制密码', exact: true }).click();
    await page.getByRole('button', { name: '查看密码', exact: true }).click();
    await expect(page.getByLabel('已显示的密码')).toBeVisible();
    await app.evaluate(async ({ clipboard, powerMonitor }) => {
      await clipboard.writeText('later ordinary text');
      powerMonitor.emit('lock-screen');
    });
    await expect(page.getByLabel('已显示的密码')).toHaveCount(0);
    expect(await app.evaluate(({ clipboard }) => clipboard.readText())).toBe('later ordinary text');
    expect(
      await page.evaluate(async (id) => {
        try {
          await window.desktop.copySecret(id, 'password');
          return 'unexpected';
        } catch (error) {
          return String(error);
        }
      }, accountId),
    ).toContain('解锁');
    await page.getByRole('button', { name: '复制密码', exact: true }).click();
    await page.getByRole('button', { name: '取消', exact: true }).click();
    expect(await app.evaluate(({ clipboard }) => clipboard.readText())).toBe('later ordinary text');
  } finally {
    await app.close();
    await fs.rm(directory, { recursive: true, force: true });
  }
});

test('账号和资源的秘密复制必须明确勾选，取消解锁不创建副本', async () => {
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), 'workbench-secret-clone-ui-'));
  const env: Record<string, string> = { ...process.env, CLEVER_WORKBENCH_DATA_DIR: directory };
  delete env.ELECTRON_RUN_AS_NODE;
  const app = await electron.launch({ args: ['.'], env });
  try {
    const page = await app.firstWindow();
    await page.evaluate(async () => {
      const systemId = (await window.desktop.mutate({ type: 'system.save', name: '订单平台' }))
        .createdId!;
      const environmentId = (
        await window.desktop.mutate({ type: 'environment.save', systemId, name: '生产' })
      ).createdId!;
      const resourceId = (
        await window.desktop.mutate({
          type: 'resource.save',
          environmentId,
          kind: 'redis',
          name: '生产缓存',
        })
      ).createdId!;
      const account = (
        await window.desktop.mutate({
          type: 'account.save',
          environmentId,
          resourceId,
          name: '连接账号',
        })
      ).createdId!;
      await window.desktop.initializeVault('fictional-master-password');
      await window.desktop.saveSecret(account, 'password', 'fictional-clone-secret');
      await window.desktop.lockVault();
    });
    await page.getByRole('menuitem', { name: '台账', exact: true }).click();
    await openLedgerRecord(page, '账号', '连接账号', true);
    await page.getByRole('button', { name: '复制账号', exact: true }).click();
    await expect(page.getByLabel('同时复制账号秘密')).not.toBeChecked();
    await page.getByLabel('同时复制账号秘密').check();
    await page.getByRole('button', { name: '创建副本', exact: true }).click();
    await page
      .getByRole('dialog', { name: '解锁秘密' })
      .getByRole('button', { name: '取消', exact: true })
      .click();
    expect(await page.evaluate(async () => (await window.desktop.snapshot()).accounts.length)).toBe(
      1,
    );
    await page.getByRole('button', { name: '创建副本', exact: true }).click();
    await page.getByLabel('主密码', { exact: true }).fill('fictional-master-password');
    await page.getByRole('button', { name: '解锁', exact: true }).click();
    await expect(page.getByLabel('账号用途', { exact: true })).toHaveValue('连接账号 副本');
    await page.getByRole('button', { name: '查看密码', exact: true }).click();
    await expect(page.getByLabel('已显示的密码')).toHaveValue('fictional-clone-secret');
    await openLedgerRecord(page, '数据库／中间件', '生产缓存', true);
    await page.getByRole('button', { name: '复制资源', exact: true }).click();
    await expect(page.getByLabel('同时复制资源账号和秘密')).not.toBeChecked();
    await page.getByLabel('同时复制资源账号和秘密').check();
    await page.getByRole('button', { name: '创建副本', exact: true }).click();
    await page
      .getByRole('complementary', { name: '台账详情' })
      .getByRole('button', { name: '编辑', exact: true })
      .click();
    await expect(page.getByLabel('资源名称', { exact: true })).toHaveValue('生产缓存 副本');
    const snapshot = await page.evaluate(() => window.desktop.snapshot());
    expect(snapshot.resources).toHaveLength(2);
    expect(snapshot.accounts).toHaveLength(4);
    expect(snapshot.accounts.every((item) => item.secretKinds.includes('password'))).toBe(true);
  } finally {
    await app.close();
    await fs.rm(directory, { recursive: true, force: true });
  }
});
