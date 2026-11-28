import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { randomBytes } from 'node:crypto';
import { afterEach, expect, test, vi } from 'vitest';
import { Backups } from '../electron/backup';
import { Store } from '../electron/store';
import { Vault } from '../electron/vault';
import { derive, seal, unseal } from '../electron/vault-crypto';
import { macUnlockFile, type MacUnlockDevice } from '../electron/mac-unlock';

const password = 'fixture-local-master-password';
const stores: Store[] = [];
async function fixture() {
  const store = new Store(fs.mkdtempSync(path.join(os.tmpdir(), 'cwb-vault-mac-unlock-')));
  stores.push(store);
  const hardwareKey = randomBytes(32);
  const device = {
    available: vi.fn(async () => true),
    seal: vi.fn<MacUnlockDevice['seal']>(async (binding, key) =>
      Buffer.from(JSON.stringify(seal(key, hardwareKey, binding))),
    ),
    open: vi.fn<MacUnlockDevice['open']>(async (binding, data) =>
      unseal(JSON.parse(data.toString()), hardwareKey, binding, 32),
    ),
  };
  const vault = new Vault(store, undefined, undefined, device);
  await vault.initialize(password);
  const systemId = store.mutate({ type: 'system.save', name: '指纹验证' }).createdId!;
  const environmentId = store.mutate({
    type: 'environment.save',
    systemId,
    name: '测试',
  }).createdId!;
  const account = store.mutate({
    type: 'account.save',
    environmentId,
    name: '样例账号',
  }).createdId!;
  vault.save(account, 'password', 'fixture-account-secret');
  vault.lock();
  return { store, device, vault, account };
}
afterEach(() => {
  for (const store of stores.splice(0)) {
    store.close();
    fs.rmSync(store.root, { recursive: true, force: true });
  }
});

test('指纹预览版授权保留原策略，明确重新授权成功后才接受 Mac 登录密码', async () => {
  const { store, vault, device, account } = await fixture();
  const config = vault.config();
  const key = await derive(password, config.kdf);
  const legacy = macUnlockFile(store.directory, config.id, 'touchID');
  try {
    fs.writeFileSync(
      legacy,
      await device.seal(`${store.generation}/${config.id}`, key, new AbortController().signal),
    );
  } finally {
    key.fill(0);
  }
  expect(vault.status().macUnlockMode).toBe('touchID');
  device.seal.mockRejectedValueOnce(new Error('已取消'));
  await expect(vault.enableMacUnlock(password, true)).rejects.toThrow('取消');
  expect(vault.status()).toMatchObject({ macUnlockMode: 'touchID', unlocked: false });
  await vault.unlockWithMac();
  expect(device.open.mock.lastCall?.[3]).toBe('touchID');
  vault.lock();
  await vault.enableMacUnlock(password, true);
  expect(vault.status()).toMatchObject({ macUnlockMode: 'system', unlocked: true });
  expect(fs.existsSync(legacy)).toBe(false);
  vault.lock();
  await vault.unlockWithMac();
  expect(device.open.mock.lastCall?.[3]).toBe('system');
  expect(vault.read(account, 'password')).toBe('fixture-account-secret');
  vault.lock();
});

test('启用须验证工作台主密码和 Mac 身份，重启或取消系统验证后只按需解锁', async () => {
  const { vault, device, store, account } = await fixture();
  await expect(vault.enableMacUnlock('wrong-password')).rejects.toThrow('主密码');
  expect(device.seal).not.toHaveBeenCalled();
  device.seal.mockRejectedValueOnce(new Error('取消'));
  await expect(vault.enableMacUnlock(password)).rejects.toThrow('取消');
  expect(vault.status()).toMatchObject({ macUnlockMode: 'off', unlocked: false });
  await vault.enableMacUnlock(password);
  const restarted = new Vault(store, undefined, undefined, device);
  expect(restarted.status()).toMatchObject({ macUnlockMode: 'system', unlocked: false });
  store.snapshot();
  expect(device.open).not.toHaveBeenCalled();
  device.open.mockRejectedValueOnce(new Error('取消'));
  await expect(restarted.unlockWithMac()).rejects.toThrow('取消');
  expect(() => restarted.read(account, 'password')).toThrow('解锁');
  device.open.mockResolvedValueOnce(randomBytes(32));
  await expect(restarted.unlockWithMac()).rejects.toThrow('Mac 系统');
  expect(restarted.status().unlocked).toBe(false);
  await expect(
    restarted.unlockWithMac(() => {
      throw new Error('正在准备安装更新');
    }),
  ).rejects.toThrow('更新');
  expect(restarted.status().unlocked).toBe(false);
  await restarted.unlockWithMac();
  expect(restarted.read(account, 'password')).toBe('fixture-account-secret');
  restarted.disableMacUnlock();
  restarted.lock();
  await expect(restarted.unlockWithMac()).rejects.toThrow('主密码');
  await restarted.unlock(password);
  expect(restarted.read(account, 'password')).toBe('fixture-account-secret');
  restarted.lock();
});

