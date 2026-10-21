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

async function start() {
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), 'workbench-maintenance-guide-'));
  const env: Record<string, string> = { ...process.env, CLEVER_WORKBENCH_DATA_DIR: directory };
  delete env.ELECTRON_RUN_AS_NODE;
  const app = await electron.launch({ args: ['.'], env });
  const page = await app.firstWindow();
  return {
    app,
    page,
    async close() {
      await app.close();
      await fs.rm(directory, { recursive: true, force: true });
    },
  };
}
async function openDirect(app: ElectronApplication, page: Page, nearby: string, id: string) {
  const feature = await expectedFeatureGuide(app, id);
  await page.getByRole('button', { name: nearby, exact: true }).click({ timeout: 5000 });
  if (await verifyUnavailableOrNoTarget(page, feature)) return null;
  const dialog = page.getByRole('dialog', { name: feature!.title, exact: true });
  await expect(
    dialog.getByRole('heading', { name: feature!.steps[0].title, exact: true }),
  ).toBeVisible();
  return { dialog, feature: feature! };
}

test('外观旁的离线指引遵守主题和辅助偏好，关闭返回焦点并从集中入口导航', async ({}, info) => {
  const fixture = await start();
  const { app, page } = fixture;
  try {
    await page.context().setOffline(true);
    await page.getByRole('button', { name: '设置', exact: true }).click();
    for (const theme of ['浅色', '深色']) {
      await page.getByRole('button', { name: theme, exact: true }).click();
      await expect(page.locator('html')).toHaveAttribute(
        'data-theme',
        theme === '浅色' ? 'light' : 'dark',
      );
      const opened = await openDirect(app, page, '外观使用指引', 'appearance');
      if (opened) {
        await expect(
          opened.dialog.getByRole('button', { name: '前往功能', exact: true }),
        ).toBeInViewport();
        await page.keyboard.press('Escape');
        await expect(opened.dialog).toHaveCount(0);
      }
      await expect(page.getByRole('button', { name: '外观使用指引', exact: true })).toBeFocused();
    }
    for (const name of ['减少透明度', '增强对比', '减少动态效果'])
      await page.getByRole('switch', { name, exact: true }).check();
    await app.evaluate(({ BrowserWindow }) =>
      BrowserWindow.getAllWindows()[0].setContentSize(800, 600),
    );
    const opened = await openDirect(app, page, '外观使用指引', 'appearance');
    for (const preference of ['reduce-transparency', 'high-contrast', 'reduce-motion'])
      await expect(page.locator('html')).toHaveAttribute(`data-${preference}`, 'true');
    if (opened) {
      await expect(
        opened.dialog.getByRole('button', { name: '前往功能', exact: true }),
      ).toBeInViewport();
      await page.screenshot({ path: info.outputPath('appearance-guide-dark-narrow.png') });
      await page.keyboard.press('Escape');
      await page.getByRole('button', { name: '查看全部使用指引', exact: true }).click();
      await page
        .getByRole('dialog', { name: '使用指引', exact: true })
        .getByRole('button', { name: opened.feature.title, exact: true })
        .click();
      await page
        .getByRole('dialog', { name: opened.feature.title, exact: true })
        .getByRole('button', { name: '前往功能', exact: true })
        .click();
      await expectGuidanceDestination(page, opened.feature);
      if (opened.feature.entry.target === 'settings-appearance')
        await expect(page.getByRole('button', { name: '深色', exact: true })).toBeInViewport();
    }
  } finally {
    await fixture.close();
  }
});

