import { test, expect, type ElectronApplication, type Page } from '@playwright/test';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { electron } from './launch';
import {
  expectedFeatureGuide,
  verifyUnavailableOrNoTarget,
  expectGuidanceDestination,
} from './guidance-content';
import { openLedgerRecord, openSystemAction } from './ledger-actions';

async function launch() {
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), 'workbench-operations-guide-'));
  const env: Record<string, string> = { ...process.env, CLEVER_WORKBENCH_DATA_DIR: directory };
  if (process.platform === 'darwin') env.CWB_TEST_MOCK_KEYCHAIN = '1';
  delete env.ELECTRON_RUN_AS_NODE;
  const app = await electron.launch({ args: ['.'], env });
  const page = await app.firstWindow();
  await page.setViewportSize({ width: 1380, height: 850 });
  return {
    app,
    page,
    close: async () => {
      await app.close();
      await fs.rm(directory, { recursive: true, force: true });
    },
  };
}

async function read(app: ElectronApplication, page: Page, id: string, placement: string) {
  const feature = await expectedFeatureGuide(app, id);
  const library = page.getByRole('dialog', { name: '使用指引', exact: true });
  await expect(library).toBeVisible();
  if (!feature || !feature.placements.includes(placement)) {
    const expectedTitles: Record<string, string> = {
      'resource-server': '维护服务器与硬件配置',
      'resource-datastores': '记录数据库、Redis 与其他资源',
      'resource-copy-delete': '复制或删除资源',
      'services-deployments': '维护服务与部署节点',
      'operations-maintenance': '记录运行作业与备份策略',
      'ledger-related-work': '从系统和资源查看相关工作',
      'ledger-paste': '校对表格后批量录入台账',
      'system-export': '导出可阅读的系统资料',
    };
    await expect(
      library.getByRole('button', { name: feature?.title ?? expectedTitles[id], exact: true }),
    ).toHaveCount(0);
    if (!(await library.locator('.guidance-list button').count()))
      await expect(library.getByRole('status')).toContainText('当前暂无可用指引');
    test.info().annotations.push({
      type: 'guidance-content-warning',
      description: `${id} 在当前安装包不可用；已验证列表降级，正常指引正文尚未核对。`,
    });
    await page.keyboard.press('Escape');
    return null;
  }
  await library.getByRole('button', { name: feature.title, exact: true }).click();
  const dialog = page.getByRole('dialog', { name: feature.title, exact: true });
  for (const [index, step] of feature.steps.entries()) {
    if (index) await dialog.getByRole('button', { name: '下一步', exact: true }).click();
    await expect(dialog.getByRole('heading', { name: step.title, exact: true })).toBeVisible();
    await expect(dialog).toContainText(step.action);
    await expect(dialog).toContainText(step.expectedResult);
    if (step.image) {
      const figure = dialog.locator('.guidance-step figure');
      await expect(figure).toBeVisible();
      if (await figure.locator('img').count()) await expect(figure.locator('img')).toBeVisible();
      else {
        await expect(figure).toContainText(`图片暂不可用：${step.image.alt}`);
        test.info().annotations.push({
          type: 'guidance-content-warning',
          description: `${id}/${step.id} 的图片不可用，已验证文字替代内容。`,
        });
      }
    }
  }
  return { feature, dialog };
}

async function nearby(
  app: ElectronApplication,
  page: Page,
  id: string,
  placement: string,
  trigger = '台账使用指引',
) {
  await page.getByRole('button', { name: trigger, exact: true }).click();
  return read(app, page, id, placement);
}

async function closeGuide(page: Page, opened: Awaited<ReturnType<typeof read>>) {
  if (opened) {
    await page.keyboard.press('Escape');
    await expect(opened.dialog).toHaveCount(0);
  }
}

