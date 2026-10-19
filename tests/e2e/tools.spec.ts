import { electron } from './launch';
import { test, expect, type Page } from '@playwright/test';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { randomBytes, createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { encryptPath } from '../../electron/tools/zip-archive';

const state = (page: Page) => page.evaluate(() => window.desktop.tools.state('zip-text'));
const idle = (page: Page) =>
  expect.poll(async () => (await state(page)).busy, { timeout: 60000 }).toBe(false);
const sidebar = (page: Page, name: string) =>
  page.getByRole('navigation', { name: '工作空间' }).getByRole('button', { name, exact: true });
const checksum = (bytes: Buffer) => createHash('sha256').update(bytes).digest('hex');
const pasteShortcut = process.platform === 'darwin' ? 'Meta+v' : 'Control+v';

test('10 个分片乱序收集，重复项自动跳过并保留原片，收齐后可直接还原', async ({}, info) => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'workbench-parts-dedupe-'));
  const source = path.join(root, 'sample.bin'),
    content = randomBytes(7_000_000);
  await fs.writeFile(source, content);
  const partsDirectory = await encryptPath(source, 'test', root, 1);
  const names = (await fs.readdir(partsDirectory)).sort();
  expect(names).toHaveLength(10);
  const env: Record<string, string> = {
    ...process.env,
    CLEVER_WORKBENCH_DATA_DIR: path.join(root, 'data'),
  };
  delete env.ELECTRON_RUN_AS_NODE;
  const app = await electron.launch({ args: ['.'], env }),
    page = await app.firstWindow();
  const copy = async (index: number) =>
    app.evaluate(
      ({ clipboard }, text) => clipboard.writeText(text),
      await fs.readFile(path.join(partsDirectory, names[index]), 'utf8'),
    );
  const add = async () => {
    await page.getByRole('button', { name: '从剪贴板加入', exact: true }).click();
    await idle(page);
  };
  const pasteTarget = page.getByRole('textbox', { name: '粘贴分片区域' });
  const paste = async () => {
    await expect(pasteTarget).toHaveAttribute('aria-disabled', 'false');
    await page.keyboard.press(pasteShortcut);
    await idle(page);
    await expect(pasteTarget).toHaveAttribute('aria-disabled', 'false');
  };
  try {
    await sidebar(page, '工具').click();
    await page.getByRole('button', { name: '打开工具', exact: true }).click();
    await page.getByRole('tab', { name: '剪贴板还原', exact: true }).click();
    await expect(pasteTarget).toBeFocused();
    await copy(0);
    await paste();
    expect((await state(page)).parts).toHaveLength(1);
    expect((await state(page)).notice).toBe('');
    await expect(pasteTarget).toBeFocused();
    const first = (await state(page)).parts;
    await paste();
    expect((await state(page)).parts).toEqual(first);
    expect((await state(page)).error).toBe('');
    await expect(
      page.getByRole('status').filter({ hasText: '第 1 / 10 片已存在，已自动跳过，保留原分片。' }),
    ).toBeVisible();
    await expect(page.locator('.tool-part')).toHaveCount(1);

    await copy(1);
    await app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0].webContents.paste());
    await expect.poll(async () => (await state(page)).parts.length).toBe(2);
    await idle(page);
    const pair = (await state(page)).parts;
    await copy(0);
    await page.getByRole('button', { name: '替换第 2 片', exact: true }).click();
    await idle(page);
    expect((await state(page)).parts).toEqual(pair);
    expect((await state(page)).error).toBe('');
    // An explicit replacement of the same slot must still work, including repairing a bad copy.
    await page.getByRole('button', { name: '替换第 1 片', exact: true }).click();
    await idle(page);
    expect((await state(page)).parts.find((part) => part.index === 1)?.id).not.toBe(first[0].id);
    expect((await state(page)).parts).toHaveLength(2);
    for (let index = 9; index >= 2; index--) {
      await copy(index);
      await paste();
    }
    const complete = (await state(page)).parts;
    await page.getByLabel('输出位置', { exact: true }).fill(root);
    await page.getByLabel('归档密码', { exact: true }).fill('test');
    await expect(page.getByRole('button', { name: '开始还原', exact: true })).toBeEnabled();
    await add();
    expect((await state(page)).parts).toEqual(complete);
    expect((await state(page)).partsReady).toBe(true);
    await expect(page.getByRole('button', { name: '开始还原', exact: true })).toBeEnabled();
    await expect(page.getByRole('alert')).toHaveCount(0);
    await page.screenshot({ path: info.outputPath('duplicate-skipped.png') });
    expect((await pasteTarget.textContent())!.length).toBeLessThan(100);

    // A matching index from a different archive remains a mixed-archive error, not a duplicate.
    await app.evaluate(
      ({ clipboard }, text) => clipboard.writeText(text),
      await fs.readFile('tests/fixtures/zip-text/legacy-part.txt', 'utf8'),
    );
    await add();
    const mixed = await state(page);
    expect(mixed.parts).toHaveLength(11);
    expect(mixed.partsReady).toBe(false);
    expect(mixed.partsDescription).toContain('不同归档');
    const extra = mixed.parts.find((part) => !complete.some((old) => old.id === part.id))!;
    await page.evaluate(
      (id) => window.desktop.tools.command('zip-text', { type: 'paste.remove', id }),
      extra.id,
    );
    await idle(page);
    await page.getByRole('button', { name: '开始还原', exact: true }).click();
    await idle(page);
    expect((await state(page)).error).toBe('');
    expect(checksum(await fs.readFile(path.join(root, 'restored', 'sample.bin')))).toBe(
      checksum(content),
    );
  } finally {
    await idle(page).catch(() => {});
    await app.evaluate(({ clipboard }) => clipboard.clear());
    await app.close();
    await fs.rm(root, { recursive: true, force: true });
  }
});

