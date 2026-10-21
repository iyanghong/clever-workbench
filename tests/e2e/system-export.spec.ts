import { openSystemAction } from './ledger-actions';
import { test, expect } from '@playwright/test';
import { electron } from './launch';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import yauzl from 'yauzl';

test('勾选内容、开始日期筛选和单文件输出在主题、窄窗口及键盘操作下可用', async ({}, info) => {
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), 'workbench-export-options-'));
  const outputDirectory = info.outputPath('exports');
  await fs.mkdir(outputDirectory, { recursive: true });
  const env: Record<string, string> = { ...process.env, CLEVER_WORKBENCH_DATA_DIR: directory };
  delete env.ELECTRON_RUN_AS_NODE;
  const app = await electron.launch({ args: ['.'], env });
  try {
    const page = await app.firstWindow();
    await page.setViewportSize({ width: 1380, height: 900 });
    await page.emulateMedia({ colorScheme: 'light' });
    await page.evaluate(async () => {
      const api = window.desktop;
      const systemId = (await api.mutate({ type: 'system.save', name: '筛选平台' })).createdId!;
      const id = (await api.mutate({ type: 'document.create', context: { systemId } })).createdId!;
      await api.mutate({
        ...(await api.document(id)),
        type: 'document.edit',
        title: '可选文档',
        markdown: '不选时不导出的文档正文',
      });
      const image = await api.importImage(
        Uint8Array.from(
          atob(
            'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR4nGNgqPr/HwAEcAJ5Qhlc0gAAAABJRU5ErkJggg==',
          ),
          (c) => c.charCodeAt(0),
        ),
        '任务图片.png',
      );
      for (const [title, day] of [
        ['范围内任务', 20],
        ['范围外任务', 22],
      ] as const) {
        await api.mutate({
          type: 'task.create',
          draft: {
            title,
            systemId,
            projectId: null,
            startedAt: new Date(2025, 9, day, 23, 59).getTime(),
            content: { type: 'doc', content: [{ type: 'paragraph' }] },
            markdown: `${title}正文\n\n![现场](${image.src})`,
          },
        });
      }
    });
    await app.evaluate(({ dialog }, outputDirectory) => {
      dialog.showSaveDialog = (async (_window: unknown, options: Electron.SaveDialogOptions) => ({
        canceled: false,
        filePath: `${outputDirectory}/${options.defaultPath}`,
      })) as typeof dialog.showSaveDialog;
    }, outputDirectory);
    await page.getByRole('button', { name: '台账', exact: true }).click();
    await openSystemAction(page, '导出资料');
    const dialog = page.getByRole('dialog', { name: '导出系统资料', exact: true });
    const submit = dialog.getByRole('button', { name: '导出资料', exact: true });
    await expect(dialog.getByLabel('导出文档', { exact: true })).toBeChecked();
    await expect(dialog.getByLabel('导出任务', { exact: true })).toBeChecked();
    await expect(dialog.getByLabel('开始日期', { exact: true })).toHaveValue('');
    await expect(dialog.getByLabel('结束日期', { exact: true })).toHaveValue('');
    await dialog.getByLabel('导出文档', { exact: true }).focus();
    await page.keyboard.press('Space');
    await expect(dialog).toContainText('直接保存一个文件');
    await dialog.screenshot({ path: info.outputPath('export-options-light.png') });
    await submit.click();
    await expect(dialog.getByRole('status')).toContainText('共 1 个文件');
    const markdownPath = path.join(outputDirectory, '筛选平台-系统资料.md');
    let markdown = await fs.readFile(markdownPath, 'utf8');
    expect(markdown).toContain('范围内任务正文');
    expect(markdown).toContain('范围外任务正文');
    expect(markdown).not.toContain('不选时不导出的文档正文');
    expect(markdown).toContain('data:image/png;base64,');
    await dialog.getByLabel('开始日期', { exact: true }).fill('2025-10-21');
    await dialog.getByLabel('结束日期', { exact: true }).fill('2025-10-20');
    await expect(submit).toBeDisabled();
    await expect(dialog.getByRole('alert')).toContainText('开始日期不能晚于结束日期');
    await dialog.getByLabel('开始日期', { exact: true }).fill('2025-10-20');
    await dialog.getByLabel('结束日期', { exact: true }).fill('2025-10-21');
    await submit.click();
    await expect(dialog.getByRole('status')).toContainText('共 1 个文件');
    markdown = await fs.readFile(markdownPath, 'utf8');
    expect(markdown).toContain('范围内任务正文');
    expect(markdown).not.toContain('范围外任务正文');
    await dialog.getByLabel('Markdown', { exact: true }).uncheck();
    for (const [label, extension, signature] of [
      ['Word', 'docx', 'PK'],
      ['PDF', 'pdf', '%PDF'],
    ] as const) {
      await dialog.getByLabel(label, { exact: true }).check();
      await submit.click();
      await expect(dialog.getByRole('status')).toContainText(`系统资料.${extension}`, {
        timeout: 20000,
      });
      const file = path.join(outputDirectory, `筛选平台-系统资料.${extension}`);
      expect((await fs.readFile(file)).subarray(0, signature.length).toString()).toBe(signature);
      if (extension === 'docx') {
        const entries = await readZip(file);
        expect(entries.get('word/document.xml')!.toString()).toContain('范围内任务正文');
        expect(entries.get('word/document.xml')!.toString()).not.toContain('范围外任务正文');
        expect([...entries.keys()].some((name) => name.startsWith('word/media/'))).toBe(true);
      }
      await dialog.getByLabel(label, { exact: true }).uncheck();
    }
    await dialog.getByLabel('Markdown', { exact: true }).check();
    await dialog.getByLabel('导出任务', { exact: true }).uncheck();
    await expect(dialog.getByLabel('开始日期', { exact: true })).toHaveCount(0);
    await submit.click();
    await expect(dialog.getByRole('status')).toContainText('系统资料.md');
    expect(await fs.readFile(markdownPath, 'utf8')).not.toContain('任务正文');
    await dialog.getByLabel('导出文档', { exact: true }).check();
    await submit.click();
    await expect(dialog.getByRole('status')).toContainText('系统资料.zip');
    const bundle = await readZip(path.join(outputDirectory, '筛选平台-系统资料.zip'));
    expect(bundle.size).toBe(2);
    expect([...bundle.values()].map((bytes) => bytes.toString()).join('\n')).toContain(
      '不选时不导出的文档正文',
    );
    expect(bundle.get('Markdown/系统总览.md')!.toString()).not.toContain('任务正文');
    await dialog.getByLabel('导出任务', { exact: true }).check();
    await page.setViewportSize({ width: 760, height: 600 });
    await page.emulateMedia({ colorScheme: 'dark', reducedMotion: 'reduce', contrast: 'more' });
    await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark');
    for (const name of ['high-contrast', 'reduce-motion', 'reduce-transparency']) {
      await expect(page.locator('html')).toHaveAttribute(`data-${name}`, 'true');
    }
    await dialog.getByLabel('开始日期', { exact: true }).scrollIntoViewIfNeeded();
    await expect(dialog.getByLabel('开始日期', { exact: true })).toBeInViewport();
    expect(await dialog.evaluate((element) => element.scrollWidth <= element.clientWidth)).toBe(
      true,
    );
    await dialog.screenshot({ path: info.outputPath('export-options-dark-narrow.png') });
    await submit.scrollIntoViewIfNeeded();
    await expect(submit).toBeInViewport();
    await page.keyboard.press('Escape');
    await expect(dialog).toHaveCount(0);
    await expect(page.getByRole('button', { name: '当前系统更多操作', exact: true })).toBeFocused();
    await openSystemAction(page, '导出资料');
    await dialog.getByRole('button', { name: '关闭导出系统资料', exact: true }).click();
    await expect(dialog).toHaveCount(0);
  } finally {
    await app.close();
    await fs.rm(directory, { recursive: true, force: true });
  }
});

