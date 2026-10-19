import { openLedgerRecord } from './ledger-actions';
import { electron } from './launch';
import { test, expect } from '@playwright/test';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

test('归档项目能查看文档和完成任务，长期账号可编辑，重开不改变项目归档状态', async () => {
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
    await page.getByRole('button', { name: '项目档案', exact: true }).click();
    await expect(page.locator('.workspace-management-row')).toContainText('阶段项目 · 已归档');
    await page.getByLabel('文档', { exact: true }).click();
    await page.getByRole('button', { name: '文档 阶段复盘', exact: true }).click();
    await expect(page.getByRole('textbox', { name: '工作内容' })).toContainText('历史记录');
    await page.getByRole('button', { name: '台账', exact: true }).click();
    await openLedgerRecord(page, '账号', '超管', true);
    await page.getByLabel('账号用户名', { exact: true }).fill('ops');
    await page.getByRole('button', { name: '工作任务', exact: true }).click();
    await page.getByRole('button', { name: /^已完成/ }).click();
    await page.locator('.task-open').filter({ hasText: '阶段收尾' }).click();
    await page.getByRole('button', { name: '重新打开', exact: true }).click();
    await expect(page.getByRole('button', { name: '标记完成', exact: true })).toBeVisible();
    const state = await page.evaluate(() => window.desktop.snapshot());
    expect(state.projects[0].archivedAt).not.toBeNull();
    expect(state.accounts[0].username).toBe('ops');
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
