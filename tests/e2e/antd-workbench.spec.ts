import { test, expect } from '@playwright/test';
import { electron } from './launch';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

test('Ant 控件接入后仍保留创建保护、模态焦点和真实本地保存', async ({}, info) => {
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), 'workbench-antd-'));
  const env: Record<string, string> = { ...process.env, CLEVER_WORKBENCH_DATA_DIR: directory };
  if (process.platform === 'darwin') env.CWB_TEST_MOCK_KEYCHAIN = '1';
  delete env.ELECTRON_RUN_AS_NODE;
  const app = await electron.launch({ args: ['.'], env });
  try {
    const page = await app.firstWindow();
    const errors: string[] = [];
    page.on('pageerror', (error) => errors.push(error.message));
    await page.setViewportSize({ width: 1440, height: 960 });
    await page.evaluate(async () => {
      await window.desktop.mutate({ type: 'system.save', name: '订单中心' });
      await window.desktop.mutate({ type: 'system.save', name: '财务平台' });
    });
    await page.getByRole('menuitem', { name: '台账', exact: true }).click();
    const quick = page.getByRole('button', { name: '快速新建', exact: true });
    await expect(quick).toBeEnabled();
    await quick.click();
    await page.getByRole('button', { name: '新环境', exact: true }).click();
    const environment = page.getByRole('dialog', { name: '新环境', exact: true });
    const system = environment.getByLabel('新记录所属系统', { exact: true });
    await system.focus();
    await system.press('ArrowDown');
    const popup = page.locator('.ant-select-dropdown').filter({ visible: true });
    await popup.getByText('财务平台', { exact: true }).click();
    await environment.getByRole('button', { name: '关闭新环境', exact: true }).click();
    const discard = page.getByRole('dialog', { name: '放弃未提交的资料？', exact: true });
    await expect(discard).toBeVisible();
    await discard.getByRole('button', { name: '继续填写', exact: true }).click();
    await expect(environment).toBeVisible();
    await environment.getByRole('button', { name: '关闭新环境', exact: true }).click();
    await page
      .getByRole('dialog', { name: '放弃未提交的资料？' })
      .getByRole('button', { name: '放弃录入', exact: true })
      .click();
    await expect(environment).toHaveCount(0);
    await expect(quick).toBeFocused();

    await quick.click();
    await page.getByRole('button', { name: '新系统', exact: true }).click();
    await page.getByLabel('快速新建系统名称', { exact: true }).fill('Ant 实际创建系统');
    await page.getByRole('button', { name: '创建系统', exact: true }).click();
    await expect
      .poll(async () =>
        (await page.evaluate(() => window.desktop.snapshot())).systems.some(
          (s) => s.name === 'Ant 实际创建系统',
        ),
      )
      .toBe(true);
    await expect(page.getByRole('button', { name: '切换系统', exact: true })).toContainText(
      'Ant 实际创建系统',
    );

    await page.getByRole('button', { name: '当前系统更多操作', exact: true }).click();
    await page.getByRole('menuitem', { name: '系统信息', exact: true }).click();
    const configuration = page.getByRole('dialog', { name: '系统信息', exact: true });
    await configuration.getByLabel('系统名称', { exact: true }).fill('');
    await configuration.getByRole('button', { name: '关闭系统信息', exact: true }).click();
    await expect(configuration).toBeVisible();
    await expect(configuration.getByRole('alert')).toBeVisible();
    await configuration.getByLabel('系统名称', { exact: true }).fill('Ant 实际创建系统');
    await page.keyboard.press('Escape');
    await expect(configuration).toHaveCount(0);
    await expect(page.getByRole('button', { name: '当前系统更多操作', exact: true })).toBeFocused();

    await page.getByRole('menuitem', { name: '工作台', exact: true }).click();
    await page.getByLabel('快速新增任务', { exact: true }).fill('Ant 实际保存任务');
    await page.getByLabel('快速新增任务', { exact: true }).press('Enter');
    await expect
      .poll(async () =>
        (await page.evaluate(() => window.desktop.snapshot())).tasks.some(
          (t) => t.title === 'Ant 实际保存任务',
        ),
      )
      .toBe(true);
    await page.screenshot({ path: info.outputPath('antd-home.png') });

    await page.getByRole('menuitem', { name: '设置', exact: true }).click();
    await page.getByRole('tab', { name: '外观', exact: true }).click();
    await page.locator('.ant-segmented').getByText('深色', { exact: true }).click();
    await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark');
    await page.getByRole('switch', { name: '减少动态效果', exact: true }).click();
    await expect(page.locator('html')).toHaveAttribute('data-reduce-motion', 'true');
    await expect(page.getByRole('tab', { name: '外观', exact: true })).toBeVisible();
    await page.setViewportSize({ width: 820, height: 650 });
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(
      true,
    );
    await page.screenshot({ path: info.outputPath('antd-settings-narrow-dark.png') });
    expect(errors).toEqual([]);
  } finally {
    await app.close();
    await fs.rm(directory, { recursive: true, force: true });
  }
});
