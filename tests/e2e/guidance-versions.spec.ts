import { test, expect, type ElectronApplication } from '@playwright/test';
import { electron } from './launch';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import type { ReleaseGuide } from '../../src/guidance/types';
import { expectedUpdateGuide } from './guidance-content';

const release = (
  version: string,
  summary: string,
  publication: 'pending' | 'published' = 'published',
): ReleaseGuide => ({
  schemaVersion: 1,
  kind: 'release',
  version,
  tag: `v${version}`,
  sourceSha: 'a'.repeat(40),
  publication,
  operationChange: 'changed',
  summary,
  changes: [{ id: `change-${version}`, summary, guideIds: ['application-update'] }],
});
async function versions(app: ElectronApplication, releases: ReleaseGuide[], version?: string) {
  const page = await app.firstWindow();
  await page.getByRole('button', { name: '工作台', exact: true }).waitFor();
  await app.evaluate(
    ({ app, ipcMain }, value) => {
      if (value.version) app.getVersion = () => value.version!;
      ipcMain.removeHandler('guidance-versions');
      ipcMain.handle('guidance-versions', () => ({
        currentVersion: app.getVersion(),
        releases: value.releases,
      }));
    },
    { releases, version },
  );
  await page.reload();
  return page;
}

test('首次只显示当前绑定版本，成功展示后关闭和重启不重复，设置可手动重看', async () => {
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), 'workbench-version-guide-'));
  const env: Record<string, string> = { ...process.env, CLEVER_WORKBENCH_DATA_DIR: directory };
  delete env.ELECTRON_RUN_AS_NODE;
  let app = await electron.launch({ args: ['.'], env });
  try {
    const current = await app.evaluate(({ app }) => app.getVersion());
    const records = [
      release('0.1.0', '不应回放的旧版变化'),
      release(current, '当前版本新增操作说明', 'pending'),
    ];
    let page = await versions(app, records);
    const prompt = page.getByRole('dialog', { name: '版本操作指引', exact: true });
    await expect(prompt).toBeVisible({ timeout: 6000 });
    await expect(prompt).toContainText('当前版本新增操作说明');
    await expect(prompt).not.toContainText('不应回放的旧版变化');
    await page.keyboard.press('Escape');
    await expect(prompt).toHaveCount(0);
    await app.close();
    app = await electron.launch({ args: ['.'], env });
    page = await versions(app, records);
    await page.getByRole('button', { name: '设置', exact: true }).click();
    await page.getByRole('button', { name: '查看版本操作说明', exact: true }).click();
    const history = page.getByRole('dialog', { name: '版本操作说明', exact: true });
    await history.getByRole('button', { name: `查看 v${current} 操作说明`, exact: true }).click();
    await expect(page.getByRole('dialog', { name: '版本操作指引', exact: true })).toContainText(
      '当前版本新增操作说明',
    );
    await page.keyboard.press('Escape');
    await page.waitForTimeout(2000);
    await expect(page.locator('dialog[open]')).toHaveCount(0);
  } finally {
    await app.close();
    await fs.rm(directory, { recursive: true, force: true });
  }
});