async function openProtection(app: ElectronApplication, page: Page, id: string) {
  const feature = await expectedFeatureGuide(app, id);
  await page
    .getByRole('button', { name: '秘密保护使用指引', exact: true })
    .click({ timeout: 5000 });
  const library = page.getByRole('dialog', { name: '使用指引', exact: true });
  await expect(library).toBeVisible();
  if (!feature || !feature.placements.includes('settings-vault')) {
    if (!(await library.locator('.guidance-list button').count()))
      await expect(library.getByRole('status')).toContainText('当前暂无可用指引');
    test
      .info()
      .annotations.push({
        type: 'guidance-content-warning',
        description: `${id} 缺失或未配置该位置，已检查降级，正文路径未覆盖。`,
      });
    await page.keyboard.press('Escape');
    return;
  }
  await library.getByRole('button', { name: feature.title, exact: true }).click();
  if (await verifyUnavailableOrNoTarget(page, feature)) return;
  const dialog = page.getByRole('dialog', { name: feature.title, exact: true });
  await dialog.getByRole('button', { name: '前往功能', exact: true }).click();
  await expectGuidanceDestination(page, feature);
}

test('秘密保护指引只导航，启用解锁与更改关闭可取消且保留备份配置', async () => {
  const fixture = await start();
  const { app, page } = fixture;
  try {
    await page.getByRole('button', { name: '设置', exact: true }).click();
    await openProtection(app, page, 'secret-protection');
    expect(await page.evaluate(() => window.desktop.vaultStatus())).toMatchObject({
      initialized: false,
      mode: 'system',
    });
    await page.getByRole('button', { name: '启用主密码', exact: true }).click();
    await page.getByLabel('主密码', { exact: true }).fill('guide-old-password');
    await page.getByLabel('确认主密码', { exact: true }).fill('guide-old-password');
    await page.getByRole('button', { name: '取消', exact: true }).click();
    expect((await page.evaluate(() => window.desktop.vaultStatus())).initialized).toBe(false);
    await page.getByRole('button', { name: '启用主密码', exact: true }).click();
    await expect(page.getByLabel('主密码', { exact: true })).toHaveValue('');
    await page.getByLabel('主密码', { exact: true }).fill('guide-old-password');
    await page.getByLabel('确认主密码', { exact: true }).fill('guide-old-password');
    await page.getByRole('button', { name: '设置并解锁', exact: true }).click();
    await expect(page.getByRole('button', { name: '立即锁定', exact: true })).toBeVisible();
    await page.getByRole('button', { name: '立即锁定', exact: true }).click();
    await page.getByRole('button', { name: '解锁秘密', exact: true }).last().click();
    await page
      .getByRole('dialog', { name: '解锁秘密', exact: true })
      .getByRole('button', { name: '取消', exact: true })
      .click();
    expect((await page.evaluate(() => window.desktop.vaultStatus())).unlocked).toBe(false);
    await openProtection(app, page, 'master-password-manage');
    expect((await page.evaluate(() => window.desktop.vaultStatus())).unlocked).toBe(false);
    await page.getByRole('button', { name: '更改主密码', exact: true }).click();
    await page.getByLabel('当前主密码', { exact: true }).fill('guide-old-password');
    await page.getByLabel('新主密码', { exact: true }).fill('guide-new-password');
    await page.getByLabel('确认新主密码', { exact: true }).fill('guide-new-password');
    await page.getByRole('button', { name: '取消', exact: true }).click();
    await page.getByRole('button', { name: '关闭主密码', exact: true }).click();
    await page.getByLabel('当前主密码', { exact: true }).fill('guide-old-password');
    await page.keyboard.press('Escape');
    expect((await page.evaluate(() => window.desktop.vaultStatus())).initialized).toBe(true);
    await page.evaluate(() => window.desktop.unlockVault('guide-old-password'));
    await page.evaluate(() => window.desktop.configureBackup('guide-independent-backup'));
    await page.getByRole('button', { name: '更改主密码', exact: true }).click();
    await page.getByLabel('当前主密码', { exact: true }).fill('guide-old-password');
    await page.getByLabel('新主密码', { exact: true }).fill('guide-new-password');
    await page.getByLabel('确认新主密码', { exact: true }).fill('guide-new-password');
    await page.getByRole('button', { name: '保存新主密码', exact: true }).click();
    await expect(page.getByRole('status').filter({ hasText: '主密码已更改' })).toBeVisible();
    expect(await page.evaluate(() => window.desktop.vaultStatus())).toMatchObject({
      unlocked: false,
      backupConfigured: true,
    });
    await page.getByRole('button', { name: '解锁秘密', exact: true }).last().click();
    await page.getByLabel('主密码', { exact: true }).fill('guide-new-password');
    await page.getByRole('button', { name: '解锁', exact: true }).click();
    await page.getByRole('button', { name: '关闭主密码', exact: true }).click();
    await page.getByLabel('当前主密码', { exact: true }).fill('guide-new-password');
    await page.getByRole('button', { name: '验证并关闭主密码', exact: true }).click();
    await expect(page.getByRole('status').filter({ hasText: '主密码已关闭' })).toBeVisible();
    expect(await page.evaluate(() => window.desktop.vaultStatus())).toMatchObject({
      initialized: false,
      mode: 'system',
      backupConfigured: true,
    });
  } finally {
    await fixture.close();
  }
});