test('粘贴快捷键保留路径、密码、搜索及其他页面的普通文本粘贴', async () => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'workbench-paste-focus-'));
  const env: Record<string, string> = { ...process.env, CLEVER_WORKBENCH_DATA_DIR: root };
  delete env.ELECTRON_RUN_AS_NODE;
  const app = await electron.launch({ args: ['.'], env }),
    page = await app.firstWindow();
  const copy = (text: string) =>
    app.evaluate(({ clipboard }, value) => clipboard.writeText(value), text);
  try {
    await sidebar(page, '工具').click();
    await page.getByRole('button', { name: '打开工具', exact: true }).click();
    await page.getByRole('tab', { name: '剪贴板还原', exact: true }).click();
    for (const [label, text] of [
      ['输出位置', '/example/output'],
      ['归档密码', 'fixture-password'],
    ]) {
      await copy(text);
      const input = page.getByLabel(label, { exact: true });
      await input.focus();
      await page.keyboard.press(pasteShortcut);
      await expect(input).toHaveValue(text);
    }
    await page.getByRole('button', { name: '全局搜索', exact: true }).click();
    await copy('search text');
    await page.getByLabel('搜索工作台内容').focus();
    await page.keyboard.press(pasteShortcut);
    await expect(page.getByLabel('搜索工作台内容')).toHaveValue('search text');
    await page.keyboard.press('Escape');
    await sidebar(page, '工作台').click();
    await copy('new task');
    await page.getByLabel('快速新增任务').focus();
    await page.keyboard.press(pasteShortcut);
    await expect(page.getByLabel('快速新增任务')).toHaveValue('new task');
    const snapshot = await state(page);
    expect(snapshot.parts).toHaveLength(0);
    expect(snapshot.error).toBe('');
    expect(snapshot.operation).toBe('');
  } finally {
    await app.evaluate(({ clipboard }) => clipboard.clear());
    await app.close();
    await fs.rm(root, { recursive: true, force: true });
  }
});

