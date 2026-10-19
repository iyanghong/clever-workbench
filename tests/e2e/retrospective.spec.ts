import { electron } from './launch';
import { test, expect } from '@playwright/test';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

test('月度回顾和系统全貌可定位跨月与同日任务，重开后完成计数更新', async ({}, testInfo) => {
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), 'workbench-timeline-ui-'));
  const env: Record<string, string> = { ...process.env, CLEVER_WORKBENCH_DATA_DIR: directory };
  delete env.ELECTRON_RUN_AS_NODE;
  const app = await electron.launch({ args: ['.'], env });
  try {
    const page = await app.firstWindow();
    const fixture = await page.evaluate(async () => {
      const now = new Date(),
        year = now.getFullYear(),
        month = now.getMonth();
      const projectId = (await window.desktop.mutate({ type: 'system.save', name: '迭代回顾' }))
        .createdId!;
      const make = async (title: string, start: number, end?: number) => {
        const id = (
          await window.desktop.mutate({
            type: 'task.create',
            draft: {
              title,
              markdown: '',
              content: { type: 'doc', content: [{ type: 'paragraph' }] },
              systemId: projectId,
              projectId: null,
              startedAt: start,
            },
          })
        ).createdId!;
        if (end !== undefined)
          await window.desktop.mutate({
            type: 'task.complete',
            id,
            complete: true,
            completedAt: end,
          });
      };
      await make(
        '跨月处理',
        new Date(year, month - 1, 28).getTime(),
        new Date(year, month, 1).getTime(),
      );
      await make(
        '同日处理',
        new Date(year, month, 1).getTime(),
        new Date(year, month, 1).getTime(),
      );
      await make('持续跟进', new Date(year, month - 1, 20).getTime());
      return {
        projectId,
        previous: `${new Date(year, month - 1, 1).getFullYear()}-${String(new Date(year, month - 1, 1).getMonth() + 1).padStart(2, '0')}`,
        current: `${year}-${String(month + 1).padStart(2, '0')}`,
      };
    });
    await page.getByRole('button', { name: '工作回顾', exact: true }).click();
    const stat = (label: string) =>
      page
        .locator('.review-stats > div')
        .filter({ has: page.getByText(label, { exact: true }) })
        .locator('strong');
    await expect(stat('本月涉及任务')).toHaveText('03');
    await expect(stat('本月完成任务')).toHaveText('02');
    await page.getByLabel('回顾月份').fill(fixture.previous);
    await expect(stat('本月涉及任务')).toHaveText('02');
    await expect(stat('本月完成任务')).toHaveText('00');
    await page.getByRole('button', { name: '系统回顾', exact: true }).click();
    await page.getByLabel('回顾系统').selectOption(fixture.projectId);
    await expect(page.locator('.timeline-row')).toHaveCount(3);
    await page.locator('.timeline-row').filter({ hasText: '同日处理' }).click();
    await expect(page.getByLabel('任务标题', { exact: true })).toHaveValue('同日处理');
    await page.getByRole('button', { name: '重新打开', exact: true }).click();
    await page.getByLabel('关闭详情').click();
    await page.getByRole('button', { name: '工作回顾', exact: true }).click();
    await page.getByRole('button', { name: '月度回顾', exact: true }).click();
    await page.getByLabel('回顾月份').fill(fixture.current);
    await expect(stat('本月完成任务')).toHaveText('01');
    await expect(page.getByText('跨度用于回顾，不代表实际工时')).toBeVisible();
    await page.screenshot({ path: testInfo.outputPath('retrospective.png') });
  } finally {
    await app.close();
    await fs.rm(directory, { recursive: true, force: true });
  }
});