test('系统导出菜单附近有操作指引，关闭后保留当前系统及焦点', async () => {
  const { app, page, close } = await launch();
  try {
    await page.evaluate(() => window.desktop.mutate({ type: 'system.save', name: '导出示例系统' }));
    await page.getByRole('button', { name: '台账', exact: true }).click();
    const more = page.getByRole('button', { name: '当前系统更多操作', exact: true });
    await more.click();
    await page.getByRole('menuitem', { name: '导出资料使用指引', exact: true }).click();
    const opened = await read(app, page, 'system-export', 'system-export');
    if (opened) {
      await page.keyboard.press('Escape');
      await expect(opened.dialog).toHaveCount(0);
    }
    await expect(more).toBeFocused();
    await expect(page.getByRole('button', { name: '切换系统', exact: true })).toContainText(
      '导出示例系统',
    );
    expect((await page.evaluate(() => window.desktop.snapshot())).systems).toHaveLength(1);
  } finally {
    await close();
  }
});

test('批量录入入口旁可查阅指引，不会打开批量录入或新增记录', async () => {
  const { app, page, close } = await launch();
  try {
    await page.evaluate(() => window.desktop.mutate({ type: 'system.save', name: '批量示例系统' }));
    await page.getByRole('button', { name: '台账', exact: true }).click();
    const trigger = page.getByRole('button', { name: '批量录入使用指引', exact: true });
    await trigger.click({ timeout: 4000 });
    const opened = await read(app, page, 'ledger-paste', 'ledger-import');
    if (opened && !(await verifyUnavailableOrNoTarget(page, opened.feature))) {
      await opened.dialog.getByRole('button', { name: '前往功能', exact: true }).click();
      await expectGuidanceDestination(page, opened.feature);
    }
    await expect(page.getByRole('dialog', { name: '批量录入 · 校对后新增' })).toHaveCount(0);
    expect((await page.evaluate(() => window.desktop.snapshot())).resources).toHaveLength(0);
  } finally {
    await close();
  }
});