test('跨版本按功能合并不同变化，目标无新增操作仍提示，失败标签不进入历史', async () => {
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), 'workbench-version-range-'));
  await fs.mkdir(path.join(directory, 'guidance'));
  await fs.writeFile(
    path.join(directory, 'guidance', 'state.json'),
    JSON.stringify({
      schemaVersion: 1,
      firstVersion: '0.1.8',
      lastStartedVersion: '0.1.9',
      shownThrough: '0.1.9',
    }),
  );
  const env: Record<string, string> = { ...process.env, CLEVER_WORKBENCH_DATA_DIR: directory };
  delete env.ELECTRON_RUN_AS_NODE;
  const app = await electron.launch({ args: ['.'], env });
  try {
    const expected = await expectedUpdateGuide(app);
    const page = await versions(
      app,
      [
        release('0.1.10', '支持下载后稍后重启'),
        release('0.1.12', '加入安装失败恢复入口'),
        release('0.1.11', '失败标签不应出现', 'pending'),
        {
          ...release('0.1.14', '常规修复', 'pending'),
          operationChange: 'none',
          noOperationReason: '修复内部行为，没有新增操作。',
          changes: [],
        },
      ],
      '0.1.14',
    );
    const prompt = page.getByRole('dialog', { name: '版本操作指引', exact: true });
    await expect(prompt).toBeVisible({ timeout: 6000 });
    if (expected)
      await expect(
        prompt.getByRole('button', { name: `查看当前用法：${expected.title}`, exact: true }),
      ).toHaveCount(1);
    else {
      await expect(
        prompt.getByText('此功能指引已移除或暂不可用，历史摘要仍可阅读。', { exact: true }),
      ).toHaveCount(1);
      test
        .info()
        .annotations.push({
          type: 'guidance-content-warning',
          description: '当前功能正文不可用，版本变化仍按同一功能合并，并验证了不可用说明。',
        });
    }
    await expect(prompt).toContainText('支持下载后稍后重启');
    await expect(prompt).toContainText('加入安装失败恢复入口');
    await expect(prompt).not.toContainText('失败标签不应出现');
    await page.keyboard.press('Escape');
    await versions(app, [release('0.1.11', '降级也不重复')], '0.1.11');
    await page.waitForTimeout(1500);
    await expect(page.locator('dialog[open]')).toHaveCount(0);
    await versions(app, [release('0.1.14', '再次升级也不重复')], '0.1.14');
    await page.waitForTimeout(1500);
    await expect(page.locator('dialog[open]')).toHaveCount(0);
  } finally {
    await app.close();
    await fs.rm(directory, { recursive: true, force: true });
  }
});

test('持续输入与中文组合期间不抢焦点，结束并保存后再提示', async () => {
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), 'workbench-version-typing-'));
  const env: Record<string, string> = { ...process.env, CLEVER_WORKBENCH_DATA_DIR: directory };
  delete env.ELECTRON_RUN_AS_NODE;
  const app = await electron.launch({ args: ['.'], env });
  try {
    const current = await app.evaluate(({ app }) => app.getVersion());
    const page = await versions(app, [release(current, '等待编辑完成后介绍变化', 'pending')]);
    const input = page.getByLabel('快速新增任务');
    await input.focus();
    await input.dispatchEvent('compositionstart');
    for (let i = 0; i < 12; i++) {
      await input.press('a');
      await page.waitForTimeout(150);
      await expect(page.locator('dialog[open]')).toHaveCount(0);
    }
    await input.dispatchEvent('compositionend');
    await expect(page.getByRole('dialog', { name: '版本操作指引', exact: true })).toBeVisible({
      timeout: 5000,
    });
    await page.keyboard.press('Escape');
    await expect(input).toHaveValue('aaaaaaaaaaaa');
    await expect(input).toBeFocused();
  } finally {
    await app.close();
    await fs.rm(directory, { recursive: true, force: true });
  }
});

test('主界面资料尚未就绪时不显示，等载入完成才开始提示', async () => {
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), 'workbench-version-loading-'));
  const env: Record<string, string> = { ...process.env, CLEVER_WORKBENCH_DATA_DIR: directory };
  delete env.ELECTRON_RUN_AS_NODE;
  const app = await electron.launch({ args: ['.'], env });
  try {
    let page = await app.firstWindow();
    await page.getByRole('button', { name: '工作台', exact: true }).waitFor();
    const snapshot = await page.evaluate(() => window.desktop.snapshot());
    await app.evaluate(({ ipcMain }, snapshot) => {
      const waiting: (() => void)[] = [];
      (globalThis as any).finishGuidanceSnapshot = () =>
        waiting.splice(0).forEach((resolve) => resolve());
      ipcMain.removeHandler('snapshot');
      ipcMain.handle(
        'snapshot',
        () =>
          new Promise((resolve) => {
            waiting.push(() => resolve(snapshot));
          }),
      );
    }, snapshot);
    const current = await app.evaluate(({ app }) => app.getVersion());
    page = await versions(app, [release(current, '资料加载完成后再看说明', 'pending')]);
    await page.waitForTimeout(1800);
    await expect(page.locator('dialog[open]')).toHaveCount(0);
    await app.evaluate(() => (globalThis as any).finishGuidanceSnapshot());
    await expect(page.getByRole('dialog', { name: '版本操作指引', exact: true })).toBeVisible({
      timeout: 4000,
    });
  } finally {
    await app.evaluate(() => (globalThis as any).finishGuidanceSnapshot?.());
    await app.close();
    await fs.rm(directory, { recursive: true, force: true });
  }
});

