import { test, expect } from '@playwright/test';
import { electron } from './launch';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
test('台账只读工作区、共享范围、部署与任务布局和开始时间', async ({}, testInfo) => {
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), 'workbench-redesign-'));
  const env: Record<string, string> = {
    ...process.env,
    CLEVER_WORKBENCH_DATA_DIR: directory,
  };
  delete env.ELECTRON_RUN_AS_NODE;
  const app = await electron.launch({ args: ['.'], env });
  try {
    const page = await app.firstWindow(),
      errors: string[] = [];
    // Match a small CI desktop, where task details cover the list controls.
    await page.setViewportSize({ width: 1024, height: 768 });
    page.on('pageerror', (e) => errors.push(e.message));
    await page.getByRole('button', { name: '台账', exact: true }).waitFor();
    const seed = await page.evaluate(async () => {
      const api = window.desktop,
        systemId = (await api.mutate({ type: 'system.save', name: '协作平台' })).createdId!;
      const prod = (await api.mutate({ type: 'environment.save', systemId, name: '生产' }))
        .createdId!;
      const testing = (await api.mutate({ type: 'environment.save', systemId, name: '测试' }))
        .createdId!;
      const server = (
        await api.mutate({
          type: 'resource.save',
          systemId,
          environmentId: null,
          kind: 'server',
          name: '应用节点 01',
          address: '192.0.2.11',
          fields: { CPU: '16 核', 内存: '32 GB', 操作系统: 'Kylin Linux V10' },
        })
      ).createdId!;
      await api.mutate({
        type: 'account.save',
        resourceId: server,
        environmentId: null,
        name: '运维',
        username: 'deploy',
      });
      const service = (await api.mutate({ type: 'service.save', systemId, name: '协作 API' }))
        .createdId!;
      await api.mutate({
        type: 'node.save',
        value: {
          serviceId: service,
          environmentId: prod,
          name: '主节点',
          serverId: server,
          address: '',
          port: '8080',
          notes: '',
          mode: 'fixed',
          count: '',
        },
      });
      const task = (
        await api.mutate({
          type: 'task.create',
          draft: {
            title: '检查新台账界面',
            systemId,
            projectId: null,
            markdown: '',
            content: { type: 'doc', content: [{ type: 'paragraph' }] },
          },
        })
      ).createdId!;
      return { systemId, prod, testing, server, task };
    });
    await page.getByRole('button', { name: '台账', exact: true }).click();
    await page.getByRole('button', { name: '系统信息', exact: true }).click();
    const info = page.getByRole('dialog', { name: '系统信息' });
    await info.getByLabel('环境名称 生产', { exact: true }).fill('测试');
    await info.getByRole('button', { name: '完成', exact: true }).click();
    await expect(info).toBeVisible();
    await expect(info.getByRole('alert')).toContainText('同名');
    await info.getByLabel('环境名称 生产', { exact: true }).fill('生产');
    await info.getByRole('button', { name: '完成', exact: true }).click();
    await page.getByRole('button', { name: '服务器', exact: true }).click();
    await page.getByRole('button', { name: /应用节点 01.*系统通用/ }).click();
    const detail = page.getByRole('complementary', { name: '台账详情' });
    await expect(detail.getByText('deploy', { exact: true })).toBeVisible();
    await expect(detail.locator('input')).toHaveCount(0);
    await detail.getByRole('button', { name: '编辑', exact: true }).click();
    await page.getByLabel('生产', { exact: true }).check();
    await page.getByLabel('测试', { exact: true }).check();
    await page.getByLabel('地点与网络标签').fill('内网');
    await detail.getByRole('button', { name: '完成编辑', exact: true }).click();
    await expect
      .poll(async () =>
        page.evaluate(
          async (id) =>
            (await window.desktop.snapshot()).scopes.find((s) => s.ownerId === id)?.environmentIds
              .length,
          seed.server,
        ),
      )
      .toBe(2);
    await detail.getByRole('button', { name: '返回清单', exact: true }).click();
    await page.getByLabel('台账环境筛选').selectOption(seed.testing);
    await expect(page.getByRole('button', { name: /应用节点 01/ })).toBeVisible();
    await page.getByRole('button', { name: '应用部署', exact: true }).click();
    await page.getByRole('button', { name: /协作 API.*系统通用/ }).click();
    await page.getByRole('button', { name: '新增节点', exact: true }).click();
    await expect(page.getByLabel('部署环境', { exact: true })).toHaveValue(seed.testing);
    await page.getByLabel('节点名称', { exact: true }).fill('测试节点');
    await page.getByRole('button', { name: '保存节点', exact: true }).click();
    await detail.getByRole('button', { name: '返回清单', exact: true }).click();
    await page.getByLabel('台账环境筛选').selectOption('all');
    await page.getByRole('button', { name: /协作 API.*系统通用/ }).click();
    await expect(page.getByText('地址来自服务器', { exact: true })).toBeVisible();
    await page.screenshot({ path: testInfo.outputPath('ledger-workspace.png') });
    await page.getByRole('button', { name: '工作任务', exact: true }).click();
    await expect(page.getByLabel('所属项目')).toHaveCount(0);
    await page.getByLabel('系统范围').selectOption(seed.systemId);
    await page.getByRole('button', { name: '紧凑', exact: true }).click();
    await expect(page.locator('.task-list')).toHaveClass(/compact-tasks/);
    await expect
      .poll(() =>
        page
          .locator('.task-row')
          .first()
          .evaluate((e) => e.getBoundingClientRect().height),
      )
      .toBe(44);
    await page.locator('.task-open').filter({ hasText: '检查新台账界面' }).click();
    await page.getByLabel('修改开始时间').click();
    const start = new Date();
    start.setDate(start.getDate() - 2);
    const local = new Date(start.getTime() - start.getTimezoneOffset() * 60000)
      .toISOString()
      .slice(0, 16);
    await page.getByLabel('开始时间', { exact: true }).fill(local);
    await page.getByRole('button', { name: '应用时间', exact: true }).click();
    const updated = await page.evaluate(async (id) => window.desktop.task(id), seed.task);
    expect(updated.startedAt).toBe(new Date(local).getTime());
    expect(updated.createdAt).toBeGreaterThan(updated.startedAt);
    await page.getByLabel('关闭详情').click();
    await page.getByRole('button', { name: '正常', exact: true }).click();
    await expect(page.locator('.task-list')).not.toHaveClass(/compact-tasks/);
    // Keep details closed when using the list's batch actions on a small desktop.
    await page.getByRole('button', { name: '批量关联系统', exact: true }).click();
    await page.getByLabel('选择任务 检查新台账界面', { exact: true }).check();
    await page.getByLabel('批量关联系统', { exact: true }).selectOption('');
    await page.getByRole('button', { name: '应用到所选任务', exact: true }).click();
    await expect(page.locator('.task-row')).toHaveCount(0);
    await page.getByLabel('系统范围').selectOption('none');
    await expect(page.locator('.task-row')).toContainText('检查新台账界面');
    await page.getByRole('button', { name: '工作回顾', exact: true }).click();
    await page.getByRole('button', { name: '系统回顾', exact: true }).click();
    await expect(page.getByLabel('回顾系统')).toBeVisible();
    expect(errors).toEqual([]);
  } finally {
    await app.close();
    await fs.rm(directory, { recursive: true, force: true });
  }
});

