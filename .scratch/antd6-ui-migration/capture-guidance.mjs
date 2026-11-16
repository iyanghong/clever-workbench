import { electron } from '../../tests/e2e/launch.ts';
import { expect } from '@playwright/test';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
const directory = await fs.mkdtemp(path.join(os.tmpdir(), 'cwb-guide-images-'));
const env = { ...process.env, CLEVER_WORKBENCH_DATA_DIR: directory, CWB_TEST_MOCK_KEYCHAIN: '1' };
delete env.ELECTRON_RUN_AS_NODE;
const app = await electron.launch({ args: ['.'], env });
try {
  const page = await app.firstWindow();
  await page.setViewportSize({ width: 1380, height: 960 });
  await page.evaluate(async () => {
    const api = window.desktop;
    await api.mutate({ type: 'settings', theme: 'light', reduceMotion: true });
    const systemId = (await api.mutate({ type: 'system.save', name: '示例订单平台' })).createdId;
    await api.mutate({ type: 'environment.save', systemId, name: '生产' });
    const id = (await api.mutate({ type: 'document.create', context: { systemId } })).createdId;
    await api.mutate({
      ...(await api.document(id)),
      type: 'document.edit',
      title: '发布检查记录',
      markdown: '记录核对结果。',
    });
  });
  await expect(page.locator('html')).toHaveAttribute('data-reduce-motion', 'true');
  await page.getByRole('menuitem', { name: '台账', exact: true }).click();
  await page.getByRole('button', { name: '当前系统更多操作', exact: true }).click();
  await page.getByRole('menuitem', { name: '导出资料', exact: true }).click();
  const exporter = page.getByRole('dialog', { name: '导出系统资料', exact: true });
  await expect(exporter.getByLabel('导出任务', { exact: true })).toBeVisible();
  await expect(exporter).toHaveCSS('transform', 'none');
  await expect.poll(async () => (await exporter.boundingBox())?.width ?? 0).toBeGreaterThan(500);
  await exporter.screenshot({
    path: 'content/guidance/assets/system-export-options-antd6.png',
    animations: 'disabled',
  });
  await page.keyboard.press('Escape');
  await expect(exporter).toHaveCount(0);
  await page.getByRole('button', { name: '批量录入', exact: true }).click();
  const batch = page.getByRole('dialog', { name: '批量录入 · 校对后新增', exact: true });
  await batch
    .getByLabel('粘贴表格', { exact: true })
    .fill('名称\t地址\t说明\n应用节点 01\t192.0.2.10\t订单应用\n应用节点 02\t192.0.2.11\t备用节点');
  await batch.getByRole('button', { name: '读取文本', exact: true }).click();
  await expect(batch.getByLabel('映射第 1 列')).toBeVisible();
  await expect(batch).toHaveCSS('transform', 'none');
  await batch.screenshot({
    path: 'content/guidance/assets/ledger-paste-review-antd6.png',
    animations: 'disabled',
  });
  await batch.getByRole('button', { name: '关闭批量录入 · 校对后新增', exact: true }).click();
  await batch.getByRole('button', { name: '放弃并离开', exact: true }).click();
  await expect(batch).toHaveCount(0);
  await page.getByRole('menuitem', { name: '设置', exact: true }).click();
  await page.getByRole('tab', { name: '关于与更新', exact: true }).click();
  await expect(page.getByRole('button', { name: '检查更新', exact: true })).toBeVisible();
  await page
    .locator('.settings-tab-panel')
    .filter({ visible: true })
    .screenshot({
      path: 'content/guidance/assets/application-update-about-antd6.png',
      animations: 'disabled',
    });
  console.log('已生成 3 张真实 Electron 指引截图');
} finally {
  await app.close();
  await fs.rm(directory, { recursive: true, force: true });
}
