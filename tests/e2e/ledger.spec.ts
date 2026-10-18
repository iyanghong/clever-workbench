import { test, expect, _electron as electron } from '@playwright/test';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

test('系统在不同项目间延续，环境台账入口保留创建时的任务背景', async ({}, testInfo) => {
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), 'workbench-ledger-ui-'));
  const env: Record<string, string> = { ...process.env, CLEVER_WORKBENCH_DATA_DIR: directory };
  delete env.ELECTRON_RUN_AS_NODE;
  const app = await electron.launch({ args: ['.'], env });
  try {
    const page = await app.firstWindow();
    await expect(page.getByRole('heading', { name: '工作任务' })).toBeVisible();
    const projects = await page.evaluate(async () => {
      const a = await window.desktop.mutate({
        type: 'project.create',
        name: '园区一期',
        color: '#007aff',
      });
      const b = await window.desktop.mutate({
        type: 'project.create',
        name: '园区二期',
        color: '#34a271',
      });
      return [a.createdId!, b.createdId!];
    });
    await page.getByRole('button', { name: '台账', exact: true }).click({ timeout: 3000 });
    await page.getByLabel('新增系统名称').fill('园区平台');
    await page.getByLabel('新增系统名称').press('Enter');
    await page.getByLabel('当前项目', { exact: true }).selectOption(projects[0]);
    await page.getByLabel('为当前系统新增任务').fill('检查生产缓存');
    await page.getByLabel('为当前系统新增任务').press('Enter');
    await expect(page.getByLabel('任务标题', { exact: true })).toHaveValue('检查生产缓存');
    await expect(page.getByLabel('所属项目', { exact: true })).toHaveValue(projects[0]);
    await page.getByRole('button', { name: '台账', exact: true }).click();
    await page.getByLabel('当前项目', { exact: true }).selectOption(projects[1]);
    await page.getByLabel('系统名称', { exact: true }).fill('智慧园区平台');
    await page.getByLabel('系统说明').click();
    await expect(page.getByRole('region', { name: '项目沿革' })).toContainText('园区一期');
    await expect(page.getByRole('region', { name: '项目沿革' })).toContainText('园区二期');
    await page.getByRole('button', { name: '工作任务', exact: true }).click();
    await page.getByRole('button', { name: /检查生产缓存.*园区一期/ }).click();
    await expect(page.getByLabel('所属项目', { exact: true })).toHaveValue(projects[0]);
    await expect(page.getByLabel('关联系统')).toContainText('智慧园区平台');
    await page.screenshot({ path: testInfo.outputPath('system-project-history.png') });
  } finally {
    await app.close();
    await fs.rm(directory, { recursive: true, force: true });
  }
});

test('服务仓库跨环境复用，切换环境前保存各自部署地址', async ({}, testInfo) => {
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), 'workbench-deployment-ui-'));
  const env: Record<string, string> = { ...process.env, CLEVER_WORKBENCH_DATA_DIR: directory };
  delete env.ELECTRON_RUN_AS_NODE;
  const app = await electron.launch({ args: ['.'], env });
  try {
    const page = await app.firstWindow();
    await page.getByRole('button', { name: '台账', exact: true }).click();
    await page.getByLabel('新增系统名称').fill('订单平台');
    await page.getByLabel('新增系统名称').press('Enter');
    await page.getByLabel('新增环境名称').fill('测试', { timeout: 3000 });
    await page.getByLabel('新增环境名称').press('Enter');
    await page.getByLabel('新增环境名称').fill('生产');
    await page.getByLabel('新增环境名称').press('Enter');
    await page.getByLabel('查看环境', { exact: true }).selectOption({ label: '测试' });
    await page.getByLabel('新增服务名称').fill('订单服务');
    await page.getByLabel('新增服务名称').press('Enter');
    await page.getByLabel('服务仓库', { exact: true }).fill('git@example.test:orders.git');
    await page.getByLabel('部署地址', { exact: true }).fill('orders.test.internal');
    await page.getByLabel('部署端口', { exact: true }).fill('8080');
    await page.getByLabel('查看环境', { exact: true }).selectOption({ label: '生产' });
    await expect(page.getByLabel('部署地址', { exact: true })).toHaveValue('');
    await expect(page.getByLabel('服务仓库', { exact: true })).toHaveValue(
      'git@example.test:orders.git',
    );
    await page.getByLabel('部署地址', { exact: true }).fill('orders.prod.internal');
    await page.getByLabel('部署端口', { exact: true }).fill('8443');
    await page.getByLabel('查看环境', { exact: true }).selectOption({ label: '测试' });
    await expect(page.getByLabel('部署地址', { exact: true })).toHaveValue('orders.test.internal');
    await expect(page.getByLabel('部署端口', { exact: true })).toHaveValue('8080');
    await page.screenshot({ path: testInfo.outputPath('service-environments.png') });
  } finally {
    await app.close();
    await fs.rm(directory, { recursive: true, force: true });
  }
});
