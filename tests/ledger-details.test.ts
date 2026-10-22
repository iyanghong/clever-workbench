import { afterEach, expect, test } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import { Store } from '../electron/store';
import { Vault } from '../electron/vault';
import { Backups } from '../electron/backup';
import { validateDocumentRefs } from '../electron/ledger-details';
import { systemDocuments } from '../src/ledger-fields';

const stores: Store[] = [],
  vaults: Vault[] = [];
function setup() {
  const s = new Store(fs.mkdtempSync(path.join(os.tmpdir(), 'workbench-ledger-details-')));
  stores.push(s);
  const v = new Vault(s);
  vaults.push(v);
  const systemId = s.mutate({ type: 'system.save', name: '台账验证' }).createdId!;
  const environmentId = s.mutate({ type: 'environment.save', systemId, name: '生产' }).createdId!;
  return { s, v, systemId, environmentId };
}
afterEach(() => {
  for (const v of vaults.splice(0)) v.lock();
  for (const s of stores.splice(0)) {
    s.close();
    fs.rmSync(s.root, { recursive: true, force: true });
  }
});
const connection = (address = '', serverId: string | null = null) => ({
  id: randomUUID(),
  label: '业务连接',
  address,
  port: '5432',
  role: '主节点',
  serverId,
});
const node = (environmentId: string) => ({
  environmentId,
  name: '主节点',
  serverId: null,
  address: '',
  port: '8080',
  notes: '',
  mode: 'fixed' as const,
  count: '',
  fields: { 部署方式: 'Docker', 版本: 'v1', 日志位置: '/srv/orders/logs' },
});

test('部分更新与类型转换不丢地址，全空连接不落库，历史普通字段仍可读取', () => {
  const { s, systemId } = setup();
  const serverId = s.mutate({
    type: 'resource.save',
    systemId,
    environmentId: null,
    kind: 'server',
    name: '主机',
    address: '192.0.2.1',
    port: '22',
  }).createdId!;
  const linked = connection('', serverId);
  const empty = { ...connection(), label: '', role: '', port: '' };
  const id = s.mutate({
    type: 'resource.save',
    systemId,
    environmentId: null,
    kind: 'database',
    name: '库',
    connections: [empty, linked],
    preferredConnectionId: empty.id,
    fields: { 最近恢复验证时间: '2026年10月22日' },
  }).createdId!;
  expect(s.ledger.resource(id).connections).toHaveLength(1);
  s.mutate({
    type: 'resource.save',
    id,
    systemId,
    environmentId: null,
    kind: 'database',
    name: '库',
    port: '5433',
  });
  expect(s.ledger.resource(id).connections![0].address).toBe('');
  s.mutate({
    type: 'resource.save',
    id: serverId,
    systemId,
    environmentId: null,
    kind: 'server',
    name: '主机',
    address: '192.0.2.2',
  });
  expect(s.ledger.resource(id)).toMatchObject({ address: '192.0.2.2', port: '5433' });
  expect(() =>
    s.mutate({
      type: 'resource.save',
      id,
      systemId,
      environmentId: null,
      kind: 'server',
      name: '库',
    }),
  ).toThrow('连接');
  s.mutate({
    type: 'resource.save',
    id,
    systemId,
    environmentId: null,
    kind: 'database',
    name: '库',
    connections: [{ ...linked, serverId: null }],
  });
  expect(s.ledger.resource(id).connections![0].address).toBe('192.0.2.2');
  s.mutate({
    type: 'resource.save',
    id: serverId,
    systemId,
    environmentId: null,
    kind: 'other',
    name: '原主机',
  });
  expect(s.ledger.resource(serverId)).toMatchObject({ address: '192.0.2.2', port: '22' });
  expect(s.snapshot().resources.find((r) => r.id === id)?.fields['最近恢复验证时间']).toBe(
    '2026年10月22日',
  );
});

