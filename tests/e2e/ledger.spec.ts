import { electron } from './launch';
import { test, expect, type Page } from '@playwright/test';
import { openLedgerRecord, openSystemAction } from './ledger-actions';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
async function session(run: (page: Page) => Promise<void>) {
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), 'ledger-redesign-regression-'));
  const env: Record<string, string> = { ...process.env, CLEVER_WORKBENCH_DATA_DIR: directory };
  delete env.ELECTRON_RUN_AS_NODE;
  const app = await electron.launch({ args: ['.'], env });
  try {
    await run(await app.firstWindow());
  } finally {
    await app.close();
    await fs.rm(directory, { recursive: true, force: true });
  }
}
test('系统跨项目保留沿革，任务只保留系统归属', async () =>
  session(async (page) => {
    const ids = await page.evaluate(async () => {
      const api = window.desktop;
      const a = (await api.mutate({ type: 'project.create', name: '园区一期', color: '#007aff' }))
          .createdId!,
        b = (await api.mutate({ type: 'project.create', name: '园区二期', color: '#34a271' }))
          .createdId!;
      return { a, b };
    });
    await page.getByRole('button', { name: '台账', exact: true }).click();
    await page.getByRole('button', { name: '新增系统', exact: true }).first().click();
    await page.getByLabel('快速新建系统名称').fill('园区平台');
    await page.getByRole('button', { name: '创建系统', exact: true }).click();
    await openSystemAction(page, '系统信息');
    await page.getByLabel('当前项目', { exact: true }).selectOption(ids.a);
    await page
      .getByRole('dialog', { name: '系统信息' })
      .getByRole('button', { name: '完成', exact: true })
      .click();
    await page.getByRole('button', { name: '快速新建', exact: true }).click();
    await page.getByRole('button', { name: '新任务', exact: true }).click();
    await page.getByLabel('快速新建任务标题').fill('检查生产缓存');
    await page.getByRole('button', { name: '创建任务', exact: true }).click();
    await expect(page.getByLabel('所属项目', { exact: true })).toHaveCount(0);
    await expect(page.getByLabel('关联系统', { exact: true })).toContainText('园区平台');
    await page.getByRole('button', { name: '台账', exact: true }).click();
    await openSystemAction(page, '系统信息');
    await page.getByLabel('当前项目', { exact: true }).selectOption(ids.b);
    await page.getByLabel('系统名称', { exact: true }).fill('智慧园区平台');
    await page
      .getByRole('dialog', { name: '系统信息' })
      .getByRole('button', { name: '完成', exact: true })
      .click();
    const data = await page.evaluate(() => window.desktop.snapshot());
    expect(data.systemProjects.map((l) => l.projectId)).toEqual([ids.a, ids.b]);
    expect(data.tasks[0]).toMatchObject({ systemId: data.systems[0].id, projectId: null });
    await page.getByRole('button', { name: '工作任务', exact: true }).click();
    await page.locator('.task-open').filter({ hasText: '检查生产缓存' }).click();
    await expect(page.getByLabel('关联系统')).toContainText('智慧园区平台');
  }));
test('服务仓库只维护一份，多个环境的独立部署节点可编辑', async () =>
  session(async (page) => {
    await page.setViewportSize({ width: 1000, height: 760 });
    const ids = await page.evaluate(async () => {
      const api = window.desktop,
        systemId = (await api.mutate({ type: 'system.save', name: '订单平台' })).createdId!;
      const testing = (await api.mutate({ type: 'environment.save', systemId, name: '测试' }))
          .createdId!,
        production = (await api.mutate({ type: 'environment.save', systemId, name: '生产' }))
          .createdId!;
      return { systemId, testing, production };
    });
    await page.getByRole('button', { name: '台账', exact: true }).click();
    await page.getByRole('button', { name: '应用部署', exact: true }).click();
    await page.getByRole('button', { name: '新增应用部署', exact: true }).click();
    await page.getByLabel('快速新建服务名称').fill('订单服务');
    await page.getByRole('button', { name: '创建服务', exact: true }).click();
    await page
      .getByRole('complementary', { name: '台账详情' })
      .getByRole('button', { name: '编辑', exact: true })
      .click();
    await page.getByLabel('代码仓库', { exact: true }).fill('git@example.test:orders.git');
    await page.getByRole('button', { name: '完成编辑', exact: true }).click();
    for (const [environment, name, address, port] of [
      [ids.testing, '测试节点', 'orders.test.internal', '8080'],
      [ids.production, '生产节点', 'orders.prod.internal', '8443'],
    ]) {
      await page.getByRole('button', { name: '新增节点', exact: true }).click();
      const dialog = page.getByRole('dialog', { name: '新增部署节点' });
      await dialog.getByLabel('节点名称').fill(name);
      await dialog.getByLabel('部署环境').selectOption(environment);
      await dialog.getByLabel('独立地址（留空展示服务器地址）').fill(address);
      await dialog.getByLabel('端口', { exact: true }).fill(port);
      await dialog.getByRole('button', { name: '保存节点', exact: true }).click();
    }
    await page.getByRole('button', { name: '编辑节点', exact: true }).first().click();
    const nodeEditor = page.getByRole('dialog', { name: '编辑部署节点' });
    await nodeEditor.getByLabel('端口', { exact: true }).fill('8081');
    await nodeEditor.getByRole('button', { name: '完成', exact: true }).click();
    await page.getByRole('button', { name: '返回清单', exact: true }).click();
    await page.getByLabel('台账环境筛选').selectOption(ids.testing);
    await openLedgerRecord(page, '应用部署', '订单服务');
    await expect(page.locator('.workspace-node')).toContainText('orders.test.internal');
    await expect(page.locator('.workspace-node')).not.toContainText('orders.prod.internal');
    const data = await page.evaluate(() => window.desktop.snapshot());
    expect(data.services[0].repository).toBe('git@example.test:orders.git');
    expect(data.deploymentNodes).toHaveLength(2);
  }));