test('任务回收站指引只导航，恢复、单条删除和清空均保留各自边界', async () => {
  const fixture = await start();
  const { app, page } = fixture;
  try {
    await page.getByRole('button', { name: '回收站', exact: true }).click();
    const opened = await openDirect(app, page, '任务回收站使用指引', 'recycle-tasks');
    if (opened) {
      await opened.dialog.getByRole('button', { name: '前往功能', exact: true }).click();
      await expectGuidanceDestination(page, opened.feature);
    }
    await page.getByRole('button', { name: '工作台', exact: true }).click();
    for (const title of ['恢复示例', '永久删除示例', '清空示例']) {
      await page.getByLabel('快速新增任务').fill(title);
      await page.getByLabel('快速新增任务').press('Enter');
      await expect(page.getByRole('button', { name: `完成 ${title}`, exact: true })).toBeVisible();
    }
    await page.getByRole('button', { name: '工作任务', exact: true }).click();
    for (const title of ['恢复示例', '永久删除示例', '清空示例']) {
      await page.locator('.task-open').filter({ hasText: title }).click();
      await page.getByRole('button', { name: '删除任务', exact: true }).click();
    }
    await page.getByRole('button', { name: '回收站', exact: true }).click();
    await page.locator('.task-open').filter({ hasText: '恢复示例' }).click();
    await expect(page.getByLabel('任务标题', { exact: true })).toBeDisabled();
    await page.getByRole('button', { name: '恢复任务', exact: true }).click();
    await expect(page.locator('.task-open').filter({ hasText: '恢复示例' })).toHaveCount(0);
    await page.getByRole('button', { name: '彻底删除 永久删除示例', exact: true }).click();
    const confirmation = page.getByRole('dialog', { name: '彻底删除后无法撤销', exact: true });
    await expect(confirmation).toBeVisible();
    await confirmation.getByRole('button', { name: '取消', exact: true }).click();
    await expect(page.locator('.task-open').filter({ hasText: '永久删除示例' })).toBeVisible();
    await page.getByRole('button', { name: '彻底删除 永久删除示例', exact: true }).click();
    await confirmation.getByRole('button', { name: '彻底删除', exact: true }).click();
    await expect(page.locator('.task-open').filter({ hasText: '永久删除示例' })).toHaveCount(0);
    await page.getByRole('button', { name: '清空回收站', exact: true }).click();
    await confirmation.getByRole('button', { name: '取消', exact: true }).click();
    await expect(page.locator('.task-open').filter({ hasText: '清空示例' })).toBeVisible();
    await page.getByRole('button', { name: '清空回收站', exact: true }).click();
    await confirmation.getByRole('button', { name: '彻底删除', exact: true }).click();
    await expect(page.locator('.task-open')).toHaveCount(0);
    await page.getByRole('button', { name: '工作任务', exact: true }).click();
    await expect(page.locator('.task-open').filter({ hasText: '恢复示例' })).toBeVisible();
    await expect(page.locator('.task-open')).toHaveCount(1);
  } finally {
    await fixture.close();
  }
});

