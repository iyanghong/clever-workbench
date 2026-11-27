import { afterEach, expect, test, vi } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { Store } from '../electron/store';
import { Vault } from '../electron/vault';
import { SecretClipboard } from '../electron/secret-clipboard';
import type { VaultIdleMinutes } from '../src/vault-types';
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

test('主密码按所选闲置时间锁定，活动从最后一次操作重新计时', async () => {
  const { accountId } = await setup();
  store!.mutate({ type: 'settings', vaultIdleMinutes: 60 });
  vi.useFakeTimers();
  vault!.touch();
  vi.advanceTimersByTime(59 * 60_000);
  expect(vault!.status().unlocked).toBe(true);
  vault!.touch();
  expect(() => vault!.touch(NaN)).toThrow('活动时间');
  vault!.touch(Date.now() + 60_000);
  vault!.touch(Date.now() - 60_000);
  vi.advanceTimersByTime(60 * 60_000 - 1);
  expect(vault!.status().unlocked).toBe(true);
  vi.advanceTimersByTime(1);
  vault!.touch();
  expect(() => vault!.read(accountId, 'password')).toThrow('解锁');
});

test('旧资料默认闲置 15 分钟锁定，非法时长不能覆盖已选时间', async () => {
  await setup();
  expect(store!.settings().vaultIdleMinutes).toBe(15);
  store!.mutate({ type: 'settings', vaultIdleMinutes: 5 });
  for (const invalid of [0, -1, 1.5, '60', 99999, null]) {
    expect(() =>
      store!.mutate({ type: 'settings', vaultIdleMinutes: invalid as VaultIdleMinutes }),
    ).toThrow('锁定时间');
  }
  expect(store!.snapshot().settings.vaultIdleMinutes).toBe(5);
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

test('整行复制取常用地址和当前账号，缺失密码留空且不复制其他凭据', async () => {
  const { accountId, resourceId, environmentId } = await setup();
  const systemId = store!.snapshot().systems[0].id;
  const accessId = store!.mutate({
    type: 'access.save',
    systemId,
    name: 'Jenkins',
    addresses: [
      { label: '内网', url: 'https://internal.example.invalid' },
      { label: '常用', url: 'https://ci.example.invalid' },
    ],
  }).createdId!;
  const access = store!.snapshot().accessEntries.find((a) => a.id === accessId)!;
  store!.mutate({ type: 'access.save', id: accessId, preferredAddressId: access.addresses[1].id });
  const operator = store!.mutate({
    type: 'account.save',
    accessId,
    name: '运维',
    username: 'operator',
  }).createdId!;
  vault!.save(operator, 'password', 'fictional-ci-password');
  expect(vault!.accountText(operator)).toEqual({
    value: 'Jenkins / 运维\nhttps://ci.example.invalid\noperator\nfictional-ci-password',
    sensitive: true,
  });
  store!.mutate({
    type: 'resource.save',
    id: resourceId,
    environmentId,
    kind: 'redis',
    name: '缓存',
    address: '192.0.2.11',
    port: '6379',
  });
  expect(vault!.accountText(accountId).value).toBe(
    '缓存 / 连接账号\n192.0.2.11:6379\n\nfictional-secret-one',
  );
  const noPassword = store!.mutate({
    type: 'account.save',
    environmentId,
    name: '自动化',
    username: 'bot',
  }).createdId!;
  store!.mutate({
    type: 'system.save',
    id: systemId,
    name: '订单平台',
    url: 'https://app.example.invalid',
  });
  vault!.save(noPassword, 'token', 'fictional-token-only');
  vault!.lock();
  expect(vault!.accountText(noPassword)).toEqual({
    value: '订单平台 / 自动化\nhttps://app.example.invalid\nbot\n',
    sensitive: false,
  });
  expect(() => vault!.accountText(operator)).toThrow('解锁');
  expect(() => vault!.accountText('missing')).toThrow('不存在');
});

test('整行复制采用受保护剪贴板，30 秒清理且复制期间锁定不留明文', async () => {
  const { accountId } = await setup();
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
  vi.useFakeTimers();
  await clipboard.copyAccount(accountId);
  expect(text).toBe('缓存 / 连接账号\n\n\nfictional-secret-one');
  await vi.advanceTimersByTimeAsync(30_000);
  expect(text).toBe('');
  await clipboard.copyAccount(accountId);
  text = 'newer user text';
  await clipboard.clearOwned();
  expect(text).toBe('newer user text');
  let release!: () => void, started!: () => void;
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
  const copying = clipboard.copyAccount(accountId);
  await writing;
  vault!.lock();
  const clearing = clipboard.clearOwned();
  release();
  await expect(copying).rejects.toThrow('取消');
  await clearing;
  expect(text).toBe('');
});
