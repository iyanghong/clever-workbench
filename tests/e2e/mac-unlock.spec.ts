import { expect, test } from '@playwright/test';
import fs from 'node:fs/promises';
import { execFileSync } from 'node:child_process';
import os from 'node:os';
import path from 'node:path';
import { electron } from './launch';

test('侧栏秘密已锁定可启用和唤起 Mac 系统解锁，取消后可改用工作台主密码', async () => {
  test.skip(process.platform !== 'darwin', '系统解锁面板属于 macOS 本机能力');
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), 'cwb-mac-unlock-ui-'));
  const env: Record<string, string> = { ...process.env, CLEVER_WORKBENCH_DATA_DIR: directory };
  delete env.ELECTRON_RUN_AS_NODE;
  const app = await electron.launch({ args: ['.'], env });
  try {
    const page = await app.firstWindow();
    const helper = await app.evaluate(({ app }) =>
      app.isPackaged
        ? process.resourcesPath + '/../Helpers/Clever Workbench Mac Unlock'
        : app.getAppPath() + '/dist-electron/cwb-mac-unlock',
    );
    const capability = execFileSync(helper, ['available']);
    expect([0, 1]).toContain(capability[0]);
    expect(await page.evaluate(() => window.desktop.canUseMacUnlock())).toBe(capability[0] === 1);

    // Only the native device-owner decision is simulated. All IPC, password checks,
    // enrollment writes and vault sessions still run in the application.
    await app.evaluate(() => {
      const cp = process.getBuiltinModule(
        'node:child_process',
      ) as typeof import('node:child_process');
      const { PassThrough } = process.getBuiltinModule(
        'node:stream',
      ) as typeof import('node:stream');
      const { randomBytes } = process.getBuiltinModule(
        'node:crypto',
      ) as typeof import('node:crypto');
      let material = Buffer.alloc(0);
      const envelope = randomBytes(64);
      let opens = 0;
      cp.execFile = new Proxy(cp.execFile, {
        apply(original, receiver, args) {
          const [filename, commands, , reply] = args;
          if (
            typeof filename !== 'string' ||
            !/\/(?:cwb-mac-unlock|Clever Workbench Mac Unlock)$/.test(filename)
          )
            return Reflect.apply(original, receiver, args);
          const pipe = new PassThrough();
          const chunks: Buffer[] = [];
          pipe.on('data', (chunk: Buffer) => chunks.push(Buffer.from(chunk)));
          pipe.on('end', () => {
            const input = Buffer.concat(chunks);
            switch (commands[0]) {
              case 'available':
                return reply(null, Buffer.from([1]));
              case 'seal':
                material = input;
                return reply(null, Buffer.from(envelope));
              case 'open':
                if (++opens === 1 || !input.equals(envelope))
                  return reply({ code: 2 }, Buffer.alloc(0));
                return reply(null, Buffer.from(material));
            }
          });
          return { stdin: pipe };
        },
      });
    });
    const password = 'fixture-master-touch-id';
    await expect(page.getByRole('button', { name: '快速新建', exact: true })).toBeEnabled();
    await page.evaluate(async (password) => {
      await window.desktop.initializeVault(password);
      await window.desktop.lockVault();
    }, password);
    const sidebar = page
      .getByRole('button', { name: '解锁秘密', exact: true })
      .filter({ hasText: '秘密已锁定' });
    const unlock = page.getByRole('dialog', { name: '解锁秘密' });
    await sidebar.click();
    await unlock.getByRole('checkbox', { name: '启用指纹或 Mac 登录密码解锁' }).check();
    await unlock.getByLabel('主密码', { exact: true }).fill(password);
    await unlock.getByRole('button', { name: '解锁并启用' }).click();
    await expect(unlock).toHaveCount(0);
    expect(await page.evaluate(() => window.desktop.vaultStatus())).toMatchObject({
      unlocked: true,
      macUnlockMode: 'system',
    });
    await page.getByRole('menuitem', { name: '设置', exact: true }).click();
    await page.getByRole('tab', { name: '凭据保护', exact: true }).click();
    const panel = page.getByRole('tabpanel', { name: '凭据保护' });
    await panel.getByRole('button', { name: '关闭 Mac 系统解锁' }).click();
    await panel.getByRole('button', { name: '立即锁定' }).click();
    await panel.getByRole('button', { name: '启用 Mac 系统解锁' }).click();
    const setup = page.getByRole('dialog', { name: '启用 Mac 系统解锁' });
    await expect(setup.getByLabel('当前主密码')).toBeFocused();
    await setup.getByLabel('当前主密码').fill('wrong-password');
    await setup.getByRole('button', { name: '继续系统验证' }).click();
    await expect(setup.getByRole('alert')).toContainText('主密码');
    await setup.getByLabel('当前主密码').fill(password);
    await setup.getByRole('button', { name: '继续系统验证' }).click();
    await expect(setup).toHaveCount(0);
    expect(await page.evaluate(() => window.desktop.vaultStatus())).toMatchObject({
      unlocked: false,
      macUnlockMode: 'system',
    });

    await sidebar.click();
    await expect(unlock.getByRole('status')).toContainText('已取消 Mac 系统验证');
    const input = unlock.getByLabel('主密码', { exact: true });
    await expect(input).toBeFocused();
    await input.fill(password);
    await input.press('Enter');
    await expect(panel.getByRole('button', { name: '立即锁定' })).toBeVisible();
    await panel.getByRole('button', { name: '立即锁定' }).click();
    await sidebar.click();
    await expect(panel.getByRole('button', { name: '立即锁定' })).toBeVisible();
    await expect(unlock).toHaveCount(0);
    await panel.getByRole('button', { name: '关闭 Mac 系统解锁' }).click();
    await expect(panel.getByRole('button', { name: '启用 Mac 系统解锁' })).toBeVisible();
    await panel.getByRole('button', { name: '立即锁定' }).click();
    await sidebar.click();
    await expect(input).toBeFocused();
    await expect(unlock.getByRole('button', { name: '使用 Mac 系统验证' })).toHaveCount(0);
    await page.keyboard.press('Escape');
    await expect(unlock).toHaveCount(0);
  } finally {
    await app.close();
    await fs.rm(directory, { recursive: true, force: true });
  }
});
