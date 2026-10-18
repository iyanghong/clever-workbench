import { afterEach, expect, test } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { Store } from '../electron/store';
import { Vault } from '../electron/vault';
import { Backups } from '../electron/backup';
import { derive, keyAad, unseal } from '../electron/vault-crypto';
const oldPassword = 'fictional-previous-master-password',
  newPassword = 'fictional-next-master-password';
const stores: Store[] = [],
  vaults: Vault[] = [];
function open(root = fs.mkdtempSync(path.join(os.tmpdir(), 'workbench-rotation-'))) {
  const store = new Store(root);
  stores.push(store);
  return store;
}
function protect(store: Store) {
  const vault = new Vault(store);
  vaults.push(vault);
  return vault;
}
async function setup() {
  const store = open(),
    vault = protect(store),
    backups = new Backups(store);
  const systemId = store.mutate({ type: 'system.save', name: '长期系统' }).createdId!,
    environmentId = store.mutate({ type: 'environment.save', systemId, name: '生产' }).createdId!;
  const accountId = store.mutate({
    type: 'account.save',
    environmentId,
    name: '运维账号',
    username: 'operator',
  }).createdId!;
  await vault.initialize(oldPassword);
  vault.save(accountId, 'password', 'fictional-access-password');
  vault.save(accountId, 'token', 'fictional-access-token');
  vault.save(accountId, 'privateKey', 'fictional-ssh-private-material');
  return { store, vault, backups, accountId };
}
afterEach(() => {
  for (const vault of vaults.splice(0)) vault.lock();
  for (const store of stores.splice(0)) {
    try {
      store.close();
    } catch {}
    fs.rmSync(store.root, { recursive: true, force: true });
  }
});

test(
  '主密码变更轮换真实秘密与备份密钥，旧材料无法解当前密文，旧备份仍可恢复再变更',
  { timeout: 20_000 },
  async () => {
    const { store, vault, backups, accountId } = await setup();
    const previousConfig = vault.config(),
      before = store.snapshot(),
      oldFile = path.join(store.root, 'old.cwb');
    await backups.create(oldFile);
    const another = protect(store);
    await another.unlock(oldPassword);
    await vault.rotate(oldPassword, newPassword);
    expect(vault.status().unlocked).toBe(false);
    expect(another.status().unlocked).toBe(false);
    expect(store.snapshot()).toEqual(before);
    const nextConfig = vault.config();
    expect(nextConfig.id).not.toBe(previousConfig.id);
    expect(nextConfig.kdf.salt).not.toBe(previousConfig.kdf.salt);
    expect(nextConfig.backupPublicKey).not.toBe(previousConfig.backupPublicKey);
    const oldWrapping = await derive(oldPassword, previousConfig.kdf),
      newWrapping = await derive(newPassword, nextConfig.kdf);
    const oldKey = unseal(previousConfig.key, oldWrapping, keyAad(previousConfig)),
      newKey = unseal(nextConfig.key, newWrapping, keyAad(nextConfig));
    try {
      expect(newKey.equals(oldKey)).toBe(false);
      const current = JSON.parse(
        String(
          store.db
            .prepare('SELECT value FROM secrets WHERE accountId=? AND kind=?')
            .get(accountId, 'password')!.value,
        ),
      );
      expect(() =>
        unseal(current, oldKey, `clever-workbench/secret/1/${accountId}/password`),
      ).toThrow('完整性');
    } finally {
      oldWrapping.fill(0);
      newWrapping.fill(0);
      oldKey.fill(0);
      newKey.fill(0);
    }
    await expect(vault.unlock(oldPassword)).rejects.toThrow('密码');
    await vault.unlock(newPassword);
    expect(vault.read(accountId, 'password')).toBe('fictional-access-password');
    expect(vault.read(accountId, 'privateKey')).toBe('fictional-ssh-private-material');
    vault.lock();
    await backups.automatic(true);
    const newest = path.join(
      store.settings().backupDir,
      fs.readdirSync(store.settings().backupDir)[0],
    );
    expect(vault.status().unlocked).toBe(false);
    await expect(backups.inspect(newest, oldPassword)).rejects.toThrow('密码');
    expect(await backups.inspect(newest, newPassword)).toMatchObject({ secrets: 3 });
    await expect(backups.inspect(oldFile, newPassword)).rejects.toThrow('密码');
    await backups.restore((await backups.inspect(oldFile, oldPassword)).token);
    await expect(vault.unlock(newPassword)).rejects.toThrow('密码');
    await vault.unlock(oldPassword);
    expect(vault.read(accountId, 'token')).toBe('fictional-access-token');
    await vault.rotate(oldPassword, newPassword);
    store.close();
    const reopened = open(store.root),
      restarted = protect(reopened);
    expect(restarted.status().unlocked).toBe(false);
    await expect(restarted.unlock(oldPassword)).rejects.toThrow('密码');
    await restarted.unlock(newPassword);
    expect(restarted.read(accountId, 'token')).toBe('fictional-access-token');
  },
);

test(
  '错误旧密码、短新密码或部分秘密写入失败均保留全部旧材料与可用会话',
  { timeout: 15_000 },
  async () => {
    const { store, vault, accountId } = await setup(),
      before = store.db.prepare('SELECT * FROM secrets ORDER BY kind').all(),
      config = vault.config();
    await expect(vault.rotate('wrong-password', newPassword)).rejects.toThrow('密码');
    await expect(vault.rotate(oldPassword, 'short')).rejects.toThrow('12');
    expect(vault.config()).toEqual(config);
    store.db.exec(
      "CREATE TRIGGER test_rotation_failure BEFORE UPDATE ON secrets WHEN OLD.kind='token' BEGIN SELECT RAISE(ABORT,'模拟秘密更新中断'); END",
    );
    await expect(vault.rotate(oldPassword, newPassword)).rejects.toThrow('模拟秘密更新中断');
    expect(store.db.prepare('SELECT * FROM secrets ORDER BY kind').all()).toEqual(before);
    expect(vault.config()).toEqual(config);
    expect(vault.read(accountId, 'password')).toBe('fictional-access-password');
    expect(vault.read(accountId, 'token')).toBe('fictional-access-token');
    store.db.exec('DROP TRIGGER test_rotation_failure');
    vault.lock();
    await expect(vault.unlock(newPassword)).rejects.toThrow('密码');
    await vault.unlock(oldPassword);
    expect(vault.read(accountId, 'privateKey')).toBe('fictional-ssh-private-material');
  },
);

test('处理期间锁定取消密码变更，不在取消后提交新保护材料', async () => {
  const { vault, accountId } = await setup(),
    config = vault.config();
  const rotating = vault.rotate(oldPassword, newPassword);
  vault.lock();
  await expect(rotating).rejects.toThrow('取消');
  expect(vault.config()).toEqual(config);
  expect(vault.status().unlocked).toBe(false);
  await vault.unlock(oldPassword);
  expect(vault.read(accountId, 'password')).toBe('fictional-access-password');
});
