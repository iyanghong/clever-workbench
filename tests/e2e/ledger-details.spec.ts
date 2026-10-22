import { test, expect } from '@playwright/test';
import { electron } from './launch';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

test('新建提交期间禁用编辑，延迟失败后保留原输入并允许继续填写', async () => {
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), 'workbench-submit-guard-'));
  const env: Record<string, string> = { ...process.env, CLEVER_WORKBENCH_DATA_DIR: directory };
  delete env.ELECTRON_RUN_AS_NODE;
  const app = await electron.launch({ args: ['.'], env });
  const page = await app.firstWindow();
  try {
    await page.evaluate(() => window.desktop.mutate({ type: 'system.save', name: '提交验证' }));
    await page.getByRole('button', { name: '台账', exact: true }).click();
    await page.getByRole('button', { name: '应用部署', exact: true }).click();
    await page.getByRole('button', { name: '新增应用部署', exact: true }).click();
    const form = page.getByRole('dialog', { name: '新增应用部署', exact: true });
    await form.getByLabel('快速新建服务名称').fill('未提交应用');
    await form.getByLabel('用途／说明').fill('原说明');
    await app.evaluate(({ ipcMain }) => {
      ipcMain.removeHandler('mutate');
      ipcMain.handle(
        'mutate',
        () =>
          new Promise((_resolve, reject) => {
            (globalThis as any).releaseLedgerSave = () => reject(new Error('模拟保存失败'));
          }),
      );
    });
    await form.getByRole('button', { name: '创建服务', exact: true }).click();
    await expect
      .poll(() => app.evaluate(() => typeof (globalThis as any).releaseLedgerSave))
      .toBe('function');
    await expect(form.getByLabel('用途／说明')).toBeDisabled();
    await expect(form.getByLabel('快速新建服务名称')).toBeDisabled();
    await app.evaluate(() => (globalThis as any).releaseLedgerSave());
    await expect(form.getByRole('alert')).toContainText('模拟保存失败');
    await expect(form.getByLabel('用途／说明')).toBeEnabled();
    await expect(form.getByLabel('用途／说明')).toHaveValue('原说明');
    await form.getByLabel('用途／说明').fill('失败后继续编辑');
    expect((await page.evaluate(() => window.desktop.snapshot())).services).toHaveLength(0);
    await form.getByRole('button', { name: '取消', exact: true }).click();
    await page.getByRole('button', { name: '放弃录入', exact: true }).click();
  } finally {
    await app
      .evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows().forEach((w) => w.destroy()))
      .catch(() => {});
    await app.close();
    await fs.rm(directory, { recursive: true, force: true });
  }
});