test('文档回收站指引可集中到达，逐篇恢复和删除确认不提供批量清空', async () => {
  const fixture = await start();
  const { app, page } = fixture;
  try {
    await page.getByRole('button', { name: '文档', exact: true }).click();
    await page.getByRole('button', { name: '文档回收站', exact: true }).click();
    const opened = await openDirect(app, page, '文档回收站使用指引', 'recycle-documents');
    if (opened) {
      await page.keyboard.press('Escape');
      await page.getByRole('button', { name: '设置', exact: true }).click();
      await page.getByRole('button', { name: '查看全部使用指引', exact: true }).click();
      await page
        .getByRole('dialog', { name: '使用指引', exact: true })
        .getByRole('button', { name: opened.feature.title, exact: true })
        .click();
      await page
        .getByRole('dialog', { name: opened.feature.title, exact: true })
        .getByRole('button', { name: '前往功能', exact: true })
        .click();
      await expectGuidanceDestination(page, opened.feature);
      if (opened.feature.entry.target === 'documents-trash')
        await expect(page.getByRole('button', { name: '文档回收站', exact: true })).toHaveAttribute(
          'aria-pressed',
          'true',
        );
    }
    await page.getByRole('button', { name: '文档', exact: true }).click();
    await page.getByRole('button', { name: '全部文档', exact: true }).click();
    for (const title of ['恢复文档示例', '彻底删除文档示例']) {
      await page.getByRole('button', { name: '新建文档', exact: true }).click();
      await page.getByLabel('文档标题', { exact: true }).fill(title);
      await page
        .getByRole('textbox', { name: '工作内容', exact: true })
        .fill('只含演示内容的回收站核对。');
      await page.getByRole('button', { name: '删除文档', exact: true }).click();
    }
    await page.getByRole('button', { name: '文档回收站', exact: true }).click();
    await expect(page.getByRole('button', { name: '清空回收站', exact: true })).toHaveCount(0);
    await page.getByRole('button', { name: '文档 恢复文档示例', exact: true }).click();
    await expect(page.getByLabel('文档标题', { exact: true })).toBeDisabled();
    await page.getByRole('button', { name: '恢复文档', exact: true }).click();
    await expect(page.getByRole('button', { name: '文档 恢复文档示例', exact: true })).toHaveCount(
      0,
    );
    await page.getByRole('button', { name: '文档 彻底删除文档示例', exact: true }).click();
    await page.getByRole('button', { name: '彻底删除', exact: true }).click();
    const confirmation = page.getByRole('dialog', { name: '彻底删除文档', exact: true });
    await expect(confirmation).toContainText('将无法从回收站恢复');
    await confirmation.getByRole('button', { name: '取消', exact: true }).click();
    await expect(page.getByLabel('文档标题', { exact: true })).toHaveValue('彻底删除文档示例');
    await page.getByRole('button', { name: '彻底删除', exact: true }).click();
    await confirmation.getByRole('button', { name: '彻底删除', exact: true }).click();
    await expect(
      page.getByRole('button', { name: '文档 彻底删除文档示例', exact: true }),
    ).toHaveCount(0);
    await page.getByRole('button', { name: '全部文档', exact: true }).click();
    await page.getByRole('button', { name: '文档 恢复文档示例', exact: true }).click();
    await expect(page.getByRole('textbox', { name: '工作内容', exact: true })).toContainText(
      '只含演示内容',
    );
    await expect(page.getByLabel('文档标题', { exact: true })).toBeEnabled();
  } finally {
    await fixture.close();
  }
});
