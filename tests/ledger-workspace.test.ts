import { afterEach, expect, test } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { Store } from '../electron/store';
const stores: Store[] = [],
  roots: string[] = [];
function setup() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'workbench-scopes-'));
  roots.push(root);
  const s = new Store(root);
  stores.push(s);
  const systemId = s.mutate({ type: 'system.save', name: '系统' }).createdId!;
  const prod = s.mutate({ type: 'environment.save', systemId, name: '生产' }).createdId!;
  const test = s.mutate({ type: 'environment.save', systemId, name: '测试' }).createdId!;
  return { s, systemId, prod, test };
}
afterEach(() => {
  for (const s of stores.splice(0)) s.close();
  for (const r of roots.splice(0)) fs.rmSync(r, { recursive: true, force: true });
});
test('one object shares accounts across environments and copied scopes remain independent', () => {
  const { s, systemId, prod, test } = setup();
  const id = s.mutate({
    type: 'resource.save',
    systemId,
    environmentId: null,
    kind: 'database',
    name: '业务库',
    fields: { 类型: 'PostgreSQL', 库名: 'orders,reports' },
  }).createdId!;
  const account = s.mutate({
    type: 'account.save',
    resourceId: id,
    environmentId: null,
    name: '只读',
    username: 'reader',
  }).createdId!;
  s.mutate({
    type: 'scope.save',
    kind: 'resource',
    ownerId: id,
    scope: { environmentIds: [prod, test], tags: ['内网'] },
  });
  expect(s.snapshot().accounts.filter((a) => a.resourceId === id)).toHaveLength(1);
  expect(s.snapshot().accounts.find((a) => a.id === account)?.environmentId).toBe(prod);
  const copy = s.mutate({ type: 'resource.copy', id }).createdId!;
  expect(s.snapshot().scopes.find((r) => r.ownerId === copy)?.environmentIds).toEqual([prod, test]);
  s.mutate({
    type: 'scope.save',
    kind: 'resource',
    ownerId: copy,
    scope: { environmentIds: [test], tags: [] },
  });
  expect(s.snapshot().scopes.find((r) => r.ownerId === id)?.environmentIds).toEqual([prod, test]);
  expect(() => s.mutate({ type: 'environment.delete', id: test })).toThrow('使用');
  expect(() =>
    s.mutate({
      type: 'resource.save',
      systemId,
      environmentId: test,
      kind: 'database',
      name: '业务库',
    }),
  ).toThrow('同名');
});
test('deployment nodes support multiple hosts or an unbound scheduled group and protect references', () => {
  const { s, systemId, prod } = setup();
  const serviceId = s.mutate({ type: 'service.save', systemId, name: 'API' }).createdId!;
  const serverId = s.mutate({
    type: 'resource.save',
    systemId,
    environmentId: null,
    kind: 'server',
    name: '节点一',
  }).createdId!;
  const base = {
    serviceId,
    environmentId: prod,
    name: '主节点',
    serverId,
    address: '',
    port: '8080',
    notes: '',
    mode: 'fixed' as const,
    count: '',
  };
  const id = s.mutate({ type: 'node.save', value: base }).createdId!;
  s.mutate({
    type: 'node.save',
    value: { ...base, name: '按需计算', serverId: null, mode: 'scheduled', count: '2' },
  });
  expect(s.snapshot().deploymentNodes).toHaveLength(2);
  expect(() => s.mutate({ type: 'resource.delete', id: serverId })).toThrow('引用');
  s.mutate({ type: 'node.save', value: { ...base, id, serverId: null, address: '192.0.2.1' } });
  s.mutate({ type: 'resource.delete', id: serverId });
  expect(s.snapshot().deploymentNodes.find((n) => n.id === id)?.address).toBe('192.0.2.1');
});
test('operations link same-system resources and documents without becoming personal tasks', () => {
  const { s, systemId, prod } = setup();
  const resourceId = s.mutate({
    type: 'resource.save',
    systemId,
    environmentId: null,
    kind: 'database',
    name: '数据库',
  }).createdId!;
  const documentId = s.mutate({ type: 'document.create', context: { systemId } }).createdId!;
  const value = {
    systemId,
    environmentId: prod,
    resourceId,
    serviceId: null,
    documentId,
    name: '每日备份',
    kind: 'backup' as const,
    frequency: '每天 02:00',
    status: 'inactive' as const,
    notes: '待修复',
  };
  const id = s.mutate({ type: 'operation.save', value }).createdId!;
  expect(s.snapshot().operations[0]).toMatchObject({
    id,
    status: 'inactive',
    frequency: '每天 02:00',
  });
  expect(s.snapshot().tasks).toHaveLength(0);
  s.mutate({
    type: 'scope.save',
    kind: 'operation',
    ownerId: id,
    scope: { environmentIds: [prod], tags: ['内网'] },
  });
  s.mutate({ type: 'operation.save', value: { ...value, id, environmentId: null } });
  expect(s.snapshot().scopes.find((scope) => scope.ownerId === id)).toMatchObject({
    environmentIds: [],
    tags: ['内网'],
  });
  expect(() => s.mutate({ type: 'document.delete', id: documentId })).toThrow('引用');
  expect(() => s.mutate({ type: 'resource.delete', id: resourceId })).toThrow('引用');
  const foreign = s.mutate({ type: 'system.save', name: '其他系统' }).createdId!;
  expect(() =>
    s.mutate({ type: 'operation.save', value: { ...value, systemId: foreign } }),
  ).toThrow('同一系统');
});
