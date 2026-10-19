import { afterEach, expect, test } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { Store } from '../electron/store';
import { emptyContent } from '../src/domain';
import { Backups } from '../electron/backup';
import { Vault } from '../electron/vault';

const roots: string[] = [],
  stores: Store[] = [];
function open(root = fs.mkdtempSync(path.join(os.tmpdir(), 'workbench-system-ledger-'))) {
  if (!roots.includes(root)) roots.push(root);
  const store = new Store(root);
  stores.push(store);
  return store;
}
afterEach(() => {
  for (const store of stores.splice(0)) {
    try {
      store.close();
    } catch {}
  }
  for (const root of roots.splice(0)) fs.rmSync(root, { recursive: true, force: true });
});

test(
  '通用入口可搜索和收藏，完整备份恢复保留地址顺序、常用账号及服务器秘密',
  { timeout: 15_000 },
  async () => {
    const store = open(),
      vault = new Vault(store),
      backups = new Backups(store);
    const systemId = store.mutate({ type: 'system.save', name: '订单平台' }).createdId!;
    await vault.initialize('fictional-portable-access-password');
    try {
      const entry = vault.capture({
        kind: 'access',
        systemId,
        environmentId: null,
        name: 'Jenkins',
        address: 'https://build.example.test',
        username: 'operator',
        password: 'fictional-jenkins-password',
      }).createdId;
      vault.capture({
        kind: 'server',
        systemId,
        environmentId: null,
        name: '应用节点',
        address: '192.0.2.10',
        purpose: '订单与定时任务',
        fields: {
          操作系统: 'Kylin Linux V10',
          CPU: 'Intel Core Processor / 16 核',
          内存: '32G',
          硬盘: '500G',
        },
        username: 'deploy',
        password: 'fictional-server-password',
      });
      expect(store.snapshot().resources[0].fields).toEqual({
        用途: '订单与定时任务',
        操作系统: 'Kylin Linux V10',
        CPU: 'Intel Core Processor / 16 核',
        内存: '32G',
        硬盘: '500G',
      });
      store.mutate({ type: 'favorite.set', kind: 'access', id: entry, pinned: true });
      expect(store.globalSearch('订单 Jenkins operator')).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            kind: 'account',
            username: 'operator',
            context: '订单平台 / 系统通用 / Jenkins',
          }),
        ]),
      );
      expect(store.globalSearch('定时任务')[0]).toMatchObject({
        kind: 'resource',
        title: '应用节点',
      });
      const before = store.snapshot(),
        file = path.join(store.root, 'new-ledger.cwb');
      vault.lock();
      await backups.create(file);
      const target = open(),
        incoming = new Backups(target);
      const prepared = await incoming.inspect(file, 'fictional-portable-access-password');
      expect(prepared).toMatchObject({ accessEntries: 1, resources: 1, accounts: 2, secrets: 2 });
      await incoming.restore(prepared.token);
      const restored = target.snapshot();
      for (const key of ['accessEntries', 'resources', 'accounts', 'favorites'] as const)
        expect(restored[key]).toEqual(before[key]);
      const targetVault = new Vault(target);
      try {
        await targetVault.unlock('fictional-portable-access-password');
        for (const account of restored.accounts)
          expect(targetVault.read(account.id, 'password')).toBe(
            account.accessId ? 'fictional-jenkins-password' : 'fictional-server-password',
          );
      } finally {
        targetVault.lock();
      }
    } finally {
      vault.lock();
    }
  },
);

test(
  '既有第七版完整备份恢复并升级后，服务器身份、多账号、秘密及资料引用保留',
  { timeout: 15_000 },
  async () => {
    const store = open(),
      backups = new Backups(store);
    const fixture = path.resolve('.scratch/desktop-workbench/evidence/migration/legacy-v7');
    const original = JSON.parse(fs.readFileSync(`${fixture}.json`, 'utf8'));
    const password = 'fictional-migration-master-password';
    const prepared = await backups.inspect(`${fixture}.cwb`, password);
    await backups.restore(prepared.token);
    const snapshot = store.snapshot();
    expect(snapshot.resources.map((r) => r.id)).toEqual(
      original.workspace.data.resources.map((r: { id: string }) => r.id),
    );
    for (const resource of snapshot.resources)
      expect(resource.systemId).toBe(
        snapshot.environments.find((e) => e.id === resource.environmentId)!.systemId,
      );
    for (const old of original.workspace.data.tasks) {
      const migrated = snapshot.tasks.find((task) => task.id === old.id)!;
      expect(migrated).toMatchObject({
        ...old,
        projectId: null,
        environmentId: null,
        resourceId: null,
      });
      if (old.projectId)
        expect(migrated.history).toContain(
          original.workspace.data.projects.find((p: any) => p.id === old.projectId).name,
        );
    }
    expect(snapshot.documents).toEqual(original.workspace.data.documents);
    const vault = new Vault(store);
    try {
      await vault.unlock(password);
      for (const secret of original.secrets)
        expect(vault.read(secret.accountId, secret.kind)).toBe(secret.value);
    } finally {
      vault.lock();
    }
  },
);

