import { test, expect, type Page, type ElectronApplication } from '@playwright/test';
import { electron } from './launch';
import {
  expectedFeatureGuide,
  expectGuidanceDestination,
  verifyUnavailableOrNoTarget,
} from './guidance-content';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

const guides: Record<string, string> = {
  从工作台开始记录: 'workspace-basics',
  整理首页常用对象: 'workspace-favorites',
  '窗口、菜单与保存反馈': 'workspace-window',
  从统一入口新建资料: 'search-and-create',
  全局搜索与结果快捷操作: 'search-and-open',
  记录任务与管理草稿: 'tasks-capture',
  设置任务计划与临期: 'tasks-planning',
  维护任务颜色标签: 'tasks-tags',
  筛选任务与批量关联系统: 'tasks-filter',
  '创建、查找和关联文档': 'documents-and-editor',
  '共用编辑器：文字与排版': 'editor-formatting',
  '共用编辑器：本地图片': 'editor-images',
  按月份与系统回顾工作: 'work-review',
};
async function openGuide(app: ElectronApplication, page: Page, nearby: string, title: string) {
  const feature = await expectedFeatureGuide(app, guides[title]);
  await page.getByRole('button', { name: nearby, exact: true }).click({ timeout: 5000 });
  const library = page.getByRole('dialog', { name: '使用指引', exact: true });
  await expect(library).toBeVisible();
  const placement: Record<string, string> = {
    工作台使用指引: 'home',
    搜索与新建使用指引: 'search',
    工作任务使用指引: 'tasks',
    文档使用指引: 'documents',
    工作回顾使用指引: 'review',
  };
  if (!feature || !feature.placements.includes(placement[nearby])) {
    await expect(
      library.getByRole('button', { name: feature?.title ?? title, exact: true }),
    ).toHaveCount(0);
    if (!(await library.locator('.guidance-list button').count()))
      await expect(library.getByRole('status')).toContainText('当前暂无可用指引');
    test
      .info()
      .annotations.push({
        type: 'guidance-content-warning',
        description: `${guides[title]} 缺失或未配置当前位置：已验证列表降级，本次未验证其正文和正常跳转。`,
      });
    return { dialog: library, feature: undefined };
  }
  await library.getByRole('button', { name: feature.title, exact: true }).click();
  return { dialog: page.getByRole('dialog', { name: feature.title, exact: true }), feature };
}
async function navigateOrClose(page: Page, opened: Awaited<ReturnType<typeof openGuide>>) {
  if (!opened.feature) {
    await page.keyboard.press('Escape');
    await expect(opened.dialog).toHaveCount(0);
    return;
  }
  if (await verifyUnavailableOrNoTarget(page, opened.feature)) return;
  await opened.dialog.getByRole('button', { name: '前往功能', exact: true }).click();
  await expectGuidanceDestination(page, opened.feature);
}

test('首页指引可离线查阅并安全返回，照着指引录入待办与整理常用工具', async ({}, info) => {
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), 'workbench-daily-guidance-'));
  const env: Record<string, string> = { ...process.env, CLEVER_WORKBENCH_DATA_DIR: directory };
  delete env.ELECTRON_RUN_AS_NODE;
  const app = await electron.launch({ args: ['.'], env });
  try {
    const page = await app.firstWindow();
    await page.context().setOffline(true);
    const guide = await openGuide(app, page, '工作台使用指引', '从工作台开始记录');
    if (guide.feature)
      await expect(
        guide.dialog.getByRole('heading', { name: guide.feature.steps[0].title, exact: true }),
      ).toBeVisible();
    await navigateOrClose(page, guide);
    await page.getByRole('button', { name: '工作台', exact: true }).click();
    await expect(page.getByRole('dialog')).toHaveCount(0);
    await page.getByLabel('快速新增任务').fill('指引示例：核对周计划');
    await page.getByLabel('快速新增任务').press('Enter');
    await expect(
      page.getByRole('button', { name: '完成 指引示例：核对周计划', exact: true }),
    ).toBeVisible();
    await page.getByRole('button', { name: '完成 指引示例：核对周计划', exact: true }).click();
    await page.getByRole('button', { name: '撤销', exact: true }).click();
    await expect(
      page.getByRole('button', { name: '完成 指引示例：核对周计划', exact: true }),
    ).toBeVisible();
    await openGuide(app, page, '工作台使用指引', '整理首页常用对象');
    await page.keyboard.press('Escape');
    await expect(page.getByRole('button', { name: '工作台使用指引', exact: true })).toBeFocused();
    await page.getByRole('button', { name: '选择常用对象', exact: true }).click();
    await page.getByRole('checkbox', { name: '常用 本地工具 ZIP 文本归档', exact: true }).check();
    await page.getByRole('button', { name: '完成选择', exact: true }).click();
    await expect(
      page.getByRole('button', { name: '打开常用工具 ZIP 文本归档', exact: true }),
    ).toBeVisible();
    await page.getByRole('button', { name: '移出常用 ZIP 文本归档', exact: true }).click();
    await expect(
      page.getByRole('button', { name: '打开常用工具 ZIP 文本归档', exact: true }),
    ).toHaveCount(0);
    await app.evaluate(({ BrowserWindow }) =>
      BrowserWindow.getAllWindows()[0].setContentSize(800, 600),
    );
    const narrow = await openGuide(app, page, '工作台使用指引', '窗口、菜单与保存反馈');
    if (narrow.feature)
      await expect(
        narrow.dialog.getByRole('button', { name: '前往功能', exact: true }),
      ).toBeInViewport();
    await page.screenshot({ path: info.outputPath('daily-guide-narrow.png') });
  } finally {
    await app.close();
    await fs.rm(directory, { recursive: true, force: true });
  }
});

