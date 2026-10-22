import { test, expect, type ElectronApplication, type Page } from '@playwright/test';
import { electron } from './launch';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

let app: ElectronApplication, page: Page, directory: string;
let seed: {
  systemId: string;
  environmentId: string;
  serverId: string;
  otherServerId: string;
  serviceId: string;
};
test.beforeEach(async () => {
  directory = await fs.mkdtemp(path.join(os.tmpdir(), 'workbench-bulk-entry-'));
  const env: Record<string, string> = { ...process.env, CLEVER_WORKBENCH_DATA_DIR: directory };
  delete env.ELECTRON_RUN_AS_NODE;
  app = await electron.launch({ args: ['.'], env });
  page = await app.firstWindow();
  await page.getByRole('button', { name: '台账', exact: true }).waitFor();
  seed = await page.evaluate(async () => {
    const api = window.desktop;
    const systemId = (await api.mutate({ type: 'system.save', name: '批量录入验收' })).createdId!;
    const environmentId = (await api.mutate({ type: 'environment.save', systemId, name: '生产' }))
      .createdId!;
    const serverId = (
      await api.mutate({
        type: 'resource.save',
        systemId,
        environmentId,
        kind: 'server',
        name: '已有服务器',
      })
    ).createdId!;
    const otherServerId = (
      await api.mutate({
        type: 'resource.save',
        systemId,
        environmentId,
        kind: 'server',
        name: '另一台服务器',
      })
    ).createdId!;
    await api.mutate({
      type: 'account.save',
      resourceId: otherServerId,
      environmentId,
      name: '运维账号',
      username: 'operator',
    });
    const serviceId = (await api.mutate({ type: 'service.save', systemId, name: '已有服务' }))
      .createdId!;
    await api.initializeVault('fictional-bulk-master');
    return { systemId, environmentId, serverId, otherServerId, serviceId };
  });
  await page.getByRole('button', { name: '台账', exact: true }).click();
});
test.afterEach(async () => {
  // Failed assertions may leave an intentionally unsaved test draft open.
  if (app) {
    await app
      .evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows().forEach((w) => w.destroy()))
      .catch(() => {});
    await app.close();
  }
  await fs.rm(directory, { recursive: true, force: true });
});
const dialog = () => page.getByRole('dialog', { name: '批量录入 · 校对后新增', exact: true });

