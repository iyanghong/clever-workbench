import { test, expect } from '@playwright/test';
import { electron } from './launch';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

test('任务标题在紧凑与正常列表中保持完整行高', async ({}, info) => {
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), 'workbench-task-layout-'));
  const env: Record<string, string> = { ...process.env, CLEVER_WORKBENCH_DATA_DIR: directory };
  delete env.ELECTRON_RUN_AS_NODE;
  const app = await electron.launch({ args: ['.'], env });
  try {
    const page = await app.firstWindow();
    await page.evaluate(async () => {
      const systemId = (await window.desktop.mutate({ type: 'system.save', name: '示例系统' }))
        .createdId!;
      for (const title of ['费用核对与接口联调', '【配置检查】'.repeat(12) + '发布及回滚计划'])
        await window.desktop.mutate({
          type: 'task.create',
          draft: {
            title,
            systemId,
            projectId: null,
            markdown: '',
            content: { type: 'doc', content: [{ type: 'paragraph' }] },
          },
        });
      await window.desktop.mutate({ type: 'settings', reduceMotion: true });
    });
    await page.getByRole('menuitem', { name: '工作任务', exact: true }).click();
    await expect(page.locator('.task-title')).toHaveCount(2);
    for (const theme of ['dark', 'light'] as const) {
      await page.evaluate((theme) => window.desktop.mutate({ type: 'settings', theme }), theme);
      await expect(page.locator('html')).toHaveAttribute('data-theme', theme);
      for (const width of [1380, 820]) {
        await page.setViewportSize({ width, height: 838 });
        for (const layout of ['compact', 'normal'] as const) {
          await page
            .getByRole('radio', { name: layout === 'compact' ? '紧凑' : '正常', exact: true })
            .locator('..')
            .click();
          await page.screenshot({ path: info.outputPath(`${theme}-${width}-${layout}.png`) });
          await expect
            .poll(
              () =>
                page.locator('.task-title').evaluateAll((titles) =>
                  titles.flatMap((title) => {
                    const box = title.getBoundingClientRect();
                    const range = document.createRange();
                    range.selectNodeContents(title);
                    const text = range.getBoundingClientRect();
                    return text.height > box.height + 1 ||
                      text.top < box.top - 1 ||
                      text.bottom > box.bottom + 1
                      ? [
                          {
                            text: title.textContent,
                            titleHeight: box.height,
                            textHeight: text.height,
                          },
                        ]
                      : [];
                  }),
                ),
              {
                message: `${theme} / ${width}px / ${layout}：标题文字不能被纵向裁切`,
                timeout: 2000,
              },
            )
            .toEqual([]);
          await expect
            .poll(() =>
              page
                .locator('.task-row')
                .first()
                .evaluate((row) => row.getBoundingClientRect().height),
            )
            .toBe(layout === 'compact' ? 44 : 68);
        }
      }
    }
  } finally {
    await app.close();
    await fs.rm(directory, { recursive: true, force: true });
  }
});