test('表格粘贴映射预览后建立服务器，密码不进入普通字段', async () => {
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), 'workbench-paste-'));
  const env: Record<string, string> = {
    ...process.env,
    CLEVER_WORKBENCH_DATA_DIR: directory,
  };
  delete env.ELECTRON_RUN_AS_NODE;
  const app = await electron.launch({ args: ['.'], env });
  try {
    const page = await app.firstWindow();
    await page.getByRole('button', { name: '台账', exact: true }).waitFor();
    await page.evaluate(async () =>
      window.desktop.mutate({ type: 'system.save', name: '粘贴系统' }),
    );
    await page.evaluate(() => window.desktop.initializeVault('fictional-paste-master-password'));
    await page.getByRole('button', { name: '台账', exact: true }).click();
    await page.getByRole('button', { name: '粘贴表格', exact: true }).click();
    await page.getByLabel('粘贴表格', { exact: true }).evaluate((element) => {
      const clipboard = new DataTransfer();
      clipboard.setData(
        'text/plain',
        '名称\tIP\tCPU\t内存\t密码\n节点一\t192.0.2.1\t16 核\t32 GB\tfictional-paste-secret\n名称\tIP\tCPU\t内存\t密码\n节点二\t192.0.2.1\t8 核\t16 GB\t',
      );
      element.dispatchEvent(
        new ClipboardEvent('paste', { clipboardData: clipboard, bubbles: true, cancelable: true }),
      );
    });
    await page.getByRole('button', { name: '取消', exact: true }).click();
    await expect(page.getByText('这些资料尚未提交，离开将丢弃本次粘贴内容。')).toBeVisible();
    await page.getByRole('button', { name: '继续校对', exact: true }).click();
    await expect(page.locator('.paste-preview')).not.toContainText('fictional-paste-secret');
    await expect(page.getByRole('button', { name: '确认新增', exact: true })).toBeDisabled();
    await page.getByLabel('录入第 2 行', { exact: true }).uncheck();
    await page.getByLabel('疑似重复，仍新增独立记录').check();
    await page.getByRole('button', { name: '确认新增', exact: true }).click();
    await expect(page.getByText('已创建 2 条，跳过 1 条。')).toBeVisible();
    await page.getByRole('button', { name: '完成', exact: true }).click();
    await expect(page.locator('.workspace-list')).toContainText('节点一');
    await expect(page.locator('.workspace-list')).toContainText('节点二');
    const resources = await page.evaluate(async () => (await window.desktop.snapshot()).resources);
    expect(resources[0].fields.CPU).toBe('16 核');
    expect(JSON.stringify(resources)).not.toContain('fictional-paste-secret');
    expect(
      await page.evaluate(async () => {
        const account = (await window.desktop.snapshot()).accounts[0];
        return window.desktop.readSecret(account.id, 'password');
      }),
    ).toBe('fictional-paste-secret');
  } finally {
    await app.close();
    await fs.rm(directory, { recursive: true, force: true });
  }
});
