import { test, expect } from '@playwright/test';
import { electron } from './launch';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

test('台账资料单条、多选、附账号与编辑保存失败不覆盖剪贴板', async ({}, info) => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'workbench-ledger-copy-'));
  const env: Record<string, string> = { ...process.env, CLEVER_WORKBENCH_DATA_DIR: root };
  delete env.ELECTRON_RUN_AS_NODE;
  const app = await electron.launch({ args: ['.'], env });
  try {
    const page = await app.firstWindow();
    // This case exercises list and inspector together; narrow navigation is tested separately.
    await page.setViewportSize({ width: 1380, height: 850 });
    await page.getByRole('button', { name: '台账', exact: true }).waitFor();
    const ids = await page.evaluate(async () => {
      const a = window.desktop;
      const systemId = (await a.mutate({ type: 'system.save', name: '协作平台' })).createdId!;
      const prod = (await a.mutate({ type: 'environment.save', systemId, name: '生产' }))
        .createdId!;
      const testing = (await a.mutate({ type: 'environment.save', systemId, name: '测试' }))
        .createdId!;
      const server = (
        await a.mutate({
          type: 'resource.save',
          systemId,
          environmentId: null,
          kind: 'server',
          name: '应用节点 01',
          address: '192.0.2.11',
          fields: { CPU: '16 核', 内存: '32 GB', 操作系统: 'Kylin V10', 用途: '订单服务' },
        })
      ).createdId!;
      await a.mutate({
        type: 'resource.save',
        systemId,
        environmentId: null,
        kind: 'server',
        name: '应用节点 02',
        address: '192.0.2.12',
      });
      const service = (
        await a.mutate({
          type: 'service.save',
          systemId,
          name: '订单 API',
          repository: 'git@example.invalid:orders.git',
        })
      ).createdId!;
      for (const [name, environmentId] of [
        ['生产节点', prod],
        ['测试节点', testing],
      ])
        await a.mutate({
          type: 'node.save',
          value: {
            name,
            serviceId: service,
            environmentId,
            serverId: server,
            address: '',
            port: '8080',
            mode: 'fixed',
            count: '',
            notes: '',
          },
        });
      const account = (
        await a.mutate({
          type: 'account.save',
          resourceId: server,
          environmentId: null,
          name: '运维',
          username: 'operator',
        })
      ).createdId!;
      await a.initializeVault('fixture-master');
      await a.saveSecret(account, 'password', 'fixture-copy-password');
      await a.lockVault();
      return { prod, server };
    });
    await page.getByRole('button', { name: '台账', exact: true }).click();
    await page.getByRole('button', { name: '服务器', exact: true }).click();
    await page.getByRole('button', { name: '复制资料 应用节点 01', exact: true }).click();
    await expect
      .poll(() => app.evaluate(({ clipboard }) => clipboard.readText()))
      .toContain('CPU：16 核');
    expect(await app.evaluate(({ clipboard }) => clipboard.readText())).not.toContain('operator');
    await expect(page.getByRole('dialog')).toHaveCount(0);
    await page.getByLabel('选择当前资料结果', { exact: true }).check();
    await page.getByRole('button', { name: '复制所选资料', exact: true }).click();
    await expect
      .poll(() => app.evaluate(({ clipboard }) => clipboard.readText()))
      .toContain('应用节点 02');
    await page.getByLabel('搜索台账清单').fill('节点 01');
    await expect(page.getByRole('button', { name: '复制所选资料', exact: true })).toBeDisabled();
    await page.getByLabel('搜索台账清单').fill('');
    await page.getByRole('button', { name: '包含账号 应用节点 01', exact: true }).click();
    const dialog = page.getByRole('dialog', { name: '复制资料 · 包含账号', exact: true });
    await expect(dialog.getByLabel('附带账号 应用节点 01 / 运维')).not.toBeChecked();
    await expect(dialog.getByLabel('包含密码', { exact: true })).not.toBeChecked();
    await dialog.getByLabel('附带账号 应用节点 01 / 运维').check();
    await dialog.getByRole('button', { name: '复制资料', exact: true }).click();
    await expect(dialog).toHaveCount(0);
    await expect
      .poll(() => app.evaluate(({ clipboard }) => clipboard.readText()))
      .toContain('用户名：operator');
    expect(await app.evaluate(({ clipboard }) => clipboard.readText())).not.toContain(
      'fixture-copy-password',
    );
    await page.getByRole('button', { name: '包含账号 应用节点 01', exact: true }).click();
    await dialog.getByLabel('附带账号 应用节点 01 / 运维').check();
    await dialog.getByLabel('包含密码', { exact: true }).check();
    await page.screenshot({
      path: info.outputPath('copy-with-accounts.png'),
      animations: 'disabled',
    });
    const previous = await app.evaluate(({ clipboard }) => clipboard.readText());
    await dialog.getByRole('button', { name: '复制资料', exact: true }).click();
    const unlock = page.getByRole('dialog', { name: '解锁秘密', exact: true });
    await unlock.getByRole('button', { name: '取消', exact: true }).click();
    await expect(dialog).toBeVisible();
    expect(await app.evaluate(({ clipboard }) => clipboard.readText())).toBe(previous);
    await dialog.getByRole('button', { name: '复制资料', exact: true }).click();
    await unlock.getByLabel('主密码', { exact: true }).fill('fixture-master');
    await unlock.getByRole('button', { name: '解锁', exact: true }).click();
    await expect(dialog).toHaveCount(0);
    await expect
      .poll(() => app.evaluate(({ clipboard }) => clipboard.readText()))
      .toContain('密码：fixture-copy-password');
    await page.evaluate(() => window.desktop.lockVault());
    await expect.poll(() => app.evaluate(({ clipboard }) => clipboard.readText())).toBe('');
    await page.getByRole('button', { name: '应用部署', exact: true }).click();
    await page.getByLabel('台账环境筛选').selectOption(ids.prod);
    await page.getByRole('button', { name: '复制资料 订单 API', exact: true }).click();
    await expect
      .poll(() => app.evaluate(({ clipboard }) => clipboard.readText()))
      .toContain('部署节点：生产节点');
    expect(await app.evaluate(({ clipboard }) => clipboard.readText())).not.toContain('测试节点');
    await page
      .locator('.workspace-list tbody tr')
      .first()
      .locator('td')
      .first()
      .getByRole('button')
      .click();
    await page.getByRole('button', { name: '复制资料 生产节点', exact: true }).click();
    await expect
      .poll(() => app.evaluate(({ clipboard }) => clipboard.readText()))
      .toContain('地址来源：服务器 应用节点 01');
    await page.getByRole('button', { name: '返回清单', exact: true }).click();
    await page.getByRole('button', { name: '服务器', exact: true }).click();
    await page
      .locator('.workspace-list tbody tr')
      .filter({ hasText: '应用节点 01' })
      .locator('td')
      .first()
      .getByRole('button')
      .click();
    const detail = page.getByRole('complementary', { name: '台账详情', exact: true });
    await detail.getByRole('button', { name: '编辑', exact: true }).click();
    await page.getByLabel('资源名称', { exact: true }).fill('');
    const before = await app.evaluate(({ clipboard }) => clipboard.readText());
    await detail.getByRole('button', { name: '复制资料 应用节点 01', exact: true }).click();
    await expect(page.getByLabel('资源名称', { exact: true })).toHaveValue('');
    expect(await app.evaluate(({ clipboard }) => clipboard.readText())).toBe(before);
    await detail.getByRole('button', { name: '复制资源地址', exact: true }).click();
    expect(await app.evaluate(({ clipboard }) => clipboard.readText())).toBe(before);
    await page.getByLabel('资源名称', { exact: true }).fill('更新后的节点');
    await detail.getByRole('button', { name: /复制资料 (应用节点 01|更新后的节点)/ }).click();
    await expect
      .poll(() => app.evaluate(({ clipboard }) => clipboard.readText()))
      .toContain('服务器：更新后的节点');
    await page.getByLabel('资源地址', { exact: true }).fill('192.0.2.31');
    const editedRow = page.locator('.workspace-list tbody tr.selected');
    await editedRow.locator('.ledger-copy-field').hover();
    await editedRow.getByRole('button', { name: '复制地址', exact: true }).click();
    await expect
      .poll(() => app.evaluate(({ clipboard }) => clipboard.readText()))
      .toBe('192.0.2.31');
    await detail.getByRole('button', { name: '完成编辑', exact: true }).click();
    await detail.getByText('基本信息与配置', { exact: true }).click();
    await page.evaluate(async (id) => {
      const record = (await window.desktop.snapshot()).resources.find((r) => r.id === id)!;
      await window.desktop.mutate({
        ...record,
        type: 'resource.save',
        fields: { ...record.fields, CPU: '32 核' },
      });
    }, ids.server);
    await detail.getByText('16 核', { exact: true }).hover();
    await detail.getByRole('button', { name: '复制CPU', exact: true }).click();
    await expect.poll(() => app.evaluate(({ clipboard }) => clipboard.readText())).toBe('32 核');
    await page.screenshot({
      path: info.outputPath('ledger-copy-details.png'),
      animations: 'disabled',
    });
  } finally {
    await app.close();
    await fs.rm(root, { recursive: true, force: true });
  }
});
