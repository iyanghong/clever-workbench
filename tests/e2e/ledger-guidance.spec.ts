import { test, expect, type Page, type ElectronApplication } from '@playwright/test';
import { electron } from './launch';
import {
  expectedFeatureGuide,
  expectGuidanceDestination,
  verifyUnavailableOrNoTarget,
} from './guidance-content';
import { openLedgerRecord, openSystemAction } from './ledger-actions';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

async function launch() {
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), 'workbench-ledger-guide-'));
  const env: Record<string, string> = { ...process.env, CLEVER_WORKBENCH_DATA_DIR: directory };
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
const authoredTitles: Record<string, string> = {
  'ledger-browsing': '查找台账与切换详情',
  'ledger-scope': '设置适用环境与标签',
  'ledger-copy': '复制台账资料摘要',
  'systems-environments': '维护系统与部署环境',
  'projects-history': '维护项目档案与系统沿革',
  'access-entries': '维护访问入口与多个地址',
  'access-copy-delete': '复制或删除访问入口',
  'accounts-secrets': '录入账号与使用秘密',
  'accounts-ownership': '复制账号与调整归属',
};
async function read(app: ElectronApplication, page: Page, id: string, placement: string) {
  const feature = await expectedFeatureGuide(app, id);
  const library = page.getByRole('dialog', { name: '使用指引', exact: true });
  await expect(library).toBeVisible();
  if (!feature || !feature.placements.includes(placement)) {
    await expect(
      library.getByRole('button', { name: feature?.title ?? authoredTitles[id], exact: true }),
    ).toHaveCount(0);
    if (!(await library.locator('.guidance-list button').count()))
      await expect(library.getByRole('status')).toContainText('当前暂无可用指引');
    test.info().annotations.push({
      type: 'guidance-content-warning',
      description: `${id} 不可用：已验证列表降级，正文未核对。`,
    });
    await page.keyboard.press('Escape');
    return;
  }
  await library.getByRole('button', { name: feature.title, exact: true }).click();
  const dialog = page.getByRole('dialog', { name: feature.title, exact: true });
  for (const [index, step] of feature.steps.entries()) {
    if (index) await dialog.getByRole('button', { name: '下一步', exact: true }).click();
    await expect(dialog.getByRole('heading', { name: step.title, exact: true })).toBeVisible();
    await expect(dialog).toContainText(step.action);
    await expect(dialog).toContainText(step.expectedResult);
  }
  return { feature, dialog };
}
async function nearby(
  app: ElectronApplication,
  page: Page,
  id: string,
  placement: string,
  name = '台账使用指引',
) {
  await page.getByRole('button', { name, exact: true }).click({ timeout: 4000 });
  return read(app, page, id, placement);
}
async function closeGuide(page: Page, opened: Awaited<ReturnType<typeof read>>) {
  if (opened) {
    await page.keyboard.press('Escape');
    await expect(opened.dialog).toHaveCount(0);
  }
}

test('空台账可读指引，七类清单共享就近入口，阅读与取消保留当前对象', async () => {
  const { app, page, close } = await launch();
  try {
    await page.context().setOffline(true);
    await page.getByRole('button', { name: '台账', exact: true }).click();
    const opened = await nearby(app, page, 'ledger-browsing', 'ledger');
    if (opened && !(await verifyUnavailableOrNoTarget(page, opened.feature))) {
      await opened.dialog.getByRole('button', { name: '前往功能', exact: true }).click();
      await expectGuidanceDestination(page, opened.feature);
    }
    await expect(page.getByRole('heading', { name: '从一个系统开始', exact: true })).toBeVisible();
    expect((await page.evaluate(() => window.desktop.snapshot())).systems).toHaveLength(0);
    await page.evaluate(() => window.desktop.mutate({ type: 'system.save', name: '指引示例系统' }));
    await page.getByRole('button', { name: '工作台', exact: true }).click();
    await page.getByRole('button', { name: '台账', exact: true }).click();
    for (const [category, placement] of [
      ['访问入口', 'ledger-access'],
      ['账号', 'ledger-accounts'],
      ['服务器', 'ledger-resources'],
      ['数据库／中间件', 'ledger-resources'],
      ['应用部署', 'ledger-deployments'],
      ['运行维护', 'ledger-operations'],
      ['文档', 'documents'],
    ]) {
      await page
        .getByRole('navigation', { name: '系统资料类型' })
        .getByRole('button', { name: category, exact: true })
        .click();
      const guide = await nearby(app, page, 'ledger-browsing', placement);
      await closeGuide(page, guide);
      await expect(
        page
          .getByRole('navigation', { name: '系统资料类型' })
          .getByRole('button', { name: category, exact: true }),
      ).toHaveAttribute('aria-pressed', 'true');
      await expect(page.getByRole('button', { name: '台账使用指引', exact: true })).toBeFocused();
    }
  } finally {
    await close();
  }
});

