import { test, expect } from '@playwright/test';
import { electron } from './launch';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

test('任务快录与详情直接选择系统，项目可留空且不会因系统关联自动改写', async () => {
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), 'workbench-system-task-'));
  const env: Record<string, string> = { ...process.env, CLEVER_WORKBENCH_DATA_DIR: directory };
  delete env.ELECTRON_RUN_AS_NODE;
  const app = await electron.launch({ args: ['.'], env });
  try {
    const page = await app.firstWindow();
    const ids = await page.evaluate(async () => {
      const api = window.desktop;
      const project = (
        await api.mutate({ type: 'project.create', name: '订单一期', color: '#007aff' })
      ).createdId!;
      const a = (await api.mutate({ type: 'system.save', name: '订单平台', projectId: project }))
        .createdId!;
      const b = (await api.mutate({ type: 'system.save', name: '设备平台' })).createdId!;
      return { a, b, project };
    });
    await page.getByRole('button', { name: '快速新建', exact: true }).click();
    await page.getByRole('button', { name: '新任务', exact: true }).click();
    const dialog = page.getByRole('dialog');
    await expect(dialog.getByLabel('关联系统', { exact: true })).toBeVisible({ timeout: 2000 });
    await dialog.getByLabel('关联系统', { exact: true }).selectOption(ids.a);
    await expect(dialog.getByLabel('新任务项目', { exact: true })).toHaveValue('');
    await dialog.getByLabel('快速新建任务标题').fill('整理订单部署说明');
    await dialog.getByRole('button', { name: '创建任务', exact: true }).click();
    await expect(page.getByLabel('关联系统', { exact: true })).toBeVisible();
    await expect(page.getByLabel('所属项目', { exact: true })).toHaveValue('');
    await page.getByLabel('所属项目', { exact: true }).selectOption(ids.project);
    await page.getByLabel('关联系统', { exact: true }).selectOption(ids.b);
    await expect(page.getByLabel('所属项目', { exact: true })).toHaveValue(ids.project);
    await page.getByLabel('所属项目', { exact: true }).selectOption('');
    await page.getByRole('button', { name: '工作台', exact: true }).click();
    const snapshot = await page.evaluate(() => window.desktop.snapshot());
    expect(snapshot.tasks.find((task) => task.title === '整理订单部署说明')).toMatchObject({
      systemId: ids.b,
      projectId: null,
    });
  } finally {
    await app.close();
    await fs.rm(directory, { recursive: true, force: true });
  }
});

test('通用与系统文档分别查看，按范围新建，修改归属和切换筛选不丢正文', async () => {
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), 'workbench-document-scopes-'));
  const env: Record<string, string> = { ...process.env, CLEVER_WORKBENCH_DATA_DIR: directory };
  delete env.ELECTRON_RUN_AS_NODE;
  let app = await electron.launch({ args: ['.'], env });
  try {
    let page = await app.firstWindow();
    const ids = await page.evaluate(async () => {
      const api = window.desktop;
      const a = (await api.mutate({ type: 'system.save', name: '订单平台' })).createdId!;
      const b = (await api.mutate({ type: 'system.save', name: '设备平台' })).createdId!;
      for (const [title, systemId] of [
        ['通用排障模板', null],
        ['订单部署说明', a],
        ['设备巡检说明', b],
      ]) {
        const id = (await api.mutate({ type: 'document.create', context: { systemId } }))
          .createdId!;
        const document = await api.document(id);
        await api.mutate({ ...document, type: 'document.edit', title: title! });
      }
      return { a, b };
    });
    await page.getByRole('button', { name: '文档', exact: true }).click();
    await page.getByLabel('文档范围', { exact: true }).selectOption('common', { timeout: 2000 });
    await expect(
      page.getByRole('button', { name: '文档 通用排障模板', exact: true }),
    ).toBeVisible();
    await expect(page.getByRole('button', { name: '文档 订单部署说明', exact: true })).toHaveCount(
      0,
    );
    await page.getByLabel('文档范围', { exact: true }).selectOption(ids.a);
    await page.getByRole('button', { name: '新建文档', exact: true }).click();
    await expect(page.getByLabel('关联系统', { exact: true })).toHaveValue(ids.a);
    await page.getByLabel('文档标题', { exact: true }).fill('新排障记录');
    await page.getByRole('textbox', { name: '工作内容', exact: true }).fill('环境调整前保留的内容');
    await page.getByLabel('关联系统', { exact: true }).selectOption('');
    await page
      .getByRole('textbox', { name: '工作内容', exact: true })
      .fill('切换为通用后继续编辑的内容');
    await page.getByLabel('文档范围', { exact: true }).selectOption(ids.b);
    await expect(
      page.getByRole('button', { name: '文档 设备巡检说明', exact: true }),
    ).toBeVisible();
    await expect(page.getByRole('button', { name: '文档 新排障记录', exact: true })).toHaveCount(0);
    await app.close();
    app = await electron.launch({ args: ['.'], env });
    page = await app.firstWindow();
    await page.getByRole('button', { name: '文档', exact: true }).click();
    await page.getByLabel('文档范围', { exact: true }).selectOption('common');
    await page.getByRole('button', { name: '文档 新排障记录', exact: true }).click();
    await expect(page.getByLabel('关联系统', { exact: true })).toHaveValue('');
    await expect(page.getByRole('textbox', { name: '工作内容', exact: true })).toContainText(
      '切换为通用后继续编辑的内容',
    );
  } finally {
    await app.close();
    await fs.rm(directory, { recursive: true, force: true });
  }
});