function readZip(output: string) {
  return new Promise<Map<string, Buffer>>((resolve, reject) => {
    yauzl.open(output, { lazyEntries: true }, (error, zip) => {
      if (error || !zip) return reject(error);
      const files = new Map<string, Buffer>();
      zip.on('error', reject);
      zip.on('end', () => resolve(files));
      zip.on('entry', (entry: yauzl.Entry) =>
        zip.openReadStream(entry, (error, stream) => {
          if (error || !stream) return reject(error);
          const chunks: Buffer[] = [];
          stream.on('data', (bytes) => chunks.push(bytes));
          stream.on('error', reject);
          stream.on('end', () => {
            files.set(entry.fileName, Buffer.concat(chunks));
            zip.readEntry();
          });
        }),
      );
      zip.readEntry();
    });
  });
}

test('系统资料分别导出 Markdown、Word、PDF，取消解锁无输出，图片和密码按选择保留', async ({}, testInfo) => {
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), 'workbench-export-ui-'));
  const output = testInfo.outputPath('system-export.zip');
  const env: Record<string, string> = { ...process.env, CLEVER_WORKBENCH_DATA_DIR: directory };
  delete env.ELECTRON_RUN_AS_NODE;
  const app = await electron.launch({ args: ['.'], env });
  try {
    const page = await app.firstWindow();
    await page.evaluate(async () => {
      const api = window.desktop;
      const systemId = (await api.mutate({ type: 'system.save', name: '订单平台' })).createdId!;
      await api.initializeVault('fictional-export-ui-password');
      await api.captureLedger({
        kind: 'server',
        systemId,
        environmentId: null,
        name: '应用节点',
        address: '192.0.2.10',
        fields: { 操作系统: 'Kylin Linux V10', CPU: '16 核', 内存: '32G', 硬盘: '500G' },
        username: 'deploy',
        password: 'fictional-server-export-password',
      });
      await api.saveSecret(
        (await api.snapshot()).accounts[0].id,
        'token',
        `workbench-asset://image/${'a'.repeat(64)}.png`,
      );
      const image = await api.importImage(
        Uint8Array.from(
          atob(
            'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR4nGNgqPr/HwAEcAJ5Qhlc0gAAAABJRU5ErkJggg==',
          ),
          (c) => c.charCodeAt(0),
        ),
        '现场.png',
      );
      const id = (await api.mutate({ type: 'document.create', context: { systemId } })).createdId!;
      await api.mutate({
        ...(await api.document(id)),
        type: 'document.edit',
        title: '排障说明',
        markdown: `## 处理步骤\n\n检查 **应用节点**。\n\n| 指标 | 状态 |\n| --- | --- |\n| 内存 | 正常 |\n\n![现场](${image.src})`,
      });
      await api.mutate({
        type: 'task.create',
        draft: {
          title: '整理部署文档',
          projectId: null,
          systemId,
          content: { type: 'doc', content: [{ type: 'paragraph' }] },
          markdown: '完整任务正文',
        },
      });
      await api.lockVault();
    });
    await app.evaluate(({ dialog }, output) => {
      dialog.showSaveDialog = (async () => ({
        canceled: false,
        filePath: output,
      })) as typeof dialog.showSaveDialog;
    }, output);
    await page.getByRole('button', { name: '台账', exact: true }).click();
    await openSystemAction(page, '导出资料');
    const dialog = page.getByRole('dialog', { name: '导出系统资料', exact: true });
    await dialog.getByLabel('Word', { exact: true }).check();
    await dialog.getByLabel('PDF', { exact: true }).check();
    await dialog.getByLabel('包含Token', { exact: true }).check();
    await expect(dialog.getByLabel('包含密码', { exact: true })).toBeChecked();
    await dialog.getByRole('button', { name: '导出资料', exact: true }).click();
    await page
      .getByRole('dialog', { name: '解锁秘密', exact: true })
      .getByRole('button', { name: '取消', exact: true })
      .click();
    await expect(fs.stat(output)).rejects.toThrow();
    await dialog.getByRole('button', { name: '导出资料', exact: true }).click();
    await page.getByLabel('主密码', { exact: true }).fill('fictional-export-ui-password');
    await page.getByRole('button', { name: '解锁', exact: true }).click();
    await expect(dialog.getByRole('status')).toContainText('系统资料已导出', { timeout: 20000 });
    await dialog.screenshot({ path: testInfo.outputPath('system-export-dialog.png') });
    const entries = await readZip(output);
    expect(entries.get('Markdown/系统总览.md')!.toString()).toContain(
      'fictional-server-export-password',
    );
    expect(entries.get('Markdown/系统总览.md')!.toString()).toContain(
      `workbench-asset://image/${'a'.repeat(64)}.png`,
    );
    expect([...entries.keys()].filter((name) => name.endsWith('.docx'))).toHaveLength(2);
    expect([...entries.keys()].filter((name) => name.endsWith('.pdf'))).toHaveLength(2);
    expect(entries.get('PDF/系统总览.pdf')!.subarray(0, 4).toString()).toBe('%PDF');
    expect([...entries.keys()].some((name) => name.startsWith('Markdown/图片/'))).toBe(true);
    expect(JSON.stringify(await page.evaluate(() => window.desktop.snapshot()))).not.toContain(
      'fictional-server-export-password',
    );
  } finally {
    await app.close();
    await fs.rm(directory, { recursive: true, force: true });
  }
});
