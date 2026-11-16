import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import { existsSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium, expect } from '@playwright/test';

const directory = path.dirname(fileURLToPath(import.meta.url));
const evidence = path.join(directory, 'evidence');
await fs.mkdir(evidence, { recursive: true });
const base = process.env.DEMO_URL || 'http://127.0.0.1:5186/';
const installed = chromium.executablePath();
const executablePath =
  process.env.DEMO_BROWSER ||
  (existsSync(installed)
    ? installed
    : '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome');
const browser = await chromium.launch({ executablePath, headless: true });
const errors = [],
  warnings = new Set(),
  checks = [];
const routes = [
  ['home', '让今天的工作，井然有序。'],
  ...['access', 'accounts', 'servers', 'resources', 'services', 'operations', 'documents'].map(
    (c) => [`ledger/${c}/orders`, '技术台账'],
  ),
  ['ledger/access/finance', '技术台账'],
  ['ledger/servers/operations', '技术台账'],
  ['tasks', '工作任务'],
  ['tasks/t1', '工作任务'],
  ['documents/d0', '技术文档'],
  ['tools', '内置工具'],
  ['tools/zip-text', 'ZIP 文本归档'],
  ['tools/config-diff', '配置对比'],
  ['tools/data-format', '数据格式助手'],
  ['tools/time-cron', '时间与 Cron'],
  ['tools/text-transform', '批量文本处理'],
  ['tools/table-data', '表格数据转换'],
  ['review', '工作回顾'],
  ['archive', '项目档案'],
  ['trash', '回收站'],
  ...['appearance', 'vault', 'backup', 'about', 'guidance'].map((s) => [`settings/${s}`, '设置']),
];
const screenshotRoutes = new Set([
  'home',
  'ledger/servers/orders',
  'tasks/t1',
  'documents/d0',
  'tools',
  'tools/config-diff',
  'review',
  'settings/appearance',
  'trash',
]);
const context = await browser.newContext({
  offline: base.startsWith('file:'),
  viewport: { width: 1440, height: 960 },
  permissions: ['clipboard-read', 'clipboard-write'],
  timezoneId: 'Asia/Shanghai',
});
const page = await context.newPage();
page.setDefaultTimeout(8000);
const externalRequests = [];
page.on('request', (request) => {
  if (/^https?:/.test(request.url())) externalRequests.push(request.url());
});
page.on('pageerror', (e) => errors.push(e.message));
page.on('console', (m) => {
  if (m.type() === 'warning' || m.type() === 'error') warnings.add(m.text());
});
const go = async (route) => {
  await page.goto(`${base}#/${route}`);
  await expect(page.locator('.page-title h3')).toBeVisible();
};
const record = (name) => {
  checks.push(name);
  console.log(`PASS ${name}`);
};
try {
  await page.goto(base, { waitUntil: 'networkidle' });
  for (const config of [
    { name: 'light', width: 1440, height: 960, dark: false },
    { name: 'dark', width: 1440, height: 960, dark: true },
    { name: 'narrow', width: 820, height: 650, dark: false },
  ]) {
    await page.setViewportSize({ width: config.width, height: config.height });
    const isDark = await page.locator('.workbench.dark').count();
    if (Boolean(isDark) !== config.dark)
      await page.getByRole('button', { name: '切换主题', exact: true }).click();
    await page.mouse.move(0, 0);
    for (const [route, heading] of routes) {
      await go(route);
      await expect(page.locator('.page-title h3')).toHaveText(heading);
      await page.waitForTimeout(100);
      const overflow = await page.evaluate(() => ({
        width: innerWidth,
        scroll: document.documentElement.scrollWidth,
      }));
      assert.ok(
        overflow.scroll <= overflow.width + 1,
        `${config.name} ${route} 页面横向溢出：${JSON.stringify(overflow)}`,
      );
      if (screenshotRoutes.has(route))
        await page.screenshot({
          path: path.join(evidence, `${config.name}-${route.replaceAll('/', '-')}.png`),
          fullPage: true,
        });
    }
    record(`${config.name}: ${routes.length} 个页面显示正常，无页面横向溢出`);
  }
  await page.setViewportSize({ width: 1440, height: 960 });

  await go('ledger/servers/orders');
  const createTrigger = page.getByRole('button', { name: '新增服务器', exact: true });
  await createTrigger.click();
  let dialog = page.getByRole('dialog', { name: '新建服务器', exact: true });
  await dialog.getByRole('button', { name: '创建服务器', exact: true }).click();
  await expect(dialog.getByText('请填写服务器名称')).toBeVisible();
  await dialog.getByLabel('服务器名称', { exact: true }).fill('QA 演示服务器');
  await dialog.getByLabel('地址 / 连接信息', { exact: true }).fill('10.24.16.88');
  await dialog.getByLabel('适用环境', { exact: true }).click();
  await expect(page.locator('.ant-select-dropdown:visible').last()).toBeVisible();
  await page.locator('.ant-select-dropdown:visible .ant-select-item-option[title="测试"]').click();
  await page.keyboard.press('Escape');
  await page.screenshot({ path: path.join(evidence, 'dialog-create-server.png'), fullPage: true });
  await dialog.getByRole('button', { name: '创建服务器', exact: true }).click();
  await expect(dialog).not.toBeVisible();
  await expect(page.getByRole('button', { name: 'QA 演示服务器', exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'QA 演示服务器', exact: true }).click();
  await page.getByRole('button', { name: '编辑资料', exact: true }).click();
  await page.locator('.ant-drawer').getByLabel('名称', { exact: true }).fill('QA 已编辑服务器');
  await page.getByRole('button', { name: '保存修改', exact: true }).click();
  await expect(page.locator('.ant-drawer-title')).toContainText('QA 已编辑服务器');
  await page.locator('.ant-drawer-close').click();
  record('台账表单校验、弹窗内下拉选择、创建、编辑与返回');

  await page.getByRole('button', { name: '导出资料', exact: true }).click();
  const download = page.waitForEvent('download');
  await page.getByRole('button', { name: '导出演示资料', exact: true }).click();
  assert.ok((await download).suggestedFilename().endsWith('.md'));
  record('导出可下载的演示 Markdown 资料');
  await page.getByRole('button', { name: '批量录入', exact: true }).click();
  await page
    .getByLabel('批量资料', { exact: true })
    .fill('QA 批量服务器\t10.24.16.89\tUbuntu\t测试录入');
  await page.getByRole('button', { name: '确认录入', exact: true }).click();
  await expect(page.getByRole('button', { name: 'QA 批量服务器', exact: true })).toBeVisible();
  record('批量录入真实更新台账列表');
  await page.getByRole('button', { name: '系统配置', exact: true }).click();
  await page.getByRole('tab', { name: '环境管理', exact: true }).click();
  await page.getByRole('textbox', { name: '新增环境名称', exact: true }).fill('预生产');
  await page.getByRole('button', { name: '新增环境', exact: true }).click();
  await expect(page.getByRole('dialog').getByText('预生产', { exact: true })).toBeVisible();
  await page.keyboard.press('Escape');
  record('系统配置与环境管理');

  await go('tasks');
  await page.getByRole('button', { name: '新建任务', exact: true }).click();
  dialog = page.getByRole('dialog', { name: '新建任务', exact: true });
  await dialog.getByLabel('任务名称', { exact: true }).fill('QA 生命周期任务');
  await dialog.getByRole('button', { name: '创建任务', exact: true }).click();
  await expect(page.getByRole('textbox', { name: '任务标题' })).toHaveValue('QA 生命周期任务');
  const taskRoute = new URL(page.url()).hash.slice(2);
  await page.getByRole('button', { name: '标记完成', exact: true }).click();
  await page.getByRole('button', { name: '重新打开', exact: true }).click();
  await page.getByText('计划与标签', { exact: true }).click();
  await page.getByRole('textbox', { name: '任务预计完成', exact: true }).click();
  await expect(page.locator('.ant-picker-dropdown:visible')).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(page.locator('.ant-picker-dropdown:visible')).not.toBeVisible();
  await page.getByRole('button', { name: '删除任务', exact: true }).click();
  await page
    .locator('.ant-popconfirm:visible')
    .getByRole('button', { name: /^确\s*定$/ })
    .click();
  await go('trash');
  const trashRow = page.getByRole('row').filter({ hasText: 'QA 生命周期任务' });
  await trashRow.getByRole('button', { name: /^恢\s*复$/ }).click();
  await go(taskRoute);
  await expect(page.getByRole('textbox', { name: '任务标题' })).toHaveValue('QA 生命周期任务');
  record('任务创建、完成、重开、日期浮层、删除与回收站恢复');

  await go('documents/d0');
  await page.locator('.editor').getByText('Markdown', { exact: true }).click();
  await page
    .getByRole('textbox', { name: '文档内容', exact: true })
    .fill('# QA 文档\n\n## 验证结果\n\n编辑内容已保留。');
  await page.locator('.editor').getByText('阅读', { exact: true }).click();
  await expect(page.getByText('编辑内容已保留。', { exact: true })).toBeVisible();
  await go('home');
  await go('documents/d0');
  await expect(page.getByText('编辑内容已保留。', { exact: true })).toBeVisible();
  record('文档 Markdown 编辑、阅读和跨页保留');
  await page.keyboard.press('ControlOrMeta+k');
  dialog = page.getByRole('dialog', { name: '搜索工作空间' });
  await dialog.getByRole('textbox', { name: '全局搜索', exact: true }).fill('Grafana');
  await dialog.getByRole('button').filter({ hasText: 'Grafana 监控面板' }).click();
  await expect(page.locator('.ant-drawer-title')).toContainText('Grafana 监控面板');
  await page.locator('.ant-drawer-close').click();
  record('键盘全局搜索与定位资料详情');

  await go('tools/data-format');
  await page.getByRole('textbox', { name: 'JSON / 文本输入' }).fill('{"ok":true,"count":2}');
  await page.getByRole('button', { name: '开始处理', exact: true }).click();
  assert.deepEqual(
    JSON.parse(await page.getByRole('textbox', { name: 'JSON 处理结果' }).inputValue()),
    { ok: true, count: 2 },
  );
  await page.getByRole('textbox', { name: 'JSON / 文本输入' }).fill('{bad');
  await page.getByRole('button', { name: '开始处理', exact: true }).click();
  await expect(page.getByText('无法处理输入内容', { exact: true })).toBeVisible();
  await expect(page.getByRole('textbox', { name: 'JSON 处理结果' })).toHaveValue('');
  record('JSON 实际处理与错误反馈');
  await go('tools/text-transform');
  await page.getByRole('textbox', { name: '原始文本' }).fill('A\nA\nB');
  await page.getByRole('button', { name: '处理文本', exact: true }).click();
  await expect(page.getByRole('textbox', { name: '文本处理结果' })).toHaveValue('A\nB');
  record('文本去重使用项目真实处理逻辑');
  await go('tools/table-data');
  await page.getByRole('button', { name: '开始转换', exact: true }).click();
  assert.equal(
    JSON.parse(await page.getByRole('textbox', { name: '表格转换结果' }).inputValue()).length,
    3,
  );
  record('CSV 与 JSON 转换');
  await go('tools/config-diff');
  await page.getByRole('textbox', { name: '原配置' }).fill('A=1');
  await page.getByRole('textbox', { name: '新配置' }).fill('A=1');
  await page.getByRole('button', { name: '开始对比', exact: true }).click();
  await expect(page.getByText('+ 0 新增', { exact: true })).toBeVisible();
  await expect(page.getByText('− 0 删除', { exact: true })).toBeVisible();
  record('配置差异计算');
  await go('tools/time-cron');
  await page.getByRole('textbox', { name: '时间转换输入' }).fill('0');
  await page.getByRole('button', { name: '转换时间', exact: true }).click();
  await expect(page.getByText('1970-01-01T00:00:00.000Z', { exact: true })).toBeVisible();
  await page.getByRole('tab', { name: 'Cron 执行计划', exact: true }).click();
  await page.getByRole('textbox', { name: 'Cron 表达式' }).fill('*/15 * * * *');
  await page.getByRole('button', { name: '解析执行计划', exact: true }).click();
  await expect(page.getByText('每 15 分钟执行', { exact: true })).toBeVisible();
  record('时间转换与 Cron 预测');
  await go('tools/zip-text');
  for (const label of ['归档文件', 'Git 筛选归档', '目录还原', '剪贴板还原']) {
    await page.getByRole('tab', { name: label, exact: true }).click();
    await expect(page.getByLabel('演示归档密码', { exact: true })).toBeVisible();
  }
  await page.getByRole('tab', { name: '归档文件', exact: true }).click();
  await page.getByRole('button', { name: '使用示例文件', exact: true }).click();
  await page.getByLabel('演示归档密码', { exact: true }).fill('demo-only');
  await page.getByRole('button', { name: '演示生成归档', exact: true }).click();
  await expect(page.getByText('已完成流程预览', { exact: true })).toBeVisible();
  record('ZIP 四个模式和归档流程演示');

  await go('settings/backup');
  await page.getByRole('button', { name: '从备份恢复', exact: true }).click();
  await page.getByRole('button', { name: '演示校验备份', exact: true }).click();
  await page.getByRole('button', { name: '演示确认恢复', exact: true }).click();
  await expect(page.getByText('恢复流程演示完成', { exact: true })).toBeVisible();
  await page.getByRole('button', { name: /^完\s*成$/ }).click();
  record('备份恢复确认流程');
  await go('settings/about');
  await page.getByRole('button', { name: '检查更新', exact: true }).click();
  await page.getByRole('button', { name: '演示下载更新', exact: true }).click();
  await expect(page.getByRole('button', { name: '演示安装流程', exact: true })).toBeVisible();
  record('版本更新检查、下载与待安装状态演示');
  await go('settings/appearance');
  await page.getByRole('switch', { name: '增强对比', exact: true }).click();
  await expect(page.getByRole('switch', { name: '增强对比', exact: true })).toHaveAttribute(
    'aria-checked',
    'true',
  );
  await page.getByRole('switch', { name: '减少动态效果', exact: true }).click();
  await expect(page.locator('.workbench')).toHaveClass(/reduce-motion/);
  await page.getByRole('switch', { name: '减少透明度', exact: true }).click();
  await expect(page.getByRole('switch', { name: '减少透明度', exact: true })).toHaveAttribute(
    'aria-checked',
    'true',
  );
  await page.getByText('系统', { exact: true }).click();
  await page.emulateMedia({ colorScheme: 'dark' });
  await expect(page.locator('.workbench')).toHaveClass(/dark/);
  await page.emulateMedia({ colorScheme: 'light' });
  await expect(page.locator('.workbench')).not.toHaveClass(/dark/);
  record('外观跟随系统、增强对比、减少动效与透明度设置');
  if (base.startsWith('file:'))
    assert.deepEqual(externalRequests, [], '离线单文件不应请求外部资源');
  assert.deepEqual(errors, [], `浏览器运行时错误：${errors.join('\n')}`);
  assert.deepEqual(
    [...warnings].filter((w) => w.includes('[antd:')),
    [],
    '存在 Ant Design 弃用或调用警告',
  );
  const result = {
    date: new Date().toISOString(),
    browser: browser.version(),
    entry: base,
    offline: base.startsWith('file:'),
    externalRequests,
    routes: routes.length,
    visualStates: routes.length * 3,
    checks,
    errors,
    warnings: [...warnings],
  };
  await fs.writeFile(path.join(evidence, 'verification.json'), JSON.stringify(result, null, 2));
  console.log(JSON.stringify(result, null, 2));
} catch (error) {
  await page.screenshot({ path: path.join(evidence, 'failure.png'), fullPage: true });
  await fs.writeFile(
    path.join(evidence, 'failure.json'),
    JSON.stringify(
      { url: page.url(), error: String(error), errors, warnings: [...warnings] },
      null,
      2,
    ),
  );
  throw error;
} finally {
  await browser.close();
}
