import { test, expect } from '@playwright/test';
import { electron } from './launch';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

test('系统动作收纳后支持键盘、保存及弹窗关闭焦点链', async ({}, info) => {
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), 'workbench-system-actions-'));
  const env: Record<string, string> = { ...process.env, CLEVER_WORKBENCH_DATA_DIR: directory };
  delete env.ELECTRON_RUN_AS_NODE;
  const app = await electron.launch({ args: ['.'], env });
  try {
    const page = await app.firstWindow();
    await page.setViewportSize({ width: 1380, height: 850 });
    await page.evaluate(async () => {
      await window.desktop.mutate({ type: 'system.save', name: '订单平台' });
      await window.desktop.mutate({ type: 'system.save', name: '报表平台' });
    });
    await page.getByRole('button', { name: '台账', exact: true }).click();
    const switcher = page.getByRole('button', { name: '切换系统', exact: true });
    const more = page.getByRole('button', { name: '当前系统更多操作', exact: true });
    await expect(more).toBeVisible({ timeout: 2000 });
    await expect(page.getByRole('button', { name: '新增系统', exact: true })).toHaveCount(0);
    await expect(page.getByRole('menuitem', { name: '系统信息', exact: true })).toHaveCount(0);
    await more.focus();
    await page.keyboard.press('ArrowDown');
    const menu = page.getByRole('menu', { name: '当前系统操作', exact: true });
    await expect(more).toHaveAttribute('aria-expanded', 'true');
    await expect(menu.getByRole('menuitem', { name: '系统信息', exact: true })).toBeFocused();
    await page.keyboard.press('ArrowDown');
    await expect(menu.getByRole('menuitem', { name: '导出资料', exact: true })).toBeFocused();
    await page.keyboard.press('Escape');
    await expect(menu).toHaveCount(0);
    await expect(more).toBeFocused();
    await more.press('ArrowDown');
    await page.keyboard.press('End');
    await expect(menu.getByRole('menuitem', { name: '导出资料', exact: true })).toBeFocused();
    await page.keyboard.press('Home');
    await expect(menu.getByRole('menuitem', { name: '系统信息', exact: true })).toBeFocused();
    await page.keyboard.press('Tab');
    await expect(menu).toHaveCount(0);
    const favorite = page.getByRole('button', { name: '设为常用系统', exact: true });
    await expect(favorite).toBeFocused();
    await favorite.click();
    await expect(page.getByRole('button', { name: '移出常用系统', exact: true })).toBeVisible();
    await more.focus();
    await page.keyboard.press('Enter');
    await page.keyboard.press('Enter');
    const system = page.getByRole('dialog', { name: '系统信息', exact: true });
    await expect(system).toBeVisible();
    await page.getByLabel('系统名称', { exact: true }).fill('订单平台 · 已保存');
    await page.keyboard.press('Escape');
    await expect(system).toHaveCount(0);
    await expect(more).toBeFocused();
    await expect(switcher).toContainText('订单平台 · 已保存');
    await more.press('ArrowUp');
    await expect(menu.getByRole('menuitem', { name: '导出资料', exact: true })).toBeFocused();
    await page.keyboard.press('Enter');
    const exporter = page.getByRole('dialog', { name: '导出系统资料', exact: true });
    await expect(exporter).toContainText('订单平台 · 已保存');
    await page.keyboard.press('Escape');
    await expect(exporter).toHaveCount(0);
    await expect(more).toBeFocused();
    await switcher.focus();
    await page.keyboard.press('Enter');
    const picker = page.getByRole('dialog', { name: '切换系统', exact: true });
    await expect(switcher).toHaveAttribute('aria-expanded', 'true');
    await expect(picker.getByLabel('搜索系统')).toBeFocused();
    await page.keyboard.press('Escape');
    await expect(switcher).toBeFocused();
    await switcher.click();
    await picker.getByRole('button', { name: '新增系统', exact: true }).click();
    const creation = page.getByRole('dialog', { name: '新增系统', exact: true });
    await expect(picker).toHaveCount(0);
    await expect(creation).toBeVisible();
    await page.keyboard.press('Escape');
    await expect(creation).toHaveCount(0);
    await expect(switcher).toBeFocused();
    await switcher.click();
    await picker.getByRole('button', { name: '新增系统', exact: true }).click();
    await creation.getByLabel('快速新建系统名称').fill('新建监控平台');
    await creation.getByRole('button', { name: '创建系统', exact: true }).click();
    await expect(switcher).toContainText('新建监控平台');
    await expect(switcher).toBeFocused();
    await switcher.click();
    await picker.getByLabel('搜索系统').fill('报表');
    await picker.getByRole('button', { name: '报表平台', exact: true }).click();
    await expect(switcher).toContainText('报表平台');
    await expect(switcher).toBeFocused();
    await more.click();
    await page.screenshot({
      path: info.outputPath('system-menu-light.png'),
      animations: 'disabled',
    });
    await page.keyboard.press('Escape');
    await page.setViewportSize({ width: 880, height: 620 });
    await page.emulateMedia({ colorScheme: 'dark' });
    await more.click();
    await expect(menu).toBeInViewport();
    await page.screenshot({
      path: info.outputPath('system-menu-dark-narrow.png'),
      animations: 'disabled',
    });
    await page.keyboard.press('Escape');
    await switcher.click();
    await expect(picker.getByRole('button', { name: '新增系统', exact: true })).toBeInViewport();
    await page.screenshot({
      path: info.outputPath('system-picker-dark-narrow.png'),
      animations: 'disabled',
    });
  } finally {
    await app.close();
    await fs.rm(directory, { recursive: true, force: true });
  }
});
