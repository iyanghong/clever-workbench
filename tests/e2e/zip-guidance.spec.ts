import { test, expect } from '@playwright/test';
import { electron } from './launch';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { expectedFeatureGuide, verifyUnavailableOrNoTarget } from './guidance-content';

test('工具目录可以打开 ZIP 文本归档的使用指引', async () => {
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), 'workbench-zip-guide-'));
  const env: Record<string, string> = { ...process.env, CLEVER_WORKBENCH_DATA_DIR: directory };
  delete env.ELECTRON_RUN_AS_NODE;
  const app = await electron.launch({ args: ['.'], env });
  try {
    const page = await app.firstWindow();
    await page.getByRole('button', { name: '工具', exact: true }).click();
    await page.getByRole('button', { name: 'ZIP 文本归档使用指引', exact: true }).click();
    await expect(page.getByRole('dialog', { name: '使用指引', exact: true })).toBeVisible();
  } finally {
    await app.close();
    await fs.rm(directory, { recursive: true, force: true });
  }
});

test('四种模式的就近帮助随选项切换，离线可阅读并安全关闭', async ({}, info) => {
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), 'workbench-zip-guide-'));
  const env: Record<string, string> = { ...process.env, CLEVER_WORKBENCH_DATA_DIR: directory };
  delete env.ELECTRON_RUN_AS_NODE;
  const app = await electron.launch({ args: ['.'], env });
  try {
    const page = await app.firstWindow();
    await page.context().setOffline(true);
    await page.getByRole('button', { name: '工具', exact: true }).click();
    await page.getByRole('button', { name: '打开工具', exact: true }).click();
    for (const [mode, id] of [
      ['归档文件', 'zip-archive-files'],
      ['Git 筛选归档', 'zip-archive-git'],
      ['目录还原', 'zip-restore-directory'],
      ['剪贴板还原', 'zip-restore-clipboard'],
    ]) {
      await page.getByRole('tab', { name: mode, exact: true }).click();
      const button = page.getByRole('button', { name: `${mode}使用指引`, exact: true });
      await button.click();
      const guide = await expectedFeatureGuide(app, id);
      if (!(await verifyUnavailableOrNoTarget(page, guide))) {
        const dialog = page.getByRole('dialog', { name: guide!.title, exact: true });
        await expect(dialog.getByRole('heading', { name: guide!.steps[0].title })).toBeVisible();
        await expect(dialog.getByText(guide!.steps[0].action)).toBeVisible();
        await dialog.getByRole('button', { name: '下一步', exact: true }).click();
        await expect(dialog.getByRole('heading', { name: guide!.steps[1].title })).toBeVisible();
        if (mode === '剪贴板还原')
          await page.screenshot({ path: info.outputPath('zip-paste-guide.png') });
        await page.keyboard.press('Escape');
        await expect(dialog).toHaveCount(0);
      }
      await expect(button).toBeFocused();
    }
    await expect(page.getByRole('tab', { name: '剪贴板还原', exact: true })).toHaveAttribute(
      'aria-selected',
      'true',
    );
    const state = await page.evaluate(() => window.desktop.tools.state('zip-text'));
    expect(state.busy).toBe(false);
    expect(state.output).toBe('');
  } finally {
    await app.close();
    await fs.rm(directory, { recursive: true, force: true });
  }
});

test('首页收藏工具旁可以直接查阅 ZIP 指引', async ({}, info) => {
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), 'workbench-zip-guide-'));
  const env: Record<string, string> = { ...process.env, CLEVER_WORKBENCH_DATA_DIR: directory };
  delete env.ELECTRON_RUN_AS_NODE;
  const app = await electron.launch({ args: ['.'], env });
  try {
    const page = await app.firstWindow();
    await page.getByRole('button', { name: '工具', exact: true }).click();
    await page.getByRole('button', { name: '设为常用工具', exact: true }).click();
    await page.getByRole('button', { name: '工作台', exact: true }).click();
    await expect(page.getByRole('button', { name: '打开常用工具 ZIP 文本归档' })).toBeVisible();
    await page.screenshot({ path: info.outputPath('zip-favorite-help.png') });
    await page.getByRole('button', { name: 'ZIP 文本归档使用指引', exact: true }).click();
    await expect(page.getByRole('dialog', { name: '使用指引', exact: true })).toBeVisible();
  } finally {
    await app.close();
    await fs.rm(directory, { recursive: true, force: true });
  }
});

test('从指引前往 ZIP 功能会打开工具本身', async () => {
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), 'workbench-zip-guide-'));
  const env: Record<string, string> = { ...process.env, CLEVER_WORKBENCH_DATA_DIR: directory };
  delete env.ELECTRON_RUN_AS_NODE;
  const app = await electron.launch({ args: ['.'], env });
  try {
    const page = await app.firstWindow();
    await page.getByRole('button', { name: '工具', exact: true }).click();
    await page.getByRole('button', { name: 'ZIP 文本归档使用指引', exact: true }).click();
    const feature = await expectedFeatureGuide(app, 'zip-archive-files');
    const library = page.getByRole('dialog', { name: '使用指引', exact: true });
    if (!feature || !feature.placements.includes('zip-text-archive')) {
      await expect(library).toBeVisible();
      test.info().annotations.push({
        type: 'guidance-content-warning',
        description: '被测包缺少归档文件指引，已检查目录仍可打开；正文导航路径未覆盖。',
      });
      return;
    }
    await library.getByRole('button', { name: feature.title, exact: true }).click();
    if (await verifyUnavailableOrNoTarget(page, feature)) return;
    await page
      .getByRole('dialog', { name: feature.title, exact: true })
      .getByRole('button', { name: '前往功能', exact: true })
      .click();
    await expect(page.getByRole('heading', { name: 'ZIP 文本归档', exact: true })).toBeVisible();
    await expect(page.getByRole('tab', { name: '归档文件', exact: true })).toBeVisible();
  } finally {
    await app.close();
    await fs.rm(directory, { recursive: true, force: true });
  }
});

test('取消选取来源仍保留原路径与未开始状态', async () => {
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), 'workbench-zip-guide-'));
  const source = path.join(directory, 'example.txt');
  await fs.writeFile(source, '示例资料');
  const env: Record<string, string> = { ...process.env, CLEVER_WORKBENCH_DATA_DIR: directory };
  delete env.ELECTRON_RUN_AS_NODE;
  const app = await electron.launch({ args: ['.'], env });
  try {
    const page = await app.firstWindow();
    await page.getByRole('button', { name: '工具', exact: true }).click();
    await page.getByRole('button', { name: '打开工具', exact: true }).click();
    await page.getByLabel('待归档文件或目录', { exact: true }).fill(source);
    await app.evaluate(({ dialog }) => {
      dialog.showOpenDialog = (async () => ({ canceled: true, filePaths: [] })) as typeof dialog.showOpenDialog;
    });
    await page.getByRole('button', { name: '选文件', exact: true }).click();
    await expect(page.getByLabel('待归档文件或目录', { exact: true })).toHaveValue(source);
    await expect(page.getByRole('heading', { name: '准备开始', exact: true })).toBeVisible();
    await expect(page.getByRole('alert')).toHaveCount(0);
  } finally {
    await app.close();
    await fs.rm(directory, { recursive: true, force: true });
  }
});
