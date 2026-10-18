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
  expect(store.task(task)).toMatchObject({ systemId: id, projectId: a });
  store.close();
  stores.pop();
  const reopened = new Store(store.root);
  stores.push(reopened);
  expect(reopened.task(task)).toMatchObject({ systemId: id, projectId: a });
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