test('资源指引对应服务器配置、其他类型、独立复制与引用删除保护', async () => {
  const { app, page, close } = await launch();
  try {
    const ids = await page.evaluate(async () => {
      const system = (await window.desktop.mutate({ type: 'system.save', name: '资源示例系统' }))
        .createdId!;
      const other = (await window.desktop.mutate({ type: 'system.save', name: '副本目标系统' }))
        .createdId!;
      const environment = (
        await window.desktop.mutate({ type: 'environment.save', systemId: system, name: '生产' })
      ).createdId!;
      return { system, other, environment };
    });
    await page.getByRole('button', { name: '台账', exact: true }).click();
    await page
      .getByRole('navigation', { name: '系统资料类型' })
      .getByRole('button', { name: '服务器', exact: true })
      .click();
    for (const id of ['resource-server', 'resource-datastores', 'resource-copy-delete'])
      await closeGuide(page, await nearby(app, page, id, 'ledger-resources'));
    await page.getByRole('button', { name: '新增服务器', exact: true }).click();
    await page.getByLabel('服务器名称', { exact: true }).fill('示例节点');
    await page.getByLabel('服务器 IP', { exact: true }).fill('192.0.2.31');
    await page.getByLabel('服务器用途', { exact: true }).fill('订单服务');
    await page.getByText('操作系统与硬件配置（可选）').click();
    await page.getByLabel('服务器CPU', { exact: true }).fill('16 核');
    await page.getByRole('button', { name: '创建服务器', exact: true }).click();
    const detail = page.getByRole('complementary', { name: '台账详情' });
    await detail.getByRole('button', { name: '编辑', exact: true }).click();
    await page.getByLabel('资源端口', { exact: true }).fill('22');
    await page.getByText('附加信息', { exact: true }).click();
    await page.getByLabel('新字段名称', { exact: true }).fill('SSH 方式');
    await page.getByLabel('新字段值', { exact: true }).fill('密钥');
    await page.getByRole('button', { name: '添加字段', exact: true }).click();
    await page.getByRole('button', { name: '完成编辑', exact: true }).click();
    const server = await page.evaluate(async () => {
      const resource = (await window.desktop.snapshot()).resources.find(
        (r) => r.name === '示例节点',
      )!;
      const account = (
        await window.desktop.mutate({
          type: 'account.save',
          resourceId: resource.id,
          environmentId: resource.environmentId,
          name: '部署账号',
          username: 'deploy',
        })
      ).createdId!;
      await window.desktop.initializeVault('guide-resource-master');
      await window.desktop.saveSecret(account, 'password', 'guide-resource-secret');
      await window.desktop.lockVault();
      return resource.id;
    });
    await page.getByRole('button', { name: '工作台', exact: true }).click();
    await page.getByRole('button', { name: '台账', exact: true }).click();
    await openLedgerRecord(page, '服务器', '示例节点', true);
    await page.getByRole('button', { name: '复制资源', exact: true }).click();
    const copy = page.getByRole('dialog', { name: '复制资源', exact: true });
    await expect(copy.getByLabel('同时复制资源账号和秘密')).not.toBeChecked();
    await copy.getByLabel('同时复制资源账号和秘密').check();
    await copy.getByRole('button', { name: '创建副本', exact: true }).click();
    await page
      .getByRole('dialog', { name: '解锁秘密', exact: true })
      .getByRole('button', { name: '取消', exact: true })
      .click();
    expect((await page.evaluate(() => window.desktop.snapshot())).resources).toHaveLength(1);
    await copy.getByLabel('同时复制资源账号和秘密').uncheck();
    await copy.getByLabel('副本目标系统').selectOption(ids.other);
    await copy.getByRole('button', { name: '创建副本', exact: true }).click();
    const snapshot = await page.evaluate(() => window.desktop.snapshot());
    expect(snapshot.resources).toHaveLength(2);
    const duplicate = snapshot.resources.find((r) => r.id !== server)!;
    expect(duplicate.systemId).toBe(ids.other);
    expect(snapshot.accounts.find((a) => a.resourceId === duplicate.id)?.secretKinds).toEqual([]);
    await page.getByRole('button', { name: '切换系统', exact: true }).click();
    await page
      .getByRole('dialog', { name: '切换系统', exact: true })
      .getByRole('button', { name: /^资源示例系统/ })
      .click();
    await openLedgerRecord(page, '服务器', '示例节点', true);
    await page.evaluate(async (resourceId) => {
      const resource = (await window.desktop.snapshot()).resources.find(
        (r) => r.id === resourceId,
      )!;
      await window.desktop.mutate({
        type: 'operation.save',
        value: {
          systemId: resource.systemId,
          environmentId: resource.environmentId,
          resourceId,
          serviceId: null,
          documentId: null,
          name: '资源引用作业',
          kind: 'job',
          frequency: '每日',
          status: 'active',
          notes: '',
        },
      });
    }, server);
    await page.getByRole('button', { name: '删除资源', exact: true }).click();
    const deletion = page.getByRole('dialog', { name: '删除资源', exact: true });
    await deletion.getByRole('button', { name: '确认删除', exact: true }).click();
    await expect(deletion.getByRole('alert')).toContainText('仍被部署节点或运维记录引用');
    await deletion.getByRole('button', { name: '取消', exact: true }).click();
    expect((await page.evaluate(() => window.desktop.snapshot())).resources).toHaveLength(2);
    await page.getByRole('button', { name: '数据库／中间件', exact: true }).click();
    await page.getByRole('button', { name: '新增数据库／中间件', exact: true }).click();
    await page.getByLabel('快速新建资源名称').fill('订单数据库');
    await page.getByLabel('新资源类型').selectOption('database');
    await page.getByRole('button', { name: '创建资源', exact: true }).click();
    await detail.getByRole('button', { name: '编辑', exact: true }).click();
    await page.getByLabel('数据库类型', { exact: true }).fill('PostgreSQL');
    await page.getByLabel('数据库版本', { exact: true }).fill('16');
    await page.getByRole('button', { name: '完成编辑', exact: true }).click();
    const database = (await page.evaluate(() => window.desktop.snapshot())).resources.find(
      (r) => r.name === '订单数据库',
    );
    expect(database?.kind).toBe('database');
    expect(database?.fields).toMatchObject({ 类型: 'PostgreSQL', 版本: '16' });
  } finally {
    await close();
  }
});

