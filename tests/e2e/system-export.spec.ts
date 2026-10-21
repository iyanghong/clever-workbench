import { openSystemAction } from './ledger-actions';
import { test, expect } from '@playwright/test';
import { electron } from './launch';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import yauzl from 'yauzl';

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
    await dialog.getByRole('button', { name: '导出资料包', exact: true }).click();
    await page
      .getByRole('dialog', { name: '解锁秘密', exact: true })
      .getByRole('button', { name: '取消', exact: true })
      .click();
    await expect(fs.stat(output)).rejects.toThrow();
    await dialog.getByRole('button', { name: '导出资料包', exact: true }).click();
    await page.getByLabel('主密码', { exact: true }).fill('fictional-export-ui-password');
    await page.getByRole('button', { name: '解锁', exact: true }).click();
    await expect(dialog.getByRole('status')).toContainText('系统资料包已导出', { timeout: 20000 });
    await dialog.screenshot({ path: testInfo.outputPath('system-export-dialog.png') });
    const entries = await new Promise<Map<string, Buffer>>((resolve, reject) => {
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
    expect(entries.get('Markdown/系统总览.md')!.toString()).toContain(
      'fictional-server-export-password',
    );
    expect(entries.get('Markdown/系统总览.md')!.toString()).toContain(
      `workbench-asset://image/${'a'.repeat(64)}.png`,
    );
    expect([...entries.keys()].filter((name) => name.endsWith('.docx'))).toHaveLength(3);
    expect([...entries.keys()].filter((name) => name.endsWith('.pdf'))).toHaveLength(3);
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
