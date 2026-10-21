import { openSystemAction } from './ledger-actions';
import { test, expect } from '@playwright/test';
import { electron } from './launch';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

test('台账弹窗有固定关闭入口，表单统一且退出保留保存与粘贴保护', async ({}, info) => {
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), 'workbench-dialog-'));
  const env: Record<string, string> = { ...process.env, CLEVER_WORKBENCH_DATA_DIR: directory };
  delete env.ELECTRON_RUN_AS_NODE;
  const app = await electron.launch({ args: ['.'], env });
  try {
    const page = await app.firstWindow();
    await page.getByRole('button', { name: '台账', exact: true }).waitFor();
    await page.evaluate(async () => {
      const projectId = (
        await window.desktop.mutate({
          type: 'project.create',
          name: '协作平台一期',
          color: '#007aff',
        })
      ).createdId!;
      const systemId = (
        await window.desktop.mutate({ type: 'system.save', name: '协作平台', projectId })
      ).createdId!;
      await window.desktop.mutate({ type: 'environment.save', systemId, name: '生产' });
    });
    await page.getByRole('button', { name: '台账', exact: true }).click();
    await openSystemAction(page, '系统信息');
    const system = page.getByRole('dialog', { name: '系统信息', exact: true });
    await expect(system.getByRole('button', { name: '关闭系统信息', exact: true })).toBeVisible();
    await expect
      .poll(() =>
        system
          .getByLabel('当前项目', { exact: true })
          .evaluate((el) => el.getBoundingClientRect().height),
      )
      .toBeGreaterThanOrEqual(36);
    await system.getByLabel('系统说明', { exact: true }).fill('保持简单、快速查询。');
    await page.screenshot({ animations: 'disabled', path: info.outputPath('system-info.png') });
    await system.getByLabel('系统名称', { exact: true }).fill('');
    await system.getByRole('button', { name: '关闭系统信息', exact: true }).click();
    await expect(system).toBeVisible();
    await expect(system.getByRole('alert')).toBeVisible();
    await expect(system.getByLabel('系统名称', { exact: true })).toHaveValue('');
    await system.getByLabel('系统名称', { exact: true }).fill('协作平台');
    await system.getByRole('button', { name: '环境管理', exact: true }).click();
    await expect(system.getByLabel('环境名称 生产', { exact: true })).toBeVisible();
    await page.screenshot({
      animations: 'disabled',
      path: info.outputPath('system-environments.png'),
    });
    await system.getByRole('button', { name: '项目档案', exact: true }).click();
    await expect(system.getByLabel('项目名称', { exact: true })).toBeVisible();
    await page.screenshot({ animations: 'disabled', path: info.outputPath('system-projects.png') });
    await system.getByRole('button', { name: '关闭系统信息', exact: true }).click();
    await expect(system).toHaveCount(0);
    expect(
      await page.evaluate(async () => (await window.desktop.snapshot()).systems[0].notes),
    ).toBe('保持简单、快速查询。');
    await page.getByRole('button', { name: '粘贴表格', exact: true }).click();
    const paste = page.getByRole('dialog', { name: '粘贴表格 · 校对后新增', exact: true });
    await expect
      .poll(() =>
        paste
          .getByLabel('粘贴表格', { exact: true })
          .evaluate((el) => el.getBoundingClientRect().height),
      )
      .toBeGreaterThanOrEqual(150);
    await page.screenshot({ animations: 'disabled', path: info.outputPath('paste-empty.png') });
    await page.setViewportSize({ width: 880, height: 620 });
    await page.emulateMedia({ colorScheme: 'dark' });
    await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark');
    expect(await paste.evaluate((el) => el.scrollWidth <= el.clientWidth + 1)).toBe(true);
    await page.screenshot({
      animations: 'disabled',
      path: info.outputPath('paste-dark-narrow.png'),
    });
    await page.emulateMedia({ colorScheme: 'light' });
    await paste
      .getByLabel('粘贴表格', { exact: true })
      .fill(
        '名称\tIP\n' +
          Array.from({ length: 20 }, (_, i) => `应用节点 ${i}\t192.0.2.${i + 1}`).join('\n'),
      );
    await paste.getByRole('button', { name: '读取文本', exact: true }).click();
    await paste.evaluate((el) => {
      el.scrollTop = el.scrollHeight;
    });
    expect(await paste.evaluate((el) => el.scrollTop)).toBeGreaterThan(100);
    await paste.getByRole('button', { name: '关闭粘贴表格 · 校对后新增', exact: true }).click();
    await expect(paste.getByText('这些资料尚未提交，离开将丢弃本次粘贴内容。')).toBeVisible();
    await expect(paste.getByRole('button', { name: '继续校对', exact: true })).toBeInViewport();
    await expect(paste.getByRole('button', { name: '继续校对', exact: true })).toBeFocused();
    await paste.getByRole('button', { name: '放弃并离开', exact: true }).click();
    await page.getByRole('button', { name: '运行维护', exact: true }).click();
    await page.getByRole('button', { name: '新增运行维护', exact: true }).click();
    const operation = page.getByRole('dialog', { name: '新增运维记录', exact: true });
    await expect(operation.getByRole('button', { name: '取消', exact: true })).toBeVisible();
    await page.screenshot({ animations: 'disabled', path: info.outputPath('operation-new.png') });
    await operation.getByRole('button', { name: '关闭新增运维记录', exact: true }).click();
    await expect(operation).toHaveCount(0);
    await openSystemAction(page, '系统信息');
    await system.evaluate((el) => {
      el.scrollTop = el.scrollHeight;
    });
    const close = system.getByRole('button', { name: '关闭系统信息', exact: true });
    expect(
      await close.evaluate((el) => {
        const r = el.getBoundingClientRect();
        return (
          document.elementFromPoint(r.x + r.width / 2, r.y + r.height / 2)?.closest('button') === el
        );
      }),
    ).toBe(true);
    expect(await system.evaluate((el) => el.scrollWidth <= el.clientWidth + 1)).toBe(true);
    await page.screenshot({
      animations: 'disabled',
      path: info.outputPath('system-narrow-scrolled.png'),
    });
    await page.keyboard.press('Escape');
    await expect(system).toHaveCount(0);
    await expect(page.getByRole('button', { name: '当前系统更多操作', exact: true })).toBeFocused();
  } finally {
    await app.close();
    await fs.rm(directory, { recursive: true, force: true });
  }
});
