import { selectChoice } from './antd-controls';
import { expect, type Page } from '@playwright/test';
import { sharedDesktopTests } from './shared-desktop';

const test = sharedDesktopTests('productivity-tools');

test.beforeEach(async ({ page }) => {
  await page.setViewportSize({ width: 1380, height: 850 });
  await page.emulateMedia({ reducedMotion: null });
  await page.evaluate(() =>
    window.desktop.mutate({ type: 'settings', theme: 'system', reduceMotion: false }),
  );
  await page
    .getByRole('navigation', { name: '工作空间' })
    .getByRole('menuitem', { name: '工具', exact: true })
    .click();
});

async function openTool(page: Page, title: string) {
  await page.getByRole('button', { name: title, exact: true }).click();
  await expect(page.getByRole('heading', { name: title, exact: true })).toBeVisible();
}

test('整张工具卡片可点击，收藏独立，键盘和减少动态效果可用', async ({ page }, info) => {
  await page.emulateMedia({ reducedMotion: 'no-preference' });
  await page.evaluate(() =>
    window.desktop.mutate({ type: 'settings', theme: 'dark', reduceMotion: false }),
  );
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark');
  const enter = page.getByRole('button', { name: '配置对比', exact: true });
  const card = page.getByRole('article').filter({ has: enter });
  const padding = { x: 110, y: 22 };
  await card.hover({ position: padding });
  await expect(card).not.toHaveCSS('transform', 'none');
  await page.screenshot({ path: info.outputPath('tools-dark-hover.png') });
  await card.click({ position: padding });
  await expect(page.getByLabel('原始配置')).toBeVisible();
  await page.getByRole('button', { name: '工具', exact: true }).click();
  await card.getByRole('button', { name: '设为常用工具' }).click();
  await expect(card.getByRole('button', { name: '移出常用工具' })).toBeVisible();
  await page.setViewportSize({ width: 820, height: 650 });
  await page.evaluate(() =>
    window.desktop.mutate({ type: 'settings', theme: 'light', reduceMotion: true }),
  );
  await card.hover({ position: padding });
  await expect(page.locator('html')).toHaveAttribute('data-reduce-motion', 'true');
  await expect(card).toHaveCSS('transform', 'none');
  await page.screenshot({ path: info.outputPath('tools-light-narrow.png') });
  await enter.focus();
  await page.keyboard.press('Tab');
  await expect(card.getByRole('button', { name: '移出常用工具' })).toBeFocused();
  await page.keyboard.press('Shift+Tab');
  await expect(enter).toBeFocused();
  await expect(card).toHaveCSS('outline-style', 'solid');
  await page.keyboard.press('Enter');
  await expect(page.getByLabel('原始配置')).toBeVisible();
  await page.evaluate(() =>
    window.desktop.mutate({ type: 'favorite.set', kind: 'tool', id: 'config-diff', pinned: false }),
  );
});

test('配置对比自动出现在目录并报告 JSON 修改', async ({ page }) => {
  await openTool(page, '配置对比');
  await selectChoice(page.getByLabel('对比格式'), 'json');
  await page.getByLabel('原始配置').fill('{"b":2,"a":1}');
  await page.getByLabel('对比配置').fill('{"a":1,"b":3}');
  await page.getByRole('button', { name: '开始对比' }).click();
  await expect(page.getByText('新增 1 行，删除 1 行，相同 3 行')).toBeVisible();
});

test('数据格式助手按路径提取本地 JSON', async ({ page }) => {
  await openTool(page, '数据格式助手');
  await selectChoice(page.getByLabel('JSON 操作'), 'query');
  await page.getByLabel('JSON 路径').fill('$.service.nodes[0].address');
  await page.getByLabel('JSON 输入').fill('{"service":{"nodes":[{"address":"127.0.0.1"}]}}');
  await page.getByRole('button', { name: '处理数据' }).click();
  await expect(page.getByLabel('JSON 输出')).toHaveValue('"127.0.0.1"');
});

test('时间与 Cron 转换时间并预测五次执行', async ({ page }) => {
  await openTool(page, '时间与 Cron');
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

test('批量文本处理按行去重并统计结果', async ({ page }) => {
  await openTool(page, '批量文本处理');
  await selectChoice(page.getByLabel('文本处理方式'), 'dedupe');
  await page.getByLabel('批量文本输入').fill('b\na\na');
  await page.getByRole('button', { name: '处理文本' }).click();
  await expect(page.getByLabel('批量文本输出')).toHaveValue('b\na');
  await expect(page.getByText('3 行 → 2 行；5 字符 → 3 字符')).toBeVisible();
});

test('表格数据在 CSV 与 JSON 之间双向转换', async ({ page }) => {
  await openTool(page, '表格数据转换');
  const csv = 'name,note\n订单,"第一行\n第二行"';
  await page.getByLabel('表格数据输入').fill(csv);
  await page.getByRole('button', { name: '转换数据' }).click();
  await expect(page.getByText('1 行数据，2 列')).toBeVisible();
  const json = await page.getByLabel('表格数据输出').inputValue();
  expect(JSON.parse(json)).toEqual([{ name: '订单', note: '第一行\n第二行' }]);
  await selectChoice(page.getByLabel('表格转换方向'), 'json-csv');
  await page.getByLabel('表格数据输入').fill(json);
  await page.getByRole('button', { name: '转换数据' }).click();
  await expect(page.getByLabel('表格数据输出')).toHaveValue(csv);
});

test('新增工具布局支持深浅主题与窄窗口', async ({ page }) => {
  await openTool(page, '批量文本处理');
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
