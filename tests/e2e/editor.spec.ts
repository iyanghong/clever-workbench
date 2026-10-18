import { electron } from './launch';
import { test, expect } from '@playwright/test';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

test('以 Markdown 为准加载，粘贴截图后立即退出仍保留正文和本地图片', async () => {
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), 'workbench-editor-'));
  const env: Record<string, string> = { ...process.env, CLEVER_WORKBENCH_DATA_DIR: directory };
  delete env.ELECTRON_RUN_AS_NODE;
  let app = await electron.launch({ args: ['.'], env });
  try {
    let page = await app.firstWindow();
    const id = await page.evaluate(
      async () =>
        (
          await window.desktop.mutate({
            type: 'task.create',
            draft: {
              title: '正文权威来源',
              projectId: null,
              markdown: '## 当前方案\n\n检查连接池，保留最后一次编辑。',
              content: {
                type: 'doc',
                content: [
                  { type: 'paragraph', content: [{ type: 'text', text: '旧缓存不应显示' }] },
                ],
              },
            },
          })
        ).createdId!,
    );
    await page.getByRole('button', { name: '台账', exact: true }).click();
    await page.getByRole('button', { name: '工作任务', exact: true }).click();
    await page.getByRole('button', { name: /正文权威来源.*未分类/ }).click();
    let editor = page.getByRole('textbox', { name: '工作内容' });
    await expect(editor).toContainText('检查连接池', { timeout: 3000 });
    await expect(editor).not.toContainText('旧缓存');
    await editor.evaluate((element) => {
      const bytes = Uint8Array.from(
        atob(
          'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR4nGNgqPr/HwAEcAJ5Qhlc0gAAAABJRU5ErkJggg==',
        ),
        (c) => c.charCodeAt(0),
      );
      const data = new DataTransfer();
      data.items.add(new File([bytes], '截图.png', { type: 'image/png' }));
      element.dispatchEvent(
        new ClipboardEvent('paste', { clipboardData: data, bubbles: true, cancelable: true }),
      );
    });
    await app.close();
    app = await electron.launch({ args: ['.'], env });
    page = await app.firstWindow();
    await page.getByRole('button', { name: /正文权威来源.*未分类/ }).click();
    editor = page.getByRole('textbox', { name: '工作内容' });
    await expect(editor).toContainText('检查连接池');
    await expect(editor.locator('img')).toBeVisible();
    await expect
      .poll(() => editor.locator('img').evaluate((image: HTMLImageElement) => image.naturalWidth))
      .toBe(1);
    expect((await page.evaluate((id) => window.desktop.task(id), id)).markdown).toContain(
      'workbench-asset://image/',
    );
    await editor.evaluate((element) => {
      const data = new DataTransfer();
      data.items.add(new File(['not an image'], 'bad.png', { type: 'image/png' }));
      element.dispatchEvent(
        new ClipboardEvent('paste', { clipboardData: data, bubbles: true, cancelable: true }),
      );
    });
    await expect(page.getByRole('alert')).toContainText('bad.png');
    await expect(editor.locator('img')).toHaveCount(1);
    await editor.press('ControlOrMeta+End');
    await editor.press('Enter');
    const original = path.join(directory, 'original.png');
    await fs.writeFile(
      original,
      Buffer.from(
        'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR4nGNgqPr/HwAEcAJ5Qhlc0gAAAABJRU5ErkJggg==',
        'base64',
      ),
    );
    await app.evaluate(({ dialog }, filePath) => {
      dialog.showOpenDialog = (async () => ({
        canceled: false,
        filePaths: [filePath],
      })) as typeof dialog.showOpenDialog;
    }, original);
    await page.getByRole('button', { name: '插入图片', exact: true }).click();
    await expect(editor.locator('img')).toHaveCount(2);
    await fs.rm(original);
    await page.getByLabel('关闭详情').click();
    await page.getByRole('button', { name: /正文权威来源.*未分类/ }).click();
    await expect(editor.locator('img')).toHaveCount(2);
    await expect
      .poll(() =>
        editor
          .locator('img')
          .last()
          .evaluate((image: HTMLImageElement) => image.naturalWidth),
      )
      .toBe(1);
  } finally {
    await app.close();
    await fs.rm(directory, { recursive: true, force: true });
  }
});