test('搜索新建旁指引只导航，九项选择可取消且键盘搜索可打开任务', async () => {
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), 'workbench-search-guide-'));
  const env: Record<string, string> = { ...process.env, CLEVER_WORKBENCH_DATA_DIR: directory };
  delete env.ELECTRON_RUN_AS_NODE;
  const app = await electron.launch({ args: ['.'], env });
  try {
    const page = await app.firstWindow();
    const guide = await openGuide(app, page, '搜索与新建使用指引', '从统一入口新建资料');
    await navigateOrClose(page, guide);
    await page.getByRole('button', { name: '工作台', exact: true }).click();
    await expect(page.getByRole('dialog')).toHaveCount(0);
    expect((await page.evaluate(() => window.desktop.snapshot())).tasks).toHaveLength(0);
    await page.getByRole('button', { name: '快速新建', exact: true }).click();
    const create = page.getByRole('dialog', { name: '快速新建', exact: true });
    for (const name of [
      '新任务',
      '新文档',
      '新系统',
      '新访问入口',
      '新账号',
      '新服务器',
      '新资源',
      '新环境',
      '新服务',
    ]) {
      await expect(create.getByRole('button', { name, exact: true })).toBeVisible();
    }
    await create.getByRole('button', { name: '新任务', exact: true }).click();
    await page.getByLabel('快速新建任务标题').fill('这项取消不应创建');
    await page.getByRole('button', { name: '取消', exact: true }).click();
    expect((await page.evaluate(() => window.desktop.snapshot())).tasks).toHaveLength(0);
    await openGuide(app, page, '搜索与新建使用指引', '全局搜索与结果快捷操作');
    await page.keyboard.press('Escape');
    await page.getByLabel('快速新增任务').fill('指引键盘查找示例');
    await page.getByLabel('快速新增任务').press('Enter');
    await page.keyboard.press(process.platform === 'darwin' ? 'Meta+k' : 'Control+k');
    await page.getByLabel('搜索工作台内容').fill('指引键盘查找示例');
    await expect(
      page.getByRole('button', { name: '打开任务 指引键盘查找示例', exact: true }),
    ).toBeVisible();
    await page.getByLabel('搜索工作台内容').press('ArrowDown');
    await page.getByLabel('搜索工作台内容').press('Enter');
    await expect(page.getByLabel('任务标题')).toHaveValue('指引键盘查找示例');
  } finally {
    await app.close();
    await fs.rm(directory, { recursive: true, force: true });
  }
});

