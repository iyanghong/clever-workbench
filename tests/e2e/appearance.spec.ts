import { test, expect, _electron as electron } from '@playwright/test';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

test('主题跟随与手动覆盖，透明度／对比／动态偏好可保存，键盘操作与弹层焦点有效', async ({}, testInfo) => {
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), 'workbench-appearance-')),
    env: Record<string, string> = { ...process.env, CLEVER_WORKBENCH_DATA_DIR: directory };
  delete env.ELECTRON_RUN_AS_NODE;
  let app = await electron.launch({ args: ['.'], env });
  try {
    let page = await app.firstWindow();
    await page.getByRole('button', { name: '设置', exact: true }).click();
    await page.getByRole('button', { name: '浅色', exact: true }).click();
    await expect(page.getByRole('button', { name: '浅色', exact: true })).toHaveAttribute(
      'aria-pressed',
      'true',
    );
    await page.emulateMedia({ colorScheme: 'dark' });
    await expect(page.locator('html')).toHaveAttribute('data-theme', 'light');
    await page.screenshot({
      animations: 'disabled',
      path: testInfo.outputPath('settings-light.png'),
    });
    await page.getByRole('button', { name: '系统', exact: true }).click();
    await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark');
    await page.emulateMedia({ colorScheme: 'light' });
    await expect(page.locator('html')).toHaveAttribute('data-theme', 'light');
    await page.getByRole('button', { name: '深色', exact: true }).click();
    await expect(page.getByRole('button', { name: '深色', exact: true })).toHaveAttribute(
      'aria-pressed',
      'true',
    );
    await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark');
    await page.screenshot({
      animations: 'disabled',
      path: testInfo.outputPath('settings-dark.png'),
    });
    await page.getByRole('switch', { name: '减少透明度', exact: true }).check();
    await page.getByRole('switch', { name: '增强对比', exact: true }).check();
    await page.getByRole('switch', { name: '减少动态效果', exact: true }).check();
    await expect(page.locator('html')).toHaveAttribute('data-reduce-transparency', 'true');
    await expect(page.locator('html')).toHaveAttribute('data-high-contrast', 'true');
    await expect(page.locator('html')).toHaveAttribute('data-reduce-motion', 'true');
    expect(
      await page
        .locator('.sidebar')
        .evaluate((element) => getComputedStyle(element).backdropFilter),
    ).toBe('none');
    expect(
      await page
        .getByRole('button', { name: '快速新建', exact: true })
        .evaluate((element) => getComputedStyle(element).transitionDuration),
    ).toBe('0s');
    await page.screenshot({
      animations: 'disabled',
      path: testInfo.outputPath('settings-accessible.png'),
    });
    const newButton = page.getByRole('button', { name: '快速新建', exact: true });
    await newButton.focus();
    await page.keyboard.press('Enter');
    await expect(page.getByRole('dialog', { name: '快速新建', exact: true })).toBeVisible();
    await page.keyboard.press('Escape');
    await expect(newButton).toBeFocused();
    expect(await newButton.evaluate((element) => getComputedStyle(element).outlineStyle)).not.toBe(
      'none',
    );
    await page.getByRole('button', { name: '工作台', exact: true }).focus();
    await page.keyboard.press('Enter');
    await page.getByLabel('快速新增任务').focus();
    await page.keyboard.type('键盘完成工作');
    await page.keyboard.press('Enter');
    await expect
      .poll(async () => (await page.evaluate(() => window.desktop.snapshot())).tasks.length)
      .toBe(1);
    await app.close();
    app = await electron.launch({ args: ['.'], env });
    page = await app.firstWindow();
    await page.getByRole('button', { name: '设置', exact: true }).click();
    await expect(page.getByRole('button', { name: '深色', exact: true })).toHaveAttribute(
      'aria-pressed',
      'true',
    );
    for (const name of ['减少透明度', '增强对比', '减少动态效果'])
      await expect(page.getByRole('switch', { name, exact: true })).toBeChecked();
  } finally {
    await app.close();
    await fs.rm(directory, { recursive: true, force: true });
  }
});

test('系统减少动态效果生效，原生可访问性变化更新全局材质', async () => {
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), 'workbench-system-appearance-')),
    env: Record<string, string> = { ...process.env, CLEVER_WORKBENCH_DATA_DIR: directory };
  delete env.ELECTRON_RUN_AS_NODE;
  const app = await electron.launch({ args: ['.'], env });
  try {
    const page = await app.firstWindow();
    await page.emulateMedia({ reducedMotion: 'reduce' });
    await expect(page.locator('html')).toHaveAttribute('data-reduce-motion', 'true');
    await app.evaluate(({ nativeTheme }) => {
      Object.defineProperty(nativeTheme, 'prefersReducedTransparency', {
        configurable: true,
        value: true,
      });
      Object.defineProperty(nativeTheme, 'shouldUseHighContrastColors', {
        configurable: true,
        value: true,
      });
      nativeTheme.emit('updated');
    });
    await expect(page.locator('html')).toHaveAttribute('data-reduce-transparency', 'true');
    await expect(page.locator('html')).toHaveAttribute('data-high-contrast', 'true');
    expect(
      await page
        .locator('.sidebar')
        .evaluate((element) => getComputedStyle(element).backdropFilter),
    ).toBe('none');
    await app.evaluate(({ nativeTheme }) => {
      Object.defineProperty(nativeTheme, 'prefersReducedTransparency', {
        configurable: true,
        value: false,
      });
      Object.defineProperty(nativeTheme, 'shouldUseHighContrastColors', {
        configurable: true,
        value: false,
      });
      nativeTheme.emit('updated');
    });
    await page.emulateMedia({ reducedMotion: 'no-preference' });
    await expect(page.locator('html')).toHaveAttribute('data-reduce-transparency', 'false');
    await expect(page.locator('html')).toHaveAttribute('data-high-contrast', 'false');
    await expect(page.locator('html')).toHaveAttribute('data-reduce-motion', 'false');
  } finally {
    await app.close();
    await fs.rm(directory, { recursive: true, force: true });
  }
});