test('手填与追加粘贴共用编辑表格，校验、秘密、键盘和窄窗口均保留', async ({}, info) => {
  await page.getByRole('button', { name: '服务器', exact: true }).click();
  await page.getByLabel('台账环境筛选').selectOption(seed.environmentId);
  await page.getByRole('button', { name: '批量录入', exact: true }).click();
  const form = dialog();
  await expect(form.getByLabel('批量条目类型')).toHaveValue('server');
  await expect(form.getByLabel('批量环境')).toHaveValue(seed.environmentId);
  await form.getByLabel('第 1 行名称', { exact: true }).fill('手填服务器');
  await page.keyboard.press('Tab');
  await expect(form.getByLabel('第 1 行地址／IP')).toBeFocused();
  await form.getByLabel('第 1 行地址／IP').fill('192.0.2.11');
  await form.getByLabel('第 1 行说明').fill('第一行说明\n第二行说明');
  await form.getByLabel('第 1 行用户名').fill('ops');
  await form.getByLabel('第 1 行密码（加密）').fill('fictional-bulk-secret');
  await expect(form.getByLabel('第 1 行密码（加密）')).toHaveAttribute('type', 'password');
  await form.getByLabel('新增附加字段名称').fill('CPU');
  await form.getByRole('button', { name: '添加字段', exact: true }).click();
  await form.getByLabel('第 1 行CPU').fill('16 核');
  await form
    .getByLabel('粘贴表格', { exact: true })
    .fill('名称\tIP\t端口\t说明\n粘贴服务器\t192.0.2.12\tbad\t原说明');
  await form.getByRole('button', { name: '读取文本', exact: true }).click();
  await form.getByRole('button', { name: '追加到录入表格（1 行）', exact: true }).click();
  await expect(form.getByLabel('第 1 行说明')).toHaveValue('第一行说明\n第二行说明');
  await expect(form.getByRole('button', { name: '确认新增', exact: true })).toBeDisabled();
  await form.getByLabel('第 2 行端口').fill('8080');
  await form.getByLabel('第 2 行说明').fill('粘贴后修改');
  await form.getByLabel('第 2 行名称', { exact: true }).fill('');
  await expect(form.getByText('名称不能为空', { exact: true })).toBeVisible();
  await form.getByLabel('第 2 行名称', { exact: true }).fill('粘贴服务器');
  await form.getByRole('button', { name: '增加一行', exact: true }).click();
  await form.getByLabel('第 3 行名称', { exact: true }).fill('删除这行');
  await form.getByRole('button', { name: '删除第 3 行', exact: true }).click();
  await form.getByRole('button', { name: '增加一行', exact: true }).click();
  await expect(form.getByText('空白行不提交', { exact: true })).toBeVisible();
  await page.screenshot({ path: info.outputPath('bulk-light.png') });
  await page.setViewportSize({ width: 880, height: 620 });
  await page.emulateMedia({ colorScheme: 'dark', reducedMotion: 'reduce', contrast: 'more' });
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark');
  await expect(page.locator('html')).toHaveAttribute('data-high-contrast', 'true');
  await expect(page.locator('html')).toHaveAttribute('data-reduce-transparency', 'true');
  await expect(page.locator('html')).toHaveAttribute('data-reduce-motion', 'true');
  expect(await form.evaluate((el) => el.scrollWidth <= el.clientWidth + 1)).toBe(true);
  const grid = form.getByRole('region', { name: '批量录入表格（可横向滚动）' });
  expect(await grid.evaluate((el) => el.scrollWidth > el.clientWidth)).toBe(true);
  await page.screenshot({ path: info.outputPath('bulk-dark-narrow.png') });
  await page.keyboard.press('Escape');
  await expect(form.getByRole('button', { name: '继续校对', exact: true })).toBeFocused();
  await form.getByRole('button', { name: '继续校对', exact: true }).click();
  await form.getByRole('button', { name: '确认新增', exact: true }).click();
  await expect(form.getByText('已创建 2 条，跳过 0 条。')).toBeVisible();
  const stored = await page.evaluate(async () => {
    const snapshot = await window.desktop.snapshot();
    const resource = snapshot.resources.find((r) => r.name === '手填服务器')!;
    const account = snapshot.accounts.find((a) => a.resourceId === resource.id)!;
    return {
      resource,
      second: snapshot.resources.find((r) => r.name === '粘贴服务器'),
      secret: await window.desktop.readSecret(account.id, 'password'),
    };
  });
  expect(stored.resource.fields.CPU).toBe('16 核');
  expect(stored.resource.environmentId).toBe(seed.environmentId);
  expect(stored.resource.notes).toBe('第一行说明\n第二行说明');
  expect(stored.second?.port).toBe('8080');
  expect(stored.second?.notes).toBe('粘贴后修改');
  expect(stored.secret).toBe('fictional-bulk-secret');
  expect(JSON.stringify(stored.resource)).not.toContain(stored.secret);
  await form.getByRole('button', { name: '完成', exact: true }).click();
  await expect(page.getByRole('button', { name: '批量录入', exact: true })).toBeFocused();
});