test('无环境可记录多台服务器及可选多角色账号，相关任务准确继承系统且重启保留', () => {
  const store = open();
  const systemId = store.mutate({ type: 'system.save', name: '园区平台' }).createdId!;
  const server = store.mutate({
    type: 'resource.save',
    systemId,
    environmentId: null,
    kind: 'server',
    name: '应用节点 1',
    address: '192.0.2.10',
    fields: { 用途: '订单应用' },
  }).createdId!;
  store.mutate({
    type: 'resource.save',
    systemId,
    environmentId: null,
    kind: 'server',
    name: '应用节点 2',
    address: '192.0.2.11',
  });
  for (const [name, username] of [
    ['运维', 'deploy'],
    ['只读', 'reader'],
  ])
    store.mutate({ type: 'account.save', environmentId: null, resourceId: server, name, username });
  const task = store.mutate({
    type: 'task.create',
    draft: {
      title: '检查应用节点',
      projectId: null,
      resourceId: server,
      markdown: '',
      content: emptyContent(),
    },
  }).createdId!;
  expect(store.task(task)).toMatchObject({ systemId, environmentId: null, resourceId: null });
  expect(store.snapshot().resources).toHaveLength(2);
  expect(
    store.snapshot().accounts.map((a) => [a.name, a.username, a.systemId, a.environmentId]),
  ).toEqual([
    ['运维', 'deploy', systemId, null],
    ['只读', 'reader', systemId, null],
  ]);
  expect(() =>
    store.mutate({
      type: 'resource.save',
      systemId,
      environmentId: null,
      kind: 'redis',
      name: '通用 Redis',
    }),
  ).not.toThrow();
  expect(() => store.mutate({ type: 'resource.delete', id: server })).toThrow('引用');
  store.close();
  const reopened = open(store.root);
  expect(reopened.snapshot().resources.find((r) => r.id === server)).toMatchObject({
    systemId,
    environmentId: null,
    fields: { 用途: '订单应用' },
  });
  expect(reopened.snapshot().accounts).toHaveLength(2);
});

test('服务器可后补环境并保留多账号，带资料引用时保护旧归属，跨系统副本独立且可显式复制秘密', async () => {
  const store = open(),
    vault = new Vault(store);
  const systemId = store.mutate({ type: 'system.save', name: '订单' }).createdId!;
  const other = store.mutate({ type: 'system.save', name: '设备' }).createdId!;
  const environmentId = store.mutate({
    type: 'environment.save',
    systemId,
    name: '生产',
  }).createdId!;
  await vault.initialize('fictional-server-copy-master');
  try {
    const server = vault.capture({
      kind: 'server',
      systemId,
      environmentId: null,
      name: '应用节点',
      address: '192.0.2.10',
      purpose: '订单',
      username: 'deploy',
      password: 'fictional-server-secret',
    }).createdId;
    const accountId = store.snapshot().accounts[0].id;
    store.mutate({
      type: 'account.save',
      resourceId: server,
      environmentId: null,
      name: '只读',
      username: 'reader',
    });
    store.mutate({
      type: 'resource.save',
      id: server,
      kind: 'server',
      systemId,
      environmentId,
      name: '应用节点',
    });
    expect(store.snapshot().accounts.map((a) => a.environmentId)).toEqual([
      environmentId,
      environmentId,
    ]);
    expect(vault.read(accountId, 'password')).toBe('fictional-server-secret');
    const task = store.mutate({
      type: 'task.create',
      draft: {
        title: '检查节点',
        projectId: null,
        resourceId: server,
        markdown: '',
        content: emptyContent(),
      },
    }).createdId!;
    store.mutate({
      type: 'resource.save',
      id: server,
      kind: 'server',
      systemId,
      environmentId: null,
      name: '应用节点',
    });
    expect(store.task(task)).toMatchObject({ systemId, resourceId: null, environmentId: null });
    const plain = store.mutate({
      type: 'resource.copy',
      id: server,
      systemId: other,
      environmentId: null,
    }).createdId!;
    expect(
      store
        .snapshot()
        .accounts.filter((a) => a.resourceId === plain)
        .map((a) => a.secretKinds),
    ).toEqual([[], []]);
    const secure = vault.copyResource(server, { systemId: other, environmentId: null }).createdId;
    const copied = store
      .snapshot()
      .accounts.find((a) => a.resourceId === secure && a.name === '默认账号')!;
    expect(vault.read(copied.id, 'password')).toBe('fictional-server-secret');
    expect(store.snapshot().resources.find((r) => r.id === server)?.systemId).toBe(systemId);
  } finally {
    vault.lock();
  }
});

