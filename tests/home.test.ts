import { afterEach, expect, test } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { Store } from '../electron/store';
let store: Store | undefined;
afterEach(() => {
  if (store) {
    store.close();
    fs.rmSync(store.root, { recursive: true, force: true });
    store = undefined;
  }
});
test('常用系统和账号的顺序跨重启保留，失效对象不再显示且不能固定无效身份', () => {
  store = new Store(fs.mkdtempSync(path.join(os.tmpdir(), 'workbench-home-')));
  const systemId = store.mutate({ type: 'system.save', name: '常用系统' }).createdId!;
  const environmentId = store.mutate({
    type: 'environment.save',
    systemId,
    name: '生产',
  }).createdId!;
  const accountId = store.mutate({ type: 'account.save', environmentId, name: '超管' }).createdId!;
  store.mutate({ type: 'favorite.set', kind: 'system', id: systemId, pinned: true });
  store.mutate({ type: 'favorite.set', kind: 'account', id: accountId, pinned: true });
  store.mutate({ type: 'favorite.move', kind: 'account', id: accountId, direction: -1 });
  expect(store.snapshot().favorites).toEqual([
    { kind: 'account', id: accountId },
    { kind: 'system', id: systemId },
  ]);
  const root = store.root;
  store.close();
  store = new Store(root);
  expect(store.snapshot().favorites[0]).toEqual({ kind: 'account', id: accountId });
  store.mutate({ type: 'account.delete', id: accountId });
  expect(store.snapshot().favorites).toEqual([{ kind: 'system', id: systemId }]);
  expect(() =>
    store!.mutate({ type: 'favorite.set', kind: 'account', id: accountId, pinned: true }),
  ).toThrow('账号');
});

test('独立快速新建不会消费已有任务草稿', () => {
  store = new Store(fs.mkdtempSync(path.join(os.tmpdir(), 'workbench-draft-preservation-')));
  const draft = {
    title: '尚未完成的草稿',
    projectId: null,
    markdown: '保留的正文',
    content: {
      type: 'doc',
      content: [{ type: 'paragraph', content: [{ type: 'text', text: '保留的正文' }] }],
    },
  };
  store.saveDraft(draft);
  store.mutate({
    type: 'task.create',
    consumeDraft: false,
    draft: {
      title: '另记一件事',
      projectId: null,
      markdown: '',
      content: { type: 'doc', content: [{ type: 'paragraph' }] },
    },
  });
  expect(store.snapshot().draft).toEqual(draft);
});

test('常用工具与已有入口共同排序，重启保留且失效工具自动隐藏', () => {
  store = new Store(fs.mkdtempSync(path.join(os.tmpdir(), 'workbench-tool-favorite-')));
  const id = store.mutate({ type: 'system.save', name: '系统' }).createdId!;
  store.mutate({ type: 'favorite.set', kind: 'system', id, pinned: true });
  store.mutate({ type: 'favorite.set', kind: 'tool', id: 'zip-text', pinned: true });
  store.mutate({ type: 'favorite.move', kind: 'tool', id: 'zip-text', direction: -1 });
  const root = store.root;
  store.close();
  store = new Store(root);
  expect(store.snapshot().favorites[0]).toEqual({ kind: 'tool', id: 'zip-text' });
  expect(() =>
    store!.mutate({ type: 'favorite.set', kind: 'tool', id: 'unknown', pinned: true }),
  ).toThrow('工具不存在');
  store.set('favorites', [{ kind: 'tool', id: 'retired' }, ...store.snapshot().favorites]);
  expect(store.snapshot().favorites).toHaveLength(2);
});
