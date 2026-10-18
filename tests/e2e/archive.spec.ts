import { electron } from './launch';
import { test, expect } from '@playwright/test';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

test('归档项目能查看文档和完成任务，长期账号可编辑，重开时明确恢复项目', async () => {
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), 'workbench-archive-ui-'));
  const env: Record<string, string> = { ...process.env, CLEVER_WORKBENCH_DATA_DIR: directory };
  delete env.ELECTRON_RUN_AS_NODE;
  const app = await electron.launch({ args: ['.'], env });
  try {
    const page = await app.firstWindow();
    await page.evaluate(async () => {
      const projectId = (
        await window.desktop.mutate({ type: 'project.create', name: '阶段项目', color: '#007aff' })
      ).createdId!;
      const systemId = (
        await window.desktop.mutate({ type: 'system.save', name: '长期系统', projectId })
      ).createdId!;
      const environmentId = (
        await window.desktop.mutate({ type: 'environment.save', systemId, name: '生产' })
      ).createdId!;
      await window.desktop.mutate({ type: 'account.save', environmentId, name: '超管' });
      const doc = (await window.desktop.mutate({ type: 'document.create', context: { systemId } }))
        .createdId!;
      const document = await window.desktop.document(doc);
      await window.desktop.mutate({
        ...document,
        type: 'document.edit',
        title: '阶段复盘',
        markdown: '历史记录保持可读。',
      });
      const task = (
        await window.desktop.mutate({
          type: 'task.create',
          draft: {
            title: '阶段收尾',
            content: { type: 'doc', content: [{ type: 'paragraph' }] },
            markdown: '',
            projectId,
            systemId,
          },
        })
      ).createdId!;
      await window.desktop.mutate({ type: 'task.complete', id: task, complete: true });
      await window.desktop.mutate({ type: 'project.archive', id: projectId, archived: true });
    });
    await page.getByRole('button', { name: '归档项目', exact: true }).click();
    await page
      .getByRole('button', { name: '查看项目文档 阶段项目', exact: true })
      .click({ timeout: 3000 });
    await page.getByRole('button', { name: '文档 阶段复盘', exact: true }).click();
    await expect(page.getByRole('textbox', { name: '工作内容' })).toContainText('历史记录');
    await page.getByRole('button', { name: '台账', exact: true }).click();
    await expect(page.getByLabel('当前项目', { exact: true })).toHaveValue('');
    await page.getByRole('tab', { name: '账号', exact: true }).click();
    await page.getByLabel('账号用户名', { exact: true }).fill('ops');
    await page.getByRole('button', { name: '归档项目', exact: true }).click();
    await page.getByRole('button', { name: /阶段项目.*归档/ }).click();
    await page.getByRole('button', { name: /阶段收尾.*阶段项目/ }).click();
    await page.getByRole('button', { name: '重新打开', exact: true }).click();
    await expect(page.getByRole('dialog')).toContainText('恢复');
    await page.getByRole('button', { name: '恢复并重新打开', exact: true }).click();
    await expect(page.getByRole('button', { name: '标记完成', exact: true })).toBeVisible();
    await page.getByRole('button', { name: '回收站', exact: true }).click();
    await page.getByRole('button', { name: '文档回收站', exact: true }).click();
    await expect(page.getByRole('button', { name: '文档回收站', exact: true })).toHaveAttribute(
      'aria-pressed',
      'true',
    );
  } finally {
    await app.close();
    await fs.rm(directory, { recursive: true, force: true });
  }
});
