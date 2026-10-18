import { electron } from './launch';
import { test, expect } from '@playwright/test';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
test('默认工作台可固定账号、快速完成任务与写方案，入口顺序重启保留', async ({}, testInfo) => {
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), 'workbench-home-ui-'));
  const env: Record<string, string> = { ...process.env, CLEVER_WORKBENCH_DATA_DIR: directory };
  delete env.ELECTRON_RUN_AS_NODE;
  let app = await electron.launch({ args: ['.'], env });
  try {
    let page = await app.firstWindow();
    await expect(page.getByRole('heading', { name: '我的工作台', exact: true })).toBeVisible({
      timeout: 3000,
    });
    await page.getByRole('button', { name: '工作台', exact: true }).click();
    await expect(page.getByRole('button', { name: '快速新建', exact: true })).toBeEnabled();
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
    await page.getByRole('button', { name: '工作台', exact: true }).click();
    await page.getByRole('button', { name: '选择常用对象', exact: true }).click();
    await page.getByLabel('常用 长期系统 订单平台', { exact: true }).check();
    await page.getByLabel('常用 订单平台 / 生产 超管', { exact: true }).check();
    await page.getByRole('button', { name: '完成选择', exact: true }).click();
    await page.getByRole('button', { name: '上移常用 超管', exact: true }).click();
    await page.getByRole('button', { name: '复制用户名 超管', exact: true }).click();
    await expect.poll(() => app.evaluate(({ clipboard }) => clipboard.readText())).toBe('admin');
    await page.getByLabel('快速新增任务').fill('检查生产连接');
    await page.getByLabel('快速新增任务').press('Enter');
    await page.getByRole('button', { name: '完成 检查生产连接', exact: true }).click();
    await expect(page.getByRole('button', { name: '完成 检查生产连接', exact: true })).toHaveCount(
      0,
    );
    await page.getByRole('button', { name: '写一份方案', exact: true }).click();
    await page.getByLabel('文档标题').fill('连接排障手册');
    await page.getByRole('textbox', { name: '工作内容' }).fill('先看连接池使用率。');
    await page.getByRole('button', { name: '工作台', exact: true }).click();
    await expect(
      page.getByRole('button', { name: '打开文档 连接排障手册', exact: true }),
    ).toBeVisible();
    await app.close();
    app = await electron.launch({ args: ['.'], env });
    page = await app.firstWindow();
    await expect(page.getByRole('heading', { name: '我的工作台', exact: true })).toBeVisible();
    await expect(page.locator('.favorite-open').first()).toHaveAttribute(
      'aria-label',
      '打开常用账号 超管',
    );
    await page.screenshot({ path: testInfo.outputPath('home-workbench.png') });
    await page.getByRole('button', { name: '打开常用账号 超管', exact: true }).click();
    await page.getByRole('button', { name: '快速新建', exact: true }).click();
    await page.getByRole('button', { name: '新文档', exact: true }).click();
    await expect(page.getByRole('button', { name: '回到关联对象', exact: true })).toContainText(
      '订单平台 / 生产',
    );
  } finally {
    await app.close();
    await fs.rm(directory, { recursive: true, force: true });
  }
});

test('统一新建沿用当前系统环境资源，另建任务保留之前的正文草稿', async () => {
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), 'workbench-quick-create-ui-'));
  const env: Record<string, string> = { ...process.env, CLEVER_WORKBENCH_DATA_DIR: directory };
  delete env.ELECTRON_RUN_AS_NODE;
  const app = await electron.launch({ args: ['.'], env });
  try {
    const page = await app.firstWindow();
    const choose = async (name: string) => {
      await page.getByRole('button', { name: '快速新建', exact: true }).click();
      await page.getByRole('button', { name, exact: true }).click();
    };
    await choose('新系统');
    await page.getByLabel('快速新建系统名称').fill('统一入口平台');
    await page.getByRole('button', { name: '创建系统', exact: true }).click();
    await expect(page.getByLabel('系统名称', { exact: true })).toHaveValue('统一入口平台');
    const systemId = await page.evaluate(
      async () => (await window.desktop.snapshot()).systems[0].id,
    );
    await choose('新环境');
    await expect(page.getByLabel('新记录所属系统')).toHaveValue(systemId);
    await page.getByLabel('快速新建环境名称').fill('生产');
    await page.getByRole('button', { name: '创建环境', exact: true }).click();
    const environmentId = await page.evaluate(
      async () => (await window.desktop.snapshot()).environments[0].id,
    );
    await choose('新资源');
    await expect(page.getByLabel('新记录所属环境')).toHaveValue(environmentId);
    await page.getByLabel('快速新建资源名称').fill('主缓存');
    await page.getByRole('button', { name: '创建资源', exact: true }).click();
    const resourceId = await page.evaluate(
      async () => (await window.desktop.snapshot()).resources[0].id,
    );
    await choose('新账号');
    await expect(page.getByLabel('新账号所属资源')).toHaveValue(resourceId);
    await page.getByLabel('快速新建账号名称').fill('应用连接');
    await page.getByRole('button', { name: '创建账号', exact: true }).click();
    await expect(page.getByLabel('账号用途', { exact: true })).toHaveValue('应用连接');
    await page.evaluate(() =>
      window.desktop.saveDraft({
        title: '尚未提交的排障记录',
        projectId: null,
        markdown: '保留这个草稿正文',
        content: {
          type: 'doc',
          content: [{ type: 'paragraph', content: [{ type: 'text', text: '保留这个草稿正文' }] }],
        },
      }),
    );
    await choose('新任务');
    await page.getByLabel('快速新建任务标题').fill('排查主缓存');
    await page.getByRole('button', { name: '创建任务', exact: true }).click();
    await expect(page.getByLabel('任务标题', { exact: true })).toHaveValue('排查主缓存');
    const state = await page.evaluate(async () => {
      const snapshot = await window.desktop.snapshot();
      const task = snapshot.tasks.find((item) => item.title === '排查主缓存')!;
      return { task, draft: snapshot.draft };
    });
    expect(state.task).toMatchObject({ systemId, environmentId, resourceId });
    expect(state.draft?.markdown).toBe('保留这个草稿正文');
    await page.getByRole('button', { name: '工作台', exact: true }).click();
    await expect(page.getByLabel('快速新增任务')).toHaveValue('尚未提交的排障记录');
  } finally {
    await app.close();
    await fs.rm(directory, { recursive: true, force: true });
  }
});