test('全部十类可直接录入，账号按所属对象查重，服务与节点保存环境', async () => {
  test.setTimeout(120000);
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  for (const kind of [
    'access',
    'server',
    'database',
    'redis',
    'other',
    'service',
    'job',
    'backup',
    'account',
    'node',
  ]) {
    await page.getByRole('button', { name: '批量录入', exact: true }).click();
    const form = dialog();
    await form.getByLabel('批量条目类型').selectOption(kind);
    if (kind !== 'account') await form.getByLabel('批量环境').selectOption(seed.environmentId);
    if (kind === 'account')
      await form.getByLabel('批量所属对象').selectOption(`resource:${seed.serverId}`);
    if (kind === 'node')
      await form.getByLabel('批量所属对象').selectOption(`service:${seed.serviceId}`);
    await form
      .getByLabel('第 1 行名称', { exact: true })
      .fill(kind === 'account' ? '运维账号' : `手填-${kind}`);
    await form.getByLabel('第 1 行说明').fill(`${kind} 说明`);
    if (kind === 'account') {
      await form.getByLabel('第 1 行用户名').fill('operator');
      await expect(form.getByLabel('疑似重复，仍新增独立记录')).toHaveCount(0);
    }
    if (kind === 'access')
      await form.getByLabel('第 1 行地址／IP').fill('https://example.invalid/bulk');
    if (kind === 'service')
      await form.getByLabel('第 1 行代码仓库').fill('https://example.invalid/repo');
    if (kind === 'job' || kind === 'backup') {
      await form.getByLabel('第 1 行频率').fill('每天');
      await form.getByLabel('第 1 行状态').selectOption('active');
      // Returning to the default must not send an invalid empty status to the main process.
      await form.getByLabel('第 1 行状态').selectOption('');
    }
    if (kind === 'node') {
      await form.getByLabel('第 1 行运行方式').selectOption('scheduled');
      await form.getByLabel('第 1 行节点数量').fill('2～4');
    }
    await form.getByRole('button', { name: '确认新增', exact: true }).click();
    await expect(form.getByText('已创建 1 条，跳过 0 条。')).toBeVisible();
    await form.getByRole('button', { name: '完成', exact: true }).click();
  }
  const snapshot = await page.evaluate(() => window.desktop.snapshot());
  expect(snapshot.resources.filter((r) => r.name.startsWith('手填-'))).toHaveLength(4);
  const service = snapshot.services.find((r) => r.name === '手填-service')!;
  expect(snapshot.scopes.find((s) => s.ownerId === service.id)?.environmentIds).toEqual([
    seed.environmentId,
  ]);
  expect(snapshot.operations).toHaveLength(2);
  expect(
    snapshot.operations.every((r) => r.status === 'unverified' && r.frequency === '每天'),
  ).toBe(true);
  expect(snapshot.deploymentNodes[0]).toMatchObject({
    serviceId: seed.serviceId,
    environmentId: seed.environmentId,
    mode: 'scheduled',
    count: '2～4',
  });
  expect(snapshot.accounts.find((a) => a.resourceId === seed.serverId)?.username).toBe('operator');
  expect(errors).toEqual([]);
});