test('更新重启提示等待当前指引关闭，版本提示也避让更新重启窗口', async () => {
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), 'workbench-version-modal-'));
  const env: Record<string, string> = { ...process.env, CLEVER_WORKBENCH_DATA_DIR: directory };
  delete env.ELECTRON_RUN_AS_NODE;
  const app = await electron.launch({ args: ['.'], env });
  try {
    const expected = await expectedUpdateGuide(app);
    const installedVersion = await app.evaluate(({ app }) => app.getVersion());
    const [major, minor, patch] = installedVersion.split('.').map(Number);
    const scenarioVersion = `${major}.${minor}.${patch + 1}`;
    const targetVersion = `${major}.${minor}.${patch + 2}`;
    const page = await app.firstWindow();
    const bundled = await page.evaluate(() => window.desktop.guidanceVersions());
    if (
      bundled.releases.some(
        (item) => item.version === installedVersion && item.operationChange === 'changed',
      )
    ) {
      const firstUse = page.getByRole('dialog', { name: '版本操作指引', exact: true });
      await expect(firstUse).toBeVisible({ timeout: 6000 });
      await page.keyboard.press('Escape');
      await expect(firstUse).toHaveCount(0);
      await expect
        .poll(() => page.evaluate(() => window.desktop.guidanceState()))
        .toMatchObject({ shownThrough: installedVersion, persisted: true });
    }
    await page.getByRole('button', { name: '设置', exact: true }).click();
    await page.getByRole('button', { name: '应用更新使用指引', exact: true }).click();
    const guide = page.getByRole('dialog', { name: expected?.title ?? '使用指引', exact: true });
    await expect(guide).toBeVisible();
    if (!expected) await expect(guide).toContainText('此指引暂不可用');
    await app.evaluate(
      ({ BrowserWindow }, { installedVersion, targetVersion }) =>
        BrowserWindow.getAllWindows()[0].webContents.send('update-state', {
          status: 'ready',
          currentVersion: installedVersion,
          preparedId: 'modal-fixture',
          release: {
            version: targetVersion,
            notes: '验收示例',
            pageUrl: '',
            publishedAt: '',
            zip: { name: 'example.zip', size: 1, url: '' },
            checksums: { name: 'SHA256SUMS', size: 1, url: '' },
          },
        }),
      { installedVersion, targetVersion },
    );
    await page.waitForTimeout(400);
    await expect(page.locator('dialog[open]')).toHaveCount(1);
    await expect(guide).toBeVisible();
    await page.keyboard.press('Escape');
    const restart = page.getByRole('dialog', { name: '更新已准备好', exact: true });
    await expect(restart).toBeVisible({ timeout: 4000 });
    await restart.getByRole('button', { name: '稍后重启', exact: true }).click();
    await versions(
      app,
      [release(scenarioVersion, '关闭更新重启提示后查看', 'pending')],
      scenarioVersion,
    );
    await app.evaluate(
      ({ BrowserWindow }, { scenarioVersion, targetVersion }) =>
        BrowserWindow.getAllWindows()[0].webContents.send('update-state', {
          status: 'ready',
          currentVersion: scenarioVersion,
          preparedId: 'modal-fixture-2',
          release: {
            version: targetVersion,
            notes: '验收示例',
            pageUrl: '',
            publishedAt: '',
            zip: { name: 'example.zip', size: 1, url: '' },
            checksums: { name: 'SHA256SUMS', size: 1, url: '' },
          },
        }),
      { scenarioVersion, targetVersion },
    );
    await expect(restart).toBeVisible();
    await page.waitForTimeout(1600);
    await expect(page.locator('dialog[open]')).toHaveCount(1);
    await restart.getByRole('button', { name: '稍后重启', exact: true }).click();
    await expect(page.getByRole('dialog', { name: '版本操作指引', exact: true })).toBeVisible({
      timeout: 5000,
    });
  } finally {
    await app.close();
    await fs.rm(directory, { recursive: true, force: true });
  }
});

