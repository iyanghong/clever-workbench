import { afterEach, expect, test, vi } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { Store } from '../electron/store';
import { emptyContent, intersectsMonth, completedInMonth } from '../src/domain';
let store: Store | undefined;
afterEach(() => {
  if (store) {
    store.close();
    fs.rmSync(store.root, { recursive: true, force: true });
    store = undefined;
  }
  vi.useRealTimers();
});

test('月界、同日和进行中的回顾按记录计算，重开、日期修正和删除立即改变口径', () => {
  vi.useFakeTimers();
  vi.setSystemTime(new Date(2026, 9, 12, 12));
  store = new Store(fs.mkdtempSync(path.join(os.tmpdir(), 'workbench-retrospective-')));
  const date = (month: number, day: number, hour = 0) => new Date(2026, month, day, hour).getTime();
  const create = (title: string, start: number, end?: number) => {
    const id = store!.mutate({
      type: 'task.create',
      draft: { title, content: emptyContent(), markdown: '', projectId: null, startedAt: start },
    }).createdId!;
    if (end !== undefined)
      store!.mutate({ type: 'task.complete', id, complete: true, completedAt: end });
    return id;
  };
  const cross = create('跨月', date(8, 30), date(9, 1));
  const same = create('同日完成', date(9, 5, 10), date(9, 5, 10));
  create('持续处理中', date(8, 20));
  const metrics = (month: number) => {
    const tasks = store!.snapshot().tasks;
    return [
      tasks.filter((task) => intersectsMonth(task, 2026, month, Date.now())).length,
      tasks.filter((task) => completedInMonth(task, 2026, month)).length,
    ];
  };
  expect(metrics(8)).toEqual([2, 0]);
  expect(metrics(9)).toEqual([3, 2]);
  store.mutate({ type: 'task.complete', id: cross, complete: false });
  expect(metrics(9)).toEqual([3, 1]);
  store.mutate({ type: 'task.dates', id: cross, startedAt: date(8, 29), completedAt: null });
  store.mutate({ type: 'task.complete', id: cross, complete: true, completedAt: date(8, 30) });
  expect(metrics(8)).toEqual([2, 1]);
  expect(metrics(9)).toEqual([2, 1]);
  store.mutate({ type: 'task.delete', id: same });
  expect(metrics(9)).toEqual([1, 0]);
});
