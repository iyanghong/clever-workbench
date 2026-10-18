import { test, expect } from '@playwright/test';
import { electron } from './launch';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

test('系统通用入口同屏录入地址与密码，服务器不建环境也可记录用途和多账号', async ({}, testInfo) => {
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), 'workbench-system-ledger-ui-'));
  const env: Record<string, string> = { ...process.env, CLEVER_WORKBENCH_DATA_DIR: directory };
  delete env.ELECTRON_RUN_AS_NODE;
  let app = await electron.launch({ args: ['.'], env });
  try {
    let page = await app.firstWindow();
    await page.evaluate(() => window.desktop.mutate({ type: 'system.save', name: '订单平台' }));
    await page.getByRole('button', { name: '台账', exact: true }).click();
    await page.getByRole('tab', { name: '访问入口', exact: true }).click();
    await page.getByRole('button', { name: '新增访问入口', exact: true }).click();
    await page.getByLabel('入口名称', { exact: true }).fill('Jenkins');
    await page.getByLabel('登录地址', { exact: true }).fill('https://build.example.test');
    await page.getByLabel('首个账号用户名', { exact: true }).fill('operator');
    await page.getByLabel('首个账号密码', { exact: true }).fill('fictional-jenkins-secret');
    await page.getByRole('button', { name: '创建访问入口', exact: true }).click();
    await page.getByLabel('主密码', { exact: true }).fill('fictional-ui-master-password');
    await page.getByLabel('确认主密码', { exact: true }).fill('fictional-ui-master-password');
    await page.getByRole('button', { name: '设置并解锁', exact: true }).click();
    await expect(page.getByRole('dialog', { name: '新增访问入口' })).toHaveCount(0);
    await expect(page.getByLabel('账号用户名', { exact: true })).toHaveValue('operator');
    await page.getByRole('button', { name: '设为常用访问入口', exact: true }).click();
    await page.getByRole('tab', { name: '服务器', exact: true }).click();
    await page.getByRole('button', { name: '新增服务器', exact: true }).click();
    await page.getByLabel('服务器名称', { exact: true }).fill('应用节点 1');
    await page.getByLabel('服务器 IP', { exact: true }).fill('192.0.2.10');
    await page.getByLabel('服务器用途', { exact: true }).fill('订单应用与定时任务');
    await page.getByText('操作系统与硬件配置（可选）', { exact: true }).click();
    await page.getByLabel('服务器操作系统', { exact: true }).fill('Kylin Linux V10');
    await page.getByLabel('服务器CPU', { exact: true }).fill('Intel Core Processor / 16 核');
    await page.getByLabel('服务器内存', { exact: true }).fill('32G');
    await page.getByLabel('服务器硬盘', { exact: true }).fill('500G');
    await page.getByRole('button', { name: '创建服务器', exact: true }).click();
    await expect(page.getByLabel('服务器用途', { exact: true })).toHaveValue('订单应用与定时任务');
    await page.getByLabel('新增账号用途').fill('运维');
    await page.getByLabel('新增账号用途').press('Enter');
    await page.getByLabel('账号用户名', { exact: true }).fill('deploy');
    await page.getByLabel('新增账号用途').fill('只读');
    await page.getByLabel('新增账号用途').press('Enter');
    await expect(page.getByRole('button', { name: '账号 只读', exact: true })).toBeVisible();
    await page.screenshot({ path: testInfo.outputPath('system-servers.png') });
    await page.getByRole('button', { name: '工作台', exact: true }).click();
    await expect(
      page.getByRole('button', { name: '打开常用访问入口 Jenkins', exact: true }),
    ).toBeVisible();
    await expect(
      page.getByRole('button', { name: '打开 Jenkins 主地址', exact: true }),
    ).toBeVisible();
    await app.close();
    app = await electron.launch({ args: ['.'], env });
    page = await app.firstWindow();
    const state = await page.evaluate(() => window.desktop.snapshot());
    expect(state.environments).toHaveLength(0);
    expect(state.accessEntries).toHaveLength(1);
    expect(state.resources[0]).toMatchObject({
      environmentId: null,
      fields: {
        用途: '订单应用与定时任务',
        操作系统: 'Kylin Linux V10',
        CPU: 'Intel Core Processor / 16 核',
        内存: '32G',
        硬盘: '500G',
      },
    });
    expect(state.accounts.filter((a) => a.resourceId === state.resources[0].id)).toHaveLength(2);
  } finally {
    await app.close();
    await fs.rm(directory, { recursive: true, force: true });
  }
});