test('真实恢复旧业务备份不回退设备提示记录，另一设备恢复后按首次提示', async () => {
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), 'workbench-version-restore-'));
  const other = await fs.mkdtemp(path.join(os.tmpdir(), 'workbench-version-device-'));
  const env: Record<string, string> = { ...process.env, CLEVER_WORKBENCH_DATA_DIR: directory };
  delete env.ELECTRON_RUN_AS_NODE;
  let app = await electron.launch({ args: ['.'], env });
  try {
    let page = await app.firstWindow();
    await page.getByRole('button', { name: '工作台', exact: true }).waitFor();
    const current = await app.evaluate(({ app }) => app.getVersion());
    const filename = path.join(directory, 'before-guidance.cwb');
    await app.evaluate(({ dialog }, filename) => {
      dialog.showSaveDialog = (async () => ({
        canceled: false,
        filePath: filename,
      })) as typeof dialog.showSaveDialog;
    }, filename);
    await page.evaluate(async () => {
      await window.desktop.configureBackup('fictional-guidance-backup-password');
      await window.desktop.backup();
    });
    page = await versions(app, [release(current, '本机已显示的版本变化', 'pending')]);
    const prompt = page.getByRole('dialog', { name: '版本操作指引', exact: true });
    await expect(prompt).toBeVisible({ timeout: 5000 });
    await page.keyboard.press('Escape');
    await expect
      .poll(() => page.evaluate(() => window.desktop.guidanceState()))
      .toMatchObject({ shownThrough: current, persisted: true });
    async function restore() {
      await app.evaluate(({ dialog }, filename) => {
        dialog.showOpenDialog = (async () => ({
          canceled: false,
          filePaths: [filename],
        })) as typeof dialog.showOpenDialog;
      }, filename);
      await page.getByRole('button', { name: '设置', exact: true }).click();
      await page.getByRole('button', { name: '从备份恢复', exact: true }).click();
      await page.getByLabel('备份密码', { exact: true }).fill('fictional-guidance-backup-password');
      await page.getByRole('button', { name: '校验备份', exact: true }).click();
      await page.getByRole('button', { name: '恢复备份', exact: true }).click();
      await expect(page.getByRole('status').filter({ hasText: '恢复完成' })).toBeVisible();
    }
    await restore();
    expect(await page.evaluate(() => window.desktop.guidanceState())).toMatchObject({
      shownThrough: current,
      persisted: true,
    });
    await page.reload();
    await page.waitForTimeout(1700);
    await expect(page.locator('dialog[open]')).toHaveCount(0);
    await app.close();
    app = await electron.launch({ args: ['.'], env: { ...env, CLEVER_WORKBENCH_DATA_DIR: other } });
    page = await app.firstWindow();
    await restore();
    expect(await page.evaluate(() => window.desktop.guidanceState())).toMatchObject({
      shownThrough: null,
    });
    page = await versions(app, [release(current, '新设备首次说明', 'pending')]);
    await expect(page.getByRole('dialog', { name: '版本操作指引', exact: true })).toContainText(
      '新设备首次说明',
      { timeout: 5000 },
    );
  } finally {
    await app.close();
    await fs.rm(directory, { recursive: true, force: true });
    await fs.rm(other, { recursive: true, force: true });
  }
});

