import { test, expect } from '@playwright/test';
import { electron } from './launch';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

test('全站共享外观在深浅主题和最小窗口可操作，长内容与浮层保持可达', async ({}, testInfo) => {
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), 'workbench-unified-appearance-'));
  const env: Record<string, string> = { ...process.env, CLEVER_WORKBENCH_DATA_DIR: directory };
  delete env.ELECTRON_RUN_AS_NODE;
  const app = await electron.launch({ args: ['.'], env });
  try {
    const page = await app.firstWindow(),
      errors: string[] = [];
    page.on('pageerror', (error) => errors.push(error.message));
    await page.evaluate(async () => {
      const api = window.desktop,
        content = {
          type: 'doc',
          content: [
            { type: 'paragraph', content: [{ type: 'text', text: '记录排查过程与处理结论。' }] },
          ],
        };
      const systemId = (await api.mutate({ type: 'system.save', name: '订单平台' })).createdId!;
      const tagIds: string[] = [];
      for (const [name, color] of [
        ['排障', 'red'],
        ['本周', 'blue'],
        ['发布验收', 'green'],
      ] as const)
        tagIds.push((await api.mutate({ type: 'task-tag.save', name, color })).createdId!);
      const now = Math.floor(Date.now() / 60000) * 60000;
      for (const [title, offset] of [
        ['检查生产数据库备份与恢复记录', -3600000],
        ['联调支付回调并核对订单状态', 3600000],
        ['整理系统升级方案及回滚步骤', 10 * 86400000],
      ] as const)
        await api.mutate({
          type: 'task.create',
          draft: {
            title,
            systemId,
            projectId: null,
            content,
            markdown: '记录排查过程与处理结论。',
            dueAt: { kind: 'time', value: now + offset },
            tagIds,
          },
        });
      const id = (await api.mutate({ type: 'document.create' })).createdId!;
      await api.mutate({
        type: 'document.edit',
        id,
        title: '生产环境发布检查与回滚步骤',
        projectId: null,
        systemId: null,
        environmentId: null,
        resourceId: null,
        content,
        markdown: '记录排查过程与处理结论。',
      });
      await api.mutate({
        type: 'access.save',
        systemId,
        name: '构建与发布',
        addresses: [
          {
            label: '内部入口',
            url: 'https://build.example.test/a/long/path/to/release/production',
          },
        ],
      });
    });
    for (const [theme, width, height] of [
      ['light', 1380, 880],
      ['dark', 1380, 880],
      ['dark', 820, 600],
    ] as const) {
      await app.evaluate(
        ({ BrowserWindow }, size) =>
          BrowserWindow.getAllWindows()[0].setContentSize(size[0], size[1]),
        [width, height],
      );
      await page.evaluate((theme) => window.desktop.mutate({ type: 'settings', theme }), theme);
      await expect(page.locator('html')).toHaveAttribute('data-theme', theme);
      for (const [name, selector] of [
        ['工作台', '.home-content'],
        ['工作任务', '.task-page'],
        ['台账', '.ledger-workspace'],
        ['文档', '.documents-layout'],
        ['工具', '.tools-content'],
        ['工作回顾', '.review'],
        ['项目档案', '.archive-page'],
        ['回收站', '.task-page'],
        ['设置', '.settings-page'],
      ]) {
        const navigation = page.locator('.sidebar').getByRole('button', { name, exact: true });
        await expect(navigation).toBeInViewport({ ratio: 1 });
        await navigation.click();
        await expect(page.locator(selector)).toBeVisible();
        if (name === '设置')
          await expect(page.getByRole('switch', { name: '自动备份', exact: true })).toBeVisible();
        if (name === '文档') await expect(page.locator('.document-list-row')).toHaveCount(1);
        if (name === '工作台') await expect(page.locator('.home-task')).toHaveCount(3);
        if (name === '台账')
          await expect(
            page.getByRole('button', { name: '新增访问入口', exact: true }),
          ).toBeVisible();
        if (name === '文档') {
          await page.locator('.document-list-row').click();
          await expect(page.getByLabel('文档标题', { exact: true })).toHaveValue(
            '生产环境发布检查与回滚步骤',
          );
        }
        expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(
          true,
        );
        await page.screenshot({
          path: testInfo.outputPath(`${theme}-${width}-${name}.png`),
          animations: 'disabled',
        });
      }
      await page.getByRole('button', { name: '工作任务', exact: true }).click();
      await page.locator('.task-open').first().click();
      await page.locator('.task-properties > summary').click();
      await expect(page.getByLabel('预计完成日期', { exact: true })).toBeVisible();
      await page.locator('.task-properties > summary').click();
      await page.screenshot({
        path: testInfo.outputPath(`${theme}-${width}-任务详情.png`),
        animations: 'disabled',
      });
      await page.getByLabel('关闭详情').click();
      await page.getByRole('button', { name: '台账', exact: true }).click();
      await page.getByRole('button', { name: '新增访问入口', exact: true }).click();
      await expect(
        page.getByRole('button', { name: '关闭新增访问入口', exact: true }),
      ).toBeInViewport();
      await page.getByLabel('首个账号密码', { exact: true }).fill('fixture-appearance-secret');
      await page.screenshot({
        path: testInfo.outputPath(`${theme}-${width}-录入.png`),
        animations: 'disabled',
      });
      await page.keyboard.press('Escape');
      const discard = page.getByRole('dialog', { name: '放弃未提交的资料？', exact: true });
      await expect(discard).toBeVisible();
      await discard.getByRole('button', { name: '放弃录入', exact: true }).click();
      await expect(page.getByRole('dialog')).toHaveCount(0);
      await page.getByRole('button', { name: '工具', exact: true }).click();
      await page.getByRole('button', { name: '打开工具', exact: true }).click();
      await expect(page.getByRole('heading', { name: 'ZIP 文本归档', exact: true })).toBeVisible();
      await expect(page.getByLabel('待归档文件或目录', { exact: true })).toBeEnabled();
      await page.screenshot({
        path: testInfo.outputPath(`${theme}-${width}-归档工具.png`),
        animations: 'disabled',
      });
      await page.getByRole('button', { name: '快速新建', exact: true }).click();
      await expect(page.getByRole('dialog', { name: '快速新建', exact: true })).toBeVisible();
      await page.screenshot({
        path: testInfo.outputPath(`${theme}-${width}-快速新建.png`),
        animations: 'disabled',
      });
      await page.keyboard.press('Escape');
    }
    await page.getByRole('button', { name: '设置', exact: true }).click();
    await page.getByRole('button', { name: '浅色', exact: true }).focus();
    await page.keyboard.press('ArrowRight');
    await expect(page.getByRole('button', { name: '深色', exact: true })).toBeFocused();
    await page.getByRole('switch', { name: '增强对比', exact: true }).check();
    await page.getByRole('switch', { name: '减少动态效果', exact: true }).check();
    await expect(page.locator('.sidebar')).toHaveCSS('backdrop-filter', 'none');
    await page.screenshot({
      path: testInfo.outputPath('accessible-820.png'),
      animations: 'disabled',
    });
    expect(errors).toEqual([]);
  } finally {
    await app.close();
    await fs.rm(directory, { recursive: true, force: true });
  }
});
