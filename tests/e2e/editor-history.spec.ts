import { electron } from './launch';
import { test, expect, type Page } from '@playwright/test';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

async function sample(page: Page, value: string) {
  await page.getByRole('button', { name: 'Markdown 源码', exact: true }).click();
  await page.getByLabel('Markdown 源码内容').fill(value);
  await page.getByRole('button', { name: '即时排版', exact: true }).click();
  const editor = page.getByRole('textbox', { name: '工作内容' });
  await expect(editor).toBeEditable();
  await editor.click();
  await editor.press(process.platform === 'darwin' ? 'Meta+ArrowDown' : 'Control+End');
  return editor;
}

test('IR 快速撤销保留连续输入分组，中文组合、重做、语法显隐与关闭保存一致', async ({}, testInfo) => {
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), 'workbench-ir-history-'));
  const env: Record<string, string> = { ...process.env, CLEVER_WORKBENCH_DATA_DIR: directory };
  delete env.ELECTRON_RUN_AS_NODE;
  let app = await electron.launch({ args: ['.'], env });
  try {
    let page = await app.firstWindow();
    const errors: string[] = [],
      remote: string[] = [];
    page.on('pageerror', (error) => errors.push(error.message));
    page.on('request', (request) => {
      if (/^https?:/.test(request.url())) remote.push(request.url());
    });
    await page.getByRole('button', { name: '写一份方案', exact: true }).click();
    await page.getByLabel('文档标题').fill('IR 正式回归');
    let editor = await sample(page, '基线');
    await page.keyboard.type('abcdef', { delay: 30 });
    await page.keyboard.press('ControlOrMeta+z');
    await expect(editor).toHaveText('基线');
    await page.keyboard.press('ControlOrMeta+Shift+z');
    await expect(editor).toHaveText('基线abcdef');
    await page.waitForTimeout(250); // The public 200 ms grouping boundary.
    await page.keyboard.type('第二组', { delay: 20 });
    await page.keyboard.press('ControlOrMeta+z');
    await expect(editor).toHaveText('基线abcdef');
    await page.keyboard.press('ControlOrMeta+z');
    await expect(editor).toHaveText('基线');
    await page.keyboard.press('ControlOrMeta+Shift+z');
    await page.keyboard.press('ControlOrMeta+Shift+z');
    await expect(editor).toHaveText('基线abcdef第二组');
    await page.waitForTimeout(250);
    await page.keyboard.press('ControlOrMeta+z');
    await page.keyboard.type('新分支');
    await page.keyboard.press('ControlOrMeta+Shift+z');
    await expect(editor).toHaveText('基线abcdef新分支');

    editor = await sample(page, '中文：');
    const cdp = await page.context().newCDPSession(page);
    await cdp.send('Input.imeSetComposition', {
      text: 'nihao',
      selectionStart: 5,
      selectionEnd: 5,
    });
    await expect(editor).toContainText('nihao');
    await cdp.send('Input.insertText', { text: '你好' });
    await page.keyboard.press('ControlOrMeta+z');
    await expect(editor).toHaveText('中文：');
    await page.keyboard.press('ControlOrMeta+Shift+z');
    await expect(editor).toHaveText('中文：你好');
    await page.keyboard.press('ControlOrMeta+z');
    await cdp.send('Input.imeSetComposition', {
      text: 'zhong',
      selectionStart: 5,
      selectionEnd: 5,
    });
    await cdp.send('Input.imeSetComposition', { text: '', selectionStart: 0, selectionEnd: 0 });
    await page.keyboard.press('ControlOrMeta+Shift+z');
    await expect(editor).toHaveText('中文：你好');

    editor = await sample(page, '**重点**\n\n普通段落');
    await editor.locator('strong').click();
    await expect(editor.locator('[data-type="strong"]')).toHaveClass(/vditor-ir__node--expand/);
    await editor.locator('p').last().click();
    await expect(editor.locator('[data-type="strong"]')).not.toHaveClass(/vditor-ir__node--expand/);
    await page.screenshot({ path: testInfo.outputPath('ir-production.png') });

    editor = await sample(page, '保存：');
    await page.getByRole('button', { name: '文字格式', exact: true }).click();
    await editor.click();
    await editor.press(process.platform === 'darwin' ? 'Meta+ArrowDown' : 'Control+End');
    await page.keyboard.type('快速编辑');
    await page.getByRole('button', { name: '撤销', exact: true }).click();
    await expect(editor).toHaveText('保存：');
    await page.getByRole('button', { name: '重做', exact: true }).click();
    await app.close();
    app = await electron.launch({ args: ['.'], env });
    page = await app.firstWindow();
    await page.getByRole('button', { name: '打开文档 IR 正式回归', exact: true }).click();
    await expect(page.getByRole('textbox', { name: '工作内容' })).toHaveText('保存：快速编辑');
    expect(errors).toEqual([]);
    expect(remote).toEqual([]);
  } finally {
    await app.close();
    await fs.rm(directory, { recursive: true, force: true });
  }
});

