import { _electron as electron } from '@playwright/test';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import assert from 'node:assert/strict';
const [executable, output] = process.argv.slice(2);
if (!executable || !output)
  throw new Error('Usage: node scripts/verify-idle.mjs <packaged-executable> <evidence.json>');
const directory = await fs.mkdtemp(path.join(os.tmpdir(), 'workbench-real-idle-'));
const env = { ...process.env, CLEVER_WORKBENCH_DATA_DIR: directory };
delete env.ELECTRON_RUN_AS_NODE;
delete env.VITE_DEV_SERVER_URL;
const app = await electron.launch({ executablePath: path.resolve(executable), args: [], env });
try {
  const page = await app.firstWindow();
  const accountId = await page.evaluate(async () => {
    const api = window.desktop;
    await api.mutate({ type: 'settings', autoBackup: false });
    const systemId = (await api.mutate({ type: 'system.save', name: '闲置验证系统' })).createdId;
    const environmentId = (await api.mutate({ type: 'environment.save', systemId, name: '测试' }))
      .createdId;
    const accountId = (await api.mutate({ type: 'account.save', environmentId, name: '虚构账号' }))
      .createdId;
    await api.initializeVault('fictional-idle-master-password');
    await api.saveSecret(accountId, 'password', 'fictional-idle-secret');
    await api.vaultActivity();
    window.idleEvidence = { startedAt: Date.now(), lockedAt: null };
    window.desktop.onVaultStatus((status) => {
      if (!status.unlocked && !window.idleEvidence.lockedAt)
        window.idleEvidence.lockedAt = Date.now();
    });
    return accountId;
  });
  await app.evaluate(({ BrowserWindow, powerMonitor }) => {
    globalThis.observedNativeLocks = [];
    powerMonitor.on('lock-screen', () => globalThis.observedNativeLocks.push(Date.now()));
    BrowserWindow.getAllWindows()[0].hide();
  });
  console.log('Waiting for the real 15-minute idle timer in an isolated hidden packaged app.');
  await page.waitForFunction(() => Boolean(window.idleEvidence.lockedAt), undefined, {
    timeout: 940_000,
    polling: 1000,
  });
  const timing = await page.evaluate(() => window.idleEvidence),
    nativeLocks = await app.evaluate(() => globalThis.observedNativeLocks);
  const elapsedMs = timing.lockedAt - timing.startedAt;
  assert.equal((await page.evaluate(() => window.desktop.vaultStatus())).unlocked, false);
  assert.match(
    await page.evaluate(
      (id) =>
        window.desktop.readSecret(id, 'password').then(
          () => 'unexpected access',
          (cause) => String(cause),
        ),
      accountId,
    ),
    /解锁/,
  );
  assert.equal((await page.evaluate(() => window.desktop.snapshot())).accounts.length, 1);
  const result = {
    platform: process.platform,
    arch: process.arch,
    os: os.version(),
    ...timing,
    elapsedMs,
    nativeLocks,
    idleVerified: elapsedMs >= 899_000 && elapsedMs <= 940_000,
    ordinaryMetadataReadable: true,
  };
  await fs.mkdir(path.dirname(path.resolve(output)), { recursive: true });
  await fs.writeFile(output, JSON.stringify(result, null, 2));
  console.log(JSON.stringify(result));
  if (!result.idleVerified)
    throw new Error(
      'A different lock occurred before the idle boundary; evidence is preserved but idle is not verified.',
    );
} finally {
  await app.close();
  await fs.rm(directory, { recursive: true, force: true });
}