test('启用系统解锁期间锁定会丢弃迟到的授权，不支持的设备可用主密码访问', async () => {
  const { store, vault, device, account } = await fixture();
  let finish!: () => void;
  let begin!: () => void;
  const started = new Promise<void>((resolve) => {
    begin = resolve;
  });
  device.seal.mockImplementationOnce(async () => {
    begin();
    await new Promise<void>((resolve) => {
      finish = resolve;
    });
    return randomBytes(64);
  });
  const enabling = vault.enableMacUnlock(password);
  await started;
  vault.lock();
  finish();
  await expect(enabling).rejects.toThrow('取消');
  expect(vault.status()).toMatchObject({ macUnlockMode: 'off', unlocked: false });
  const unsupported = new Vault(store);
  expect(await unsupported.canUseMacUnlock()).toBe(false);
  await expect(unsupported.unlockWithMac()).rejects.toThrow('不支持');
  await unsupported.unlock(password);
  expect(unsupported.read(account, 'password')).toBe('fixture-account-secret');
  unsupported.lock();
});

test('锁屏或关闭 Mac 系统解锁后，迟到的验证结果不能重新开启会话', async () => {
  const { vault, device } = await fixture();
  await vault.enableMacUnlock(password);
  for (const cancel of [() => vault.lock(), () => vault.disableMacUnlock()]) {
    let begin!: (signal: AbortSignal) => void;
    let finish!: (key: Buffer) => void;
    const started = new Promise<AbortSignal>((resolve) => {
      begin = resolve;
    });
    const result = new Promise<Buffer>((resolve) => {
      finish = resolve;
    });
    device.open.mockImplementationOnce(async (_binding, _blob, signal) => {
      begin(signal);
      return result;
    });
    const attempt = vault.unlockWithMac();
    const signal = await started;
    await expect(vault.unlockWithMac()).rejects.toThrow('正在处理');
    cancel();
    expect(signal.aborted).toBe(true);
    const late = randomBytes(32);
    finish(late);
    await expect(attempt).rejects.toThrow('取消');
    expect(late).toEqual(Buffer.alloc(32));
    expect(vault.status().unlocked).toBe(false);
  }
});

test('恢复换代和更改主密码撤销 Mac 系统授权，备份不含本机授权文件', async () => {
  const { vault, store, account } = await fixture();
  await vault.unlock(password);
  await vault.configureBackup('fixture-independent-backup');
  await vault.enableMacUnlock(password);
  const filename = macUnlockFile(store.directory, vault.config().id);
  if (process.platform !== 'win32') expect(fs.statSync(filename).mode & 0o777).toBe(0o600);
  const backups = new Backups(store, () => vault);
  const archive = path.join(store.root, 'secrets.cwb');
  await backups.create(archive);
  const preview = await backups.inspect(archive, 'fixture-independent-backup');
  const retained = fs.readFileSync(filename);
  const oldID = vault.config().id;
  await backups.restore(preview.token);
  expect(vault.config().id).toBe(oldID);
  expect(fs.existsSync(macUnlockFile(store.directory, oldID))).toBe(false);
  expect(vault.status()).toMatchObject({ macUnlockMode: 'off', unlocked: false });
  // Even copying the old device file cannot authorize a different data generation.
  fs.writeFileSync(macUnlockFile(store.directory, oldID), retained);
  await expect(vault.unlockWithMac()).rejects.toThrow();
  await vault.enableMacUnlock(password);
  await expect(vault.rotate('wrong-password', 'fixture-new-master')).rejects.toThrow('主密码');
  expect(vault.status().macUnlockMode).toBe('system');
  await vault.rotate(password, 'fixture-new-master');
  expect(vault.status()).toMatchObject({ macUnlockMode: 'off', unlocked: false });
  expect(fs.existsSync(macUnlockFile(store.directory, oldID))).toBe(false);
  await vault.unlock('fixture-new-master');
  expect(vault.read(account, 'password')).toBe('fixture-account-secret');
  vault.lock();
});
