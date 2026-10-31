import { openLedgerRecord, openSystemAction } from './ledger-actions';
import { electron } from './launch';
import { test, expect } from '@playwright/test';
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
    await openLedgerRecord(page, '数据库／中间件', '订单缓存');
    await page
      .getByRole('button', { name: '为当前对象写文档', exact: true })
      .click({ timeout: 3000 });
    await page.getByLabel('文档标题').fill('生产缓存排障');
    await page.getByRole('textbox', { name: '工作内容' }).fill('连接池耗尽，调整超时和容量。');
    await expect(page.getByLabel('文档所属项目')).toHaveValue(ids.a);
    await page.getByRole('button', { name: '回到关联对象', exact: true }).click();
    await expect(page.getByRole('heading', { name: '订单缓存', exact: true })).toBeVisible();
    await openSystemAction(page, '系统信息');
    await page.getByLabel('当前项目', { exact: true }).selectOption(ids.b);
    await page
      .getByRole('dialog', { name: '系统信息' })
      .getByRole('button', { name: '完成', exact: true })
      .click();
    await page.getByLabel('文档', { exact: true }).click();
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
    await page.getByLabel('文档', { exact: true }).click();
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
    await page.getByLabel('文档', { exact: true }).click();
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

test('居中稿纸可切换专注编辑，退出后保留标题、正文与文档列表', async ({}, testInfo) => {
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), 'workbench-document-focus-'));
  const env: Record<string, string> = { ...process.env, CLEVER_WORKBENCH_DATA_DIR: directory };
  delete env.ELECTRON_RUN_AS_NODE;
  const app = await electron.launch({ args: ['.'], env });
  try {
    const page = await app.firstWindow();
    await page.getByLabel('文档', { exact: true }).click();
    await page.getByRole('button', { name: '新建文档', exact: true }).click();
    await expect(page.locator('.documents-index')).toBeVisible();
    await expect(page.locator('.documents-layout')).not.toHaveClass(/focused/);
    await page.getByRole('button', { name: '专注编辑', exact: true }).click();
    await expect(page.locator('.documents-index')).toBeHidden();
    await expect(page.locator('.document-metadata')).toBeHidden();
    await expect(page.getByRole('button', { name: '退出专注', exact: true })).toHaveAttribute(
      'aria-pressed',
      'true',
    );
    await page.getByLabel('文档标题').fill('专注编辑中的方案');
    await page
      .getByRole('textbox', { name: '工作内容' })
      .fill('隐藏列表后仍然可以持续记录，退出专注不能丢失内容。');
    await page.getByRole('button', { name: '退出专注', exact: true }).click();
    await expect(page.locator('.documents-index')).toBeVisible();
    await expect(page.locator('.document-metadata')).toBeVisible();
    await expect(page.getByRole('button', { name: '已保存', exact: true })).toBeVisible();
    await expect(
      page.getByRole('button', { name: '文档 专注编辑中的方案', exact: true }),
    ).toBeVisible();
    await expect(page.getByRole('textbox', { name: '工作内容' })).toContainText(
      '退出专注不能丢失内容',
    );
    await page.screenshot({ path: testInfo.outputPath('document-focus-restored.png') });
  } finally {
    await app.close();
    await fs.rm(directory, { recursive: true, force: true });
  }
});

test('多级大纲支持长标题、三种布局和重启后的展开状态记忆', async () => {
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), 'workbench-document-outline-'));
  const env: Record<string, string> = { ...process.env, CLEVER_WORKBENCH_DATA_DIR: directory };
  delete env.ELECTRON_RUN_AS_NODE;
  let app = await electron.launch({ args: ['.'], env });
  const longHeading = '生产环境高峰期慢查询与跨节点连接泄漏联合排查记录';
  try {
    let page = await app.firstWindow();
    await page.getByLabel('文档', { exact: true }).click();
    await page.getByRole('button', { name: '新建文档', exact: true }).click();
    await page.getByLabel('文档标题').fill('多级长标题大纲');
    await page.getByRole('button', { name: 'Markdown 源码', exact: true }).click();
    await page
      .getByLabel('Markdown 源码内容')
      .fill(
        `## 问题现象\n\n正文\n\n## 排查过程\n\n正文\n\n### ${longHeading}\n\n正文\n\n## 处理方案\n\n正文\n\n## 验证结果\n\n正文`,
      );
    await page.getByRole('button', { name: '即时排版', exact: true }).click();
    await page.getByRole('button', { name: '专注编辑', exact: true }).click();
    await page.getByRole('button', { name: '大纲', exact: true }).click();
    let panel = page.getByRole('complementary', { name: '文档大纲' });
    await expect(panel).toHaveAttribute('data-layout', 'popover');
    await expect(panel.getByRole('button', { name: longHeading, exact: true })).toHaveAttribute(
      'title',
      longHeading,
    );
    const parentIndent = await panel
      .getByRole('button', { name: '排查过程', exact: true })
      .evaluate((element) => parseFloat(getComputedStyle(element).paddingInlineStart));
    const childIndent = await panel
      .getByRole('button', { name: longHeading, exact: true })
      .evaluate((element) => parseFloat(getComputedStyle(element).paddingInlineStart));
    expect(childIndent).toBeGreaterThan(parentIndent);
    await panel.getByRole('button', { name: '左侧', exact: true }).click();
    await expect(panel).toHaveAttribute('data-layout', 'left');
    await panel.getByRole('button', { name: '右侧', exact: true }).click();
    await expect(panel).toHaveAttribute('data-layout', 'right');
    await panel.getByRole('button', { name: longHeading, exact: true }).click();
    await expect(panel.getByRole('button', { name: longHeading, exact: true })).toHaveAttribute(
      'aria-current',
      'location',
    );
    await expect(panel).toBeVisible();
    expect(await page.evaluate(() => localStorage.getItem('document-outline-layout'))).toBe(
      'right',
    );
    expect(await page.evaluate(() => localStorage.getItem('document-outline-open'))).toBe('true');

    await app.close();
    app = await electron.launch({ args: ['.'], env });
    page = await app.firstWindow();
    await page.getByLabel('文档', { exact: true }).click();
    await page.getByRole('button', { name: '文档 多级长标题大纲', exact: true }).click();
    await page.getByRole('button', { name: '专注编辑', exact: true }).click();
    panel = page.getByRole('complementary', { name: '文档大纲' });
    await expect(panel).toBeVisible();
    await expect(panel).toHaveAttribute('data-layout', 'right');
    await panel.getByRole('button', { name: '弹出', exact: true }).click();
    await expect(panel).toHaveAttribute('data-layout', 'popover');
    await panel.getByRole('button', { name: '关闭大纲', exact: true }).click();
    await expect(panel).toHaveCount(0);

    await app.close();
    app = await electron.launch({ args: ['.'], env });
    page = await app.firstWindow();
    await page.getByLabel('文档', { exact: true }).click();
    await page.getByRole('button', { name: '文档 多级长标题大纲', exact: true }).click();
    await page.getByRole('button', { name: '专注编辑', exact: true }).click();
    await expect(page.getByRole('button', { name: '大纲', exact: true })).toHaveAttribute(
      'aria-expanded',
      'false',
    );
    await expect(page.getByRole('complementary', { name: '文档大纲' })).toHaveCount(0);
    await page.getByRole('button', { name: '大纲', exact: true }).click();
    await expect(page.getByRole('complementary', { name: '文档大纲' })).toHaveAttribute(
      'data-layout',
      'popover',
    );
  } finally {
    await app.close();
    await fs.rm(directory, { recursive: true, force: true });
  }
});
