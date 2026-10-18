import { afterEach, expect, test } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { Store } from '../electron/store';
import { Vault } from '../electron/vault';
import { emptyContent } from '../src/domain';
let store: Store | undefined, vault: Vault | undefined;
afterEach(() => {
  vault?.lock();
  if (store) {
    store.close();
    fs.rmSync(store.root, { recursive: true, force: true });
  }
  store = undefined;
  vault = undefined;
});

test('跨模块搜索组合中文环境与资源信息，排除秘密和回收站，普通字符按字面匹配', async () => {
  store = new Store(fs.mkdtempSync(path.join(os.tmpdir(), 'workbench-search-')));
  const systemId = store.mutate({ type: 'system.save', name: '订单平台' }).createdId!;
  const environments = ['生产', '测试'].map(
    (name) => store!.mutate({ type: 'environment.save', systemId, name }).createdId!,
  );
  const accounts: string[] = [];
  for (const environmentId of environments) {
    const resourceId = store.mutate({
      type: 'resource.save',
      environmentId,
      kind: 'redis',
      name: '缓存',
    }).createdId!;
    accounts.push(
      store.mutate({
        type: 'account.save',
        environmentId,
        resourceId,
        name: '应用连接',
        username: 'app',
      }).createdId!,
    );
  }
  const taskId = store.mutate({
    type: 'task.create',
    draft: {
      title: '完成 100% 覆盖',
      markdown: '复查超时',
      content: emptyContent(),
      projectId: null,
      systemId,
    },
  }).createdId!;
  const documentId = store.mutate({ type: 'document.create', context: { systemId } }).createdId!;
  const document = store.document(documentId);
  store.mutate({ ...document, type: 'document.edit', title: '排障方案', markdown: '连接池耗尽' });
  vault = new Vault(store);
  await vault.initialize('fictional-master-search-password');
  vault.save(accounts[0], 'password', 'exclusive-secret-9842');
  vault.lock();
  const hits = store.globalSearch('订单平台 生产 Redis');
  expect(hits.filter((item) => item.kind === 'account')).toEqual([
    expect.objectContaining({
      id: accounts[0],
      context: expect.stringContaining('生产'),
      username: 'app',
    }),
  ]);
  expect(JSON.stringify(hits)).not.toContain('exclusive-secret-9842');
  expect(store.globalSearch('exclusive-secret-9842')).toEqual([]);
  expect(store.globalSearch('fictional-master-search-password')).toEqual([]);
  expect(store.globalSearch('连接池')).toEqual([
    expect.objectContaining({ kind: 'document', id: documentId }),
  ]);
  expect(store.globalSearch('%')).toEqual([expect.objectContaining({ kind: 'task', id: taskId })]);
  store.mutate({ type: 'document.delete', id: documentId });
  expect(store.globalSearch('连接池')).toEqual([]);
  store.mutate({ type: 'document.restore', id: documentId });
  expect(store.globalSearch('连接池')).toHaveLength(1);
  store.mutate({ type: 'system.save', id: systemId, name: '交易平台' });
  expect(store.globalSearch('订单平台 生产 Redis')).toEqual([]);
  expect(store.globalSearch('交易平台 生产 Redis').some((item) => item.id === accounts[0])).toBe(
    true,
  );
});