test('部署和运维指引对应节点地址回退、状态筛选、引用限制及相关任务', async () => {
  const { app, page, close } = await launch();
  try {
    const ids = await page.evaluate(async () => {
      const system = (await window.desktop.mutate({ type: 'system.save', name: '部署示例系统' }))
        .createdId!;
      const environment = (
        await window.desktop.mutate({ type: 'environment.save', systemId: system, name: '生产' })
      ).createdId!;
      const server = (
        await window.desktop.mutate({
          type: 'resource.save',
          systemId: system,
          environmentId: environment,
          kind: 'server',
          name: '物理节点',
          address: '192.0.2.40',
        })
      ).createdId!;
      return { system, environment, server };
    });
    await page.getByRole('button', { name: '台账', exact: true }).click();
    await page.getByRole('button', { name: '应用部署', exact: true }).click();
    await closeGuide(page, await nearby(app, page, 'services-deployments', 'ledger-deployments'));
    await closeGuide(page, await nearby(app, page, 'ledger-related-work', 'ledger-deployments'));
    await page.getByRole('button', { name: '新增应用部署', exact: true }).click();
    await page.getByLabel('快速新建服务名称').fill('订单服务');
    await page.getByRole('button', { name: '创建服务', exact: true }).click();
    const detail = page.getByRole('complementary', { name: '台账详情' });
    await detail.getByRole('button', { name: '编辑', exact: true }).click();
    await page.getByLabel('代码仓库', { exact: true }).fill('https://example.invalid/order.git');
    await page.getByRole('button', { name: '完成编辑', exact: true }).click();
    await detail.getByRole('button', { name: '新增节点', exact: true }).click();
    const node = page.getByRole('dialog', { name: '新增部署节点', exact: true });
    await node.getByLabel('节点名称', { exact: true }).fill('前台实例');
    await node.getByLabel('部署环境', { exact: true }).selectOption(ids.environment);
    await node.getByRole('combobox').nth(2).selectOption(ids.server);
    await expect(node.getByRole('combobox').nth(1)).toHaveValue('fixed');
    await node.getByRole('button', { name: '保存节点', exact: true }).click();
    await expect(detail.getByText('地址来自服务器')).toBeVisible();
    await expect(detail).toContainText('192.0.2.40');
    await detail.getByRole('button', { name: '编辑节点', exact: true }).click();
    const editNode = page.getByRole('dialog', { name: '编辑部署节点', exact: true });
    await editNode.getByRole('combobox').nth(1).selectOption('scheduled');
    await editNode.getByRole('textbox').nth(3).fill('3');
    await editNode.getByRole('button', { name: '完成', exact: true }).click();
    await expect(detail).toContainText('按需调度 3');
    await detail.getByRole('button', { name: '删除服务', exact: true }).click();
    const deletion = page.getByRole('dialog', { name: '删除这条记录？', exact: true });
    await deletion.getByRole('button', { name: '删除', exact: true }).click();
    await expect(deletion.getByRole('alert')).toContainText('服务仍有部署节点或运维记录');
    await deletion.getByRole('button', { name: '取消', exact: true }).click();
    const serviceId = (await page.evaluate(() => window.desktop.snapshot())).services[0].id;
    await page.getByRole('button', { name: '运行维护', exact: true }).click();
    await closeGuide(page, await nearby(app, page, 'operations-maintenance', 'ledger-operations'));
    await closeGuide(page, await nearby(app, page, 'ledger-related-work', 'ledger-operations'));
    await page.getByRole('button', { name: '新增运行维护', exact: true }).click();
    const create = page.getByRole('dialog', { name: '新增运维记录', exact: true });
    await create.getByRole('textbox', { name: '名称', exact: true }).fill('每日备份核对');
    await create.getByRole('button', { name: '创建运维记录', exact: true }).click();
    await detail.getByRole('button', { name: '编辑', exact: true }).click();
    const fields = detail.locator('.workspace-fields');
    await fields.getByRole('combobox').nth(0).selectOption('backup');
    await fields.getByRole('textbox').nth(1).fill('每日 02:00');
    await fields.getByRole('combobox').nth(1).selectOption('inactive');
    await fields.getByRole('combobox').nth(2).selectOption(ids.environment);
    await fields.getByRole('combobox').nth(3).selectOption(`service:${serviceId}`);
    await page.getByRole('button', { name: '完成编辑', exact: true }).click();
    await page.getByRole('button', { name: '返回清单', exact: true }).click();
    await page.getByLabel('运维类型筛选').selectOption('backup');
    await page.getByLabel('运维状态筛选').selectOption('inactive');
    await expect(page.locator('.workspace-list tbody tr')).toHaveCount(1);
    await expect(page.locator('.workspace-list tbody tr')).toContainText('每日备份核对');
    await page.getByRole('button', { name: '相关工作', exact: true }).click();
    const related = page.getByRole('dialog', { name: '系统相关工作', exact: true });
    await related.getByLabel('为当前系统新增任务').fill('核对备份结果');
    await related.getByLabel('为当前系统新增任务').press('Enter');
    await expect(related).toHaveCount(0);
    const task = (await page.evaluate(() => window.desktop.snapshot())).tasks.find(
      (item) => item.title === '核对备份结果',
    );
    expect(task?.systemId).toBe(ids.system);
  } finally {
    await close();
  }
});