test('工具收藏、后台运行与退出保护、目录及剪贴板还原', async ({}, info) => {
  test.setTimeout(120000);
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'workbench-tools-ui-'));
  const env: Record<string, string> = {
    ...process.env,
    CLEVER_WORKBENCH_DATA_DIR: path.join(root, 'data'),
  };
  delete env.ELECTRON_RUN_AS_NODE;
  const source = path.join(root, '待归档'),
    restoreParent = path.join(root, '目录还原'),
    pasteParent = path.join(root, '粘贴还原');
  await fs.mkdir(source);
  await fs.mkdir(restoreParent);
  await fs.mkdir(pasteParent);
  const content = randomBytes(32_000_000);
  await fs.writeFile(path.join(source, '二进制.bin'), content);
  await fs.mkdir(path.join(source, '空目录'));
  await fs.writeFile(path.join(source, '说明.txt'), '示例文件');
  let app = await electron.launch({ args: ['.'], env });
  let page = await app.firstWindow();
  try {
    const errors: string[] = [];
    page.on('pageerror', (error) => errors.push(error.message));
    await sidebar(page, '工具').click();
    await expect(page.getByRole('heading', { name: '工具', exact: true })).toBeVisible();
    await page.getByRole('button', { name: '设为常用工具', exact: true }).click();
    await page.getByRole('button', { name: '打开工具', exact: true }).click();
    await page.getByLabel('待归档文件或目录', { exact: true }).fill(source);
    await page.getByLabel('设置归档密码', { exact: true }).fill('归档-secret');
    await page.getByLabel('再次输入密码', { exact: true }).fill('归档-secret');
    await page.screenshot({ path: info.outputPath('zip-light.png') });
    await page.getByRole('button', { name: '开始归档', exact: true }).click();
    expect((await state(page)).busy).toBe(true);
    await app.evaluate(({ BrowserWindow, dialog }) => {
      const host = globalThis as typeof globalThis & { toolCloseMessage?: string };
      dialog.showMessageBox = (async (_window: unknown, options: { message: string }) => {
        host.toolCloseMessage = options.message;
        return { response: 0, checkboxChecked: false };
      }) as typeof dialog.showMessageBox;
      BrowserWindow.getAllWindows()[0].close();
    });
    await expect
      .poll(() =>
        app.evaluate(
          () => (globalThis as typeof globalThis & { toolCloseMessage?: string }).toolCloseMessage,
        ),
      )
      .toContain('工具任务尚未完成');
    await sidebar(page, '工作台').click();
    await expect(page.getByRole('heading', { name: '我的工作台' })).toBeVisible();
    await page.getByRole('button', { name: '打开常用工具 ZIP 文本归档', exact: true }).click();
    await idle(page);
    const packed = await state(page);
    expect(packed.error).toBe('');
    await expect(page.getByRole('button', { name: '打开结果目录' })).toBeVisible();
    await expect(page.getByLabel('设置归档密码', { exact: true })).toHaveValue('');
    await page.getByRole('tab', { name: '目录还原', exact: true }).click();
    await page.getByLabel('文本分片目录', { exact: true }).fill(packed.output);
    await page.getByLabel('输出位置', { exact: true }).fill(restoreParent);
    await page.getByLabel('归档密码', { exact: true }).fill('归档-secret');
    await page.getByRole('button', { name: '开始还原', exact: true }).click();
    await idle(page);
    expect((await state(page)).error).toBe('');
    expect(
      checksum(await fs.readFile(path.join(restoreParent, 'restored', '待归档', '二进制.bin'))),
    ).toBe(checksum(content));
    await page.getByRole('tab', { name: '剪贴板还原', exact: true }).click();
    const encoded = await fs.readFile(path.join(packed.output, 'part-000001.txt'), 'utf8');
    await app.evaluate(({ clipboard }, text) => clipboard.writeText(text), ` \n${encoded}\n `);
    await page.getByRole('textbox', { name: '粘贴分片区域' }).focus();
    await page.keyboard.press(pasteShortcut);
    await page.keyboard.press(pasteShortcut);
    await idle(page);
    expect((await state(page)).error).toBe('');
    expect((await state(page)).notice).toBe('');
    await expect(page.getByText(/已收齐 1 片/)).toBeVisible();
    await sidebar(page, '工作台').click();
    await page.getByRole('button', { name: '打开常用工具 ZIP 文本归档', exact: true }).click();
    await expect(page.getByText(/已收齐 1 片/)).toBeVisible();
    await page.getByLabel('输出位置', { exact: true }).fill(pasteParent);
    await page.getByLabel('归档密码', { exact: true }).fill('wrong');
    await page.getByRole('button', { name: '开始还原', exact: true }).click();
    await idle(page);
    expect((await state(page)).parts).toHaveLength(1);
    await expect(page.getByRole('alert')).toContainText('密码错误');
    await page.getByLabel('归档密码', { exact: true }).fill('归档-secret');
    await page.getByRole('button', { name: '开始还原', exact: true }).click();
    await idle(page);
    expect((await state(page)).error).toBe('');
    expect((await state(page)).parts).toHaveLength(0);
    expect(
      checksum(await fs.readFile(path.join(pasteParent, 'restored', '待归档', '二进制.bin'))),
    ).toBe(checksum(content));
    await page.evaluate(() => window.desktop.mutate({ type: 'settings', theme: 'dark' }));
    await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark');
    await expect
      .poll(() =>
        page.locator('#zip-output').evaluate((input) => getComputedStyle(input).backgroundColor),
      )
      .toBe('rgb(37, 38, 42)');
    await page.setViewportSize({ width: 850, height: 740 });
    await page.screenshot({ path: info.outputPath('zip-dark-narrow.png') });
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(
      true,
    );
    expect(errors).toEqual([]);
    await app.evaluate(({ clipboard }) => clipboard.clear());
    await app.close();
    app = await electron.launch({ args: ['.'], env });
    page = await app.firstWindow();
    await expect(
      page.getByRole('button', { name: '打开常用工具 ZIP 文本归档', exact: true }),
    ).toBeVisible();
    await page.getByRole('button', { name: '打开常用工具 ZIP 文本归档', exact: true }).click();
    await expect(page.getByLabel('输出位置', { exact: true })).toHaveValue(pasteParent);
    expect((await state(page)).parts).toHaveLength(0);
  } finally {
    await idle(page).catch(() => {});
    await app.close();
    await fs.rm(root, { recursive: true, force: true });
  }
});

