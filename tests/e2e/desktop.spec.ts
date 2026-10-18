import { test, expect, _electron as electron } from '@playwright/test';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
test('native desktop capture, editor, completion, archive, recovery and theme', async ({}, testInfo) => {
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), 'clever-workbench-e2e-'));
  const environment: Record<string, string> = {
    ...process.env,
    CLEVER_WORKBENCH_DATA_DIR: directory,
  };
  delete environment.ELECTRON_RUN_AS_NODE;
  const application = await electron.launch({ args: ['.'], env: environment });
  try {
    const page = await application.firstWindow();
    const errors: string[] = [];
    page.on('pageerror', (e) => errors.push(e.message));
    await page.getByRole('button', { name: '工作任务', exact: true }).click();
    await expect(page.getByRole('heading', { name: '工作任务' })).toBeVisible();
    const runtime = await application.evaluate(() => ({
      node: process.versions.node,
      electron: process.versions.electron,
    }));
    console.log('Electron runtime', runtime);
    await page.getByLabel('新增项目', { exact: true }).click();
    await page.getByLabel('项目名称', { exact: true }).fill('产品迭代');
    await page.getByRole('button', { name: '保存项目', exact: true }).click();
    await page.getByLabel('项目范围', { exact: true }).selectOption({ label: '产品迭代' });
    const quick = page.getByLabel('快速新增任务');
    await quick.fill('修复登录超时');
    await quick.press('Enter');
    await expect(page.getByRole('button', { name: /修复登录超时.*产品迭代/ })).toBeVisible();
    await page.getByRole('button', { name: /修复登录超时.*产品迭代/ }).click();
    const editor = page.getByRole('textbox', { name: '工作内容' });
    await editor.fill('已定位问题，补充重试机制。');
    await page.getByLabel('关闭详情').click();
    await page.getByRole('button', { name: /修复登录超时.*产品迭代/ }).click();
    await expect(editor).toContainText('补充重试机制');
    await page.getByRole('button', { name: '标记完成', exact: true }).click();
    await expect(page.getByRole('button', { name: '重新打开', exact: true })).toBeVisible();
    await page.getByLabel('关闭详情').click();
    await page.getByLabel('项目设置').click();
    await page.getByRole('button', { name: '归档项目', exact: true }).last().click();
    await page.getByRole('button', { name: '归档项目', exact: true }).click();
    await expect(page.locator('.archive-title')).toContainText('产品迭代');
    await page.getByRole('button', { name: '恢复项目', exact: true }).click();
    await page.getByRole('button', { name: '工作任务', exact: false }).first().click();
    await page.getByRole('button', { name: '全部', exact: false }).first().click();
    await page.getByRole('button', { name: /修复登录超时.*产品迭代/ }).click();
    await page.getByLabel('删除任务', { exact: true }).click();
    await page.getByRole('button', { name: '回收站', exact: true }).click();
    await page.getByLabel('恢复 修复登录超时', { exact: true }).click();
    await page.getByRole('button', { name: '工作回顾', exact: true }).click();
    await expect(page.getByRole('heading', { name: '看见每一步进展.' })).toBeVisible();
    await expect(page.locator('.timeline-row')).toContainText('修复登录超时');
    await page.screenshot({ path: testInfo.outputPath('review.png') });
    await page.getByRole('button', { name: '设置', exact: true }).click();
    await page.getByRole('button', { name: '深色', exact: true }).click();
    await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark');
    await page.getByRole('button', { name: '工作任务', exact: false }).first().click();
    await page.getByRole('button', { name: '新增任务', exact: true }).click();
    await page.getByLabel('任务标题', { exact: true }).fill('待整理的工作');
    await page.getByRole('textbox', { name: '工作内容' }).fill('下次继续整理');
    await page.getByLabel('关闭详情').click();
    await page.getByRole('button', { name: '新增任务', exact: true }).click();
    await expect(page.getByLabel('任务标题', { exact: true })).toHaveValue('待整理的工作');
    await page.screenshot({ path: testInfo.outputPath('desktop-dark.png') });
    expect(errors).toEqual([]);
  } finally {
    await application.close();
    await fs.rm(directory, { recursive: true, force: true });
  }
});

