import { test, expect, _electron as electron } from '@playwright/test';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

test('从资源写方案并回到台账，系统换项目后保留旧背景和文档恢复能力', async ({}, testInfo) => {
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), 'workbench-documents-ui-'));
  const env: Record<string, string> = { ...process.env, CLEVER_WORKBENCH_DATA_DIR: directory };
  delete env.ELECTRON_RUN_AS_NODE;
  const app = await electron.launch({ args: ['.'], env });
  try {
    const page = await app.firstWindow();
    const ids = await page.evaluate(async () => {
      const a = (
        await window.desktop.mutate({ type: 'project.create', name: '园区一期', color: '#007aff' })
      ).createdId!;
      const b = (
        await window.desktop.mutate({ type: 'project.create', name: '园区二期', color: '#34a271' })
      ).createdId!;
      const system = (
        await window.desktop.mutate({ type: 'system.save', name: '园区平台', projectId: a })
      ).createdId!;
      const environment = (
        await window.desktop.mutate({ type: 'environment.save', systemId: system, name: '生产' })
      ).createdId!;
      const resource = (
        await window.desktop.mutate({
          type: 'resource.save',
          environmentId: environment,
          kind: 'redis',
          name: '订单缓存',
        })
      ).createdId!;
      return { a, b, system, environment, resource };
    });
    await page.getByRole('button', { name: '台账', exact: true }).click();
    await page.getByRole('button', { name: '为资源写文档', exact: true }).click({ timeout: 3000 });
    await page.getByLabel('文档标题').fill('生产缓存排障');
    await page.getByRole('textbox', { name: '工作内容' }).fill('连接池耗尽，调整超时和容量。');
    await expect(page.getByLabel('文档所属项目')).toHaveValue(ids.a);
    await page.getByRole('button', { name: '回到关联对象', exact: true }).click();
    await expect(page.getByLabel('资源名称', { exact: true })).toHaveValue('订单缓存');
    await page.getByLabel('当前项目', { exact: true }).selectOption(ids.b);
    await page.getByRole('button', { name: '文档', exact: true }).click();
    await page.getByLabel('搜索文档').fill('连接池');
    await page.getByRole('button', { name: /文档 生产缓存排障/ }).click();
    await expect(page.getByLabel('文档所属项目')).toHaveValue(ids.a);
    await expect(page.getByRole('textbox', { name: '工作内容' })).toContainText('调整超时');
    await page.getByRole('button', { name: '删除文档', exact: true }).click();
    await page.getByRole('button', { name: '文档回收站', exact: true }).click();
    await page.getByRole('button', { name: /文档 生产缓存排障/ }).click();
    await page.getByRole('button', { name: '恢复文档', exact: true }).click();
    await page.getByRole('button', { name: '全部文档', exact: true }).click();
    await page.getByRole('button', { name: /文档 生产缓存排障/ }).click();
    await expect(page.getByRole('textbox', { name: '工作内容' })).toContainText('连接池耗尽');
    await page.screenshot({ path: testInfo.outputPath('document-context.png') });
  } finally {
    await app.close();
    await fs.rm(directory, { recursive: true, force: true });
  }
});

test('未命名文档粘贴图片后立即切换，重启后保留正文与图片', async () => {
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), 'workbench-doc-draft-'));
  const env: Record<string, string> = { ...process.env, CLEVER_WORKBENCH_DATA_DIR: directory };
  delete env.ELECTRON_RUN_AS_NODE;
  let app = await electron.launch({ args: ['.'], env });
  try {
    let page = await app.firstWindow();
    await page.getByRole('button', { name: '文档', exact: true }).click();
    await page.getByRole('button', { name: '新建文档', exact: true }).click();
    const editor = page.getByRole('textbox', { name: '工作内容' });
    await editor.fill('先保留现场，稍后补标题。');
    await editor.evaluate((element) => {
      const data = new DataTransfer();
      const bytes = Uint8Array.from(
        atob(
          'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR4nGNgqPr/HwAEcAJ5Qhlc0gAAAABJRU5ErkJggg==',
        ),
        (c) => c.charCodeAt(0),
      );
      data.items.add(new File([bytes], '现场.png', { type: 'image/png' }));
      element.dispatchEvent(
        new ClipboardEvent('paste', { clipboardData: data, bubbles: true, cancelable: true }),
      );
    });
    await page.getByRole('button', { name: '工作任务', exact: true }).click();
    await app.close();
    app = await electron.launch({ args: ['.'], env });
    page = await app.firstWindow();
    await page.getByRole('button', { name: '文档', exact: true }).click();
    await page.getByRole('button', { name: '文档 未命名文档', exact: true }).click();
    await expect(page.getByLabel('文档标题')).toHaveValue('');
    await expect(page.getByRole('textbox', { name: '工作内容' })).toContainText('先保留现场');
    await expect(page.getByRole('textbox', { name: '工作内容' }).locator('img')).toBeVisible();
    await expect(page.getByLabel('文档所属项目')).toHaveValue('');
  } finally {
    await app.close();
    await fs.rm(directory, { recursive: true, force: true });
  }
});