test('系统菜单指引返回焦点，系统环境编辑与项目沿革按说明保留归属', async () => {
  const { app, page, close } = await launch();
  try {
    await page.evaluate(() => window.desktop.mutate({ type: 'system.save', name: '示例订单系统' }));
    await page.getByRole('button', { name: '台账', exact: true }).click();
    const more = page.getByRole('button', { name: '当前系统更多操作', exact: true });
    await more.click();
    await page
      .getByRole('menuitem', { name: '系统与环境使用指引', exact: true })
      .click({ timeout: 4000 });
    const guide = await read(app, page, 'systems-environments', 'systems');
    await closeGuide(page, guide);
    await expect(more).toBeFocused();
    await openSystemAction(page, '系统信息');
    const info = page.getByRole('dialog', { name: '系统信息', exact: true });
    await page.getByLabel('系统名称', { exact: true }).fill('示例订单系统 · 已保存');
    await page.getByLabel('系统登录地址').fill('https://order.example.invalid');
    await info.getByRole('button', { name: '环境管理', exact: true }).click();
    await page.getByLabel('新环境名称').fill('预发布');
    await info.getByRole('button', { name: '新增环境', exact: true }).click();
    await page.getByLabel('环境名称 预发布', { exact: true }).fill('测试');
    await info.getByRole('button', { name: '项目档案', exact: true }).click();
    await page.getByLabel('项目名称', { exact: true }).fill('一期实施');
    await info.getByRole('button', { name: '新增项目', exact: true }).click();
    await info.getByRole('button', { name: '基本信息', exact: true }).click();
    await page.getByLabel('当前项目', { exact: true }).selectOption({ label: '一期实施' });
    await info.getByRole('button', { name: '完成', exact: true }).click();
    await expect(info).toHaveCount(0);
    await expect(page.getByRole('button', { name: '切换系统', exact: true })).toContainText(
      '已保存',
    );
    await openSystemAction(page, '系统信息');
    await expect(info).toContainText('一期实施 · 当前');
    await info.getByRole('button', { name: '环境管理', exact: true }).click();
    await expect(page.getByLabel('环境名称 测试', { exact: true })).toHaveValue('测试');
    await info.getByRole('button', { name: '删除', exact: true }).click();
    await expect(page.getByLabel('环境名称 测试', { exact: true })).toHaveCount(0);
    await page.keyboard.press('Escape');
  } finally {
    await close();
  }
});

