import { test, expect, afterEach, vi } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { Store } from '../electron/store';
import { Vault } from '../electron/vault';
import { SecretClipboard } from '../electron/secret-clipboard';
import { collectLedgerCopy, prepareLedgerCopy } from '../electron/ledger-copy';
import type { LedgerCopySelection } from '../src/ledger-copy-types';
const stores: Store[] = [];
afterEach(() => {
  for (const s of stores.splice(0)) {
    s.close();
    fs.rmSync(s.root, { recursive: true, force: true });
  }
  vi.useRealTimers();
});
function fixture() {
  const s = new Store(fs.mkdtempSync(path.join(os.tmpdir(), 'ledger-copy-')));
  stores.push(s);
  const systemId = s.mutate({ type: 'system.save', name: '协作平台' }).createdId!;
  const prod = s.mutate({ type: 'environment.save', systemId, name: '生产' }).createdId!;
  const testing = s.mutate({ type: 'environment.save', systemId, name: '测试' }).createdId!;
  const server = s.mutate({
    type: 'resource.save',
    systemId,
    environmentId: null,
    kind: 'server',
    name: '应用节点',
    address: '192.0.2.10',
    port: '22',
    fields: {
      CPU: '16 核',
      内存: '32 GB',
      硬盘: '500 GB',
      操作系统: 'Kylin V10',
      用途: '订单服务',
      机房: 'A 区',
    },
    notes: '第一行\n第二行',
  }).createdId!;
  const testServer = s.mutate({
    type: 'resource.save',
    systemId,
    environmentId: testing,
    kind: 'server',
    name: '测试节点',
    address: '192.0.2.20',
  }).createdId!;
  const service = s.mutate({
    type: 'service.save',
    systemId,
    name: '订单 API',
    repository: 'git@example.invalid:orders.git',
  }).createdId!;
  function node(name: string, environmentId: string, serverId: string | null) {
    return s.mutate({
      type: 'node.save',
      value: {
        name,
        serviceId: service,
        environmentId,
        serverId,
        address: '',
        port: '8080',
        mode: 'fixed',
        count: '',
        notes: '',
      },
    }).createdId!;
  }
  const prodNode = node('生产节点', prod, server);
  node('测试部署', testing, testServer);
  const admin = s.mutate({
    type: 'account.save',
    environmentId: null,
    resourceId: server,
    name: '运维',
    username: 'operator',
  }).createdId!;
  const reader = s.mutate({
    type: 'account.save',
    environmentId: testing,
    resourceId: testServer,
    name: '测试账号',
    username: 'reader',
  }).createdId!;
  const operation = s.mutate({
    type: 'operation.save',
    value: {
      systemId,
      environmentId: prod,
      name: '每日备份',
      kind: 'backup',
      serviceId: service,
      resourceId: null,
      documentId: null,
      frequency: '每天 02:00',
      status: 'active',
      notes: '检查结果',
    },
  }).createdId!;
  return {
    s,
    systemId,
    prod,
    testing,
    server,
    testServer,
    service,
    prodNode,
    admin,
    reader,
    operation,
  };
}
test('服务器完整配置及服务范围、节点回退、运维账号来源准确且无递归展开', () => {
  const f = fixture();
  const selection: LedgerCopySelection = {
    systemId: f.systemId,
    environment: f.prod,
    objects: [
      { kind: 'resource', id: f.server },
      { kind: 'resource', id: f.server },
    ],
  };
  const server = collectLedgerCopy(f.s.snapshot(), selection);
  expect(server.titles).toEqual(['应用节点']);
  expect(server.text).toContain('CPU：16 核');
  expect(server.text).toContain('机房：A 区');
  expect(server.text).toContain('适用环境：系统通用');
  expect(server.text).toContain('第一行\n第二行');
  expect(server.text).not.toContain(f.server);
  const service = collectLedgerCopy(f.s.snapshot(), {
    ...selection,
    objects: [{ kind: 'service', id: f.service }],
  });
  expect(service.text).toContain('生产节点');
  expect(service.text).toContain('地址来源：服务器 应用节点');
  expect(service.text).not.toContain('测试部署');
  expect(service.text).not.toContain('CPU');
  expect(service.accounts.map((a) => a.id)).toEqual([f.admin]);
  const all = collectLedgerCopy(f.s.snapshot(), {
    ...selection,
    environment: 'all',
    objects: [{ kind: 'service', id: f.service }],
  });
  expect(all.text).toContain('部署环境：测试');
  expect(all.accounts).toHaveLength(2);
  const common = collectLedgerCopy(f.s.snapshot(), {
    ...selection,
    environment: 'common',
    objects: [{ kind: 'service', id: f.service }],
  });
  expect(common.text).not.toContain('部署节点');
  expect(common.accounts).toEqual([]);
  const op = collectLedgerCopy(f.s.snapshot(), {
    ...selection,
    environment: 'all',
    objects: [{ kind: 'operation', id: f.operation }],
  });
  expect(op.text).toContain('频率：每天 02:00');
  expect(op.text).not.toContain('部署节点');
  expect(op.accounts.map((a) => a.id)).toEqual([f.admin]);
  const node = collectLedgerCopy(f.s.snapshot(), {
    ...selection,
    objects: [{ kind: 'node', id: f.prodNode }],
  });
  expect(node.text).toContain('服务：订单 API');
  expect(node.accounts.map((a) => a.id)).toEqual([f.admin]);
});
test('入口全部具名地址、账号去重与密码选项，拒绝越界或失效请求', async () => {
  const f = fixture(),
    v = new Vault(f.s);
  await v.initialize('fixture-master');
  v.save(f.admin, 'password', 'fixture-password');
  v.save(f.reader, 'token', 'fixture-token');
  const entry = f.s.mutate({
    type: 'access.save',
    systemId: f.systemId,
    name: 'Jenkins',
    addresses: [
      { label: '内网', url: 'https://a.example.invalid' },
      { label: '外网', url: 'https://b.example.invalid' },
    ],
  }).createdId!;
  const selection: LedgerCopySelection = {
    systemId: f.systemId,
    environment: 'all',
    objects: [
      { kind: 'access', id: entry },
      { kind: 'resource', id: f.server },
      { kind: 'service', id: f.service },
    ],
  };
  const c = collectLedgerCopy(f.s.snapshot(), selection);
  expect(c.text).toContain('内网（常用）：https://a.example.invalid');
  expect(c.text).toContain('外网：https://b.example.invalid');
  expect(c.accounts.filter((a) => a.id === f.admin)).toHaveLength(1);
  let reads = 0;
  const read = (id: string) => {
    reads++;
    return v.read(id, 'password');
  };
  const normal = prepareLedgerCopy(
    f.s.snapshot(),
    { ...selection, accountIds: [f.admin], includePasswords: false },
    read,
  );
  expect(reads).toBe(0);
  expect(normal.value).toContain('用户名：operator');
  expect(normal.value).not.toContain('fixture-password');
  expect(normal.sensitive).toBe(false);
  const secret = prepareLedgerCopy(
    f.s.snapshot(),
    { ...selection, accountIds: [f.admin, f.admin, f.reader], includePasswords: true },
    read,
  );
  expect(reads).toBe(1);
  expect(secret.value.match(/账号用途：运维/g)).toHaveLength(1);
  expect(secret.value).toContain('密码：fixture-password');
  expect(secret.value).toContain('密码：未保存密码');
  expect(secret.value).not.toContain('fixture-token');
  const restricted = {
    ...selection,
    environment: f.prod,
    objects: [{ kind: 'service' as const, id: f.service }],
  };
  expect(() =>
    prepareLedgerCopy(
      f.s.snapshot(),
      { ...restricted, accountIds: [f.reader], includePasswords: true },
      read,
    ),
  ).toThrow('不属于');
  const another = f.s.mutate({ type: 'system.save', name: '另一系统' }).createdId!;
  expect(() => collectLedgerCopy(f.s.snapshot(), { ...selection, systemId: another })).toThrow();
  expect(() =>
    collectLedgerCopy(f.s.snapshot(), { ...selection, objects: [{ kind: 'node', id: 'missing' }] }),
  ).toThrow('不存在');
  expect(() =>
    collectLedgerCopy(f.s.snapshot(), {
      ...selection,
      objects: [{ kind: 'secret' as any, id: f.admin }],
    }),
  ).toThrow('类型');
  v.save(f.admin, 'password', '   ');
  expect(
    prepareLedgerCopy(
      f.s.snapshot(),
      { ...selection, accountIds: [f.admin], includePasswords: true },
      read,
    ).value,
  ).toContain('密码：   ');
  v.lock();
  expect(() =>
    prepareLedgerCopy(
      f.s.snapshot(),
      { ...selection, accountIds: [f.admin], includePasswords: true },
      read,
    ),
  ).toThrow('解锁');
});
test('普通摘要不定时清理，含密码摘要沿用计时清理，失败不覆盖剪贴板', async () => {
  const f = fixture(),
    v = new Vault(f.s);
  await v.initialize('fixture-master');
  v.save(f.admin, 'password', 'fixture-password');
  let value = 'previous';
  const clipboard = new SecretClipboard(v, {
    readText: async () => value,
    writeText: async (next) => {
      value = next;
    },
    clear: () => {
      value = '';
    },
  });
  const request = {
    systemId: f.systemId,
    environment: 'all',
    objects: [{ kind: 'resource' as const, id: f.server }],
    accountIds: [f.admin],
    includePasswords: false,
  };
  vi.useFakeTimers();
  await clipboard.copyPrepared(() =>
    prepareLedgerCopy(f.s.snapshot(), request, (id) => v.read(id, 'password')),
  );
  await vi.advanceTimersByTimeAsync(30000);
  expect(value).toContain('CPU');
  await expect(
    clipboard.copyPrepared(() => {
      throw new Error('模拟失败');
    }),
  ).rejects.toThrow();
  expect(value).toContain('CPU');
  await clipboard.copyPrepared(() =>
    prepareLedgerCopy(f.s.snapshot(), { ...request, includePasswords: true }, (id) =>
      v.read(id, 'password'),
    ),
  );
  expect(value).toContain('fixture-password');
  await vi.advanceTimersByTimeAsync(30000);
  expect(value).toBe('');
  v.lock();
  await clipboard.clearOwned();
});
