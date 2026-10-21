import { test, expect } from '@playwright/test';
import { electron } from './launch';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

test('打开台账后用摘要连续浏览，详情获得主要阅读宽度', async ({}, info) => {
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), 'workbench-ledger-layout-'));
  const env: Record<string, string> = { ...process.env, CLEVER_WORKBENCH_DATA_DIR: directory };
  delete env.ELECTRON_RUN_AS_NODE;
  const app = await electron.launch({ args: ['.'], env });
  try {
    const page = await app.firstWindow();
    await page.setViewportSize({ width: 1440, height: 960 });
    await page.getByRole('button', { name: '台账', exact: true }).waitFor();
    await page.evaluate(async () => {
      const api = window.desktop;
      const systemId = (await api.mutate({ type: 'system.save', name: '布局验证系统' })).createdId!;
      for (let i = 1; i <= 2; i++) {
        await api.mutate({
          type: 'resource.save',
          systemId,
          environmentId: null,
          kind: 'server',
          name: `应用节点 0${i}`,
          address: `192.0.2.${i}`,
          fields: { 用途: '订单服务' },
        });
      }
    });
    await page.getByRole('button', { name: '台账', exact: true }).click();
    await page.getByRole('button', { name: '服务器', exact: true }).click();
    await expect(page.getByRole('columnheader', { name: '说明', exact: true })).toBeVisible();
    await page.getByRole('button', { name: /应用节点 01.*系统通用/ }).click();
    const detail = page.getByRole('complementary', { name: '台账详情' });
    const list = page.locator('.workspace-results');
    await expect(detail.getByRole('heading', { name: '应用节点 01', exact: true })).toBeVisible();
    await expect
      .poll(async () => {
        const [left, right] = await Promise.all([list.boundingBox(), detail.boundingBox()]);
        return right!.width / left!.width;
      })
      .toBeGreaterThan(1.6);
    await expect(page.getByRole('columnheader', { name: '说明', exact: true })).toHaveCount(0);
    const search = await page.getByLabel('搜索台账清单').boundingBox();
    const detailBox = await detail.boundingBox();
    expect(search!.x + search!.width).toBeLessThanOrEqual(detailBox!.x);
    await list.getByRole('button', { name: /应用节点 02.*系统通用/ }).click();
    await expect(detail.getByRole('heading', { name: '应用节点 02', exact: true })).toBeVisible();
    await page.screenshot({
      animations: 'disabled',
      path: info.outputPath('ledger-wide-light.png'),
    });
    // The content area still fits a summary and detail at this desktop width.
    await page.setViewportSize({ width: 1080, height: 760 });
    await expect(list).toBeVisible();
    await expect(detail).toBeVisible();
    expect((await detail.boundingBox())!.width).toBeGreaterThan(500);
  } finally {
    await app.close();
    await fs.rm(directory, { recursive: true, force: true });
  }
});

