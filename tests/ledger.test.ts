import { afterEach, expect, test } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { Store } from '../electron/store';
import { emptyContent } from '../src/domain';

const roots: string[] = [],
  stores: Store[] = [];
function open() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'clever-workbench-ledger-'));
  roots.push(root);
  const store = new Store(root);
  stores.push(store);
  return store;
}
afterEach(() => {
  for (const store of stores.splice(0)) store.close();
  for (const root of roots.splice(0)) fs.rmSync(root, { recursive: true, force: true });
});

test('系统跨阶段项目保持身份和历史任务归属，改名与重启不破坏关联', () => {
  const store = open();
  const a = store.mutate({ type: 'project.create', name: '园区一期', color: '#007aff' }).createdId!;
  const b = store.mutate({ type: 'project.create', name: '园区二期', color: '#34a271' }).createdId!;
  const id = store.mutate({ type: 'system.save', name: '园区平台', projectId: a }).createdId!;
  const task = store.mutate({
    type: 'task.create',
    draft: {
      title: '排查生产缓存',
      content: emptyContent(),
      markdown: '',
      projectId: a,
      systemId: id,
    },
  }).createdId!;
  store.mutate({ type: 'system.save', id, name: '智慧园区平台', projectId: b });
  expect(store.snapshot().systems).toEqual([
    expect.objectContaining({ id, name: '智慧园区平台', currentProjectId: b }),
  ]);
  expect(store.snapshot().systemProjects.map((link) => link.projectId)).toEqual([a, b]);
  expect(store.task(task)).toMatchObject({ systemId: id, projectId: null });
  store.close();
  stores.pop();
  const reopened = new Store(store.root);
  stores.push(reopened);
  expect(reopened.task(task)).toMatchObject({ systemId: id, projectId: null });
  expect(reopened.snapshot().systems[0].currentProjectId).toBe(b);
});

test('服务公共仓库只保存一份，测试与生产部署独立且不能跨系统关联', () => {
  const store = open();
  const systemId = store.mutate({ type: 'system.save', name: '订单平台' }).createdId!;
  const other = store.mutate({ type: 'system.save', name: '设备平台' }).createdId!;
  const testEnv = store.mutate({ type: 'environment.save', systemId, name: '测试' }).createdId!;
  const production = store.mutate({ type: 'environment.save', systemId, name: '生产' }).createdId!;
  const foreign = store.mutate({
    type: 'environment.save',
    systemId: other,
    name: '生产',
  }).createdId!;
  const serviceId = store.mutate({
    type: 'service.save',
    systemId,
    name: '订单服务',
    repository: 'git@example.test:orders.git',
  }).createdId!;
  store.mutate({
    type: 'deployment.save',
    serviceId,
    environmentId: testEnv,
    address: 'orders.test.internal',
    port: '8080',
  });
  store.mutate({
    type: 'deployment.save',
    serviceId,
    environmentId: production,
    address: 'orders.prod.internal',
    port: '8443',
  });
  expect(store.snapshot().services).toEqual([
    expect.objectContaining({ id: serviceId, repository: 'git@example.test:orders.git' }),
  ]);
  expect(store.snapshot().deployments).toEqual(
    expect.arrayContaining([
      expect.objectContaining({
        environmentId: testEnv,
        address: 'orders.test.internal',
        port: '8080',
      }),
      expect.objectContaining({
        environmentId: production,
        address: 'orders.prod.internal',
        port: '8443',
      }),
    ]),
  );
  expect(() =>
    store.mutate({ type: 'deployment.save', serviceId, environmentId: foreign, address: 'wrong' }),
  ).toThrow('同一系统');
  expect(store.snapshot().deployments).toHaveLength(2);
});

