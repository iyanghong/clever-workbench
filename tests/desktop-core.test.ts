import { afterEach, expect, test, vi } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { Store } from '../electron/store';

const roots: string[] = [];
const stores: Store[] = [];
afterEach(() => {
  for (const store of stores.splice(0)) store.close();
  for (const root of roots.splice(0)) fs.rmSync(root, { recursive: true, force: true });
  vi.useRealTimers();
});

test('工作任务只填标题即可保存，完成时间在重启后保持且重复完成不改写', () => {
  vi.useFakeTimers();
  vi.setSystemTime(new Date('2026-10-18T02:10:30Z'));
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'clever-workbench-core-'));
  roots.push(root);
  let store = new Store(root);
  const id = store.mutate({
    type: 'task.create',
    draft: {
      title: '核查生产 Redis 配置',
      content: { type: 'doc', content: [{ type: 'paragraph' }] },
      markdown: '',
      projectId: null,
    },
  }).createdId!;
  expect(store.task(id)).toMatchObject({
    title: '核查生产 Redis 配置',
    projectId: null,
    completedAt: null,
  });
  vi.setSystemTime(new Date('2026-10-18T02:18:45Z'));
  store.mutate({ type: 'task.complete', id, complete: true });
  store.close();
  store = new Store(root);
  stores.push(store);
  expect(store.task(id)).toMatchObject({
    createdAt: Date.parse('2026-10-18T02:10:00Z'),
    completedAt: Date.parse('2026-10-18T02:18:00Z'),
  });
  vi.setSystemTime(new Date('2026-10-18T02:20:00Z'));
  store.mutate({ type: 'task.complete', id, complete: true });
  expect(store.task(id).completedAt).toBe(Date.parse('2026-10-18T02:18:00Z'));
});