test('系统访问入口保存多个具名地址和角色账号，切换常用项与删地址不丢账号', () => {
  const store = open();
  const systemId = store.mutate({ type: 'system.save', name: '订单平台' }).createdId!;
  const accessId = store.mutate({
    type: 'access.save',
    systemId,
    environmentId: null,
    name: 'Jenkins',
    addresses: [
      { label: '内网', url: 'https://jenkins.example.test' },
      { label: '外网', url: 'https://build.example.test' },
    ],
  }).createdId!;
  const admin = store.mutate({
    type: 'account.save',
    environmentId: null,
    accessId,
    name: '管理员',
    username: 'admin',
  }).createdId!;
  const reader = store.mutate({
    type: 'account.save',
    environmentId: null,
    accessId,
    name: '只读',
    username: 'reader',
  }).createdId!;
  const initial = store.snapshot().accessEntries[0];
  expect(initial).toMatchObject({
    systemId,
    environmentId: null,
    preferredAccountId: admin,
    preferredAddressId: initial.addresses[0].id,
  });
  store.mutate({
    type: 'access.save',
    id: accessId,
    preferredAccountId: reader,
    preferredAddressId: initial.addresses[1].id,
  });
  store.mutate({
    type: 'access.save',
    id: accessId,
    systemId,
    environmentId: null,
    name: 'Jenkins',
    addresses: [initial.addresses[0]],
  });
  expect(store.snapshot().accounts).toHaveLength(2);
  expect(store.snapshot().accessEntries[0]).toMatchObject({
    preferredAccountId: reader,
    preferredAddressId: initial.addresses[0].id,
  });
  store.mutate({ type: 'account.delete', id: reader });
  expect(store.snapshot().accessEntries[0].preferredAccountId).toBe(admin);
  store.close();
  expect(open(store.root).snapshot().accessEntries[0]).toMatchObject({
    name: 'Jenkins',
    preferredAccountId: admin,
  });
});

test('一次录入入口与密码必须整体保存，锁定或秘密写入失败不留下半条记录且可原样重试', async () => {
  const store = open(),
    vault = new Vault(store);
  const systemId = store.mutate({ type: 'system.save', name: '订单平台' }).createdId!;
  const input = {
    kind: 'access' as const,
    systemId,
    environmentId: null,
    name: 'GitLab',
    address: 'https://git.example.test',
    username: 'operator',
    password: 'fictional-access-secret',
  };
  expect(() => vault.capture(input)).toThrow('解锁');
  expect(store.snapshot().accessEntries).toHaveLength(0);
  await vault.initialize('fictional-capture-master');
  try {
    store.db.exec(
      "CREATE TRIGGER reject_capture BEFORE INSERT ON secrets BEGIN SELECT RAISE(ABORT,'模拟磁盘写入失败'); END",
    );
    expect(() => vault.capture(input)).toThrow('模拟磁盘');
    expect(store.snapshot().accessEntries).toHaveLength(0);
    expect(store.snapshot().accounts).toHaveLength(0);
    store.db.exec('DROP TRIGGER reject_capture');
    const result = vault.capture(input);
    expect(result.snapshot.accessEntries).toHaveLength(1);
    const account = result.snapshot.accounts[0];
    expect(account).toMatchObject({
      accessId: result.createdId,
      name: '默认账号',
      username: 'operator',
    });
    expect(vault.read(account.id, 'password')).toBe(input.password);
    expect(JSON.stringify(result.snapshot)).not.toContain(input.password);
  } finally {
    vault.lock();
  }
});

test('跨系统复制入口保留地址和账号元数据，秘密仅经解锁操作复制且副本独立', async () => {
  const store = open(),
    vault = new Vault(store);
  const sourceSystem = store.mutate({ type: 'system.save', name: '订单' }).createdId!;
  const targetSystem = store.mutate({ type: 'system.save', name: '设备' }).createdId!;
  await vault.initialize('fictional-copy-master-password');
  try {
    const source = vault.capture({
      kind: 'access',
      systemId: sourceSystem,
      environmentId: null,
      name: 'GitLab',
      address: 'https://git.example.test',
      username: 'operator',
      password: 'fictional-source-password',
    }).createdId;
    const plain = store.mutate({
      type: 'access.copy',
      id: source,
      systemId: targetSystem,
      environmentId: null,
    }).createdId!;
    expect(store.snapshot().accounts.find((a) => a.accessId === plain)).toMatchObject({
      name: '默认账号',
      username: 'operator',
      secretKinds: [],
    });
    vault.lock();
    expect(() => vault.copyAccess(source, { systemId: targetSystem, environmentId: null })).toThrow(
      '解锁',
    );
    expect(store.snapshot().accessEntries).toHaveLength(2);
    await vault.unlock('fictional-copy-master-password');
    const secure = vault.copyAccess(source, {
      systemId: targetSystem,
      environmentId: null,
    }).createdId;
    const account = store.snapshot().accounts.find((a) => a.accessId === secure)!;
    expect(vault.read(account.id, 'password')).toBe('fictional-source-password');
    store.mutate({
      type: 'access.save',
      id: secure,
      systemId: targetSystem,
      environmentId: null,
      name: '设备 Git',
      addresses: [],
    });
    expect(store.snapshot().accessEntries.find((e) => e.id === source)?.addresses[0].url).toBe(
      'https://git.example.test',
    );
  } finally {
    vault.lock();
  }
});