test('资源可快捷新增并复制到另一环境，复制后的普通资料独立且来源不变', () => {
  const store = open();
  const systemId = store.mutate({ type: 'system.save', name: '订单平台' }).createdId!;
  const production = store.mutate({ type: 'environment.save', systemId, name: '生产' }).createdId!;
  const staging = store.mutate({ type: 'environment.save', systemId, name: '预发布' }).createdId!;
  const id = store.mutate({
    type: 'resource.save',
    environmentId: production,
    kind: 'redis',
    name: '订单缓存',
    address: 'cache.prod.internal',
    port: '6379',
    fields: { 数据库: '2' },
  }).createdId!;
  const copy = store.mutate({ type: 'resource.copy', id, environmentId: staging }).createdId!;
  store.mutate({
    type: 'resource.save',
    id: copy,
    environmentId: staging,
    kind: 'redis',
    name: '预发布缓存',
    address: 'cache.staging.internal',
  });
  expect(store.snapshot().resources).toEqual(
    expect.arrayContaining([
      expect.objectContaining({
        id,
        environmentId: production,
        address: 'cache.prod.internal',
        port: '6379',
        fields: { 数据库: '2' },
      }),
      expect.objectContaining({
        id: copy,
        environmentId: staging,
        name: '预发布缓存',
        address: 'cache.staging.internal',
        port: '6379',
        fields: { 数据库: '2' },
      }),
    ]),
  );
  expect(copy).not.toBe(id);
  expect(() =>
    store.mutate({
      type: 'resource.save',
      id,
      environmentId: production,
      kind: 'redis',
      name: '订单缓存',
      port: '70000',
    }),
  ).toThrow('端口');
  store.close();
  stores.pop();
  const reopened = new Store(store.root);
  stores.push(reopened);
  expect(reopened.snapshot().resources.find((item) => item.id === copy)?.fields).toEqual({
    数据库: '2',
  });
  reopened.mutate({
    type: 'resource.save',
    id,
    environmentId: staging,
    kind: 'redis',
    name: '调整环境的资源',
  });
});

test('环境与资源可各有多个角色账号，空用户名合法，移动与删除保护关联', () => {
  const store = open();
  const systemId = store.mutate({ type: 'system.save', name: '园区平台' }).createdId!;
  const environmentId = store.mutate({
    type: 'environment.save',
    systemId,
    name: '生产',
  }).createdId!;
  const staging = store.mutate({ type: 'environment.save', systemId, name: '测试' }).createdId!;
  const otherSystem = store.mutate({ type: 'system.save', name: '设备平台' }).createdId!;
  const foreign = store.mutate({
    type: 'environment.save',
    systemId: otherSystem,
    name: '生产',
  }).createdId!;
  const resourceId = store.mutate({
    type: 'resource.save',
    environmentId,
    kind: 'redis',
    name: '缓存',
  }).createdId!;
  const admin = store.mutate({
    type: 'account.save',
    environmentId,
    name: '超管',
    username: 'admin',
  }).createdId!;
  const token = store.mutate({ type: 'account.save', environmentId, name: 'B 角色' }).createdId!;
  const cache = store.mutate({
    type: 'account.save',
    environmentId,
    resourceId,
    name: '应用连接',
    username: 'app',
  }).createdId!;
  const copy = store.mutate({
    type: 'account.copy',
    id: cache,
    environmentId: staging,
    resourceId: null,
  }).createdId!;
  expect(store.snapshot().accounts).toEqual(
    expect.arrayContaining([
      expect.objectContaining({ id: admin, resourceId: null, username: 'admin' }),
      expect.objectContaining({ id: token, resourceId: null, username: '' }),
      expect.objectContaining({ id: cache, resourceId, username: 'app' }),
      expect.objectContaining({
        id: copy,
        environmentId: staging,
        resourceId: null,
        username: 'app',
      }),
    ]),
  );
  expect(() =>
    store.mutate({ type: 'account.save', environmentId: staging, resourceId, name: '误挂' }),
  ).toThrow('环境');
  expect(() =>
    store.mutate({ type: 'account.save', id: admin, environmentId: foreign, name: '误移' }),
  ).toThrow('同一系统');
  expect(() => store.mutate({ type: 'resource.delete', id: resourceId })).toThrow('引用');
  store.mutate({
    type: 'resource.save',
    id: resourceId,
    environmentId,
    name: '新缓存名',
    kind: 'redis',
  });
  store.close();
  stores.pop();
  const reopened = new Store(store.root);
  stores.push(reopened);
  expect(reopened.snapshot().accounts.find((item) => item.id === cache)).toMatchObject({
    resourceId,
    username: 'app',
  });
  expect(reopened.snapshot().resources.find((item) => item.id === resourceId)?.name).toBe(
    '新缓存名',
  );
});