for (const failure of ['corrupt', 'unwritable'] as const)
  test(`设备记录${failure === 'corrupt' ? '损坏只考虑当前版本' : '写入失败如实提示并在当前进程去重'}`, async () => {
    const directory = await fs.mkdtemp(path.join(os.tmpdir(), 'workbench-version-state-'));
    if (failure === 'corrupt') {
      await fs.mkdir(path.join(directory, 'guidance'));
      await fs.writeFile(path.join(directory, 'guidance', 'state.json'), '{broken');
    } else await fs.writeFile(path.join(directory, 'guidance'), '阻止测试记录目录写入');
    const env: Record<string, string> = { ...process.env, CLEVER_WORKBENCH_DATA_DIR: directory };
    delete env.ELECTRON_RUN_AS_NODE;
    let app = await electron.launch({ args: ['.'], env });
    try {
      const current = await app.evaluate(({ app }) => app.getVersion());
      const records = [
        release('0.1.0', '旧变化不回放'),
        release(current, '只介绍当前版本', 'pending'),
      ];
      let page = await versions(app, records);
      const prompt = page.getByRole('dialog', { name: '版本操作指引', exact: true });
      await expect(prompt).toBeVisible({ timeout: 5000 });
      await expect(prompt).not.toContainText('旧变化不回放');
      if (failure === 'unwritable') {
        await expect(prompt).toContainText('重启后可能再次显示');
        await expect
          .poll(() => page.evaluate(() => window.desktop.guidanceState()))
          .toMatchObject({ shownThrough: current, persisted: false });
      }
      await page.keyboard.press('Escape');
      await page.reload();
      await page.waitForTimeout(1600);
      await expect(page.locator('dialog[open]')).toHaveCount(0);
      await app.close();
      app = await electron.launch({ args: ['.'], env });
      page = await versions(app, records);
      if (failure === 'unwritable')
        await expect(page.getByRole('dialog', { name: '版本操作指引', exact: true })).toContainText(
          '重启后可能再次显示',
          { timeout: 5000 },
        );
      else {
        await page.waitForTimeout(1600);
        await expect(page.locator('dialog[open]')).toHaveCount(0);
      }
    } finally {
      await app.close();
      await fs.rm(directory, { recursive: true, force: true });
    }
  });

test('未实际显示的提示不被消费，等待期间退出后下一次仍可提示', async () => {
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), 'workbench-version-pending-'));
  const env: Record<string, string> = { ...process.env, CLEVER_WORKBENCH_DATA_DIR: directory };
  delete env.ELECTRON_RUN_AS_NODE;
  let app = await electron.launch({ args: ['.'], env });
  try {
    const current = await app.evaluate(({ app }) => app.getVersion());
    const records = [release(current, '实际显示后才记为已提示', 'pending')];
    let page = await versions(app, records);
    await page.evaluate(() => {
      const original = HTMLDialogElement.prototype.showModal;
      HTMLDialogElement.prototype.showModal = function () {
        if (this.getAttribute('aria-label') === '版本操作指引')
          throw new DOMException('验收：系统暂时拒绝显示');
        original.call(this);
      };
    });
    await page.waitForTimeout(1500);
    await expect(page.locator('dialog[open]')).toHaveCount(0);
    expect(await page.evaluate(() => window.desktop.guidanceState())).toMatchObject({
      shownThrough: null,
    });
    await app.close();
    app = await electron.launch({ args: ['.'], env });
    page = await versions(app, records);
    await expect(page.getByRole('dialog', { name: '版本操作指引', exact: true })).toBeVisible({
      timeout: 5000,
    });
  } finally {
    await app.close();
    await fs.rm(directory, { recursive: true, force: true });
  }
});