test('摘要搜索保留详情、范围筛选关闭详情，窄窗口返回恢复清单条件和位置', async ({}, info) => {
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), 'workbench-ledger-return-'));
  const env: Record<string, string> = { ...process.env, CLEVER_WORKBENCH_DATA_DIR: directory };
  delete env.ELECTRON_RUN_AS_NODE;
  const app = await electron.launch({ args: ['.'], env });
  try {
    const page = await app.firstWindow();
    await page.setViewportSize({ width: 1440, height: 760 });
    await page.getByRole('button', { name: '台账', exact: true }).waitFor();
    const production = await page.evaluate(async () => {
      const api = window.desktop;
      const systemId = (await api.mutate({ type: 'system.save', name: '连续浏览系统' })).createdId!;
      const environmentId = (await api.mutate({ type: 'environment.save', systemId, name: '生产' }))
        .createdId!;
      for (let i = 1; i <= 36; i++) {
        const id = (
          await api.mutate({
            type: 'resource.save',
            systemId,
            environmentId,
            kind: 'server',
            name: `应用节点 ${String(i).padStart(2, '0')}${i === 20 ? ' · 负责订单与支付的核心服务节点'.repeat(4) : ''}`,
            address: `node-${i}.${'long-address-'.repeat(10)}example.invalid`,
            fields: i === 20 ? { CPU: '16 核' } : { 用途: '订单服务' },
            notes: i === 20 ? '长期维护记录'.repeat(80) : '',
          })
        ).createdId!;
        await api.mutate({
          type: 'scope.save',
          kind: 'resource',
          ownerId: id,
          scope: { environmentIds: [environmentId], tags: ['内网'] },
        });
      }
      return environmentId;
    });
    await page.getByRole('button', { name: '台账', exact: true }).click();
    await page.getByRole('button', { name: '服务器', exact: true }).click();
    await page.getByLabel('台账环境筛选').selectOption(production);
    await page.getByLabel('台账标签筛选').selectOption('内网');
    await page.getByLabel('搜索台账清单').fill('应用节点');
    const list = page.locator('.workspace-list');
    const target = list.getByRole('button', { name: /应用节点 20.*生产/ });
    await target.scrollIntoViewIfNeeded();
    const position = await list.evaluate((element) => element.scrollTop);
    expect(position).toBeGreaterThan(200);
    await target.click();
    const detail = page.getByRole('complementary', { name: '台账详情' });
    await expect(detail.getByRole('heading', { name: /^应用节点 20/ })).toBeVisible();
    const selectedSummary = page
      .getByRole('list', { name: '台账摘要清单' })
      .getByRole('listitem')
      .filter({ hasText: '应用节点 20' });
    expect((await selectedSummary.boundingBox())!.height).toBeLessThan(300);
    await list.getByRole('button', { name: /应用节点 36.*生产/ }).scrollIntoViewIfNeeded();
    await page.setViewportSize({ width: 960, height: 760 });
    await expect(page.getByRole('region', { name: '台账清单' })).toBeHidden();
    await expect(detail.getByRole('button', { name: '编辑', exact: true })).toBeInViewport();
    expect(
      await detail.evaluate((element) => element.scrollWidth - element.clientWidth),
    ).toBeLessThanOrEqual(1);
    await page.screenshot({
      animations: 'disabled',
      path: info.outputPath('ledger-narrow-light.png'),
    });
    await detail.getByRole('button', { name: '返回清单', exact: true }).click();
    await expect(page.getByLabel('搜索台账清单')).toHaveValue('应用节点');
    await expect(page.getByLabel('台账环境筛选')).toHaveValue(production);
    await expect(page.getByLabel('台账标签筛选')).toHaveValue('内网');
    await expect.poll(() => list.evaluate((element) => element.scrollTop)).toBe(position);
    await page.setViewportSize({ width: 1440, height: 760 });
    await target.click();
    await page.getByLabel('搜索台账清单').fill('不存在的节点');
    await expect(detail.getByRole('heading', { name: /^应用节点 20/ })).toBeVisible();
    await expect(page.getByText('这里还没有符合条件的记录', { exact: true })).toBeVisible();
    await page.getByLabel('搜索台账清单').fill('应用节点');
    await page.emulateMedia({ colorScheme: 'dark' });
    await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark');
    await page.screenshot({
      animations: 'disabled',
      path: info.outputPath('ledger-wide-dark.png'),
    });
    await page.setViewportSize({ width: 960, height: 760 });
    await page.screenshot({
      animations: 'disabled',
      path: info.outputPath('ledger-narrow-dark.png'),
    });
    await page.setViewportSize({ width: 1440, height: 760 });
    await page.getByLabel('台账环境筛选').selectOption('common');
    await expect(detail).toHaveCount(0);
    await expect(page.getByText('这里还没有符合条件的记录', { exact: true })).toBeVisible();
  } finally {
    await app.close();
    await fs.rm(directory, { recursive: true, force: true });
  }
});