test('多地址与常用账号可从首页及搜索使用，跨系统复制取消解锁不创建副本，删除地址保留账号', async ({}, testInfo) => {
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), 'workbench-access-actions-'));
  const env: Record<string, string> = { ...process.env, CLEVER_WORKBENCH_DATA_DIR: directory };
  delete env.ELECTRON_RUN_AS_NODE;
  const app = await electron.launch({ args: ['.'], env });
  try {
    const page = await app.firstWindow();
    const ids = await page.evaluate(async () => {
      const api = window.desktop;
      const source = (await api.mutate({ type: 'system.save', name: '订单平台' })).createdId!;
      const target = (await api.mutate({ type: 'system.save', name: '设备平台' })).createdId!;
      await api.initializeVault('fictional-actions-master-password');
      const entry = (
        await api.captureLedger({
          kind: 'access',
          systemId: source,
          environmentId: null,
          name: 'Jenkins',
          address: 'https://inner.example.test',
          username: 'admin',
          password: 'fictional-admin-secret',
        })
      ).createdId!;
      const reader = (
        await api.mutate({
          type: 'account.save',
          environmentId: null,
          accessId: entry,
          name: '只读',
          username: 'reader',
        })
      ).createdId!;
      const production = (
        await api.mutate({ type: 'environment.save', systemId: source, name: '生产' })
      ).createdId!;
      await api.captureLedger({
        kind: 'access',
        systemId: source,
        environmentId: production,
        name: '生产 GitLab',
        address: 'https://git-prod.example.test',
      });
      return { source, target, entry, reader, production };
    });
    await app.evaluate(({ shell }) => {
      (globalThis as any).openedLinks = [];
      shell.openExternal = async (url: string) => {
        (globalThis as any).openedLinks.push(url);
      };
    });
    await page.getByRole('button', { name: '台账', exact: true }).click();
    await page.getByRole('tab', { name: '访问入口', exact: true }).click();
    await page.getByLabel('访问入口环境筛选', { exact: true }).selectOption(ids.production);
    await expect(page.getByRole('button', { name: '访问入口 Jenkins', exact: true })).toBeVisible();
    await expect(
      page.getByRole('button', { name: '访问入口 生产 GitLab', exact: true }),
    ).toBeVisible();
    await page.getByLabel('访问入口环境筛选', { exact: true }).selectOption('common');
    await expect(
      page.getByRole('button', { name: '访问入口 生产 GitLab', exact: true }),
    ).toHaveCount(0);
    await page.getByRole('button', { name: '添加地址', exact: true }).click();
    await page.getByLabel('地址名称 2', { exact: true }).fill('外网');
    await page.getByLabel('登录地址 2', { exact: true }).fill('https://outer.example.test');
    await page.getByRole('button', { name: '设为常用地址 外网', exact: true }).click();
    await page.getByLabel('入口常用账号', { exact: true }).selectOption(ids.reader);
    await page.getByRole('button', { name: '设为常用访问入口', exact: true }).click();
    await page.getByRole('button', { name: '工作台', exact: true }).click();
    await page.getByRole('button', { name: '打开 Jenkins 外网', exact: true }).click();
    await expect
      .poll(() => app.evaluate(() => (globalThis as any).openedLinks))
      .toEqual(['https://outer.example.test/']);
    await expect(page.getByLabel('Jenkins 快捷账号', { exact: true })).toHaveValue(ids.reader);
    await page.getByRole('button', { name: '复制用户名 Jenkins 只读', exact: true }).click();
    await expect
      .poll(() => app.evaluate(async ({ clipboard }) => await clipboard.readText()))
      .toBe('reader');
    await page.screenshot({ path: testInfo.outputPath('access-home.png') });
    await page.getByRole('button', { name: '全局搜索', exact: true }).click();
    await page.getByLabel('搜索工作台内容').fill('Jenkins');
    await page.getByRole('button', { name: '打开网站 Jenkins', exact: true }).click();
    await expect.poll(() => app.evaluate(() => (globalThis as any).openedLinks)).toHaveLength(2);
    await page.getByRole('button', { name: '打开访问入口 Jenkins', exact: true }).click();
    await expect(page.getByRole('tab', { name: '访问入口', exact: true })).toHaveAttribute(
      'aria-selected',
      'true',
    );
    await page.evaluate(() => window.desktop.lockVault());
    await page.getByRole('button', { name: '复制访问入口', exact: true }).click();
    await page.getByLabel('入口副本系统', { exact: true }).selectOption(ids.target);
    await page.getByLabel('同时复制入口秘密', { exact: true }).check();
    await page.getByRole('button', { name: '创建副本', exact: true }).click();
    await page
      .getByRole('dialog', { name: '解锁秘密', exact: true })
      .getByRole('button', { name: '取消', exact: true })
      .click();
    expect((await page.evaluate(() => window.desktop.snapshot())).accessEntries).toHaveLength(2);
    await page.getByRole('button', { name: '创建副本', exact: true }).click();
    await page.getByLabel('主密码', { exact: true }).fill('fictional-actions-master-password');
    await page.getByRole('button', { name: '解锁', exact: true }).click();
    await expect(page.getByRole('dialog', { name: '复制访问入口', exact: true })).toHaveCount(0);
    await expect(page.getByLabel('入口名称', { exact: true })).toHaveValue('Jenkins 副本');
    await page.getByRole('button', { name: '删除地址 外网', exact: true }).click();
    await page.getByRole('button', { name: '工作台', exact: true }).click();
    const snapshot = await page.evaluate(() => window.desktop.snapshot());
    const copy = snapshot.accessEntries.find((e) => e.systemId === ids.target)!;
    expect(copy.addresses).toHaveLength(1);
    expect(snapshot.accounts.filter((a) => a.accessId === copy.id)).toHaveLength(2);
    expect(snapshot.accessEntries.find((e) => e.id === ids.entry)?.addresses).toHaveLength(2);
  } finally {
    await app.close();
    await fs.rm(directory, { recursive: true, force: true });
  }
});