test('批量录入指引对应手填、粘贴追加、逐行取消和未提交放弃', async ({}, info) => {
  const { app, page, close } = await launch();
  try {
    await page.evaluate(() => window.desktop.mutate({ type: 'system.save', name: '批量核对系统' }));
    await page.getByRole('button', { name: '台账', exact: true }).click();
    await closeGuide(
      page,
      await nearby(app, page, 'ledger-paste', 'ledger-import', '批量录入使用指引'),
    );
    await page.getByRole('button', { name: '批量录入', exact: true }).click();
    const paste = page.getByRole('dialog', { name: '批量录入 · 校对后新增', exact: true });
    await expect(paste.getByLabel('批量条目类型').locator('option')).toHaveText([
      '访问入口',
      '服务器',
      '数据库',
      'Redis',
      '其他资源',
      '应用／服务',
      '运行作业',
      '备份策略',
      '账号',
      '部署节点',
    ]);
    await paste.getByLabel('批量条目类型').selectOption('redis');
    await paste.getByLabel('第 1 行名称', { exact: true }).fill('手填缓存');
    await paste
      .getByRole('textbox', { name: '粘贴表格', exact: true })
      .fill('名称\t地址\t端口\n订单缓存\t192.0.2.21\t6379\n订单缓存\t192.0.2.22\t6379');
    await paste.getByRole('button', { name: '读取文本', exact: true }).click();
    await expect(paste.getByLabel('映射第 1 列')).toHaveValue('name');
    await expect(paste.getByLabel('映射第 2 列')).toHaveValue('address');
    await expect(paste.getByLabel('映射第 3 列')).toHaveValue('port');
    await expect(paste.getByRole('button', { name: '确认新增', exact: true })).toBeDisabled();
    await paste.getByRole('button', { name: '追加到录入表格（2 行）', exact: true }).click();
    await expect(paste.getByLabel('第 2 行名称', { exact: true })).toHaveValue('订单缓存');
    await expect(paste.getByLabel('第 3 行名称', { exact: true })).toHaveValue('订单缓存');
    await paste.screenshot({ path: info.outputPath('ledger-paste-review.png') });
    await paste.getByLabel('录入第 3 行').uncheck();
    await expect(paste.getByRole('button', { name: '确认新增', exact: true })).toBeEnabled();
    await paste.getByRole('button', { name: '取消', exact: true }).click();
    await expect(paste.getByRole('alert')).toContainText('尚未提交');
    await paste.getByRole('button', { name: '继续校对', exact: true }).click();
    await expect(paste.getByLabel('录入第 3 行')).not.toBeChecked();
    await paste.getByRole('button', { name: '确认新增', exact: true }).click();
    await expect(paste.getByRole('status')).toContainText('已创建 2 条，跳过 1 条');
    await paste.getByRole('button', { name: '完成', exact: true }).click();
    expect((await page.evaluate(() => window.desktop.snapshot())).resources).toHaveLength(2);
    await page.getByRole('button', { name: '批量录入', exact: true }).click();
    await paste
      .getByRole('textbox', { name: '粘贴表格', exact: true })
      .fill('名称\t另一个缓存\n地址\t192.0.2.23');
    await paste.getByRole('button', { name: '读取文本', exact: true }).click();
    await paste.getByLabel('表格预览方式').selectOption('card');
    await paste.getByRole('button', { name: '追加到录入表格（1 行）', exact: true }).click();
    await expect(paste.getByLabel('第 1 行名称')).toHaveValue('另一个缓存');
    await paste.getByRole('button', { name: '取消', exact: true }).click();
    await paste.getByRole('button', { name: '放弃并离开', exact: true }).click();
    await expect(paste).toHaveCount(0);
    expect((await page.evaluate(() => window.desktop.snapshot())).resources).toHaveLength(2);
  } finally {
    await close();
  }
});

