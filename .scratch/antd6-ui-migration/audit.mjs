import { electron } from '../../tests/e2e/launch.ts';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { expect } from '@playwright/test';
const directory = await fs.mkdtemp(path.join(os.tmpdir(), 'cwb-antd-audit-'));
const env = { ...process.env, CLEVER_WORKBENCH_DATA_DIR: directory, CWB_TEST_MOCK_KEYCHAIN: '1' };
delete env.ELECTRON_RUN_AS_NODE;
const app = await electron.launch({ args: ['.'], env });
const evidence = '.scratch/antd6-ui-migration/evidence';
await fs.mkdir(evidence, { recursive: true });
try {
  const page = await app.firstWindow();
  await page.setViewportSize({ width: 1440, height: 960 });
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  page.on('console', (m) => {
    if (m.type() === 'error' || m.type() === 'warning') console.log(m.text().slice(0, 600));
  });
  await expect(page.getByRole('menuitem', { name: '台账', exact: true })).toBeVisible();
  await page.evaluate(async () => {
    const api = window.desktop;
    const projectId = (
      await api.mutate({ type: 'project.create', name: '订单平台升级', color: '#1677ff' })
    ).createdId;
    const systemId = (
      await api.mutate({
        type: 'system.save',
        name: '订单中心',
        projectId,
        notes: '交易与订单服务 · 稳定维护',
      })
    ).createdId;
    await api.mutate({ type: 'system.save', name: '内部服务平台', notes: '研发工具与团队资料' });
    const environmentId = (await api.mutate({ type: 'environment.save', systemId, name: '生产' }))
      .createdId;
    for (let i = 1; i < 4; i++)
      await api.mutate({
        type: 'resource.save',
        systemId,
        environmentId,
        kind: 'server',
        name: `order-app-0${i}`,
        address: `192.0.2.${i}`,
        fields: { 用途: '订单应用节点', CPU: '8核', 内存: '16GB' },
      });
    await api.mutate({
      type: 'resource.save',
      systemId,
      environmentId,
      kind: 'database',
      name: '订单数据库',
      product: 'PostgreSQL',
      address: '192.0.2.21',
      port: '5432',
      fields: { 用途: '订单主库' },
    });
    const accessId = (
      await api.mutate({
        type: 'access.save',
        systemId,
        name: '构建与发布',
        addresses: [{ label: '内部入口', url: 'https://build.example.test' }],
      })
    ).createdId;
    const accountId = (
      await api.mutate({
        type: 'account.save',
        systemId,
        environmentId,
        name: '应用运维',
        username: 'operator',
      })
    ).createdId;
    await api.mutate({
      type: 'service.save',
      systemId,
      name: '订单 API',
      repository: 'https://git.example.test/order-api',
      notes: '订单查询、创建与履约接口',
    });
    const documentId = (await api.mutate({ type: 'document.create', context: { systemId } }))
      .createdId;
    await api.mutate({
      ...(await api.document(documentId)),
      type: 'document.edit',
      title: '生产发布检查与回滚步骤',
      markdown:
        '# 发布前检查\n\n核对数据库备份、变更清单和回滚版本。\n\n## 操作步骤\n\n1. 检查监控指标与服务状态\n2. 执行灰度发布并核对订单\n3. 记录本次验证结果\n\n## 常用命令\n\n```sh\ncurl https://api.example.test/health\n```',
    });
    await api.mutate({
      type: 'operation.save',
      value: {
        systemId,
        environmentId,
        resourceId: null,
        serviceId: null,
        documentId,
        kind: 'backup',
        name: '每日数据库备份',
        frequency: '每日 02:00',
        status: 'active',
        notes: '备份后核对校验结果。',
      },
    });
    await api.mutate({
      type: 'task.create',
      draft: {
        title: '核对订单库备份与恢复记录',
        systemId,
        projectId: null,
        content: {
          type: 'doc',
          content: [
            {
              type: 'paragraph',
              content: [{ type: 'text', text: '核对备份、联调记录与回滚步骤。' }],
            },
          ],
        },
        markdown: '核对备份、联调记录与回滚步骤。',
      },
    });
    for (const title of ['联调支付回调并核对订单状态', '整理发布检查与回滚方案'])
      await api.mutate({
        type: 'task.create',
        draft: {
          title,
          systemId,
          projectId: null,
          content: { type: 'doc', content: [{ type: 'paragraph' }] },
          markdown: '',
        },
      });
    const deleted = (
      await api.mutate({
        type: 'task.create',
        draft: {
          title: '过期的联调记录',
          systemId: null,
          projectId: null,
          content: { type: 'doc', content: [{ type: 'paragraph' }] },
          markdown: '',
        },
      })
    ).createdId;
    await api.mutate({ type: 'task.delete', id: deleted });
    for (const item of [
      { kind: 'system', id: systemId },
      { kind: 'account', id: accountId },
      { kind: 'access', id: accessId },
      { kind: 'tool', id: 'zip-text' },
    ])
      await api.mutate({ type: 'favorite.set', ...item, pinned: true });
  });
  for (const [theme, width, height] of [
    ['light', 1440, 960],
    ['dark', 1440, 960],
    ['dark', 820, 650],
  ]) {
    await page.setViewportSize({ width, height });
    await page.evaluate((theme) => window.desktop.mutate({ type: 'settings', theme }), theme);
    await expect(page.locator('html')).toHaveAttribute('data-theme', theme);
    for (const name of [
      '工作台',
      '台账',
      '工作任务',
      '文档',
      '工具',
      '工作回顾',
      '项目档案',
      '回收站',
      '设置',
    ]) {
      await page.getByRole('menuitem', { name, exact: true }).click();
      await expect(page.getByRole('menuitem', { name, exact: true })).toHaveAttribute(
        'aria-current',
        'page',
      );
      await expect(page.locator('.module-loading')).toHaveCount(0);
      await expect(page.locator('main[aria-busy="true"]')).toHaveCount(0);
      await expect(page.getByRole('button', { name: '快速新建', exact: true })).toBeEnabled();
      if (name === '文档') {
        await page.locator('.document-list-row').first().click();
        await expect(page.getByLabel('文档标题', { exact: true })).toHaveValue(
          '生产发布检查与回滚步骤',
        );
        await expect(page.locator('.workbench-vditor[aria-busy="true"]')).toHaveCount(0);
      }
      if (name === '台账') {
        await page.getByRole('tab', { name: '服务器', exact: true }).click();
        await expect(page.getByRole('tab', { name: '服务器', exact: true })).toHaveAttribute(
          'aria-selected',
          'true',
        );
      }
      await page.screenshot({
        path: `${evidence}/${theme}-${width}-${name}.png`,
        animations: 'disabled',
      });
      console.log(theme, width, name, await page.locator('h1,h2').allTextContents());
    }
  }
  console.log(JSON.stringify({ errors }));
} catch (error) {
  const page = await app.firstWindow();
  console.log((await page.locator('body').innerText()).slice(0, 3000));
  await page.screenshot({ path: `${evidence}/failure.png` });
  throw error;
} finally {
  await app.close();
  await fs.rm(directory, { recursive: true, force: true });
}
