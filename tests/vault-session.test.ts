import { afterEach, expect, test, vi } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { Store } from '../electron/store';
import { Vault } from '../electron/vault';
import { SecretClipboard } from '../electron/secret-clipboard';
let store: Store | undefined, vault: Vault | undefined, clipboard: SecretClipboard | undefined;
async function setup() {
  store = new Store(fs.mkdtempSync(path.join(os.tmpdir(), 'workbench-session-')));
  const systemId = store.mutate({ type: 'system.save', name: '订单平台' }).createdId!;
  const environmentId = store.mutate({
    type: 'environment.save',
    systemId,
    name: '生产',
  }).createdId!;
  const resourceId = store.mutate({
    type: 'resource.save',
    environmentId,
    kind: 'redis',
    name: '缓存',
  }).createdId!;
  const accountId = store.mutate({
    type: 'account.save',
    environmentId,
    resourceId,
    name: '连接账号',
  }).createdId!;
  vault = new Vault(store);
  await vault.initialize('fictional-master-password');
  vault.save(accountId, 'password', 'fictional-secret-one');
  vault.save(accountId, 'token', 'fictional-token-two');
  return { accountId, environmentId, resourceId };
}
afterEach(async () => {
  await clipboard?.clearOwned();
  vault?.lock();
  if (store) {
    store.close();
    fs.rmSync(store.root, { recursive: true, force: true });
  }
  store = undefined;
  vault = undefined;
  clipboard = undefined;
  vi.useRealTimers();
});

test('闲置 15 分钟撤销访问，正常活动延续会话，过期后活动不能自动解锁', async () => {
  const { accountId } = await setup();
  vi.useFakeTimers();
  await vi.advanceTimersByTimeAsync(14 * 60_000);
  vault!.touch();
  await vi.advanceTimersByTimeAsync(14 * 60_000);
  expect(vault!.read(accountId, 'password')).toBe('fictional-secret-one');
  await vi.advanceTimersByTimeAsync(15 * 60_000);
  vault!.touch();
  expect(vault!.status().unlocked).toBe(false);
  expect(() => vault!.read(accountId, 'password')).toThrow('解锁');
});

test('剪贴板只清理本次仍持有的秘密，后续普通复制和重复秘密复制各自保持正确计时', async () => {
  const { accountId } = await setup();
  vi.useFakeTimers();
  let text = '';
  clipboard = new SecretClipboard(vault!, {
    readText: async () => text,
    writeText: async (value) => {
      text = value;
    },
    clear: () => {
      text = '';
    },
  });
  await clipboard.copy(accountId, 'password');
  expect(text).toBe('fictional-secret-one');
  await vi.advanceTimersByTimeAsync(29_999);
  expect(text).toBe('fictional-secret-one');
  await vi.advanceTimersByTimeAsync(1);
  expect(text).toBe('');
  await clipboard.copy(accountId, 'password');
  text = 'later ordinary text';
  await vi.advanceTimersByTimeAsync(30_000);
  expect(text).toBe('later ordinary text');
  await clipboard.copy(accountId, 'password');
  await vi.advanceTimersByTimeAsync(20_000);
  await clipboard.copy(accountId, 'token');
  await vi.advanceTimersByTimeAsync(10_000);
  expect(text).toBe('fictional-token-two');
  await vi.advanceTimersByTimeAsync(20_000);
  expect(text).toBe('');
  vault!.lock();
  await expect(clipboard!.copy(accountId, 'password')).rejects.toThrow('解锁');
});

test('明确复制秘密生成独立账号，失败时回滚新身份，资源复制也保留各账号秘密', async () => {
  const { accountId, environmentId, resourceId } = await setup();
  const copied = vault!.copyAccount(accountId, { environmentId, resourceId, name: '只读连接' }, [
    'password',
  ]);
  expect(vault!.read(copied.createdId!, 'password')).toBe('fictional-secret-one');
  expect(() => vault!.read(copied.createdId!, 'token')).toThrow('尚未保存');
  const before = store!.snapshot().accounts.length;
  store!.db.exec(
    "CREATE TRIGGER test_copy_failure BEFORE INSERT ON secrets BEGIN SELECT RAISE(ABORT,'模拟写入失败'); END",
  );
  expect(() =>
    vault!.copyAccount(accountId, { environmentId, resourceId, name: '失败副本' }, ['password']),
  ).toThrow();
  expect(store!.snapshot().accounts).toHaveLength(before);
  store!.db.exec('DROP TRIGGER test_copy_failure');
  const resourceCopy = vault!.copyResource(resourceId, { environmentId, name: '缓存副本' });
  const accounts = store!
    .snapshot()
    .accounts.filter((item) => item.resourceId === resourceCopy.createdId);
  expect(accounts).toHaveLength(2);
  expect(vault!.read(accounts.find((item) => item.name === '连接账号')!.id, 'token')).toBe(
    'fictional-token-two',
  );
  vault!.lock();
  expect(() => vault!.copyResource(resourceId, { environmentId, name: '锁定时副本' })).toThrow(
    '解锁',
  );
});

test('异步剪贴板写入期间锁定会清除迟到的秘密，不保留已取消操作', async () => {
  const { accountId } = await setup();
  let text = '',
    release!: () => void;
  let started!: () => void;
  const writing = new Promise<void>((resolve) => {
    started = resolve;
  });
  clipboard = new SecretClipboard(vault!, {
    readText: async () => text,
    writeText: async (value) => {
      started();
      await new Promise<void>((resolve) => {
        release = resolve;
      });
      text = value;
    },
    clear: () => {
      text = '';
    },
  });
  const copying = clipboard.copy(accountId, 'password');
  await writing;
  vault!.lock();
  const clearing = clipboard.clearOwned();
  release();
  await expect(copying).rejects.toThrow('取消');
  await clearing;
  expect(text).toBe('');
});
