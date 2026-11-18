import { importChanges, importTargets } from '../src/ledger-import-matches';
import { adviseImport, targetRevision } from '../electron/ledger-import-advice';
import { afterEach, expect, test } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import { Store } from '../electron/store';
import { Vault } from '../electron/vault';
import { Backups } from '../electron/backup';
import type { PreparedLedgerImport } from '../electron/ledger-import-save';
import type { ImportCandidate, LedgerImportKind } from '../src/ledger-import-types';

const roots: string[] = [],
  stores: Store[] = [],
  vaults: Vault[] = [];
function setup() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'cwb-import-save-'));
  roots.push(root);
  const store = new Store(root);
  stores.push(store);
  const vault = new Vault(store);
  vaults.push(vault);
  const systemId = store.mutate({ type: 'system.save', name: '合成导入系统' }).createdId!;
  const environmentId = store.mutate({
    type: 'environment.save',
    systemId,
    name: '生产',
  }).createdId!;
  return { store, vault, systemId, environmentId };
}
afterEach(() => {
  for (const vault of vaults.splice(0)) vault.lock();
  for (const store of stores.splice(0)) store.close();
  for (const root of roots.splice(0)) fs.rmSync(root, { recursive: true, force: true });
});
function candidate(
  id: string,
  kind: LedgerImportKind,
  environmentIds: string[] = [],
): ImportCandidate {
  return {
    id,
    kind,
    name: id,
    sourceIds: ['source'],
    environmentNames: [],
    environmentIds,
    tags: [],
    address: '',
    port: '',
    notes: '',
    repository: '',
    fields: {},
    accounts: [],
    addresses: [],
    connections: [],
    service: null,
    server: null,
    owner: null,
    username: '',
    passwordRef: null,
    frequency: '',
    status: 'unverified',
    mode: 'fixed',
    count: '',
    selected: true,
    reviewed: true,
    confirmDuplicate: false,
    warnings: [],
  };
}
function batch(
  systemId: string,
  candidates: ImportCandidate[],
  passwords: Record<string, string> = {},
): PreparedLedgerImport {
  return {
    id: randomUUID(),
    systemId,
    kind: 'all',
    candidates,
    passwords,
    sensitiveValues: Object.values(passwords),
  };
}

test('mixed import creates new relationships, multiple accounts and connections atomically and retries without duplicates', async () => {
  const { store, vault, systemId, environmentId } = setup();
  await vault.initialize('fictional-import-master');
  const server = { ...candidate('app-server', 'server', [environmentId]), address: '192.0.2.10' };
  const service = candidate('order-service', 'service', [environmentId]);
  const database = {
    ...candidate('order-database', 'database', [environmentId]),
    connections: [
      {
        id: 'db-conn-1',
        label: '业务连接',
        address: '192.0.2.20',
        port: '5432',
        role: '',
        server: { candidate: server.id },
      },
      {
        id: 'db-conn-2',
        label: '管理连接',
        address: '192.0.2.21',
        port: '5432',
        role: '',
        server: null,
      },
    ],
    accounts: [
      {
        id: 'app-account',
        name: '应用账号',
        username: '000123',
        notes: '',
        passwordRef: 'source-password-1',
      },
      {
        id: 'read-account',
        name: '只读账号',
        username: 'reader',
        notes: '',
        passwordRef: 'source-password-2',
      },
    ],
  } as ImportCandidate;
  const node = {
    ...candidate('api-node', 'node', [environmentId]),
    service: { candidate: service.id },
    server: { candidate: server.id },
    port: '8080',
  };
  const operation = {
    ...candidate('daily-backup', 'backup', [environmentId]),
    owner: { candidate: database.id },
    frequency: '每天 03:00',
  };
  const input = batch(systemId, [node, operation, database, service, server], {
    'app-account': ' fixture-app! ',
    'read-account': 'fixture-reader!',
  });
  const saved = vault.captureImport(input);
  expect(saved.snapshot.resources).toHaveLength(2);
  expect(saved.snapshot.accounts).toHaveLength(2);
  const db = saved.snapshot.resources.find((item) => item.kind === 'database')!;
  expect(db.connections).toHaveLength(2);
  expect(db.connections![0].serverId).toBe(
    saved.snapshot.resources.find((item) => item.kind === 'server')!.id,
  );
  expect(saved.snapshot.deploymentNodes[0].serviceId).toBe(saved.snapshot.services[0].id);
  expect(saved.snapshot.operations[0].resourceId).toBe(db.id);
  expect(
    vault.read(saved.snapshot.accounts.find((item) => item.username === '000123')!.id, 'password'),
  ).toBe(' fixture-app! ');
  expect(JSON.stringify(saved.snapshot)).not.toContain('fixture-app!');
  expect(String(store.db.prepare('SELECT value FROM secrets LIMIT 1').get()!.value)).not.toContain(
    'fixture-app!',
  );
  expect(vault.captureImport(input).snapshot.resources).toHaveLength(2);
  const backups = new Backups(store, () => vault);
  const archive = path.join(store.root, 'mixed-import.cwb');
  await backups.create(archive);
  const prepared = await backups.inspect(archive, 'fictional-import-master');
  await backups.restore(prepared.token);
  await vault.unlock('fictional-import-master');
  expect(store.snapshot().resources).toHaveLength(2);
  expect(
    store.snapshot().resources.find((item) => item.kind === 'database')!.connections,
  ).toHaveLength(2);
  expect(
    vault.read(
      store.snapshot().accounts.find((item) => item.username === '000123')!.id,
      'password',
    ),
  ).toBe(' fixture-app! ');
});

