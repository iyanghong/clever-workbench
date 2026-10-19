import { afterEach, expect, test } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { Store } from '../electron/store';
import { Vault } from '../electron/vault';
const stores: Store[] = [],
  roots: string[] = [],
  vaults: Vault[] = [];
function setup() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'workbench-vault-'));
  roots.push(root);
  const store = new Store(root);
  stores.push(store);
  const systemId = store.mutate({ type: 'system.save', name: '订单平台' }).createdId!;
  const environmentId = store.mutate({
    type: 'environment.save',
    systemId,
    name: '生产',
  }).createdId!;
  const accountId = store.mutate({
    type: 'account.save',
    environmentId,
    name: '应用账号',
    username: 'app',
  }).createdId!;
  const vault = new Vault(store);
  vaults.push(vault);
  return { store, vault, accountId };
}
afterEach(() => {
  for (const vault of vaults.splice(0)) vault.lock();
  for (const store of stores.splice(0)) store.close();
  for (const root of roots.splice(0)) fs.rmSync(root, { recursive: true, force: true });
});

test('主密码最低 6 个字符，拒绝 5 个字符且不创建保护材料', async () => {
  const { vault, accountId } = setup();
  await expect(vault.initialize('test1')).rejects.toThrow('6 到 1024');
  expect(vault.status()).toEqual({ initialized: false, unlocked: false });
  await vault.initialize('test12');
  vault.save(accountId, 'password', 'fixture-secret');
  vault.lock();
  await vault.unlock('test12');
  expect(vault.read(accountId, 'password')).toBe('fixture-secret');
});

test('秘密使用主密码解锁，重启与锁定撤销访问，快照和落盘数据不含明文', async () => {
  const { store, vault, accountId } = setup();
  const password = 'fictional-master-password-2026',
    secret = 'fictional-redis-secret-unique-9472';
  expect(vault.status()).toEqual({ initialized: false, unlocked: false });
  await vault.initialize(password);
  vault.save(accountId, 'password', secret);
  expect(vault.read(accountId, 'password')).toBe(secret);
  expect(store.snapshot().accounts[0].secretKinds).toEqual(['password']);
  expect(JSON.stringify(store.snapshot())).not.toContain(secret);
  vault.lock();
  expect(() => vault.read(accountId, 'password')).toThrow('解锁');
  await expect(vault.unlock('wrong-master-password')).rejects.toThrow('主密码');
  expect(vault.status().unlocked).toBe(false);
  store.close();
  stores.pop();
  const reopened = new Store(store.root);
  stores.push(reopened);
  const next = new Vault(reopened);
  vaults.push(next);
  expect(next.status()).toEqual({ initialized: true, unlocked: false });
  await next.unlock(password);
  expect(next.read(accountId, 'password')).toBe(secret);
  next.save(accountId, 'password', 'replaced-fictional-secret');
  expect(next.read(accountId, 'password')).toBe('replaced-fictional-secret');
  for (const file of fs
    .readdirSync(reopened.directory)
    .filter((name) => name.startsWith('database.sqlite'))) {
    const data = fs.readFileSync(path.join(reopened.directory, file));
    for (const text of [password, secret, 'replaced-fictional-secret'])
      expect(data.includes(Buffer.from(text))).toBe(false);
  }
});

test('篡改密文不能返回秘密，普通账号复制不带秘密', async () => {
  const { store, vault, accountId } = setup();
  await vault.initialize('fictional-master-password');
  vault.save(accountId, 'token', 'fictional-token-value');
  const copy = store.mutate({ type: 'account.copy', id: accountId }).createdId!;
  expect(store.snapshot().accounts.find((item) => item.id === copy)?.secretKinds).toEqual([]);
  const row = store.db
    .prepare('SELECT value FROM secrets WHERE accountId=? AND kind=?')
    .get(accountId, 'token')!;
  const value = JSON.parse(String(row.value));
  value.ciphertext = Buffer.from('tampered').toString('base64');
  store.db
    .prepare('UPDATE secrets SET value=? WHERE accountId=? AND kind=?')
    .run(JSON.stringify(value), accountId, 'token');
  expect(() => vault.read(accountId, 'token')).toThrow('校验');
  expect(() => vault.read(copy, 'token')).toThrow('尚未保存');
});

test('解锁进行中发生锁定，不允许异步完成重新开放秘密', async () => {
  const { vault, accountId } = setup();
  const password = 'fictional-master-password';
  await vault.initialize(password);
  vault.save(accountId, 'privateKey', 'fictional-private-key');
  vault.lock();
  const pending = vault.unlock(password);
  vault.lock();
  await expect(pending).rejects.toThrow('取消');
  expect(() => vault.read(accountId, 'privateKey')).toThrow('解锁');
});
