import { test, expect, type ElectronApplication, type Page } from '@playwright/test';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { electron } from './launch';
import { selectChoice } from './antd-controls';
import { createLedgerImportFixtures } from '../fixtures/ledger-import';

test.describe('真实 Ollama 文件导入', () => {
  test.skip(
    process.env.CWB_TEST_REAL_OLLAMA !== '1',
    '需显式启用真实模型回归，并准备本机 Ollama 与模型缓存。',
  );
  let app: ElectronApplication, page: Page, directory: string, source: string;
  let environmentId: string;
  test.beforeEach(async () => {
    directory = await fs.mkdtemp(path.join(os.tmpdir(), 'cwb-real-import-'));
    const runtimeDirectory = process.env.CWB_TEST_OLLAMA_DIR;
    const models = process.env.CWB_TEST_OLLAMA_MODELS;
    if (!models) throw new Error('请设置 CWB_TEST_OLLAMA_MODELS，指向含测试模型的本地缓存。');
    await fs.symlink(models, path.join(directory, 'local-models'), 'dir');
    source = (await createLedgerImportFixtures(path.join(directory, 'fixtures')))[0].filename;
    const env: Record<string, string> = {
      ...process.env,
      CLEVER_WORKBENCH_DATA_DIR: directory,
      CWB_TEST_MOCK_KEYCHAIN: '1',
      PATH: [runtimeDirectory, process.env.PATH].filter(Boolean).join(path.delimiter),
    };
    delete env.ELECTRON_RUN_AS_NODE;
    app = await electron.launch({ args: ['.'], env });
    page = await app.firstWindow();
    await page.getByRole('menuitem', { name: '台账', exact: true }).waitFor();
    environmentId = await page.evaluate(async () => {
      const systemId = (await window.desktop.mutate({ type: 'system.save', name: '合成导入验收' }))
        .createdId!;
      const environment = (
        await window.desktop.mutate({ type: 'environment.save', systemId, name: '生产' })
      ).createdId!;
      await window.desktop.initializeVault('fictional-real-import-master');
      return environment;
    });
    await page.getByRole('menuitem', { name: '台账', exact: true }).click();
    await app.evaluate(({ dialog }, filename) => {
      // Only the native file picker is replaced; parsing, IPC, model process and storage are real.
      dialog.showOpenDialog = async () => ({ canceled: false, filePaths: [filename] });
    }, source);
  });
  test.afterEach(async () => {
    if (app) {
      await app
        .evaluate(({ BrowserWindow }) =>
          BrowserWindow.getAllWindows().forEach((window) => window.destroy()),
        )
        .catch(() => {});
      await app.close();
    }
    if (directory) await fs.rm(directory, { recursive: true, force: true });
  });

  test('关闭窗口前保留尚未复核的导入，即使导入弹窗没有打开', async () => {
    await page.evaluate(async () => {
      const snapshot = await window.desktop.snapshot();
      await window.desktop.localLedgerImport.chooseFile({
        systemId: snapshot.systems[0].id,
        kind: 'all',
      });
    });
    await expect
      .poll(
        async () =>
          (await page.evaluate(() => window.desktop.localLedgerImport.state())).job?.phase,
      )
      .toBe('ready');
    const outcome = await app.evaluate(async ({ dialog, BrowserWindow }) => {
      const target = BrowserWindow.getAllWindows()[0];
      let message = '';
      const original = dialog.showMessageBox;
      dialog.showMessageBox = async (...args: unknown[]) => {
        message = (args.at(-1) as { message: string }).message;
        return { response: 0, checkboxChecked: false };
      };
      try {
        target.close();
        const started = Date.now();
        while (!target.isDestroyed() && !message && Date.now() - started < 3000)
          await new Promise((resolve) => setTimeout(resolve, 25));
        return { closed: target.isDestroyed(), message };
      } finally {
        dialog.showMessageBox = original;
      }
    });
    expect(outcome.closed).toBe(false);
    expect(outcome.message).toContain('文件导入尚未确认');
    const state = await page.evaluate(() => window.desktop.localLedgerImport.state());
    expect(state.job?.phase).toBe('ready');
    expect(state.job?.sourceCount).toBeGreaterThan(0);
  });

  test('真实模型分析跨渲染重载继续，人工校对后统一保存，错误回滚且密码不外露', async ({}, info) => {
    test.setTimeout(300_000);
    const errors: string[] = [];
    page.on('pageerror', (error) => errors.push(error.message));
    const open = () => page.getByRole('button', { name: '文件导入', exact: true }).click();
    const dialog = () => page.getByRole('dialog', { name: '文件导入 · 校对后保存', exact: true });
    await open();
    await dialog().getByRole('button', { name: '启动 Ollama', exact: true }).click();
    await expect(dialog().getByText(/Ollama .+ 已在本机运行/)).toBeVisible({ timeout: 30_000 });
    await dialog().getByRole('button', { name: '选择 Excel／Word／CSV', exact: true }).click();
    await expect(dialog().getByRole('button', { name: '开始本地分析', exact: true })).toBeEnabled({
      timeout: 20_000,
    });
    await page.keyboard.press('Escape');
    await expect(dialog().getByRole('button', { name: '继续校对', exact: true })).toBeFocused();
    await dialog().getByRole('button', { name: '继续校对', exact: true }).click();
    await dialog().getByRole('button', { name: '开始本地分析', exact: true }).click();
    await expect(dialog().getByRole('button', { name: '取消分析', exact: true })).toBeVisible();
    const session = await page.evaluate(() => window.desktop.localLedgerImport.state());
    expect(session.job?.phase).toBe('analyzing');
    expect(JSON.stringify(session)).not.toContain('fixture-');
    await page.reload();
    await page.getByRole('menuitem', { name: '台账', exact: true }).click();
    await open();
    await expect(
      dialog().getByRole('button', { name: '编辑候选 跳板机', exact: true }),
    ).toBeVisible({ timeout: 180_000 });
    await expect(
      dialog().getByRole('button', { name: '编辑候选 制品仓库', exact: true }),
    ).toBeVisible();
    const prepared = await page.evaluate(() => window.desktop.localLedgerImport.state());
    expect(prepared.job?.id).toBe(session.job?.id);
    expect(prepared.job?.candidates).toHaveLength(2);
    expect(JSON.stringify(prepared)).not.toContain('fixture-');
    await dialog().getByText('映射来源环境', { exact: true }).click();
    await selectChoice(dialog().getByLabel('来源环境 生产', { exact: true }), { label: '生产' });
    await dialog().getByRole('button', { name: '编辑候选 跳板机', exact: true }).click();
    await expect(dialog().getByLabel('候选名称', { exact: true })).toHaveValue('跳板机');
    await expect(dialog().getByLabel('候选地址／IP', { exact: true })).toHaveValue('192.0.2.10');
    await expect(dialog().getByLabel('账号 1 用户名', { exact: true })).toHaveValue('000123');
    await expect(dialog().getByLabel('账号 1 密码（加密保存）', { exact: true })).toHaveAttribute(
      'type',
      'password',
    );
    await dialog()
      .getByRole('checkbox', { name: '我已核对本条来源、环境和关联', exact: true })
      .check();
    await dialog().getByRole('button', { name: '编辑候选 制品仓库', exact: true }).click();
    await dialog().getByLabel('地址 1 URL', { exact: true }).fill('javascript:alert(1)');
    await dialog()
      .getByRole('checkbox', { name: '我已核对本条来源、环境和关联', exact: true })
      .check();
    await dialog().getByRole('button', { name: '确认保存所选台账', exact: true }).click();
    await expect(dialog().getByText(/地址仅支持 HTTP|完整的 HTTP/)).toBeVisible();
    const rollback = await page.evaluate(() => window.desktop.snapshot());
    expect(rollback.resources).toHaveLength(0);
    expect(rollback.accounts).toHaveLength(0);
    expect(rollback.accessEntries).toHaveLength(0);
    await dialog().getByLabel('地址 1 URL', { exact: true }).fill('https://repo.example.invalid');
    await dialog()
      .getByRole('checkbox', { name: '我已核对本条来源、环境和关联', exact: true })
      .check();
    await expect(
      dialog().getByRole('button', { name: '确认保存所选台账', exact: true }),
    ).toBeEnabled();
    await page.screenshot({ path: info.outputPath('file-import-light.png') });
    await page.setViewportSize({ width: 850, height: 680 });
    await page.emulateMedia({ colorScheme: 'dark', contrast: 'more', reducedMotion: 'reduce' });
    await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark');
    await expect(page.locator('html')).toHaveAttribute('data-high-contrast', 'true');
    await expect(page.locator('html')).toHaveAttribute('data-reduce-transparency', 'true');
    await expect(page.locator('html')).toHaveAttribute('data-reduce-motion', 'true');
    expect(
      await dialog().evaluate((element) => element.scrollWidth <= element.clientWidth + 1),
    ).toBe(true);
    await page.screenshot({ path: info.outputPath('file-import-dark-narrow.png') });
    await dialog().getByRole('button', { name: '确认保存所选台账', exact: true }).click();
    await expect(
      dialog().getByText('已新增 2 条台账，所选内容全部保存。', { exact: true }),
    ).toBeVisible();
    const saved = await page.evaluate(async () => {
      const snapshot = await window.desktop.snapshot();
      const account = snapshot.accounts.find((item) => item.username === '000123')!;
      return {
        snapshot,
        password: await window.desktop.readSecret(account.id, 'password'),
        state: await window.desktop.localLedgerImport.state(),
      };
    });
    expect(saved.snapshot.resources).toHaveLength(1);
    expect(saved.snapshot.accessEntries).toHaveLength(1);
    expect(saved.snapshot.resources[0].environmentId).toBe(environmentId);
    expect(saved.snapshot.accessEntries[0].environmentId).toBe(environmentId);
    expect(saved.password).toBe('fixture-ssh!23');
    expect(JSON.stringify(saved.snapshot)).not.toContain(saved.password);
    expect(saved.state.job?.sourceCount).toBe(0);
    expect(saved.state.job?.passwordSources).toEqual([]);
    await dialog().getByRole('button', { name: '完成', exact: true }).click();
    await expect(page.getByRole('button', { name: '文件导入', exact: true })).toBeFocused();
    expect(errors).toEqual([]);
  });
  test('模型标出明确迁移的地址差异，用户确认前旧值仍可读取', async () => {
    test.setTimeout(360_000);
    const id = await page.evaluate(async (env) => {
      const s = await window.desktop.snapshot();
      return (
        await window.desktop.mutate({
          type: 'access.save',
          systemId: s.systems[0].id,
          environmentId: env,
          name: '合成文档门户',
          notes: '已有交接说明',
          addresses: [{ label: '访问地址', url: 'https://old.example.invalid' }],
        })
      ).createdId!;
    }, environmentId);
    await fs.writeFile(
      source,
      '类型,名称,地址,备注\n访问入口,合成文档门户,https://new.example.invalid,旧地址停用，入口迁移到新地址。\n',
    );
    await page.reload();
    await page.getByRole('menuitem', { name: '台账', exact: true }).click();
    await page.getByRole('button', { name: '文件导入', exact: true }).click();
    const dialog = page.getByRole('dialog', { name: '文件导入 · 校对后保存' });
    await dialog.getByRole('button', { name: '启动 Ollama', exact: true }).click();
    await dialog.getByRole('button', { name: '选择 Excel／Word／CSV', exact: true }).click();
    await dialog.getByRole('button', { name: '开始本地分析', exact: true }).click();
    await expect(
      dialog.getByRole('button', { name: '编辑候选 合成文档门户', exact: true }),
    ).toBeVisible({ timeout: 240_000 });
    const job = await page.evaluate(
      async () => (await window.desktop.localLedgerImport.state()).job!,
    );
    const c = job.candidates[0];
    expect(c.kind).toBe('access');
    expect(c.advice?.targetId, JSON.stringify(c.advice)).toBe(id);
    expect(c.advice?.fields).toContain('url:' + c.addresses[0].id);
    expect(
      (await page.evaluate(() => window.desktop.snapshot())).accessEntries[0].addresses[0].url,
    ).toBe('https://old.example.invalid');
    if (!c.update) await dialog.getByRole('button', { name: '比较并选择字段' }).click();
    await expect(dialog.getByLabel('替换 访问地址', { exact: true })).toBeChecked();
    for (const box of await dialog.getByRole('checkbox', { name: '替换 说明', exact: true }).all())
      await box.uncheck();
    await dialog
      .getByRole('checkbox', { name: '我已核对本条来源、环境和关联', exact: true })
      .check();
    await dialog.getByRole('button', { name: '确认保存所选台账', exact: true }).click();
    await expect(dialog.getByText(/已新增 0 条、更新 1 条/)).toBeVisible();
    const saved = (await page.evaluate(() => window.desktop.snapshot())).accessEntries;
    expect(saved).toHaveLength(1);
    expect(saved[0]).toMatchObject({
      id,
      environmentId,
      notes: '已有交接说明',
      addresses: [{ url: 'https://new.example.invalid' }],
    });
  });
});