test('项目档案附近指引保留未提交名称，归档恢复不会自动恢复当前项目', async () => {
  const { app, page, close } = await launch();
  try {
    await page.getByRole('button', { name: '项目档案', exact: true }).click();
    await page.getByLabel('项目名称', { exact: true }).fill('尚未提交的阶段');
    const guide = await nearby(app, page, 'projects-history', 'projects', '项目档案使用指引');
    await closeGuide(page, guide);
    await expect(page.getByLabel('项目名称', { exact: true })).toHaveValue('尚未提交的阶段');
    expect((await page.evaluate(() => window.desktop.snapshot())).projects).toHaveLength(0);
    await page.getByRole('button', { name: '新增项目', exact: true }).click();
    const ids = await page.evaluate(async () => {
      const project = (await window.desktop.snapshot()).projects[0];
      const { createdId } = await window.desktop.mutate({
        type: 'system.save',
        name: '项目示例系统',
        projectId: project.id,
      });
      return { system: createdId!, project: project.id };
    });
    await page.getByRole('button', { name: '归档', exact: true }).click();
    await expect(page.getByText('尚未提交的阶段 · 已归档', { exact: true })).toBeVisible();
    await page.getByRole('button', { name: '恢复', exact: true }).click();
    const snapshot = await page.evaluate(() => window.desktop.snapshot());
    expect(snapshot.systems.find((s) => s.id === ids.system)?.currentProjectId).toBeNull();
    expect(snapshot.systemProjects.some((link) => link.projectId === ids.project)).toBe(true);
    await page.getByRole('button', { name: '删除空项目', exact: true }).click();
    await expect(page.getByRole('alert')).toContainText(/项目|系统|关联/);
    await page.getByRole('button', { name: '编辑', exact: true }).click();
    await page.getByLabel('项目名称', { exact: true }).fill('阶段更名');
    await page.getByRole('button', { name: '保存', exact: true }).click();
    await expect(page.getByText('阶段更名', { exact: true })).toBeVisible();
    await page.getByLabel('项目名称', { exact: true }).fill('空项目');
    await page.getByRole('button', { name: '新增项目', exact: true }).click();
    await page
      .locator('.workspace-management-row')
      .filter({ has: page.locator('span').filter({ hasText: /^空项目$/ }) })
      .getByRole('button', { name: '删除空项目', exact: true })
      .click();
    await expect(
      page
        .locator('.workspace-management-row')
        .filter({ has: page.locator('span').filter({ hasText: /^空项目$/ }) }),
    ).toHaveCount(0);
  } finally {
    await close();
  }
});

async function fixture(page: Page) {
  return page.evaluate(async () => {
    const api = window.desktop;
    const system = (await api.mutate({ type: 'system.save', name: '指引源系统' })).createdId!;
    const other = (await api.mutate({ type: 'system.save', name: '指引目标系统' })).createdId!;
    const prod = (await api.mutate({ type: 'environment.save', systemId: system, name: '生产' }))
      .createdId!;
    const stage = (await api.mutate({ type: 'environment.save', systemId: system, name: '测试' }))
      .createdId!;
    return { system, other, prod, stage };
  });
}