test('自动提示等待保存失败修复，保留输入且不反复抢焦点', async () => {
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), 'workbench-version-save-'));
  const env: Record<string, string> = { ...process.env, CLEVER_WORKBENCH_DATA_DIR: directory };
  delete env.ELECTRON_RUN_AS_NODE;
  const app = await electron.launch({ args: ['.'], env });
  const { DatabaseSync } = await import('node:sqlite');
  let database: InstanceType<typeof DatabaseSync> | undefined;
  try {
    const page = await app.firstWindow();
    await page.getByRole('button', { name: '工作台', exact: true }).waitFor();
    const generation = (await fs.readFile(path.join(directory, 'data', 'CURRENT'), 'utf8')).trim();
    database = new DatabaseSync(
      path.join(directory, 'data', 'vaults', generation, 'database.sqlite'),
    );
    database.exec(
      "CREATE TRIGGER version_draft_failure BEFORE INSERT ON preferences WHEN NEW.key='draft' BEGIN SELECT RAISE(ABORT,'版本指引验收保存失败'); END",
    );
    const current = await app.evaluate(({ app }) => app.getVersion());
    await versions(app, [release(current, '保存成功后再显示', 'pending')]);
    await page.getByRole('button', { name: '工作任务', exact: true }).click();
    const input = page.getByLabel('快速新增任务');
    await input.fill('仍需保留的任务草稿');
    await expect(page.getByRole('alert')).toContainText('版本指引验收保存失败');
    await page.waitForTimeout(1600);
    await expect(page.locator('dialog[open]')).toHaveCount(0);
    await expect(input).toHaveValue('仍需保留的任务草稿');
    database.exec('DROP TRIGGER version_draft_failure');
    await input.fill('修复后仍需保留的任务草稿');
    await expect(page.getByRole('dialog', { name: '版本操作指引', exact: true })).toBeVisible({
      timeout: 5000,
    });
    await page.keyboard.press('Escape');
    await expect(input).toHaveValue('修复后仍需保留的任务草稿');
  } finally {
    database?.exec('DROP TRIGGER IF EXISTS version_draft_failure');
    database?.close();
    await app.close();
    await fs.rm(directory, { recursive: true, force: true });
  }
});

test('正常关闭等待已显示提示记录落盘，避免快速退出后重复提示', async () => {
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), 'workbench-version-durable-'));
  const env: Record<string, string> = { ...process.env, CLEVER_WORKBENCH_DATA_DIR: directory };
  delete env.ELECTRON_RUN_AS_NODE;
  const app = await electron.launch({ args: ['.'], env });
  try {
    const current = await app.evaluate(({ app }) => app.getVersion());
    const page = await versions(app, [release(current, '关闭前保存提示记录', 'pending')]);
    await app.evaluate(async () => {
      const fs = process.getBuiltinModule('fs/promises') as typeof import('node:fs/promises');
      const original = fs.rename;
      fs.rename = (async (...args: Parameters<typeof original>) => {
        if (String(args[1]).endsWith('/guidance/state.json'))
          await new Promise<void>((resolve) => {
            (globalThis as any).finishGuidanceRename = resolve;
          });
        return original(...args);
      }) as typeof original;
      (globalThis as any).restoreGuidanceRename = () => {
        fs.rename = original;
      };
    });
    await expect(page.getByRole('dialog', { name: '版本操作指引', exact: true })).toBeVisible({
      timeout: 5000,
    });
    await expect
      .poll(() => app.evaluate(() => typeof (globalThis as any).finishGuidanceRename))
      .toBe('function');
    await app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0].close());
    await page.waitForTimeout(500);
    expect(page.isClosed()).toBe(false);
    await app.evaluate(() => {
      (globalThis as any).finishGuidanceRename();
      (globalThis as any).restoreGuidanceRename();
    });
    await expect.poll(() => page.isClosed()).toBe(true);
  } finally {
    await app
      .evaluate(() => {
        (globalThis as any).finishGuidanceRename?.();
        (globalThis as any).restoreGuidanceRename?.();
      })
      .catch(() => {});
    await app.close();
    await fs.rm(directory, { recursive: true, force: true });
  }
});