test('a later invalid address rolls back objects and encrypted passwords and leaves the batch retryable', async () => {
  const { store, vault, systemId } = setup();
  await vault.initialize('fictional-import-master');
  const server = {
    ...candidate('server', 'server'),
    accounts: [{ id: 'server-user', name: '运维', username: 'ops', notes: '', passwordRef: 'pw' }],
  };
  const entry = {
    ...candidate('entry', 'access'),
    addresses: [{ id: 'bad-address', label: '登录', url: 'javascript:alert(1)' }],
  };
  const input = batch(systemId, [server, entry], { 'server-user': 'fixture-rollback!' });
  expect(() => vault.captureImport(input)).toThrow('HTTP');
  expect(store.snapshot().resources).toHaveLength(0);
  expect(store.snapshot().accounts).toHaveLength(0);
  expect(store.db.prepare('SELECT * FROM secrets').all()).toHaveLength(0);
  expect(store.db.prepare('SELECT * FROM ledger_batches').all()).toHaveLength(0);
  entry.addresses[0].url = 'https://entry.example.invalid';
  expect(vault.captureImport(input).snapshot.resources).toHaveLength(1);
});

test('existing parents are referenced without overwriting them, common parent scope is inherited, and cross-system references fail', () => {
  const { store, vault, systemId, environmentId } = setup();
  const existing = store.mutate({
    type: 'resource.save',
    systemId,
    environmentId: null,
    kind: 'server',
    name: '已有通用服务器',
    address: '192.0.2.10',
  }).createdId!;
  const account = {
    ...candidate('new-user', 'account', [environmentId]),
    owner: { existing },
    username: 'ops',
  };
  const result = vault.captureImport({ ...batch(systemId, [account]), kind: 'account' });
  expect(result.snapshot.resources).toHaveLength(1);
  expect(result.snapshot.resources[0].name).toBe('已有通用服务器');
  expect(result.snapshot.accounts[0].environmentId).toBeNull();
  const anotherSystem = store.mutate({ type: 'system.save', name: '其他系统' }).createdId!;
  expect(() =>
    vault.captureImport(batch(anotherSystem, [{ ...account, name: '跨系统账号' }])),
  ).toThrow('本系统');
});