test('访问入口指引支持地址编辑、范围筛选和资料复制，保存失败时导航保持输入', async ({}, info) => {
  const { app, page, close } = await launch();
  try {
    const ids = await fixture(page);
    await page.getByRole('button', { name: '台账', exact: true }).click();
    await closeGuide(page, await nearby(app, page, 'access-entries', 'ledger-access'));
    await page.getByRole('button', { name: '新增访问入口', exact: true }).click();
    await page.getByLabel('入口名称', { exact: true }).fill('示例发布入口');
    await page.getByLabel('登录地址', { exact: true }).fill('https://ci.example.invalid');
    await page.getByRole('button', { name: '创建访问入口', exact: true }).click();
    const detail = page.getByRole('complementary', { name: '台账详情' });
    await detail.getByRole('button', { name: '编辑', exact: true }).click();
    await page.getByRole('button', { name: '添加地址', exact: true }).click();
    await page.getByLabel('地址名称 2').fill('外网');
    await page.getByLabel('登录地址 2').fill('https://public.example.invalid');
    await page.getByRole('button', { name: '设为常用地址 外网', exact: true }).click();
    await page.getByRole('button', { name: '上移地址 外网', exact: true }).click();
    await expect(page.getByLabel('地址名称 1')).toHaveValue('外网');
    await closeGuide(page, await nearby(app, page, 'ledger-scope', 'ledger-access'));
    await page
      .locator('.scope-editor')
      .getByRole('checkbox', { name: '生产', exact: true })
      .check();
    await page
      .locator('.scope-editor')
      .getByRole('checkbox', { name: '测试', exact: true })
      .check();
    await page.getByLabel('地点与网络标签').fill('内网，广州');
    await page.getByRole('button', { name: '完成编辑', exact: true }).click();
    await page.getByRole('button', { name: '返回清单', exact: true }).click();
    await page.getByLabel('台账环境筛选').selectOption(ids.prod);
    await page.getByLabel('台账标签筛选').selectOption('广州');
    await expect(page.locator('.workspace-list tbody tr')).toHaveCount(1);
    await page.getByLabel('台账环境筛选').selectOption(ids.stage);
    await expect(page.locator('.workspace-list tbody tr')).toHaveCount(1);
    await closeGuide(page, await nearby(app, page, 'ledger-copy', 'ledger-access'));
    await page.getByRole('button', { name: '复制资料 示例发布入口', exact: true }).click();
    await expect
      .poll(() => app.evaluate(({ clipboard }) => clipboard.readText()))
      .toContain('示例发布入口');
    await page.getByLabel('选择当前资料结果', { exact: true }).check();
    await page.getByRole('button', { name: '复制所选资料', exact: true }).click();
    await expect
      .poll(() => app.evaluate(({ clipboard }) => clipboard.readText()))
      .toContain('https://public.example.invalid');
    await page.getByRole('button', { name: '取消选择', exact: true }).click();
    await page.getByRole('button', { name: '包含账号 示例发布入口', exact: true }).click();
    await expect(page.getByRole('dialog', { name: '复制资料 · 包含账号' })).toContainText(
      '本次范围没有可附带的账号',
    );
    await page.getByRole('button', { name: '取消', exact: true }).click();
    await openLedgerRecord(page, '访问入口', '示例发布入口', true);
    await page.getByLabel('入口名称', { exact: true }).fill('');
    const guide = await nearby(app, page, 'access-entries', 'ledger-access');
    if (guide && !(await verifyUnavailableOrNoTarget(page, guide.feature))) {
      await guide.dialog.getByRole('button', { name: '前往功能', exact: true }).click();
      await expect(guide.dialog.getByRole('alert')).toBeVisible();
      await closeGuide(page, guide);
    }
    await expect(page.getByLabel('入口名称', { exact: true })).toHaveValue('');
    await page.getByLabel('入口名称', { exact: true }).fill('示例发布入口');
    await page.getByRole('button', { name: '删除地址 主地址', exact: true }).click();
    await page.getByRole('button', { name: '完成编辑', exact: true }).click();
    await expect(detail.locator('.workspace-address-row')).toHaveCount(1);
    await page.emulateMedia({ colorScheme: 'dark' });
    await page.setViewportSize({ width: 880, height: 650 });
    const dark = await nearby(app, page, 'access-entries', 'ledger-access');
    if (dark) {
      await expect(
        dark.dialog.getByRole('button', { name: '前往功能', exact: true }),
      ).toBeInViewport();
      await page.screenshot({ path: info.outputPath('ledger-guide-dark-narrow.png') });
    }
  } finally {
    await close();
  }
});

test('入口副本指引区分秘密选项，取消复制与删除保留原入口', async () => {
  const { app, page, close } = await launch();
  try {
    const ids = await fixture(page);
    const entry = await page.evaluate(async ({ system, prod }) => {
      const api = window.desktop;
      const access = (
        await api.mutate({
          type: 'access.save',
          systemId: system,
          environmentId: prod,
          name: '示例入口',
          addresses: [{ label: '主地址', url: 'https://ci.example.invalid' }],
        })
      ).createdId!;
      const account = (
        await api.mutate({
          type: 'account.save',
          accessId: access,
          environmentId: prod,
          name: '示例运维',
          username: 'operator',
        })
      ).createdId!;
      await api.initializeVault('guide-fixture-master');
      await api.saveSecret(account, 'password', 'guide-fixture-secret');
      await api.lockVault();
      return access;
    }, ids);
    await page.getByRole('button', { name: '台账', exact: true }).click();
    await closeGuide(page, await nearby(app, page, 'access-copy-delete', 'ledger-access'));
    await openLedgerRecord(page, '访问入口', '示例入口', true);
    await page.getByRole('button', { name: '复制访问入口', exact: true }).click();
    const copy = page.getByRole('dialog', { name: '复制访问入口', exact: true });
    await expect(copy.getByLabel('同时复制入口秘密')).not.toBeChecked();
    await copy.getByLabel('同时复制入口秘密').check();
    await copy.getByRole('button', { name: '创建副本', exact: true }).click();
    await page
      .getByRole('dialog', { name: '解锁秘密' })
      .getByRole('button', { name: '取消', exact: true })
      .click();
    expect((await page.evaluate(() => window.desktop.snapshot())).accessEntries).toHaveLength(1);
    await copy.getByRole('button', { name: '取消', exact: true }).click();
    await page.getByRole('button', { name: '复制访问入口', exact: true }).click();
    await copy.getByLabel('入口副本系统').selectOption(ids.other);
    await copy.getByRole('button', { name: '创建副本', exact: true }).click();
    const copied = await page.evaluate(() => window.desktop.snapshot());
    expect(copied.accessEntries).toHaveLength(2);
    const duplicate = copied.accessEntries.find((a) => a.id !== entry)!;
    expect(duplicate.systemId).toBe(ids.other);
    expect(copied.accounts.find((a) => a.accessId === duplicate.id)?.secretKinds).toEqual([]);
    await page
      .getByRole('complementary', { name: '台账详情' })
      .getByRole('button', { name: '编辑', exact: true })
      .click();
    await page.getByRole('button', { name: '删除访问入口', exact: true }).click();
    const deletion = page.getByRole('dialog', { name: '删除访问入口', exact: true });
    await deletion.getByRole('button', { name: '取消', exact: true }).click();
    expect((await page.evaluate(() => window.desktop.snapshot())).accessEntries).toHaveLength(2);
    await page.getByRole('button', { name: '删除访问入口', exact: true }).click();
    await deletion.getByRole('button', { name: '确认删除', exact: true }).click();
    expect(
      (await page.evaluate(() => window.desktop.snapshot())).accessEntries.map((a) => a.id),
    ).toEqual([entry]);
  } finally {
    await close();
  }
});