test('任务指引关闭保留详情，计划、标签与批量归属可按说明操作', async () => {
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), 'workbench-task-guide-'));
  const env: Record<string, string> = { ...process.env, CLEVER_WORKBENCH_DATA_DIR: directory };
  delete env.ELECTRON_RUN_AS_NODE;
  const app = await electron.launch({ args: ['.'], env });
  try {
    const page = await app.firstWindow();
    await page.getByRole('button', { name: '工作任务', exact: true }).click();
    const capture = await openGuide(app, page, '工作任务使用指引', '记录任务与管理草稿');
    await navigateOrClose(page, capture);
    await page.getByRole('button', { name: '工作任务', exact: true }).click();
    await page.getByRole('button', { name: '新增任务', exact: true }).click();
    await page.getByLabel('任务标题').fill('指引任务详情示例');
    await page.getByRole('button', { name: /^创建任务/ }).click();
    await openGuide(app, page, '工作任务使用指引', '设置任务计划与临期');
    await page.keyboard.press('Escape');
    await expect(page.getByLabel('任务标题')).toHaveValue('指引任务详情示例', { timeout: 3000 });
    await page.getByText('计划与标签', { exact: true }).click();
    await page.getByLabel('预计完成日期', { exact: true }).fill('2027-05-10');
    await page.getByLabel('临期开始日期', { exact: true }).fill('2027-05-09');
    await page.getByRole('button', { name: '关闭详情', exact: true }).click();
    await openGuide(app, page, '工作任务使用指引', '维护任务颜色标签');
    await page.keyboard.press('Escape');
    await page.getByRole('button', { name: '管理标签', exact: true }).click();
    await page.getByLabel('标签名称').fill('指引示例分类');
    await page.getByRole('button', { name: '创建标签', exact: true }).click();
    await page.getByRole('button', { name: '关闭任务标签', exact: true }).click();
    await page.locator('.task-open').filter({ hasText: '指引任务详情示例' }).click();
    await page.getByText('计划与标签', { exact: true }).click();
    await page.getByLabel('标签 指引示例分类', { exact: true }).check();
    await page.getByRole('button', { name: '关闭详情', exact: true }).click();
    await openGuide(app, page, '工作任务使用指引', '筛选任务与批量关联系统');
    await page.keyboard.press('Escape');
    await page.getByText('标签筛选', { exact: true }).click();
    await page.getByLabel('筛选标签 指引示例分类', { exact: true }).check();
    await page.getByLabel('标签匹配方式').selectOption('all');
    await expect(page.locator('.task-open')).toHaveCount(1);
    await page.getByRole('button', { name: '批量关联系统', exact: true }).click();
    await page.getByLabel('选择当前结果', { exact: true }).check();
    await page.getByRole('button', { name: '应用到所选任务', exact: true }).click();
    await expect(page.getByRole('button', { name: '批量关联系统', exact: true })).toHaveAttribute(
      'aria-pressed',
      'false',
    );
    await page.getByRole('button', { name: '紧凑', exact: true }).click();
    await page.getByLabel('时间归类').selectOption('due');
    await expect(page.locator('.task-open')).toContainText('指引任务详情示例');
  } finally {
    await app.close();
    await fs.rm(directory, { recursive: true, force: true });
  }
});

test('阅读任务指引期间创建快捷键不会提交底层草稿', async () => {
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), 'workbench-guide-shortcut-'));
  const env: Record<string, string> = { ...process.env, CLEVER_WORKBENCH_DATA_DIR: directory };
  delete env.ELECTRON_RUN_AS_NODE;
  const app = await electron.launch({ args: ['.'], env });
  try {
    const page = await app.firstWindow();
    await page.getByRole('button', { name: '工作任务', exact: true }).click();
    await page.getByRole('button', { name: '新增任务', exact: true }).click();
    await page.getByLabel('任务标题').fill('只阅读不创建的草稿');
    const guide = await openGuide(app, page, '工作任务使用指引', '记录任务与管理草稿');
    if (guide.feature && guide.feature.steps.length > 1)
      await guide.dialog.getByRole('button', { name: '下一步', exact: true }).click();
    else await guide.dialog.getByRole('heading').click();
    await page.keyboard.press(process.platform === 'darwin' ? 'Meta+Enter' : 'Control+Enter');
    await page.keyboard.press('Escape');
    await expect(guide.dialog).toHaveCount(0);
    await expect(page.getByRole('button', { name: /^创建任务/ })).toBeVisible({ timeout: 3000 });
    expect((await page.evaluate(() => window.desktop.snapshot())).tasks).toHaveLength(0);
    await expect(page.getByLabel('任务标题')).toHaveValue('只阅读不创建的草稿');
  } finally {
    await app.close();
    await fs.rm(directory, { recursive: true, force: true });
  }
});