test('失败整批回滚，原生关闭保护草稿，全局保存等待解锁与提交', async () => {
  await page.getByRole('button', { name: '批量录入', exact: true }).click();
  let form = dialog();
  await form.getByLabel('批量条目类型').selectOption('service');
  await form.getByLabel('第 1 行名称', { exact: true }).fill('回滚服务');
  await form.getByRole('button', { name: '增加一行', exact: true }).click();
  await form.getByLabel('第 2 行名称', { exact: true }).fill('已有服务');
  await form.getByLabel('疑似重复，仍新增独立记录').check();
  await form.getByRole('button', { name: '确认新增', exact: true }).click();
  await expect(form.getByRole('alert')).toContainText('同名服务');
  expect(
    await page.evaluate(async () =>
      (await window.desktop.snapshot()).services.some((s) => s.name === '回滚服务'),
    ),
  ).toBe(false);
  await expect(form.getByLabel('第 1 行名称', { exact: true })).toHaveValue('回滚服务');
  await form.getByLabel('第 2 行名称', { exact: true }).fill('修正服务');
  await form.getByRole('button', { name: '确认新增', exact: true }).click();
  await expect(form.getByText('已创建 2 条，跳过 0 条。')).toBeVisible();
  await form.getByRole('button', { name: '完成', exact: true }).click();
  await page.getByRole('button', { name: '批量录入', exact: true }).click();
  form = dialog();
  await form.getByLabel('批量条目类型').selectOption('server');
  await form.getByLabel('第 1 行名称', { exact: true }).fill('退出保护服务器');
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
  expect(message).toContain('批量资料尚未提交');
  await expect(form.getByLabel('第 1 行名称', { exact: true })).toHaveValue('退出保护服务器');
  await form.getByRole('button', { name: '继续校对', exact: true }).click();
  await form.getByLabel('第 1 行密码（加密）').fill('fictional-await-secret');
  await page.evaluate(() => window.desktop.lockVault());
  await form.getByRole('button', { name: '确认新增', exact: true }).click();
  const unlock = page.getByRole('dialog', { name: '解锁秘密', exact: true });
  await expect(unlock).toBeVisible();
  const flushed = app.evaluate(
    ({ BrowserWindow, ipcMain }) =>
      new Promise<string | null>((resolve) => {
        const token = 'bulk-entry-test-flush';
        const handler = (_event: unknown, received: string, error: string | null) => {
          if (received !== token) return;
          ipcMain.removeListener('flushed', handler);
          resolve(error);
        };
        ipcMain.on('flushed', handler);
        BrowserWindow.getAllWindows()[0].webContents.send('flush', token);
      }),
  );
  await unlock.getByLabel('主密码', { exact: true }).fill('fictional-bulk-master');
  await unlock.getByRole('button', { name: '解锁', exact: true }).click();
  expect(await flushed).toBeNull();
  await expect(form.getByText('已创建 1 条，跳过 0 条。')).toBeVisible();
  expect(
    await page.evaluate(
      async () =>
        (await window.desktop.snapshot()).resources.filter((r) => r.name === '退出保护服务器')
          .length,
    ),
  ).toBe(1);
});

test('密码映射不能写入普通字段，追加超过上限后可选择二百条统一保存', async () => {
  await page.getByRole('button', { name: '批量录入', exact: true }).click();
  const form = dialog();
  await form.getByLabel('批量条目类型').selectOption('server');
  await form.getByLabel('第 1 行名称', { exact: true }).fill('规模-手填');
  await form
    .getByLabel('粘贴表格', { exact: true })
    .fill('名称\t密码\n秘密映射\tfictional-mapping-secret');
  await form.getByRole('button', { name: '读取文本', exact: true }).click();
  await form.getByLabel('映射第 2 列').selectOption('notes');
  await expect(form.getByRole('alert')).toContainText('密码列只能加密保存或忽略');
  await expect(
    form.getByRole('button', { name: '追加到录入表格（1 行）', exact: true }),
  ).toBeDisabled();
  await expect(form.getByRole('region', { name: '待追加表格预览', exact: true })).not.toContainText(
    'fictional-mapping-secret',
  );
  await form.getByRole('button', { name: '放弃本次粘贴', exact: true }).click();
  await form
    .getByLabel('粘贴表格', { exact: true })
    .fill('名称\n' + Array.from({ length: 200 }, (_, i) => `规模-${i}`).join('\n'));
  await form.getByRole('button', { name: '读取文本', exact: true }).click();
  await form.getByRole('button', { name: '追加到录入表格（200 行）', exact: true }).click();
  await expect(form.getByRole('alert')).toContainText('每批最多新增 200 条');
  await expect(form.getByRole('button', { name: '确认新增', exact: true })).toBeDisabled();
  await form.getByLabel('录入第 201 行', { exact: true }).uncheck();
  await form.getByRole('button', { name: '确认新增', exact: true }).click();
  await expect(form.getByText('已创建 200 条，跳过 1 条。')).toBeVisible();
  expect(
    await page.evaluate(
      async () =>
        (await window.desktop.snapshot()).resources.filter((r) => r.name.startsWith('规模-'))
          .length,
    ),
  ).toBe(200);
});
