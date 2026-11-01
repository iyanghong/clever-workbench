import { electron } from './launch';
import { test, expect, type Page } from '@playwright/test';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

const apps: Awaited<ReturnType<typeof electron.launch>>[] = [];
const roots: string[] = [];
test.afterEach(async () => {
  for (const app of apps.splice(0)) await app.close();
  for (const root of roots.splice(0)) await fs.rm(root, { recursive: true, force: true });
});

async function openTool(title: string): Promise<Page> {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'workbench-productivity-tools-'));
  roots.push(root);
  const env: Record<string, string> = { ...process.env, CLEVER_WORKBENCH_DATA_DIR: root };
  delete env.ELECTRON_RUN_AS_NODE;
  const app = await electron.launch({ args: ['.'], env });
  apps.push(app);
  const page = await app.firstWindow();
  await page
    .getByRole('navigation', { name: '工作空间' })
    .getByRole('button', { name: '工具', exact: true })
    .click();
  const card = page
    .getByRole('article')
    .filter({ has: page.getByRole('heading', { name: title, exact: true }) });
  await card.getByRole('button', { name: '打开工具' }).click();
  await expect(page.getByRole('heading', { name: title, exact: true })).toBeVisible();
  return page;
}

test('配置对比自动出现在目录并报告 JSON 修改', async () => {
  const page = await openTool('配置对比');
  await page.getByLabel('对比格式').selectOption('json');
  await page.getByLabel('原始配置').fill('{"b":2,"a":1}');
  await page.getByLabel('对比配置').fill('{"a":1,"b":3}');
  await page.getByRole('button', { name: '开始对比' }).click();
  await expect(page.getByText('新增 1 行，删除 1 行，相同 3 行')).toBeVisible();
});

test('数据格式助手按路径提取本地 JSON', async () => {
  const page = await openTool('数据格式助手');
  await page.getByLabel('JSON 操作').selectOption('query');
  await page.getByLabel('JSON 路径').fill('$.service.nodes[0].address');
  await page.getByLabel('JSON 输入').fill('{"service":{"nodes":[{"address":"127.0.0.1"}]}}');
  await page.getByRole('button', { name: '处理数据' }).click();
  await expect(page.getByLabel('JSON 输出')).toHaveValue('"127.0.0.1"');
});

test('时间与 Cron 转换时间并预测五次执行', async () => {
  const page = await openTool('时间与 Cron');
  await page.getByLabel('时间戳或日期时间').fill('0');
  await page.getByRole('button', { name: '转换时间' }).click();
  await expect(page.getByText('1970-01-01T00:00:00.000Z')).toBeVisible();
  await page.getByLabel('Cron 表达式').fill('0 9 * * *');
  await page.getByRole('button', { name: '解释并预测' }).click();
  await expect(page.getByText('每天 09:00 执行')).toBeVisible();
  await expect(page.getByRole('list', { name: '未来执行时间' }).getByRole('listitem')).toHaveCount(
    5,
  );
});

test('批量文本处理按行去重并统计结果', async () => {
  const page = await openTool('批量文本处理');
  await page.getByLabel('文本处理方式').selectOption('dedupe');
  await page.getByLabel('批量文本输入').fill('b\na\na');
  await page.getByRole('button', { name: '处理文本' }).click();
  await expect(page.getByLabel('批量文本输出')).toHaveValue('b\na');
  await expect(page.getByText('3 行 → 2 行；5 字符 → 3 字符')).toBeVisible();
});

test('表格数据在 CSV 与 JSON 之间双向转换', async () => {
  const page = await openTool('表格数据转换');
  const csv = 'name,note\n订单,"第一行\n第二行"';
  await page.getByLabel('表格数据输入').fill(csv);
  await page.getByRole('button', { name: '转换数据' }).click();
  await expect(page.getByText('1 行数据，2 列')).toBeVisible();
  const json = await page.getByLabel('表格数据输出').inputValue();
  expect(JSON.parse(json)).toEqual([{ name: '订单', note: '第一行\n第二行' }]);
  await page.getByLabel('表格转换方向').selectOption('json-csv');
  await page.getByLabel('表格数据输入').fill(json);
  await page.getByRole('button', { name: '转换数据' }).click();
  await expect(page.getByLabel('表格数据输出')).toHaveValue(csv);
});

test('新增工具布局支持深浅主题与窄窗口', async () => {
  const page = await openTool('批量文本处理');
  for (const [theme, width] of [
    ['light', 1280],
    ['dark', 760],
  ] as const) {
    await page.setViewportSize({ width, height: 850 });
    await page.evaluate((theme) => window.desktop.mutate({ type: 'settings', theme }), theme);
    await expect(page.locator('html')).toHaveAttribute('data-theme', theme);
    await expect(page.getByLabel('批量文本输入')).toBeVisible();
    await expect(page.getByLabel('批量文本输出')).toBeVisible();
    expect(
      await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth),
    ).toBe(false);
  }
});