test('数据库新增可录多连接与账号，常用地址、配置、解除服务器引用可持续编辑', async ({}, info) => {
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), 'workbench-details-ui-'));
  const env: Record<string, string> = { ...process.env, CLEVER_WORKBENCH_DATA_DIR: directory };
  delete env.ELECTRON_RUN_AS_NODE;
  const app = await electron.launch({ args: ['.'], env });
  const page = await app.firstWindow();
  try {
    await page.setViewportSize({ width: 1280, height: 850 });
    const seed = await page.evaluate(async () => {
      const api = window.desktop;
      const systemId = (await api.mutate({ type: 'system.save', name: '完整资料' })).createdId!;
      const serverId = (
        await api.mutate({
          type: 'resource.save',
          systemId,
          environmentId: null,
          kind: 'server',
          name: '数据库主机',
          address: '192.0.2.30',
          port: '22',
        })
      ).createdId!;
      await api.initializeVault('fictional-details-ui-master');
      return { systemId, serverId };
    });
    await page.getByRole('button', { name: '台账', exact: true }).click();
    await page.getByRole('button', { name: '数据库／中间件', exact: true }).click();
    await page.getByRole('button', { name: '新增数据库／中间件', exact: true }).click();
    const form = page.getByRole('dialog', { name: '新增数据库／中间件', exact: true });
    await form.getByLabel('快速新建资源名称').fill('业务数据库');
    await form.getByLabel('新资源类型').selectOption('database');
    await form.getByLabel('资源类型', { exact: true }).fill('PostgreSQL');
    await form.getByLabel('资源版本', { exact: true }).fill('16');
    await form.getByRole('button', { name: '添加连接', exact: true }).click();
    await form.getByLabel('连接 1 名称').fill('业务连接');
    await form.getByLabel('连接 1 服务器').selectOption(seed.serverId);
    await expect(form.getByLabel('连接 1 地址')).toHaveAttribute('placeholder', '192.0.2.30');
    await form.getByLabel('连接 1 端口').fill('5432');
    await form.getByRole('button', { name: '添加连接', exact: true }).click();
    await form.getByLabel('连接 2 名称').fill('管理连接');
    await form.getByLabel('连接 2 地址').fill('admin.example.test');
    await form.getByLabel('连接 2 端口').fill('9000');
    await form.getByLabel('常用连接', { exact: true }).nth(1).check();
    await form.getByText('配置资料（可选）', { exact: true }).click();
    await form.getByLabel('数据库库名', { exact: true }).fill('orders,reports');
    await form.getByLabel('首个账号用户名').fill('reader');
    await form.getByLabel('首个账号密码').fill('fictional-db-secret');
    await page.evaluate(() => window.desktop.lockVault());
    await form.getByRole('button', { name: '创建资源', exact: true }).click();
    const unlock = page.getByRole('dialog', { name: '解锁秘密', exact: true });
    await expect(unlock).toBeVisible();
    await expect(form.getByLabel('首个账号用户名')).toBeDisabled();
    const flushError = await app.evaluate(
      ({ BrowserWindow, ipcMain }) =>
        new Promise<string | null>((resolve) => {
          const token = 'capture-await-unlock';
          const handler = (_event: unknown, received: string, error: string | null) => {
            if (received !== token) return;
            ipcMain.removeListener('flushed', handler);
            resolve(error);
          };
          ipcMain.on('flushed', handler);
          BrowserWindow.getAllWindows()[0].webContents.send('flush', token);
        }),
    );
    expect(flushError).toContain('正在保存新增资料');
    await expect(page.getByRole('dialog', { name: '放弃未提交的资料？', exact: true })).toHaveCount(
      0,
    );
    await unlock.getByRole('button', { name: '取消', exact: true }).click();
    await expect(form.getByLabel('首个账号密码')).toHaveValue('fictional-db-secret');
    await form.getByRole('button', { name: '创建资源', exact: true }).click();
    await unlock.getByLabel('主密码', { exact: true }).fill('fictional-details-ui-master');
    await unlock.getByRole('button', { name: '解锁', exact: true }).click();
    await expect(form).toHaveCount(0);
    const detail = page.getByRole('complementary', { name: '台账详情' });
    await expect(detail.getByText('管理连接（常用）', { exact: true })).toBeVisible();
    const saved = await page.evaluate(() => window.desktop.snapshot());
    const resource = saved.resources.find((r) => r.name === '业务数据库')!;
    expect(resource).toMatchObject({
      address: 'admin.example.test',
      port: '9000',
      fields: { 类型: 'PostgreSQL', 版本: '16', 库名: 'orders,reports' },
    });
    expect(resource.connections).toHaveLength(2);
    const account = saved.accounts.find((a) => a.resourceId === resource.id)!;
    expect(await page.evaluate((id) => window.desktop.readSecret(id, 'password'), account.id)).toBe(
      'fictional-db-secret',
    );
    await detail.getByRole('button', { name: '编辑', exact: true }).click();
    await page.getByLabel('连接 1 服务器').selectOption('');
    await expect(page.getByLabel('连接 1 地址')).toHaveValue('192.0.2.30');
    await page.getByRole('button', { name: '完成编辑', exact: true }).click();
    await page.screenshot({ path: info.outputPath('database-connections.png') });
    await page.getByRole('button', { name: '工作台', exact: true }).click();
    const after = await page.evaluate(() => window.desktop.snapshot());
    expect(after.resources.find((r) => r.id === resource.id)?.connections?.[0]).toMatchObject({
      serverId: null,
      address: '192.0.2.30',
    });
  } finally {
    await page
      .evaluate(() =>
        document
          .querySelectorAll<HTMLElement>('[data-new-record]')
          .forEach((f) => (f.dataset.dirty = 'false')),
      )
      .catch(() => {});
    await app.close();
    await fs.rm(directory, { recursive: true, force: true });
  }
});