test('原生文件选择期间自动与手动版本窗口均避让，取消后可以继续查看', async () => {
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), 'workbench-version-native-'));
  const env: Record<string, string> = { ...process.env, CLEVER_WORKBENCH_DATA_DIR: directory };
  delete env.ELECTRON_RUN_AS_NODE;
  const app = await electron.launch({ args: ['.'], env });
  try {
    const current = await app.evaluate(({ app }) => app.getVersion());
    const page = await versions(app, [release(current, '原生文件选择结束后显示', 'pending')]);
    await app.evaluate(({ dialog }) => {
      const original = dialog.showOpenDialog;
      dialog.showOpenDialog = (() =>
        new Promise((resolve) => {
          (globalThis as any).finishVersionFileChoice = () =>
            resolve({ canceled: true, filePaths: [] });
        })) as typeof dialog.showOpenDialog;
      (globalThis as any).restoreVersionFileChoice = () => {
        dialog.showOpenDialog = original;
      };
    });
    await page.evaluate(() => {
      void window.desktop.chooseImages().catch(() => {});
    });
    await expect
      .poll(() => app.evaluate(() => typeof (globalThis as any).finishVersionFileChoice))
      .toBe('function');
    await page.getByRole('button', { name: '设置', exact: true }).click();
    await page.getByRole('button', { name: '查看版本操作说明', exact: true }).click();
    await page.waitForTimeout(1600);
    await expect(page.locator('dialog[open]')).toHaveCount(0);
    await expect(
      page.getByRole('status').filter({ hasText: '请等待当前保存、文件选择' }),
    ).toBeVisible();
    await app.evaluate(() => {
      (globalThis as any).finishVersionFileChoice();
      (globalThis as any).restoreVersionFileChoice();
    });
    await expect(page.getByRole('dialog', { name: '版本操作指引', exact: true })).toBeVisible({
      timeout: 5000,
    });
  } finally {
    await app.evaluate(() => {
      (globalThis as any).finishVersionFileChoice?.();
      (globalThis as any).restoreVersionFileChoice?.();
    });
    await app.close();
    await fs.rm(directory, { recursive: true, force: true });
  }
});

test('明确无变化时安静启动，缺失当前说明和移除功能在手动历史中如实说明', async () => {
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), 'workbench-version-gaps-'));
  const env: Record<string, string> = { ...process.env, CLEVER_WORKBENCH_DATA_DIR: directory };
  delete env.ELECTRON_RUN_AS_NODE;
  const app = await electron.launch({ args: ['.'], env });
  try {
    const current = await app.evaluate(({ app }) => app.getVersion());
    const page = await versions(app, [
      {
        ...release(current, '仅内部修复', 'pending'),
        operationChange: 'none',
        noOperationReason: '现有操作方式保持不变。',
        changes: [],
      },
    ]);
    await page.waitForTimeout(1600);
    await expect(page.locator('dialog[open]')).toHaveCount(0);
    await page.getByRole('button', { name: '设置', exact: true }).click();
    await page.getByRole('button', { name: '查看版本操作说明', exact: true }).click();
    await page.getByRole('button', { name: `查看 v${current} 操作说明`, exact: true }).click();
    await expect(page.getByRole('dialog', { name: '版本操作指引', exact: true })).toContainText(
      '无新增操作：现有操作方式保持不变。',
    );
    await page.keyboard.press('Escape');
    const history = release('0.1.0', '当时有效的功能说明');
    history.changes = [
      { id: 'removed-feature', summary: '历史功能内容仍可追溯', guideIds: ['removed-feature'] },
    ];
    await versions(app, [history, release('0.1.1', '草稿或失败版本不应进入历史', 'pending')]);
    await page.waitForTimeout(1600);
    await expect(page.locator('dialog[open]')).toHaveCount(0);
    await page.getByRole('button', { name: '设置', exact: true }).click();
    await page.getByRole('button', { name: '查看版本操作说明', exact: true }).click();
    const list = page.getByRole('dialog', { name: '版本操作说明', exact: true });
    await expect(list).toContainText('当前版本暂未提供完整操作说明');
    await expect(list).not.toContainText('草稿或失败版本不应进入历史');
    await list.getByRole('button', { name: '查看 v0.1.0 操作说明', exact: true }).click();
    const detail = page.getByRole('dialog', { name: '版本操作指引', exact: true });
    await expect(detail).toContainText('历史功能内容仍可追溯');
    await expect(detail).toContainText('此功能指引已移除或暂不可用');
  } finally {
    await app.close();
    await fs.rm(directory, { recursive: true, force: true });
  }
});