test('pasted images survive immediate close, portable backup and restart', async ({}, testInfo) => {
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), 'clever-workbench-images-'));
  const environment: Record<string, string> = {
    ...process.env,
    CLEVER_WORKBENCH_DATA_DIR: directory,
  };
  delete environment.ELECTRON_RUN_AS_NODE;
  let application = await electron.launch({ args: ['.'], env: environment });
  try {
    let page = await application.firstWindow();
    await expect(page.getByLabel('快速新增任务')).toBeVisible();
    await page.getByRole('button', { name: '工作任务', exact: true }).click();
    await page.getByLabel('快速新增任务').fill('检查截图持久化');
    await page.getByLabel('快速新增任务').press('Enter');
    await page.getByRole('button', { name: /检查截图持久化.*未分类/ }).click();
    const editor = page.getByRole('textbox', { name: '工作内容' });
    await editor.fill('这是一条包含本地截图的工作记录。');
    await editor.evaluate((element) => {
      const bytes = Uint8Array.from(
        atob(
          'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR4nGNgqPr/HwAEcAJ5Qhlc0gAAAABJRU5ErkJggg==',
        ),
        (c) => c.charCodeAt(0),
      );
      const data = new DataTransfer();
      data.items.add(new File([bytes], '截图.png', { type: 'image/png' }));
      element.dispatchEvent(
        new ClipboardEvent('paste', { clipboardData: data, bubbles: true, cancelable: true }),
      );
    });
    await page.getByLabel('关闭详情').click();
    await expect(page.getByRole('complementary', { name: '任务详情' })).not.toBeVisible();
    await page.getByRole('button', { name: /检查截图持久化.*未分类/ }).click();
    await expect(editor.locator('img')).toBeVisible();
    expect(await editor.locator('img').evaluate((img: HTMLImageElement) => img.naturalWidth)).toBe(
      1,
    );
    await page.getByLabel('关闭详情').click();
    await page.getByRole('button', { name: '设置', exact: true }).click();
    const archive = path.join(directory, 'portable.cwb');
    await application.evaluate(({ dialog }, filename) => {
      (dialog as any).showSaveDialog = async () => ({ canceled: false, filePath: filename });
    }, archive);
    await page.getByRole('button', { name: '导出完整备份', exact: true }).click();
    await page.getByLabel('主密码', { exact: true }).fill('fictional-image-backup-password');
    await page.getByLabel('确认主密码').fill('fictional-image-backup-password');
    await page.getByRole('button', { name: '设置并解锁', exact: true }).click();
    await expect(page.getByRole('status').filter({ hasText: '备份已保存' })).toBeVisible();
    await page.getByRole('button', { name: '工作任务', exact: false }).first().click();
    await page.getByLabel('快速新增任务').fill('备份后新增');
    await page.getByLabel('快速新增任务').press('Enter');
    await expect(page.getByRole('button', { name: /备份后新增.*未分类/ })).toBeVisible();
    await page.getByRole('button', { name: '设置', exact: true }).click();
    await application.evaluate(({ dialog }, filename) => {
      (dialog as any).showOpenDialog = async () => ({ canceled: false, filePaths: [filename] });
    }, archive);
    await page.getByRole('button', { name: '从备份恢复', exact: true }).click();
    await page.getByLabel('备份密码', { exact: true }).fill('fictional-image-backup-password');
    await page.getByRole('button', { name: '校验备份', exact: true }).click();
    await expect(page.getByRole('dialog')).toContainText('1 张图片');
    await page.getByRole('button', { name: '恢复备份', exact: true }).click();
    await expect(page.getByRole('status').filter({ hasText: '恢复完成' })).toBeVisible();
    await page.getByRole('button', { name: '工作任务', exact: false }).first().click();
    await expect(page.getByRole('button', { name: /备份后新增.*未分类/ })).toHaveCount(0);
    await page.getByRole('button', { name: /检查截图持久化.*未分类/ }).click();
    await expect(page.getByRole('textbox', { name: '工作内容' }).locator('img')).toBeVisible();
    await application.close();
    application = await electron.launch({ args: ['.'], env: environment });
    page = await application.firstWindow();
    await page.getByRole('button', { name: '工作任务', exact: true }).click();
    await page.getByRole('button', { name: /检查截图持久化.*未分类/ }).click();
    await expect(page.getByRole('textbox', { name: '工作内容' })).toContainText('包含本地截图');
    await expect(page.getByRole('textbox', { name: '工作内容' }).locator('img')).toBeVisible();
    await page.screenshot({ path: testInfo.outputPath('image-recovery.png') });
  } finally {
    await application.close();
    await fs.rm(directory, { recursive: true, force: true });
  }
});
