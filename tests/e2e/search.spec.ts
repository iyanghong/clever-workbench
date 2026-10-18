import { electron } from './launch';
import { test, expect } from '@playwright/test';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
test('全局搜索区分环境，可从结果按需解锁复制秘密并用键盘定位文档', async ({}, testInfo) => {
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), 'workbench-search-ui-'));
  const env: Record<string, string> = { ...process.env, CLEVER_WORKBENCH_DATA_DIR: directory };
  delete env.ELECTRON_RUN_AS_NODE;
  const app = await electron.launch({ args: ['.'], env });
  try {
    const page = await app.firstWindow();
    await page.evaluate(async () => {
      const systemId = (await window.desktop.mutate({ type: 'system.save', name: '订单平台' }))
        .createdId!;
      for (const name of ['生产', '测试']) {
        const environmentId = (
          await window.desktop.mutate({ type: 'environment.save', systemId, name })
        ).createdId!;
        const resourceId = (
          await window.desktop.mutate({
            type: 'resource.save',
            environmentId,
            kind: 'redis',
            name: '缓存',
          })
        ).createdId!;
        const accountId = (
          await window.desktop.mutate({
            type: 'account.save',
            environmentId,
            resourceId,
            name: '应用连接',
            username: name === '生产' ? 'app-prod' : 'app-test',
          })
        ).createdId!;
        if (name === '生产') {
          await window.desktop.initializeVault('fictional-master-password');
          await window.desktop.saveSecret(accountId, 'password', 'fictional-search-secret');
        }
      }
      const id = (await window.desktop.mutate({ type: 'document.create', context: { systemId } }))
        .createdId!;
      const document = await window.desktop.document(id);
      await window.desktop.mutate({
        ...document,
        type: 'document.edit',
        title: '缓存排障方案',
        markdown: '连接池耗尽的处理步骤',
      });
      await window.desktop.lockVault();
    });
    await page.getByRole('button', { name: '全局搜索', exact: true }).click({ timeout: 3000 });
    await page.getByLabel('搜索工作台内容').fill('订单平台 生产 Redis');
    await expect(page.getByRole('list', { name: '搜索结果' })).toContainText(
      '订单平台 / 生产 / 缓存',
    );
    await expect(page.getByRole('list', { name: '搜索结果' })).not.toContainText('app-test');
    await page.screenshot({ path: testInfo.outputPath('global-search.png') });
    await page.getByLabel('搜索工作台内容').fill('不存在的资料-9842');
    await page.getByLabel('搜索工作台内容').press('Enter');
    await expect(page.getByRole('dialog', { name: '搜索工作台', exact: true })).toBeVisible();
    await expect(
      page.getByText('没有找到匹配内容，试试系统名、环境或正文关键词。', { exact: true }),
    ).toBeVisible();
    await page.getByLabel('搜索工作台内容').fill('订单平台 生产 Redis');
    await page.getByRole('button', { name: '复制用户名 应用连接', exact: true }).click();
    await expect.poll(() => app.evaluate(({ clipboard }) => clipboard.readText())).toBe('app-prod');
    await page.getByRole('button', { name: '复制密码 应用连接', exact: true }).click();
    await page.getByLabel('主密码', { exact: true }).fill('fictional-master-password');
    await page.getByRole('button', { name: '解锁', exact: true }).click();
    await expect
      .poll(() => app.evaluate(({ clipboard }) => clipboard.readText()))
      .toBe('fictional-search-secret');
    await expect(page.getByLabel('搜索工作台内容')).toHaveValue('订单平台 生产 Redis');
    await page.getByRole('button', { name: '打开账号 应用连接', exact: true }).click();
    await expect(page.getByLabel('账号用户名', { exact: true })).toHaveValue('app-prod');
    await page.keyboard.press('ControlOrMeta+k');
    await page.getByLabel('搜索工作台内容').fill('连接池');
    await expect(
      page.getByRole('button', { name: '打开文档 缓存排障方案', exact: true }),
    ).toBeVisible();
    await page.getByLabel('搜索工作台内容').press('ArrowDown');
    await page.getByLabel('搜索工作台内容').press('Enter');
    await expect(page.getByLabel('文档标题')).toHaveValue('缓存排障方案');
  } finally {
    await app.close();
    await fs.rm(directory, { recursive: true, force: true });
  }
});