test('新普通字段不能伪装秘密，历史同名字段不阻止读取或修改其他普通资料', () => {
  const { s, v, systemId } = setup();
  for (const key of ['密码', 'Token', '私钥'])
    expect(() =>
      v.capture({
        kind: 'database',
        systemId,
        environmentId: null,
        name: '错误字段',
        fields: { [key]: 'fixture-sensitive' },
      }),
    ).toThrow('秘密字段');
  expect(s.snapshot().resources).toHaveLength(0);
  const id = s.mutate({
    type: 'resource.save',
    systemId,
    environmentId: null,
    kind: 'database',
    name: '旧资料',
  }).createdId!;
  s.db
    .prepare('UPDATE resources SET fields=? WHERE id=?')
    .run(JSON.stringify({ Token: '旧普通说明' }), id);
  expect(s.ledger.resource(id).fields.Token).toBe('旧普通说明');
  s.mutate({
    type: 'resource.save',
    id,
    systemId,
    environmentId: null,
    kind: 'database',
    name: '改名',
  });
  expect(() =>
    s.mutate({
      type: 'resource.save',
      id,
      systemId,
      environmentId: null,
      kind: 'database',
      name: '改名',
      fields: { Token: '新秘密' },
    }),
  ).toThrow('秘密字段');
});

test('运维步骤的本系统归属不能被文档修改破坏，日期写入拒绝不存在的日期', () => {
  const { s, systemId, environmentId } = setup();
  const doc = s.mutate({ type: 'document.create', context: { systemId } }).createdId!;
  const value = {
    systemId,
    environmentId,
    serviceId: null,
    resourceId: null,
    documentId: doc,
    name: '验证备份',
    kind: 'backup' as const,
    frequency: '',
    status: 'unverified' as const,
    notes: '',
  };
  s.mutate({ type: 'operation.save', value });
  expect(() => s.mutate({ ...s.document(doc), type: 'document.edit', systemId: null })).toThrow(
    '引用',
  );
  expect(() =>
    s.mutate({
      type: 'operation.save',
      value: { ...value, name: '非法日期', fields: { 最近恢复验证时间: '2026-02-31' } },
    }),
  ).toThrow('日期');
  expect(s.snapshot().operations).toHaveLength(1);
});

test('多连接保留常用选择、动态服务器地址、独立副本和非首条搜索，旧修改不清空连接', () => {
  const { s, systemId } = setup();
  const serverId = s.mutate({
    type: 'resource.save',
    systemId,
    environmentId: null,
    kind: 'server',
    name: '数据库主机',
    address: '192.0.2.20',
    port: '22',
  }).createdId!;
  const first = connection('db.example.test'),
    second = { ...connection('', serverId), label: '管理连接', role: '管理' };
  const input = {
    type: 'resource.save' as const,
    systemId,
    environmentId: null,
    kind: 'database' as const,
    name: '数据库',
    connections: [first, second],
    preferredConnectionId: second.id,
  };
  const id = s.mutate(input).createdId!;
  expect(s.ledger.resource(id)).toMatchObject({
    address: '192.0.2.20',
    port: '5432',
    preferredConnectionId: second.id,
  });
  s.mutate({
    type: 'resource.save',
    id,
    systemId,
    environmentId: null,
    kind: 'database',
    name: '改名',
  });
  expect(s.ledger.resource(id).connections).toEqual([first, second]);
  s.mutate({
    type: 'resource.save',
    id: serverId,
    systemId,
    environmentId: null,
    kind: 'server',
    name: '数据库主机',
    address: '192.0.2.21',
  });
  expect(s.ledger.resource(id).address).toBe('192.0.2.21');
  expect(s.globalSearch('db.example.test')).toEqual(
    expect.arrayContaining([expect.objectContaining({ id })]),
  );
  expect(() => s.mutate({ type: 'resource.delete', id: serverId })).toThrow('引用');
  const other = s.mutate({ type: 'system.save', name: '其他系统' }).createdId!;
  const copied = s.mutate({ type: 'resource.copy', id, systemId: other }).createdId!;
  const copy = s.ledger.resource(copied);
  expect(copy.connections?.map((c) => c.serverId)).toEqual([null, null]);
  expect(copy.address).toBe('192.0.2.21');
  expect(copy.connections?.[1].address).toBe('192.0.2.21');
  expect(copy.connections?.[1].id).not.toBe(second.id);
  expect(copy.preferredConnectionId).toBe(copy.connections?.[1].id);
  expect(() => s.mutate({ ...input, id, connections: [{ ...first, serverId: copied }] })).toThrow(
    '服务器',
  );
  expect(() => s.mutate({ ...input, id, connections: [{ ...first, port: '65536' }] })).toThrow(
    '端口',
  );
  expect(s.ledger.resource(id).connections).toEqual([first, second]);
});