test('表格与源码切换保全内容，不支持的结构重启后仍可编辑', async ({}, testInfo) => {
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), 'workbench-markdown-'));
  const env: Record<string, string> = { ...process.env, CLEVER_WORKBENCH_DATA_DIR: directory };
  delete env.ELECTRON_RUN_AS_NODE;
  let app = await electron.launch({ args: ['.'], env });
  try {
    let page = await app.firstWindow();
    await page.getByLabel('快速新增任务').fill('检查编辑往返');
    await page.getByLabel('快速新增任务').press('Enter');
    await page.getByRole('button', { name: /检查编辑往返.*未分类/ }).click();
    await page.getByRole('button', { name: 'Markdown 源码', exact: true }).click({ timeout: 3000 });
    const source =
      '## 排障记录\n\n| 环境 | 端口 |\n| --- | --- |\n| 生产 | 6379 |\n\n```sql\nselect 1;\n```\n\n- [x] 完成检查\n- [ ] 继续观察';
    await page.getByLabel('Markdown 源码内容').fill(source);
    await page.getByRole('button', { name: '即时排版', exact: true }).click();
    const editor = page.getByRole('textbox', { name: '工作内容' });
    await expect(editor.locator('table')).toContainText('6379');
    await expect(editor.locator('pre')).toContainText('select 1;');
    await expect(editor.getByRole('checkbox').first()).toBeChecked();
    await editor.locator('td').last().dblclick();
    await page.keyboard.type('6380');
    await page.getByRole('button', { name: 'Markdown 源码', exact: true }).click();
    await expect(page.getByLabel('Markdown 源码内容')).toHaveValue(/6380/);
    const unsupported = source + '\n\n<details><summary>保留原文</summary>额外说明</details>';
    await page.getByLabel('Markdown 源码内容').fill(unsupported);
    await page.getByRole('button', { name: '即时排版', exact: true }).click();
    await expect(page.getByLabel('Markdown 源码内容')).toHaveValue(unsupported);
    await expect(page.getByRole('status').filter({ hasText: '保留源码' })).toBeVisible();
    await app.close();
    app = await electron.launch({ args: ['.'], env });
    page = await app.firstWindow();
    await page.getByRole('button', { name: /检查编辑往返.*未分类/ }).click();
    await expect(page.getByLabel('Markdown 源码内容')).toHaveValue(unsupported);
    await page.screenshot({ path: testInfo.outputPath('markdown-source-preserved.png') });
  } finally {
    await app.close();
    await fs.rm(directory, { recursive: true, force: true });
  }
});

test('保存失败时留在编辑页并保留最新内容，重试成功后再关闭', async () => {
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), 'workbench-save-failure-'));
  const env: Record<string, string> = { ...process.env, CLEVER_WORKBENCH_DATA_DIR: directory };
  delete env.ELECTRON_RUN_AS_NODE;
  const app = await electron.launch({ args: ['.'], env });
  const { DatabaseSync } = await import('node:sqlite');
  let database: InstanceType<typeof DatabaseSync> | undefined;
  try {
    const page = await app.firstWindow();
    await page.getByLabel('快速新增任务').fill('保留未保存内容');
    await page.getByLabel('快速新增任务').press('Enter');
    await page.getByRole('button', { name: /保留未保存内容.*未分类/ }).click();
    const generation = (await fs.readFile(path.join(directory, 'data', 'CURRENT'), 'utf8')).trim();
    database = new DatabaseSync(
      path.join(directory, 'data', 'vaults', generation, 'database.sqlite'),
    );
    database.exec(
      "CREATE TRIGGER test_write_failure BEFORE UPDATE ON tasks BEGIN SELECT RAISE(ABORT, '模拟写入失败'); END",
    );
    const editor = page.getByRole('textbox', { name: '工作内容' });
    await editor.fill('最新的排障结论不能丢失。');
    await page.getByLabel('关闭详情').click();
    await expect(editor).toContainText('最新的排障结论不能丢失。');
    await expect(page.getByRole('button', { name: /保存失败.*点击重试/ })).toBeVisible();
    database.exec('DROP TRIGGER test_write_failure');
    await page.getByLabel('关闭详情').click();
    await expect(page.getByRole('complementary', { name: '任务详情' })).toHaveCount(0);
    await page.getByRole('button', { name: /保留未保存内容.*未分类/ }).click();
    await expect(editor).toContainText('最新的排障结论不能丢失。');
  } finally {
    if (database) {
      database.exec('DROP TRIGGER IF EXISTS test_write_failure');
      database.close();
    }
    await app.close();
    await fs.rm(directory, { recursive: true, force: true });
  }
});
