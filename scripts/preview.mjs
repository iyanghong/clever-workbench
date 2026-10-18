import { _electron as electron } from '@playwright/test';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
const root = await fs.mkdtemp(path.join(os.tmpdir(), 'clever-workbench-preview-'));
const env = { ...process.env, CLEVER_WORKBENCH_DATA_DIR: root };
delete env.ELECTRON_RUN_AS_NODE;
const app = await electron.launch({ args: ['.'], env });
try {
  const page = await app.firstWindow();
  await page.getByRole('heading', { name: '工作任务' }).waitFor();
  await page.evaluate(async () => {
    const api = window.desktop,
      now = Math.floor(Date.now() / 60000) * 60000,
      day = 86400000;
    const projects = [];
    for (const [name, color] of [
      ['Clever Workbench', '#007aff'],
      ['产品迭代', '#34a271'],
      ['日常工作', '#af52de'],
    ])
      projects.push((await api.mutate({ type: 'project.create', name, color })).createdId);
    const example = {
      type: 'doc',
      content: [
        {
          type: 'paragraph',
          content: [{ type: 'text', text: '把输入的负担留给工具，让记录自然发生。' }],
        },
        { type: 'heading', attrs: { level: 2 }, content: [{ type: 'text', text: '这次做了什么' }] },
        {
          type: 'bulletList',
          content: [
            {
              type: 'listItem',
              content: [
                {
                  type: 'paragraph',
                  content: [{ type: 'text', text: '支持 Markdown 即时排版和代码块' }],
                },
              ],
            },
            {
              type: 'listItem',
              content: [
                {
                  type: 'paragraph',
                  content: [{ type: 'text', text: '直接粘贴截图，自动保存本地副本' }],
                },
              ],
            },
            {
              type: 'listItem',
              content: [
                {
                  type: 'paragraph',
                  content: [{ type: 'text', text: '切换任务前完成保存，继续记录更安心' }],
                },
              ],
            },
          ],
        },
        { type: 'heading', attrs: { level: 2 }, content: [{ type: 'text', text: '接下来' }] },
        {
          type: 'taskList',
          content: [
            {
              type: 'taskItem',
              attrs: { checked: true },
              content: [
                { type: 'paragraph', content: [{ type: 'text', text: '验证文字与图片备份恢复' }] },
              ],
            },
            {
              type: 'taskItem',
              attrs: { checked: false },
              content: [
                {
                  type: 'paragraph',
                  content: [{ type: 'text', text: '再检查一次浅色与深色模式' }],
                },
              ],
            },
          ],
        },
        {
          type: 'codeBlock',
          attrs: { language: 'typescript' },
          content: [{ type: 'text', text: 'await saveTask({\n  title, content, projectId\n});' }],
        },
      ],
    };
    const examples = [
      ['完善任务编辑与图片粘贴', 0, 3, false],
      ['修复登录会话过期问题', 1, 4, false],
      ['整理本周的技术复盘', 2, 1, false],
      ['完成订单导出功能', 1, 7, false],
      ['更新接口与交付文档', 2, 2, false],
      ['完成项目归档入口', 0, 9, true],
      ['优化列表的键盘操作', 0, 6, true],
      ['补充备份恢复验证', 0, 5, true],
    ];
    for (const [title, project, days, done] of examples) {
      const id = (
        await api.mutate({
          type: 'task.create',
          draft: {
            title,
            content: example,
            markdown: '## 工作记录\n支持 Markdown 和本地图片',
            projectId: projects[project],
            startedAt: now - days * day,
          },
        })
      ).createdId;
      if (done)
        await api.mutate({ type: 'task.complete', id, complete: true, completedAt: now - day });
    }
  });
  await page.reload();
  await page.getByRole('button', { name: /完善任务编辑与图片粘贴.*Clever Workbench/ }).click();
  await page.getByRole('textbox', { name: '工作内容' }).waitFor();
  await page.getByRole('textbox', { name: '工作内容' }).waitFor();
  await page.screenshot({ animations: 'disabled', path: 'docs/screenshots/workspace.png' });
  await page.getByLabel('关闭详情').click();
  await page.getByRole('button', { name: '工作回顾', exact: true }).click();
  await page.locator('.timeline-row').first().waitFor();
  await page.screenshot({ animations: 'disabled', path: 'docs/screenshots/timeline.png' });
  await page.getByRole('button', { name: '设置', exact: true }).click();
  await page.getByRole('button', { name: '深色', exact: true }).click();
  await page
    .getByRole('button', { name: /工作任务/ })
    .first()
    .click();
  await page.getByRole('button', { name: /完善任务编辑与图片粘贴.*Clever Workbench/ }).click();
  await page.getByRole('textbox', { name: '工作内容' }).waitFor();
  await page.screenshot({ animations: 'disabled', path: 'docs/screenshots/workspace-dark.png' });
  console.log('Preview screenshots generated with isolated example data.');
} finally {
  await app.close();
  await fs.rm(root, { recursive: true, force: true });
}