test('新增数据库与三类秘密原子保存，秘密写入失败可重试且普通快照不泄露', async () => {
  const { s, v, systemId } = setup();
  await v.initialize('fictional-ledger-details-master');
  const input = {
    kind: 'database' as const,
    systemId,
    environmentId: null,
    name: '业务库',
    connections: [connection('db.example.test')],
    username: 'reader',
    accountName: '只读',
    password: 'fixture-password',
    token: 'fixture-token',
    privateKey: 'fixture-private-key',
    fields: { 类型: 'PostgreSQL' },
  };
  s.db.exec(
    "CREATE TRIGGER reject_details BEFORE INSERT ON secrets BEGIN SELECT RAISE(ABORT,'模拟失败'); END",
  );
  expect(() => v.capture(input)).toThrow('模拟失败');
  expect(s.snapshot().resources).toHaveLength(0);
  expect(s.snapshot().accounts).toHaveLength(0);
  s.db.exec('DROP TRIGGER reject_details');
  const result = v.capture(input),
    account = result.snapshot.accounts[0];
  for (const kind of ['password', 'token', 'privateKey'] as const) {
    expect(v.read(account.id, kind)).toBe(input[kind]);
    expect(JSON.stringify(result.snapshot)).not.toContain(input[kind]);
    expect(JSON.stringify(s.db.prepare('SELECT * FROM secrets').all())).not.toContain(input[kind]);
  }
  expect(account).toMatchObject({ name: '只读', username: 'reader', resourceId: result.createdId });
});

test('应用和首节点整体保存，文档多处引用与原归属独立，删除和归属变化受保护', () => {
  const { s, systemId, environmentId } = setup();
  const doc = s.mutate({ type: 'document.create' }).createdId!;
  const unrelated = s.mutate({ type: 'document.create' }).createdId!;
  const foreign = s.mutate({ type: 'system.save', name: '其他系统' }).createdId!;
  expect(() =>
    s.mutate({ type: 'service.save', systemId, name: '失败应用', firstNode: node('missing') }),
  ).toThrow();
  expect(s.snapshot().services).toHaveLength(0);
  const serviceId = s.mutate({
    type: 'service.save',
    systemId,
    name: '订单应用',
    documentIds: [doc],
    firstNode: { ...node(environmentId), documentIds: [doc] },
  }).createdId!;
  s.mutate({ ...s.document(doc), type: 'document.edit', title: '恢复手册' });
  expect(s.globalSearch('订单应用 恢复手册')).toEqual(
    expect.arrayContaining([
      expect.objectContaining({ id: serviceId }),
      expect.objectContaining({ id: doc }),
    ]),
  );
  const deployment = s.snapshot().deploymentNodes[0];
  expect(systemDocuments(s.snapshot(), systemId).map((d) => d.id)).toEqual([doc]);
  expect(systemDocuments(s.snapshot(), systemId).map((d) => d.id)).not.toContain(unrelated);
  s.mutate({
    type: 'node.save',
    value: {
      ...node(environmentId),
      id: deployment.id,
      serviceId,
      fields: undefined,
      documentIds: undefined,
      notes: '更新说明',
    },
  });
  expect(s.snapshot().deploymentNodes[0]).toMatchObject({
    fields: node(environmentId).fields,
    documentIds: [doc],
  });
  expect(() => s.mutate({ ...s.document(doc), type: 'document.edit', systemId: foreign })).toThrow(
    '引用',
  );
  expect(() => s.mutate({ type: 'document.delete', id: doc })).toThrow('引用');
  s.mutate({ type: 'service.save', id: serviceId, systemId, name: '订单应用', documentIds: [] });
  expect(s.document(doc).deletedAt).toBeNull();
  expect(() => s.mutate({ type: 'document.delete', id: doc })).toThrow('引用');
  s.mutate({ type: 'node.delete', id: deployment.id });
  expect(s.document(doc).deletedAt).toBeNull();
  s.mutate({ type: 'document.delete', id: doc });
  expect(s.document(doc).deletedAt).not.toBeNull();
  s.db
    .prepare('INSERT INTO ledger_document_refs VALUES(?,?,?)')
    .run('service', 'missing', unrelated);
  expect(() => validateDocumentRefs(s.db)).toThrow('引用');
});