test('运维筛选在摘要与返回清单间保持有效，编辑后可沿步骤和分类进入文档', async ({}, info) => {
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), 'workbench-ledger-integration-'));
  const env: Record<string, string> = { ...process.env, CLEVER_WORKBENCH_DATA_DIR: directory };
  delete env.ELECTRON_RUN_AS_NODE;
  const app = await electron.launch({ args: ['.'], env });
  try {
    const page = await app.firstWindow();
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.getByRole('button', { name: '台账', exact: true }).waitFor();
    const ids = await page.evaluate(async () => {
      const api = window.desktop;
      const systemId = (await api.mutate({ type: 'system.save', name: '运维验收系统' })).createdId!;
      const production = (await api.mutate({ type: 'environment.save', systemId, name: '生产' }))
        .createdId!;
      const testing = (await api.mutate({ type: 'environment.save', systemId, name: '测试' }))
        .createdId!;
      const documentId = (
        await api.mutate({
          type: 'document.create',
          context: { systemId, environmentId: production },
        })
      ).createdId!;
      await api.mutate({
        ...(await api.document(documentId)),
        type: 'document.edit',
        title: '生产备份步骤',
        markdown: '备份后核对校验结果。',
      });
      const operations = [
        { name: '每日数据库备份', kind: 'backup', status: 'active', environmentId: production },
        { name: '旧数据库备份', kind: 'backup', status: 'inactive', environmentId: production },
        { name: '测试数据同步', kind: 'job', status: 'unverified', environmentId: testing },
        { name: '系统通用清理', kind: 'job', status: 'active', environmentId: null },
      ] as const;
      for (const value of operations) {
        const id = (
          await api.mutate({
            type: 'operation.save',
            value: {
              ...value,
              systemId,
              resourceId: null,
              serviceId: null,
              documentId: value.name === '每日数据库备份' ? documentId : null,
              frequency: '每日 02:00',
              notes: '确认执行结果后记录异常。',
            },
          })
        ).createdId!;
        if (value.environmentId === production)
          await api.mutate({
            type: 'scope.save',
            kind: 'operation',
            ownerId: id,
            scope: { environmentIds: [production], tags: ['内网'] },
          });
      }
      return { systemId, production, testing };
    });
    await page.getByRole('button', { name: '台账', exact: true }).click();
    await page.getByRole('button', { name: '运行维护', exact: true }).click();
    const list = page.getByRole('region', { name: '台账清单' });
    const detail = page.getByRole('complementary', { name: '台账详情' });
    await expect(list.getByRole('row')).toHaveCount(5);
    await page.getByLabel('台账环境筛选').selectOption(ids.production);
    await expect(list.getByRole('row')).toHaveCount(4);
    await expect(list).toContainText('系统通用清理');
    await page.getByLabel('台账标签筛选').selectOption('内网');
    await page.getByLabel('运维类型筛选').selectOption('backup');
    await page.getByLabel('运维状态筛选').selectOption('active');
    await expect(list.getByRole('row')).toHaveCount(2);
    await list.getByRole('button', { name: /每日数据库备份.*生产/ }).click();
    await expect(list.getByRole('listitem')).toHaveCount(1);
    await expect(
      detail.getByRole('heading', { name: '每日数据库备份', exact: true }),
    ).toBeVisible();
    await detail.getByRole('button', { name: '编辑', exact: true }).click();
    await detail.getByLabel('频率', { exact: true }).fill('每日 03:30');
    await page.getByLabel('运维状态筛选').selectOption('inactive');
    await expect(detail).toHaveCount(0);
    await expect(list.getByRole('row')).toHaveCount(2);
    await expect(list).toContainText('旧数据库备份');
    await expect(list).not.toContainText('每日数据库备份');
    await page.getByLabel('运维状态筛选').selectOption('active');
    await list.getByRole('button', { name: /每日数据库备份.*生产/ }).click();
    await expect(detail).toContainText('每日 03:30');
    await page.screenshot({ animations: 'disabled', path: info.outputPath('operations-wide.png') });
    await page.setViewportSize({ width: 960, height: 760 });
    await expect(list).toBeHidden();
    await detail.getByRole('button', { name: '返回清单', exact: true }).click();
    await expect(page.getByLabel('台账环境筛选')).toHaveValue(ids.production);
    await expect(page.getByLabel('台账标签筛选')).toHaveValue('内网');
    await expect(page.getByLabel('运维类型筛选')).toHaveValue('backup');
    await expect(page.getByLabel('运维状态筛选')).toHaveValue('active');
    await page.getByLabel('台账标签筛选').selectOption('all');
    await page.getByLabel('台账环境筛选').selectOption(ids.testing);
    await page.getByLabel('运维类型筛选').selectOption('job');
    await page.getByLabel('运维状态筛选').selectOption('unverified');
    await expect(list.getByRole('row')).toHaveCount(2);
    await expect(list).toContainText('测试数据同步');
    await expect(list).not.toContainText('系统通用清理');
    await page.getByLabel('运维状态筛选').selectOption('inactive');
    await expect(page.getByText('这里还没有符合条件的记录', { exact: true })).toBeVisible();
    await page.getByLabel('台账环境筛选').selectOption(ids.production);
    await page.getByLabel('运维类型筛选').selectOption('backup');
    await page.getByLabel('运维状态筛选').selectOption('active');
    await list.getByRole('button', { name: /每日数据库备份.*生产/ }).click();
    await detail.getByRole('button', { name: '阅读步骤文档', exact: true }).click();
    await expect(page.getByLabel('文档标题')).toHaveValue('生产备份步骤');
    await page.getByRole('textbox', { name: '工作内容' }).fill('补充备份恢复校验并保留结果。');
    await page.getByRole('button', { name: '台账', exact: true }).click();
    await page
      .getByRole('navigation', { name: '系统资料类型' })
      .getByRole('button', { name: '文档', exact: true })
      .click();
    await list.getByRole('button', { name: /生产备份步骤.*生产/ }).click();
    await expect(page.getByLabel('文档标题')).toHaveValue('生产备份步骤');
    await expect(page.getByRole('textbox', { name: '工作内容' })).toContainText('补充备份恢复校验');
    await page.getByRole('button', { name: '台账', exact: true }).click();
    await page.getByRole('button', { name: '新增文档', exact: true }).click();
    await expect(page.getByLabel('文档标题')).toHaveValue('');
    await expect(page.getByLabel('关联系统', { exact: true })).toHaveValue(ids.systemId);
    await page.getByLabel('文档标题').fill('新增生产运维记录');
    await page.getByRole('button', { name: '台账', exact: true }).click();
    await expect(list.getByRole('button', { name: /新增生产运维记录.*生产/ })).toBeVisible();
    await page.screenshot({
      animations: 'disabled',
      path: info.outputPath('documents-narrow.png'),
    });
  } finally {
    await app.close();
    await fs.rm(directory, { recursive: true, force: true });
  }
});