test('资源普通字段编辑与跨环境复制互不影响', async () =>
  session(async (page) => {
    const ids = await page.evaluate(async () => {
      const api = window.desktop,
        systemId = (await api.mutate({ type: 'system.save', name: '订单平台' })).createdId!;
      const a = (await api.mutate({ type: 'environment.save', systemId, name: '生产' })).createdId!,
        b = (await api.mutate({ type: 'environment.save', systemId, name: '测试' })).createdId!;
      await api.mutate({
        type: 'resource.save',
        systemId,
        environmentId: a,
        kind: 'redis',
        name: '订单缓存',
        address: '192.0.2.2',
      });
      return { a, b };
    });
    await page.getByRole('button', { name: '台账', exact: true }).click();
    await openLedgerRecord(page, '数据库／中间件', '订单缓存', true);
    await page.getByLabel('连接 1 端口', { exact: true }).fill('6379');
    await page.getByRole('button', { name: '复制资源', exact: true }).click();
    const dialog = page.getByRole('dialog');
    await dialog.getByLabel('副本目标环境', { exact: true }).selectOption(ids.b);
    await dialog.getByRole('button', { name: '创建副本', exact: true }).click();
    await expect(page.getByRole('heading', { name: '订单缓存 副本', exact: true })).toBeVisible();
    await page
      .getByRole('complementary', { name: '台账详情' })
      .getByRole('button', { name: '编辑', exact: true })
      .click();
    await page.getByLabel('连接 1 地址', { exact: true }).fill('192.0.2.3');
    await page.getByRole('button', { name: '工作台', exact: true }).click();
    const data = await page.evaluate(() => window.desktop.snapshot());
    expect(data.resources.find((r) => r.name === '订单缓存')?.address).toBe('192.0.2.2');
    expect(data.resources.find((r) => r.name === '订单缓存 副本')).toMatchObject({
      environmentId: ids.b,
      address: '192.0.2.3',
      port: '6379',
    });
  }));
test('账号汇总保留环境和资源归属，普通资料与空用户名可编辑', async () =>
  session(async (page) => {
    await page.evaluate(async () => {
      const api = window.desktop,
        systemId = (await api.mutate({ type: 'system.save', name: '平台' })).createdId!,
        environmentId = (await api.mutate({ type: 'environment.save', systemId, name: '生产' }))
          .createdId!,
        resourceId = (
          await api.mutate({
            type: 'resource.save',
            systemId,
            environmentId,
            kind: 'redis',
            name: '缓存',
          })
        ).createdId!;
      await api.mutate({ type: 'account.save', environmentId, name: '超管', username: 'admin' });
      await api.mutate({ type: 'account.save', environmentId, resourceId, name: '应用连接' });
    });
    await page.getByRole('button', { name: '台账', exact: true }).click();
    await openLedgerRecord(page, '账号', '应用连接', true);
    await expect(page.getByLabel('账号用户名', { exact: true })).toHaveValue('');
    await page.getByLabel('账号用户名', { exact: true }).fill('application');
    await page.getByRole('button', { name: '工作台', exact: true }).click();
    await page.getByRole('button', { name: '台账', exact: true }).click();
    await openLedgerRecord(page, '账号', '超管', true);
    await expect(page.getByLabel('账号用户名', { exact: true })).toHaveValue('admin');
    const data = await page.evaluate(() => window.desktop.snapshot());
    expect(data.accounts.find((a) => a.name === '应用连接')?.username).toBe('application');
    expect(data.accounts).toHaveLength(2);
  }));