test('账号指引不触发解锁或新建，按步骤保存秘密、收藏和调整同系统归属', async () => {
  const { app, page, close } = await launch();
  try {
    const ids = await fixture(page);
    await page.evaluate(() => window.desktop.initializeVault('guide-fixture-master'));
    await page.getByRole('button', { name: '台账', exact: true }).click();
    await page.getByRole('button', { name: '账号', exact: true }).click();
    await closeGuide(page, await nearby(app, page, 'accounts-secrets', 'ledger-accounts'));
    await expect(page.getByRole('dialog')).toHaveCount(0);
    expect((await page.evaluate(() => window.desktop.snapshot())).accounts).toHaveLength(0);
    await page.getByRole('button', { name: '新增账号', exact: true }).click();
    await page.getByLabel('快速新建账号名称').fill('示例运维');
    await expect(page.getByRole('button', { name: '创建账号', exact: true })).toBeDisabled();
    await page.getByLabel('新记录所属环境').selectOption(ids.prod);
    await page.getByRole('button', { name: '创建账号', exact: true }).click();
    const detail = page.getByRole('complementary', { name: '台账详情' });
    await detail.getByRole('button', { name: '编辑', exact: true }).click();
    await page.getByLabel('账号用户名', { exact: true }).fill('guide-operator');
    await page.getByRole('button', { name: '添加密码', exact: true }).click();
    await page.getByLabel('秘密内容', { exact: true }).fill('guide-fixture-password');
    await page.getByRole('button', { name: '保存秘密', exact: true }).click();
    await page.getByRole('button', { name: '查看密码', exact: true }).click();
    await expect(page.getByLabel('已显示的密码', { exact: true })).toHaveValue(
      'guide-fixture-password',
    );
    await page.getByRole('button', { name: '隐藏密码', exact: true }).click();
    await expect(page.getByLabel('已显示的密码', { exact: true })).toHaveCount(0);
    await page.getByRole('button', { name: '设为常用账号', exact: true }).click();
    await expect(page.getByRole('button', { name: '移出常用账号', exact: true })).toBeVisible();
    await closeGuide(page, await nearby(app, page, 'accounts-ownership', 'ledger-accounts'));
    await page.getByRole('button', { name: '调整归属', exact: true }).click();
    const move = page.getByRole('dialog', { name: '调整账号归属' });
    await page.getByLabel('账号目标环境').selectOption(ids.stage);
    await move.getByRole('button', { name: '取消', exact: true }).click();
    expect((await page.evaluate(() => window.desktop.snapshot())).accounts[0].environmentId).toBe(
      ids.prod,
    );
    await page.getByRole('button', { name: '调整归属', exact: true }).click();
    await page.getByLabel('账号目标环境').selectOption(ids.stage);
    await move.getByRole('button', { name: '保存归属', exact: true }).click();
    expect((await page.evaluate(() => window.desktop.snapshot())).accounts[0].environmentId).toBe(
      ids.stage,
    );
    await page.evaluate(() => window.desktop.lockVault());
    await page.getByRole('button', { name: '复制账号', exact: true }).click();
    const protectedCopy = page.getByRole('dialog', { name: '复制账号', exact: true });
    await protectedCopy.getByLabel('同时复制账号秘密').check();
    await protectedCopy.getByRole('button', { name: '创建副本', exact: true }).click();
    await page
      .getByRole('dialog', { name: '解锁秘密' })
      .getByRole('button', { name: '取消', exact: true })
      .click();
    expect((await page.evaluate(() => window.desktop.snapshot())).accounts).toHaveLength(1);
    await protectedCopy.getByRole('button', { name: '创建副本', exact: true }).click();
    await page.getByLabel('主密码', { exact: true }).fill('guide-fixture-master');
    await page.getByRole('button', { name: '解锁', exact: true }).click();
    await expect(protectedCopy).toHaveCount(0);
    expect(
      (await page.evaluate(() => window.desktop.snapshot())).accounts.find(
        (a) => a.name === '示例运维 副本',
      )?.secretKinds,
    ).toEqual(['password']);
    await page.getByRole('button', { name: '删除账号', exact: true }).click();
    await page
      .getByRole('dialog', { name: '删除账号', exact: true })
      .getByRole('button', { name: '确认删除', exact: true })
      .click();
    await expect(page.locator('.account-table')).toBeVisible();
    await openLedgerRecord(page, '账号', '示例运维', true);
    await page.getByRole('button', { name: '复制账号', exact: true }).click();
    const copy = page.getByRole('dialog', { name: '复制账号', exact: true });
    await expect(copy.getByLabel('同时复制账号秘密')).not.toBeChecked();
    await copy.getByRole('button', { name: '创建副本', exact: true }).click();
    const records = (await page.evaluate(() => window.desktop.snapshot())).accounts;
    expect(records).toHaveLength(2);
    expect(records.find((a) => a.name === '示例运维 副本')?.secretKinds).toEqual([]);
    await page.getByRole('button', { name: '删除账号', exact: true }).click();
    const deletion = page.getByRole('dialog', { name: '删除账号', exact: true });
    await deletion.getByRole('button', { name: '取消', exact: true }).click();
    expect((await page.evaluate(() => window.desktop.snapshot())).accounts).toHaveLength(2);
    await page.getByRole('button', { name: '删除账号', exact: true }).click();
    await deletion.getByRole('button', { name: '确认删除', exact: true }).click();
    expect((await page.evaluate(() => window.desktop.snapshot())).accounts).toHaveLength(1);
    await expect(page.locator('.account-table')).toBeVisible();
    await page.evaluate(() => window.desktop.lockVault());
    await app.evaluate(({ clipboard }) => clipboard.writeText('before-cancel'));
    await page.getByRole('button', { name: '复制整行 指引源系统 / 示例运维', exact: true }).click();
    await page
      .getByRole('dialog', { name: '解锁秘密' })
      .getByRole('button', { name: '取消', exact: true })
      .click();
    expect(await app.evaluate(({ clipboard }) => clipboard.readText())).toBe('before-cancel');
    await page.getByRole('button', { name: '显示当前列表密码', exact: true }).click();
    await page.getByLabel('主密码', { exact: true }).fill('guide-fixture-master');
    await page.getByRole('button', { name: '解锁', exact: true }).click();
    await expect(page.getByLabel('已显示的密码 示例运维', { exact: true })).toHaveText(
      'guide-fixture-password',
    );
    await page.getByRole('button', { name: '隐藏当前列表密码', exact: true }).click();
    await page.getByRole('button', { name: '复制整行 指引源系统 / 示例运维', exact: true }).click();
    await expect
      .poll(() => app.evaluate(({ clipboard }) => clipboard.readText()))
      .toContain('guide-fixture-password');
    await openLedgerRecord(page, '账号', '示例运维', true);
    await page.getByRole('button', { name: '修改密码', exact: true }).click();
    await page.getByRole('button', { name: '移除秘密', exact: true }).click();
    await expect(page.getByRole('button', { name: '添加密码', exact: true })).toBeVisible();
  } finally {
    await close();
  }
});