test('Git 提交筛选预览并打包当前磁盘文件', async ({}, info) => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'workbench-tools-git-ui-')),
    source = path.join(root, 'repository');
  await fs.mkdir(source);
  const git = (...args: string[]) => execFileSync('git', ['-C', source, ...args]);
  git('init', '-b', 'main');
  git('config', 'user.name', 'UI Author');
  git('config', 'user.email', 'ui@example.invalid');
  await fs.writeFile(path.join(source, 'file.txt'), 'committed');
  git('add', '.');
  git('commit', '-m', '示例提交');
  await fs.writeFile(path.join(source, 'file.txt'), 'current content');
  const env: Record<string, string> = {
    ...process.env,
    CLEVER_WORKBENCH_DATA_DIR: path.join(root, 'data'),
  };
  delete env.ELECTRON_RUN_AS_NODE;
  const app = await electron.launch({ args: ['.'], env }),
    page = await app.firstWindow();
  try {
    await sidebar(page, '工具').click();
    await page.getByRole('button', { name: '打开工具', exact: true }).click();
    await page.getByRole('tab', { name: 'Git 筛选归档', exact: true }).click();
    await page.getByLabel('Git 工作目录', { exact: true }).fill(source);
    await page.getByRole('button', { name: '读取分支' }).click();
    await idle(page);
    await expect(page.getByLabel('分支', { exact: true })).toHaveValue('refs/heads/main');
    await page.getByLabel('作者', { exact: true }).fill('UI Author');
    await page.getByRole('button', { name: '应用筛选', exact: true }).click();
    await idle(page);
    await page.getByRole('checkbox', { name: /示例提交/ }).check();
    await expect(page.getByRole('heading', { name: '将打包 1 个文件', exact: true })).toBeVisible();
    await page.getByLabel('设置归档密码', { exact: true }).fill('test');
    await page.getByLabel('再次输入密码', { exact: true }).fill('test');
    await page.screenshot({ path: info.outputPath('zip-git.png') });
    await page.getByRole('button', { name: '开始归档', exact: true }).click();
    await idle(page);
    const packed = await state(page);
    expect(packed.error).toBe('');
    await page.evaluate(
      (source) =>
        window.desktop.tools.command('zip-text', {
          type: 'restore',
          settings: { source, outputDir: '', partSizeMB: 50 },
          password: 'test',
        }),
      packed.output,
    );
    await idle(page);
    const restored = await state(page);
    expect(restored.error).toBe('');
    expect(await fs.readFile(path.join(restored.output, 'repository', 'file.txt'), 'utf8')).toBe(
      'current content',
    );
  } finally {
    await idle(page).catch(() => {});
    await app.close();
    await fs.rm(root, { recursive: true, force: true });
  }
});