test('unconfirmed environments, excluded parent candidates, out-of-filter objects and secret contamination cannot be committed', () => {
  const { vault, systemId } = setup();
  const source = candidate('db', 'database');
  expect(() => vault.captureImport(batch(systemId, [{ ...source, environmentIds: null }]))).toThrow(
    '环境',
  );
  const parent = { ...candidate('service', 'service'), selected: false };
  const node = { ...candidate('node', 'node'), service: { candidate: parent.id } };
  expect(() => vault.captureImport(batch(systemId, [parent, node]))).toThrow();
  expect(() =>
    vault.captureImport({ ...batch(systemId, [candidate('server', 'server')]), kind: 'database' }),
  ).toThrow('类型');
  expect(() =>
    vault.captureImport({
      ...batch(systemId, [{ ...source, notes: 'fixture-secret-should-not-be-notes' }]),
      sensitiveValues: ['fixture-secret-should-not-be-notes'],
    }),
  ).toThrow('秘密');
  expect(() =>
    vault.captureImport(
      batch(systemId, [
        { ...source, address: 'https://example.invalid?password=fixture-query-secret' },
      ]),
    ),
  ).toThrow('内嵌');
});

test('a username equal to its password remains ordinary identity data while the password uses encrypted storage', async () => {
  const { store, vault, systemId, environmentId } = setup();
  await vault.initialize('fictional-import-master');
  const account = {
    ...candidate('shared-user', 'account', [environmentId]),
    username: 'shared-login',
    passwordRef: 'source-password',
  };
  const saved = vault.captureImport(batch(systemId, [account], { 'shared-user': 'shared-login' }));
  expect(saved.snapshot.accounts[0].username).toBe('shared-login');
  expect(vault.read(saved.snapshot.accounts[0].id, 'password')).toBe('shared-login');
  expect(String(store.db.prepare('SELECT value FROM secrets LIMIT 1').get()!.value)).not.toContain(
    'shared-login',
  );
});

test('reviewed fields update the existing identity and only its selected URL, preserving scopes, address IDs and encrypted credentials', async () => {
  const { store, vault, systemId, environmentId } = setup();
  await vault.initialize('fictional-import-master');
  const env2 = store.mutate({ type: 'environment.save', systemId, name: '验证' }).createdId!;
  const initial = {
    ...candidate('portal', 'access', [environmentId, env2]),
    name: '合成入口',
    notes: '保留说明',
    addresses: [
      { id: 'u', label: '前台', url: 'https://old.example.invalid' },
      { id: 'm', label: '后台', url: 'https://admin.example.invalid' },
    ],
    accounts: [{ id: 'ops', name: '原有角色', username: 'example', notes: '', passwordRef: 'pw' }],
  };
  const old = vault.captureImport(
    batch(systemId, [initial], { ops: 'synthetic-original-password' }),
  ).snapshot;
  const targets = importTargets(old, systemId),
    t = targets.find((t) => t.kind === 'access')!;
  const targetRevisions = new Map([[t.id, targetRevision(t)]]);
  const edit = {
    ...candidate('review', 'access', []),
    name: '合成入口',
    addresses: [{ id: 'new-url', label: '前台', url: 'https://new.example.invalid' }],
    notes: '未选择的新说明',
    update: { targetId: t.id, fields: ['url:new-url'] },
  };
  const accepted = { ...batch(systemId, [edit]), targetRevisions };
  const saved = vault.captureImport(accepted).snapshot;
  expect(saved.accessEntries).toHaveLength(1);
  expect(saved.accessEntries[0]).toMatchObject({
    id: t.id,
    notes: '保留说明',
    preferredAddressId: old.accessEntries[0].preferredAddressId,
    addresses: [
      { ...old.accessEntries[0].addresses[0], url: 'https://new.example.invalid' },
      old.accessEntries[0].addresses[1],
    ],
  });
  expect(saved.scopes.find((s) => s.ownerId === t.id)?.environmentIds).toEqual([
    environmentId,
    env2,
  ]);
  expect(vault.read(saved.accounts[0].id, 'password')).toBe('synthetic-original-password');
  expect(vault.captureImport(accepted).snapshot.accessEntries).toHaveLength(1);
  expect(() =>
    vault.captureImport({
      ...batch(systemId, [
        { ...edit, notes: '变更', update: { targetId: t.id, fields: ['notes'] } },
      ]),
      targetRevisions,
    }),
  ).toThrow(/已修改/);
  const fresh = new Map(
    importTargets(store.snapshot(), systemId).map((t) => [t.id, targetRevision(t)]),
  );
  const second = {
    ...edit,
    environmentIds: [env2],
    update: { targetId: t.id, fields: ['notes'], environmentOverride: true },
  };
  expect(() =>
    vault.captureImport({
      ...batch(systemId, [
        second,
        {
          ...candidate('bad', 'access'),
          addresses: [{ id: 'bad-url', label: '错', url: 'invalid' }],
        },
      ]),
      targetRevisions: fresh,
    }),
  ).toThrow();
  const restored = store.snapshot();
  expect(restored.accessEntries[0].notes).toBe('保留说明');
  expect(restored.scopes.find((s) => s.ownerId === t.id)?.environmentIds).toEqual([
    environmentId,
    env2,
  ]);
  expect(
    vault
      .captureImport({ ...batch(systemId, [second]), targetRevisions: fresh })
      .snapshot.scopes.find((s) => s.ownerId === t.id)?.environmentIds,
  ).toEqual([env2]);
});