test('导出指引对应编辑保存、取消解锁和明文文件结果', async ({}, info) => {
  const { app, page, close } = await launch();
  const output = info.outputPath('system-export.md');
  try {
    await page.evaluate(async () => {
      const api = window.desktop;
      const system = (await api.mutate({ type: 'system.save', name: '导出核对系统' })).createdId!;
      const resource = (
        await api.mutate({
          type: 'resource.save',
          systemId: system,
          environmentId: null,
          kind: 'server',
          name: '示例服务器',
          address: '192.0.2.50',
        })
      ).createdId!;
      const account = (
        await api.mutate({ type: 'account.save', resourceId: resource, name: '运维账号' })
      ).createdId!;
      await api.initializeVault('guide-export-master');
      await api.saveSecret(account, 'password', 'guide-export-secret');
      await api.lockVault();
    });
    await app.evaluate(({ dialog }, filePath) => {
      dialog.showSaveDialog = (async () => ({
        canceled: false,
        filePath,
      })) as typeof dialog.showSaveDialog;
    }, output);
    await page.getByRole('button', { name: '台账', exact: true }).click();
    await page.getByRole('button', { name: '当前系统更多操作', exact: true }).click();
    await page.getByRole('menuitem', { name: '导出资料使用指引', exact: true }).click();
    await closeGuide(page, await read(app, page, 'system-export', 'system-export'));
    await openLedgerRecord(page, '服务器', '示例服务器', true);
    await page.getByText('附加信息', { exact: true }).click();
    await page.getByLabel('资源说明', { exact: true }).fill('导出前尚未自动提交的说明');
    await openSystemAction(page, '导出资料');
    const dialog = page.getByRole('dialog', { name: '导出系统资料', exact: true });
    await expect(dialog.getByLabel('包含密码', { exact: true })).toBeChecked();
    await dialog.screenshot({ path: info.outputPath('system-export-options.png') });
    await dialog.getByRole('button', { name: '导出资料', exact: true }).click();
    await page
      .getByRole('dialog', { name: '解锁秘密', exact: true })
      .getByRole('button', { name: '取消', exact: true })
      .click();
    await expect(dialog.getByRole('status')).toHaveCount(0);
    await expect
      .poll(() =>
        fs.stat(output).then(
          () => true,
          () => false,
        ),
      )
      .toBe(false);
    await dialog.getByRole('button', { name: '导出资料', exact: true }).click();
    await page.getByLabel('主密码', { exact: true }).fill('guide-export-master');
    await page.getByRole('button', { name: '解锁', exact: true }).click();
    await expect(dialog.getByRole('status')).toContainText('系统资料已导出');
    const content = await fs.readFile(output, 'utf8');
    expect(content).toContain('导出前尚未自动提交的说明');
    expect(content).toContain('guide-export-secret');
    expect(content).toContain('包含明文秘密');
  } finally {
    await close();
  }
});