test('新版备份恢复保留连接、节点配置、运维字段、文档引用和加密凭据', async () => {
  const { s, v, systemId, environmentId } = setup();
  await v.initialize('fictional-details-backup-master');
  v.capture({
    kind: 'database',
    systemId,
    environmentId: null,
    name: '业务库',
    connections: [connection('db.example.test')],
    username: 'reader',
    password: 'fixture-password',
  });
  const documentId = s.mutate({ type: 'document.create' }).createdId!;
  const serviceId = s.mutate({
    type: 'service.save',
    systemId,
    name: '应用',
    documentIds: [documentId],
    firstNode: { ...node(environmentId), documentIds: [documentId] },
  }).createdId!;
  s.mutate({
    type: 'operation.save',
    value: {
      systemId,
      environmentId,
      serviceId,
      resourceId: null,
      documentId: null,
      name: '备份',
      kind: 'backup',
      status: 'unverified',
      frequency: '每日',
      notes: '',
      fields: { 目标位置: '/backups', 保留周期: '30 天', 最近恢复验证时间: '2026-10-22T10:00' },
    },
  });
  const before = s.snapshot(),
    file = path.join(s.root, 'details.cwb');
  await new Backups(s).create(file);
  const target = setup().s,
    backups = new Backups(target),
    prepared = await backups.inspect(file, 'fictional-details-backup-master');
  await backups.restore(prepared.token);
  const after = target.snapshot();
  for (const key of [
    'resources',
    'services',
    'deploymentNodes',
    'operations',
    'accounts',
    'documents',
  ] as const)
    expect(after[key]).toEqual(before[key]);
});

test('v12 单地址及仅端口升级后保留身份，重复启动不重复连接', () => {
  const { s, systemId } = setup();
  const id = s.mutate({
    type: 'resource.save',
    systemId,
    environmentId: null,
    kind: 'database',
    name: '旧数据库',
    port: '1521',
  }).createdId!;
  s.db.exec(
    "UPDATE resources SET address='',port='1521'; ALTER TABLE resources DROP COLUMN connections; ALTER TABLE resources DROP COLUMN preferredConnectionId; ALTER TABLE deployment_nodes DROP COLUMN fields; ALTER TABLE operations DROP COLUMN fields; DROP TABLE ledger_document_refs; PRAGMA user_version=12;",
  );
  const root = s.root;
  s.close();
  stores.splice(stores.indexOf(s), 1);
  let reopened = new Store(root);
  stores.push(reopened);
  expect(reopened.ledger.resource(id).connections).toEqual([
    expect.objectContaining({ address: '', port: '1521' }),
  ]);
  const connectionId = reopened.ledger.resource(id).connections![0].id;
  reopened.close();
  stores.pop();
  reopened = new Store(root);
  stores.push(reopened);
  expect(reopened.ledger.resource(id).connections?.map((c) => c.id)).toEqual([connectionId]);
});
