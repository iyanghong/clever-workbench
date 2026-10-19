import { test, expect } from '@playwright/test';
import { electron } from './launch';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

test('任务页系统范围可在具体系统、未关联系统和全部之间切换', async () => {
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), 'workbench-project-filter-'));
  const env: Record<string, string> = { ...process.env, CLEVER_WORKBENCH_DATA_DIR: directory };
  delete env.ELECTRON_RUN_AS_NODE;
  const app = await electron.launch({ args: ['.'], env });
  try {
    const page = await app.firstWindow();
    const projects = await page.evaluate(async () => {
      const api = window.desktop;
      const a = (await api.mutate({ type: 'system.save', name: '系统 A' })).createdId!;
      const b = (await api.mutate({ type: 'system.save', name: '系统 B' })).createdId!;
      for (const [title, projectId] of [
        ['A 系统专属任务', a],
        ['B 系统专属任务', b],
        ['未关联系统任务', null],
      ] as const)
        await api.mutate({
          type: 'task.create',
          draft: {
            title,
            systemId: projectId,
            projectId: null,
            markdown: '',
            content: { type: 'doc', content: [{ type: 'paragraph' }] },
          },
        });
      return { a, b };
    });
    await page.getByRole('button', { name: '工作任务', exact: true }).click({ timeout: 3000 });
    const scope = page.getByLabel('系统范围', { exact: true });
    await expect(page.getByText('A 系统专属任务', { exact: true })).toBeVisible();
    await expect(page.getByText('B 系统专属任务', { exact: true })).toBeVisible();
    // DOM selection bypasses Electron's native hit testing, so verify the mouse
    // target is excluded from a draggable title bar as well as checking filtering.
    const draggable = await scope.evaluate((element) => {
      for (let node: Element | null = element; node; node = node.parentElement) {
        const region = getComputedStyle(node).getPropertyValue('app-region');
        if (region === 'no-drag') return false;
        if (region === 'drag') return true;
      }
      return false;
    });
    expect(draggable, '系统选择控件必须接收原生鼠标点击，不能成为窗口拖动区域').toBe(false);
    await scope.selectOption(projects.a);
    await expect(scope).toHaveValue(projects.a, { timeout: 1500 });
    await expect(page.getByText('A 系统专属任务', { exact: true })).toBeVisible();
    await expect(page.getByText('B 系统专属任务', { exact: true })).toHaveCount(0);
    await scope.selectOption(projects.b);
    await expect(scope).toHaveValue(projects.b);
    await expect(page.getByText('B 系统专属任务', { exact: true })).toBeVisible();
    await expect(page.getByText('A 系统专属任务', { exact: true })).toHaveCount(0);
    await scope.selectOption('none');
    await expect(scope).toHaveValue('none');
    await expect(page.getByText('未关联系统任务', { exact: true })).toBeVisible();
    await expect(page.getByText('B 系统专属任务', { exact: true })).toHaveCount(0);
    await scope.selectOption('all');
    await expect(page.getByText('A 系统专属任务', { exact: true })).toBeVisible();
    await expect(page.getByText('B 系统专属任务', { exact: true })).toBeVisible();
  } finally {
    await app.close();
    await fs.rm(directory, { recursive: true, force: true });
  }
});