test('文档附近和设置可查看共用编辑指引，源码与本地图片保存后仍可阅读', async ({}, info) => {
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), 'workbench-document-guide-'));
  const env: Record<string, string> = { ...process.env, CLEVER_WORKBENCH_DATA_DIR: directory };
  delete env.ELECTRON_RUN_AS_NODE;
  const app = await electron.launch({ args: ['.'], env });
  try {
    const page = await app.firstWindow();
    await page.getByRole('button', { name: '文档', exact: true }).click();
    const guide = await openGuide(app, page, '文档使用指引', '创建、查找和关联文档');
    await navigateOrClose(page, guide);
    await page.getByRole('button', { name: '文档', exact: true }).click();
    await page.getByRole('button', { name: '新建文档', exact: true }).click();
    await page.getByLabel('文档标题').fill('指引文档示例');
    await page.getByRole('button', { name: 'Markdown 源码', exact: true }).click();
    await page.getByLabel('Markdown 源码内容').fill('# 示例方案\n\n只含隔离示例文字。');
    await openGuide(app, page, '文档使用指引', '共用编辑器：文字与排版');
    await page.keyboard.press('Escape');
    await expect(page.getByLabel('Markdown 源码内容')).toHaveValue(/只含隔离示例文字。/);
    const original = path.join(directory, '示例图片.png');
    await fs.writeFile(
      original,
      Buffer.from(
        'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR4nGNgqPr/HwAEcAJ5Qhlc0gAAAABJRU5ErkJggg==',
        'base64',
      ),
    );
    await app.evaluate(({ dialog }, filePath) => {
      dialog.showOpenDialog = (async () => ({
        canceled: false,
        filePaths: [filePath],
      })) as typeof dialog.showOpenDialog;
    }, original);
    await page.getByRole('button', { name: '插入图片', exact: true }).click();
    await expect(page.getByLabel('Markdown 源码内容')).toHaveValue(/workbench-asset/);
    await openGuide(app, page, '文档使用指引', '共用编辑器：本地图片');
    await page.keyboard.press('Escape');
    await page.getByRole('button', { name: '即时排版', exact: true }).click();
    const picture = page.getByRole('textbox', { name: '工作内容' }).locator('img');
    await expect
      .poll(() => picture.evaluate((node: HTMLImageElement) => node.naturalWidth))
      .toBe(1);
    await picture.click();
    await expect(page.getByAltText('图片原图')).toBeVisible();
    await page.keyboard.press('Escape');
    await page.getByRole('button', { name: '设置', exact: true }).click();
    await page.getByRole('button', { name: '查看全部使用指引', exact: true }).click();
    await expect(page.getByRole('dialog', { name: '使用指引', exact: true })).toBeVisible();
    const editorGuide = await expectedFeatureGuide(app, 'editor-formatting');
    if (editorGuide) {
      await page
        .getByRole('dialog', { name: '使用指引', exact: true })
        .getByRole('button', { name: editorGuide.title, exact: true })
        .click();
      await page.emulateMedia({ colorScheme: 'dark' });
      await expect(
        page.getByRole('dialog', { name: editorGuide.title, exact: true }),
      ).toBeVisible();
      await page.screenshot({ path: info.outputPath('editor-guide-dark.png') });
    } else {
      test
        .info()
        .annotations.push({
          type: 'guidance-content-warning',
          description: '编辑器指引缺失：集中入口仍可打开，未验证正文。',
        });
      await expect(
        page
          .getByRole('dialog', { name: '使用指引', exact: true })
          .getByRole('button', { name: '共用编辑器：文字与排版', exact: true }),
      ).toHaveCount(0);
    }
    await page.keyboard.press('Escape');
    await page.getByRole('button', { name: '文档', exact: true }).click();
    await page.getByRole('button', { name: '文档 指引文档示例', exact: true }).click();
    await expect(picture).toHaveCount(1);
  } finally {
    await app.close();
    await fs.rm(directory, { recursive: true, force: true });
  }
});

test('工作回顾指引与月份、系统全貌入口一致，打开任务后可返回', async () => {
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), 'workbench-review-guide-'));
  const env: Record<string, string> = { ...process.env, CLEVER_WORKBENCH_DATA_DIR: directory };
  delete env.ELECTRON_RUN_AS_NODE;
  const app = await electron.launch({ args: ['.'], env });
  try {
    const page = await app.firstWindow();
    await page.getByLabel('快速新增任务').fill('指引回顾任务');
    await page.getByLabel('快速新增任务').press('Enter');
    await page.getByRole('button', { name: '工作回顾', exact: true }).click();
    const guide = await openGuide(app, page, '工作回顾使用指引', '按月份与系统回顾工作');
    await navigateOrClose(page, guide);
    await page.getByRole('button', { name: '工作回顾', exact: true }).click();
    await page.getByRole('button', { name: '上个月', exact: true }).click();
    await page.getByRole('button', { name: '本月', exact: true }).click();
    await page.getByRole('button', { name: '系统回顾', exact: true }).click();
    await expect(page.getByLabel('回顾月份')).toBeDisabled();
    await page.getByLabel('系统时间范围').selectOption('month');
    await expect(page.getByLabel('回顾月份')).toBeEnabled();
    await page.getByLabel('回顾系统').selectOption('none');
    await page.locator('.timeline-row').filter({ hasText: '指引回顾任务' }).click();
    await expect(page.getByLabel('任务标题')).toHaveValue('指引回顾任务');
    await page.getByRole('button', { name: '关闭详情', exact: true }).click();
    await expect(page.getByText('跨度用于回顾，不代表实际工时')).toBeVisible();
  } finally {
    await app.close();
    await fs.rm(directory, { recursive: true, force: true });
  }
});