test('local advice uses source rows, sibling rows, nearby existing objects and field differences without account values', async () => {
  const { store, systemId, environmentId } = setup();
  const target = store.mutate({
    type: 'resource.save',
    kind: 'server',
    systemId,
    environmentId,
    name: '样例机器',
    address: '192.0.2.1',
  }).createdId!;
  const item = {
    ...candidate('r1', 'server'),
    name: '样例机器',
    address: '192.0.2.2',
    notes: '旧地址停用',
    accounts: [
      { id: 'a', name: '附属', username: 'do-not-send-account', passwordRef: 'p', notes: '' },
    ],
    sourceIds: ['n', 'h'],
  };
  const row2 = { ...item, id: 'r2' };
  const file = {
    filename: '验证.docx',
    warnings: [],
    sources: [
      { id: 'n', text: '样例机器', location: '表格 1，第 2 行第 1 列' },
      { id: 'h', text: '未知分区：', location: '第 1 段' },
    ],
    blocks: [{ location: '表格 1', headingId: 'h', rows: [['n']] }],
  };
  const runtime = {
    chat: async (...args: Parameters<import('../electron/local-ollama').LocalOllama['chat']>) => {
      expect(JSON.stringify(args[1])).not.toContain('do-not-send-account');
      const ctx = JSON.parse(args[1][1].content);
      expect(ctx.r0.peers[0].row).toBe(2);
      expect(ctx.r0.existing[0].address).toContain('192.0.2.1');
      const f = ctx.r0.existing[0].differences.find((x: any) => x.label === '地址').field;
      return {
        content: JSON.stringify({
          r0: { env: 0, peer: 2, action: 'update', target: 1, fields: [f] },
          r1: { env: 0, peer: 1, action: 'skip', target: 0, fields: [] },
        }),
        inputTokens: 0,
        outputTokens: 0,
        seconds: 0,
      };
    },
  };
  await adviseImport(
    runtime,
    'qwen3:8b',
    file,
    [item, row2],
    importTargets(store.snapshot(), systemId),
    store.snapshot().environments,
    new AbortController().signal,
    () => {},
  );
  expect(item).toMatchObject({
    environmentIds: [environmentId],
    update: { targetId: target, fields: ['address'] },
    advice: { peerIds: ['r2'], modelPeerId: 'r2' },
  });
  expect(row2).toMatchObject({ selected: false, environmentIds: [], advice: { action: 'skip' } });
  const comparison: ImportCandidate = { ...item, id: 'r3', update: undefined };
  await adviseImport(
    {
      chat: async () => ({
        content: JSON.stringify({
          r0: { peer: 0, env: 0, action: 'new', target: 0, fields: [ctxAddressField()] },
        }),
        seconds: 0,
        inputTokens: 0,
        outputTokens: 0,
      }),
    },
    'qwen3:8b',
    file,
    [comparison],
    importTargets(store.snapshot(), systemId),
    store.snapshot().environments,
    new AbortController().signal,
    () => {},
  );
  function ctxAddressField() {
    return (
      importChanges(comparison, importTargets(store.snapshot(), systemId)[0]).findIndex(
        (f) => f.key === 'address',
      ) + 1
    );
  }
  expect(comparison.advice).toMatchObject({ action: 'new', targetId: target, fields: ['address'] });
  expect(comparison.update).toBeUndefined();
});