test('本地图片可立即撤销重做，导入中导航等待原记录保存', async () => {
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), 'workbench-ir-image-'));
  const env: Record<string, string> = { ...process.env, CLEVER_WORKBENCH_DATA_DIR: directory };
  delete env.ELECTRON_RUN_AS_NODE;
  const app = await electron.launch({ args: ['.'], env });
  try {
    const page = await app.firstWindow();
    await page.getByRole('button', { name: '写一份方案', exact: true }).click();
    await page.getByLabel('文档标题').fill('图片撤销');
    const editor = await sample(page, '保留正文');
    await page.keyboard.type('补充');
    await editor.evaluate((element) => {
      const data = new DataTransfer();
      const bytes = Uint8Array.from(
        atob(
          'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR4nGNgqPr/HwAEcAJ5Qhlc0gAAAABJRU5ErkJggg==',
        ),
        (c) => c.charCodeAt(0),
      );
      data.items.add(new File([bytes], '截图.png', { type: 'image/png' }));
      data.setData('text/html', '<img src="https://example.invalid/private.png">');
      element.dispatchEvent(
        new ClipboardEvent('paste', { clipboardData: data, bubbles: true, cancelable: true }),
      );
    });
    await expect(editor.locator('img')).toHaveCount(1);
    await page.keyboard.press('ControlOrMeta+z');
    await expect(editor.locator('img')).toHaveCount(0);
    await expect(editor).toContainText('保留正文补充');
    await page.keyboard.press('ControlOrMeta+Shift+z');
    await page.getByRole('button', { name: '工作台', exact: true }).click();
    await page.getByRole('button', { name: '打开文档 图片撤销', exact: true }).click();
    await expect(editor).toContainText('保留正文');
    await expect
      .poll(() => editor.locator('img').evaluate((image: HTMLImageElement) => image.naturalWidth))
      .toBe(1);
    const filename = path.join(directory, 'delayed.png');
    await fs.writeFile(
      filename,
      Buffer.from(
        'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR4nGNgqPr/HwAEcAJ5Qhlc0gAAAABJRU5ErkJggg==',
        'base64',
      ),
    );
    await app.evaluate(({ dialog }, filename) => {
      dialog.showOpenDialog = (async () => {
        await new Promise((resolve) => setTimeout(resolve, 1000));
        return { canceled: false, filePaths: [filename] };
      }) as typeof dialog.showOpenDialog;
    }, filename);
    await page.getByRole('button', { name: '插入图片', exact: true }).click();
    await page.getByRole('button', { name: '工作台', exact: true }).click();
    await page.getByRole('button', { name: '打开文档 图片撤销', exact: true }).click();
    await expect(editor.locator('img')).toHaveCount(2);
  } finally {
    await app.close();
    await fs.rm(directory, { recursive: true, force: true });
  }
});

test('只打开或移动光标不改写原文，回收站正文和勾选项保持只读', async () => {
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), 'workbench-ir-readonly-'));
  const env: Record<string, string> = { ...process.env, CLEVER_WORKBENCH_DATA_DIR: directory };
  delete env.ELECTRON_RUN_AS_NODE;
  const app = await electron.launch({ args: ['.'], env });
  try {
    const page = await app.firstWindow();
    const raw = '# 原样标题\n\n\n- [ ] 未完成\n\n末尾原样\n\n';
    const id = await page.evaluate(
      async (markdown) =>
        (
          await window.desktop.mutate({
            type: 'task.create',
            draft: {
              title: '不改原文',
              projectId: null,
              markdown,
              content: { type: 'doc', content: [{ type: 'paragraph' }] },
            },
          })
        ).createdId!,
      raw,
    );
    await page.getByRole('button', { name: '工作任务', exact: true }).click();
    await page.locator('.task-open').filter({ hasText: '不改原文' }).click();
    const editor = page.getByRole('textbox', { name: '工作内容' });
    await editor.click();
    await page.keyboard.press('ArrowLeft');
    await page.getByLabel('关闭详情').click();
    expect((await page.evaluate((id) => window.desktop.task(id), id)).markdown).toBe(raw);
    await page.locator('.task-open').filter({ hasText: '不改原文' }).click();
    await page.getByRole('button', { name: '删除任务', exact: true }).click();
    await page.getByRole('button', { name: '回收站', exact: true }).click();
    await page.locator('.task-open').filter({ hasText: '不改原文' }).click();
    await expect(editor).not.toBeEditable();
    await expect(editor.getByRole('checkbox')).toBeDisabled();
    await expect(editor.getByRole('checkbox')).not.toBeChecked();
    await page.getByLabel('关闭详情').click();
    expect((await page.evaluate((id) => window.desktop.task(id), id)).markdown).toBe(raw);
  } finally {
    await app.close();
    await fs.rm(directory, { recursive: true, force: true });
  }
});
