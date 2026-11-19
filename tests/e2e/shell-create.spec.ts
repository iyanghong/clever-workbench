import { expect } from '@playwright/test';
import { sharedDesktopTests } from './shared-desktop';

const test = sharedDesktopTests('shell-create');

test('快速新建直接展示两组九项，窄窗口可滚动并用键盘返回和关闭', async ({ app, page }, info) => {
  await app.evaluate(({ BrowserWindow }) => {
    BrowserWindow.getAllWindows()[0].setContentSize(1440, 960);
  });
  await page.evaluate(() => window.desktop.mutate({ type: 'settings', theme: 'system' }));
  await page.emulateMedia({ colorScheme: 'light' });
  const trigger = page.getByRole('button', { name: '快速新建', exact: true });
  await trigger.click();
  const dialog = page.getByRole('dialog', { name: '快速新建', exact: true });
  const work = dialog.getByRole('region', { name: '工作记录', exact: true });
  const ledger = dialog.getByRole('region', { name: '台账资料', exact: true });
  await expect(work).toBeVisible();
  await expect(ledger).toBeVisible();
  await expect(work.getByRole('button')).toHaveText([/新任务.*标题即可/, /新文档.*直接开始记录/]);
  await expect(ledger.getByRole('button')).toHaveText([
    /新系统/,
    /新访问入口/,
    /新账号/,
    /新服务器/,
    /新资源/,
    /新环境/,
    /新服务/,
  ]);
  await expect(dialog.getByRole('button')).toHaveCount(10);
  const workBounds = await work.boundingBox();
  const ledgerBounds = await ledger.boundingBox();
  expect(workBounds!.y + workBounds!.height).toBeLessThanOrEqual(ledgerBounds!.y);
  await page.screenshot({
    animations: 'disabled',
    path: info.outputPath('create-groups-light.png'),
  });

  await app.evaluate(({ BrowserWindow }) => {
    BrowserWindow.getAllWindows()[0].setContentSize(880, 620);
  });
  await page.emulateMedia({ colorScheme: 'dark' });
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark');
  const service = ledger.getByRole('button', { name: '新服务', exact: true });
  await service.focus();
  await expect(service).toBeInViewport();
  const close = dialog.getByRole('button', { name: '关闭快速新建', exact: true });
  await expect(close).toBeInViewport();
  expect(await dialog.evaluate((element) => element.scrollWidth <= element.clientWidth + 1)).toBe(
    true,
  );
  const bounds = await dialog.boundingBox();
  expect(bounds!.x).toBeGreaterThanOrEqual(0);
  expect(bounds!.y).toBeGreaterThanOrEqual(0);
  expect(bounds!.y + bounds!.height).toBeLessThanOrEqual(620);
  await page.screenshot({
    animations: 'disabled',
    path: info.outputPath('create-groups-dark-narrow.png'),
  });
  await page.keyboard.press('Enter');
  const form = page.getByRole('dialog', { name: '新服务', exact: true });
  await expect(form.getByLabel('快速新建服务名称')).toBeFocused();
  await form.getByRole('button', { name: '其他类型', exact: true }).click();
  await expect(work).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(dialog).toHaveCount(0);
  await expect(trigger).toBeFocused();
  await page.keyboard.press('ControlOrMeta+n');
  await expect(dialog).toBeVisible();
  await close.click();
  await expect(dialog).toHaveCount(0);
  await expect(trigger).toBeFocused();
});

test('最小窗口中导航与全局入口完整可达，切换页面后位置稳定', async ({ app, page }, info) => {
  await app.evaluate(({ BrowserWindow }) => {
    BrowserWindow.getAllWindows()[0].setContentSize(820, 600);
  });
  await page.evaluate(() => window.desktop.mutate({ type: 'settings', theme: 'system' }));
  await page.emulateMedia({ colorScheme: 'light' });
  const search = page.getByRole('button', { name: '全局搜索', exact: true });
  const create = page.getByRole('button', { name: '快速新建', exact: true });
  await expect(create).toBeEnabled();
  await expect(page.locator('.sidebar')).toHaveClass(/ant-layout-sider-collapsed/);
  await page
    .locator('.sidebar')
    .evaluate((element) =>
      Promise.all(element.getAnimations().map((animation) => animation.finished.catch(() => {}))),
    );
  const searchBounds = await search.boundingBox();
  const createBounds = await create.boundingBox();
  for (const name of ['工作台', '工作任务', '文档', '设置']) {
    const navigation = page.getByRole('menuitem', { name, exact: true });
    await expect(navigation).toBeInViewport({ ratio: 1 });
    await navigation.click();
    await expect(navigation).toHaveAttribute('aria-current', 'page');
    await expect(create).toBeEnabled();
    await expect(search).toBeInViewport({ ratio: 1 });
    await expect(create).toBeInViewport({ ratio: 1 });
    expect(await search.boundingBox()).toEqual(searchBounds);
    expect(await create.boundingBox()).toEqual(createBounds);
  }
  await page.screenshot({
    animations: 'disabled',
    path: info.outputPath('shell-minimum-light.png'),
  });
  await page.getByRole('radio', { name: '深色', exact: true }).locator('..').click();
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark');
  await page.screenshot({
    animations: 'disabled',
    path: info.outputPath('shell-minimum-dark.png'),
  });
});