test('应用首节点与共用文档同屏保存，窄窗口可滚动，退出拦截未提交的运维资料', async ({}, info) => {
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), 'workbench-deployment-ui-'));
  const env: Record<string, string> = { ...process.env, CLEVER_WORKBENCH_DATA_DIR: directory };
  delete env.ELECTRON_RUN_AS_NODE;
  const app = await electron.launch({ args: ['.'], env });
  const page = await app.firstWindow();
  try {
    const seed = await page.evaluate(async () => {
      const api = window.desktop,
        systemId = (await api.mutate({ type: 'system.save', name: '应用资料' })).createdId!;
      const environmentId = (await api.mutate({ type: 'environment.save', systemId, name: '生产' }))
        .createdId!;
      const documentId = (await api.mutate({ type: 'document.create' })).createdId!;
      const doc = await api.document(documentId);
      await api.mutate({ ...doc, type: 'document.edit', title: '共享手册', markdown: '一份正文' });
      return { systemId, environmentId, documentId };
    });
    await page.setViewportSize({ width: 820, height: 650 });
    await page.emulateMedia({ colorScheme: 'dark', reducedMotion: 'reduce', contrast: 'more' });
    await page.getByRole('button', { name: '台账', exact: true }).click();
    await page.getByRole('button', { name: '应用部署', exact: true }).click();
    await page.getByRole('button', { name: '新增应用部署', exact: true }).click();
    const form = page.getByRole('dialog', { name: '新增应用部署', exact: true });
    await form.getByLabel('快速新建服务名称').fill('订单应用');
    await form.getByLabel('代码仓库', { exact: true }).fill('https://example.test/orders.git');
    await form.getByLabel('同时记录部署').check();
    await form.getByLabel('节点名称', { exact: true }).fill('生产节点');
    await form.getByLabel('部署环境').selectOption(seed.environmentId);
    await form.getByText('部署与排障资料（可选）', { exact: true }).click();
    await form.getByLabel('部署方式', { exact: true }).fill('Docker');
    await form.getByLabel('版本', { exact: true }).fill('2026.10');
    await form.getByLabel('日志位置', { exact: true }).fill('/srv/orders/logs');
    await form.getByLabel('共享手册（通用）', { exact: true }).first().check();
    await form.getByText('操作文档（可选）', { exact: true }).click();
    await form.getByLabel('共享手册（通用）', { exact: true }).nth(1).check();
    expect(await form.evaluate((e) => e.scrollWidth - e.clientWidth)).toBeLessThanOrEqual(1);
    await form.getByRole('button', { name: '创建服务', exact: true }).scrollIntoViewIfNeeded();
    await page.screenshot({ path: info.outputPath('deployment-dark-narrow.png') });
    await form.getByRole('button', { name: '创建服务', exact: true }).click();
    await expect(form).toHaveCount(0);
    const state = await page.evaluate(() => window.desktop.snapshot());
    expect(state.services[0].documentIds).toEqual([seed.documentId]);
    expect(state.deploymentNodes[0]).toMatchObject({
      name: '生产节点',
      environmentId: seed.environmentId,
      documentIds: [seed.documentId],
      fields: { 部署方式: 'Docker', 版本: '2026.10', 日志位置: '/srv/orders/logs' },
    });
    await page.getByRole('button', { name: '运行维护', exact: true }).click();
    await page.getByRole('button', { name: '新增运行维护', exact: true }).click();
    const operation = page.getByRole('dialog', { name: '新增运维记录', exact: true });
    await operation.getByLabel('名称', { exact: true }).fill('尚未提交的备份');
    await operation.getByLabel('运维类型', { exact: true }).selectOption('backup');
    await operation.getByText('作业／备份资料（可选）', { exact: true }).click();
    await operation.getByLabel('保留周期', { exact: true }).fill('30 天');
    await operation.getByLabel('最近恢复验证时间', { exact: true }).fill('2026-10-22');
    await page.keyboard.press('Escape');
    const confirm = page.getByRole('dialog', { name: '放弃未提交的资料？', exact: true });
    await expect(confirm).toBeVisible();
    await page.keyboard.press('Escape');
    await expect(confirm).toHaveCount(0);
    await expect(operation.getByLabel('保留周期', { exact: true })).toHaveValue('30 天');
    const message = await app.evaluate(
      ({ BrowserWindow, dialog }) =>
        new Promise<string>((resolve) => {
          const original = dialog.showMessageBox;
          dialog.showMessageBox = (async (...args: any[]) => {
            dialog.showMessageBox = original;
            resolve(args[args.length - 1].message);
            return { response: 0, checkboxChecked: false };
          }) as typeof dialog.showMessageBox;
          BrowserWindow.getAllWindows()[0].close();
        }),
    );
    expect(message).toContain('新增资料尚未提交');
    await expect(confirm).toBeVisible();
    await confirm.getByRole('button', { name: '继续填写', exact: true }).click();
    await operation.getByRole('button', { name: '创建运维记录', exact: true }).click();
    await expect(operation).toHaveCount(0);
    expect(
      (await page.evaluate(() => window.desktop.snapshot())).operations[0].fields,
    ).toMatchObject({ 保留周期: '30 天', 最近恢复验证时间: '2026-10-22' });
  } finally {
    await page
      .evaluate(() =>
        document
          .querySelectorAll<HTMLElement>('[data-new-record]')
          .forEach((f) => (f.dataset.dirty = 'false')),
      )
      .catch(() => {});
    await app.close();
    await fs.rm(directory, { recursive: true, force: true });
  }
});
