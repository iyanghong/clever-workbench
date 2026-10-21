import { afterEach, expect, test, vi } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { Store } from '../electron/store';
import { emptyContent, minute, intersectsMonth } from '../src/domain';
import { taskRows, taskUrgency } from '../src/task-list';
const roots: string[] = [],
  stores: Store[] = [];
function setup() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'workbench-task-system-'));
  roots.push(root);
  const s = new Store(root);
  stores.push(s);
  return s;
}
const draft = { title: '排障', content: emptyContent(), markdown: '保留正文', projectId: null };
afterEach(() => {
  vi.useRealTimers();
  for (const s of stores.splice(0)) s.close();
  for (const root of roots.splice(0)) fs.rmSync(root, { recursive: true, force: true });
});
test('跨年日期分组互不重叠，旧月份的紧迫任务仍置顶且不重复', () => {
  const previous = process.env.TZ;
  try {
    process.env.TZ = 'UTC';
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(new Date('2026-11-20T10:00:00Z'));
    const store = setup();
    store.mutate({
      type: 'task.create',
      draft: { ...draft, title: '旧月逾期', dueAt: { kind: 'date', value: '2026-12-30' } },
    });
    store.mutate({ type: 'task.create', draft: { ...draft, title: '旧月普通' } });
    vi.setSystemTime(new Date('2026-12-31T10:00:00Z'));
    for (const [title, date] of [
      ['临期', '2026-12-31'],
      ['明天', '2027-01-01'],
      ['七日内', '2027-01-07'],
      ['更晚', '2027-01-08'],
    ] as const)
      store.mutate({
        type: 'task.create',
        draft: { ...draft, title, dueAt: { kind: 'date', value: date } },
      });
    store.mutate({
      type: 'task.create',
      draft: {
        ...draft,
        title: '今天稍后关注',
        dueAt: { kind: 'date', value: '2026-12-31' },
        urgentAt: { kind: 'time', value: Date.parse('2026-12-31T23:00:00Z') },
      },
    });
    const tasks = store.snapshot().tasks;
    const created = taskRows(tasks, 'created');
    expect(created.filter((row) => row.kind === 'group').map((row) => row.label)).toEqual([
      '逾期',
      '临期',
      '2026 年 12 月',
      '2026 年 11 月',
    ]);
    const due = taskRows(tasks, 'due');
    expect(due.filter((row) => row.kind === 'group').map((row) => row.label)).toEqual([
      '逾期',
      '临期',
      '今天',
      '明天',
      '未来 7 天内',
      '更晚',
      '未设置',
    ]);
    expect(due.filter((row) => row.kind === 'task')).toHaveLength(tasks.length);
  } finally {
    if (previous === undefined) delete process.env.TZ;
    else process.env.TZ = previous;
  }
});
test('日期按本地午夜到期，跨夏令时仍提前实际 24 小时，具体时刻跨时区保持不变', () => {
  const previous = process.env.TZ;
  try {
    process.env.TZ = 'America/New_York';
    const store = setup();
    const id = store.mutate({
      type: 'task.create',
      draft: { ...draft, dueAt: { kind: 'date', value: '2026-11-01' } },
    }).createdId!;
    const task = store.task(id),
      now = Date.parse('2026-11-02T04:59:00Z');
    expect(taskUrgency(task, Date.parse('2026-11-01T04:59:00Z'))).toBe('normal');
    expect(taskUrgency(task, Date.parse('2026-11-01T05:00:00Z'))).toBe('near');
    expect(taskUrgency(task, now)).toBe('near');
    expect(taskUrgency(task, now + 60000)).toBe('overdue');
    store.mutate({ ...task, type: 'task.edit', dueAt: { kind: 'time', value: now } });
    process.env.TZ = 'Asia/Shanghai';
    expect(store.task(id).dueAt).toEqual({ kind: 'time', value: now });
    expect(taskUrgency(store.task(id), now)).toBe('overdue');
    const normal = store.mutate({ type: 'task.create', draft }).createdId!;
    expect(
      taskRows(store.snapshot().tasks, 'due', now)
        .filter((row) => row.kind === 'task')
        .map((row) => row.task.id),
    ).toEqual([id, normal]);
  } finally {
    if (previous === undefined) delete process.env.TZ;
    else process.env.TZ = previous;
  }
});
test('预计完成时间可选，区分日期与实际时刻并在编辑、完成和重开后保留', () => {
  const s = setup();
  const dueAt = { kind: 'date' as const, value: '2026-10-23' };
  const id = s.mutate({ type: 'task.create', draft: { ...draft, dueAt } }).createdId!;
  expect(s.task(id).dueAt).toEqual(dueAt);
  expect(s.snapshot().tasks.find((task) => task.id === id)?.dueAt).toEqual(dueAt);
  s.mutate({ type: 'task.edit', id, ...draft });
  s.mutate({ type: 'task.complete', id, complete: true });
  s.mutate({ type: 'task.complete', id, complete: false });
  expect(s.task(id).dueAt).toEqual(dueAt);
  const precise = { kind: 'time' as const, value: Date.parse('2026-10-23T08:00:00Z') };
  s.mutate({ type: 'task.edit', id, ...draft, dueAt: precise });
  expect(s.task(id).dueAt).toEqual(precise);
  s.close();
  stores.splice(stores.indexOf(s), 1);
  const again = new Store(s.root);
  stores.push(again);
  expect(again.task(id).dueAt).toEqual(precise);
  again.mutate({ type: 'task.edit', id, ...draft, dueAt: null });
  expect(again.task(id).dueAt).toBeNull();
  expect(() =>
    again.mutate({ type: 'task.edit', id, ...draft, dueAt: { kind: 'date', value: '2026-02-30' } }),
  ).toThrow();
  expect(again.task(id).dueAt).toBeNull();
});
test('自定义临期起点固定保留，矛盾日期拒绝保存，删除预计完成时间同时清除临期设置', () => {
  const s = setup();
  const dueAt = { kind: 'date' as const, value: '2026-10-23' };
  const urgentAt = { kind: 'date' as const, value: '2026-10-20' };
  const id = s.mutate({ type: 'task.create', draft: { ...draft, dueAt, urgentAt } }).createdId!;
  expect(s.task(id).urgentAt).toEqual(urgentAt);
  s.mutate({ type: 'task.edit', id, ...draft, dueAt: { kind: 'date', value: '2026-10-25' } });
  expect(s.task(id).urgentAt).toEqual(urgentAt);
  expect(() =>
    s.mutate({ type: 'task.edit', id, ...draft, dueAt: { kind: 'date', value: '2026-10-18' } }),
  ).toThrow('临期');
  expect(s.task(id).dueAt).toEqual({ kind: 'date', value: '2026-10-25' });
  s.mutate({ type: 'task.edit', id, ...draft, dueAt: null });
  expect(s.task(id)).toMatchObject({ dueAt: null, urgentAt: null });
  expect(() => s.mutate({ type: 'task.create', draft: { ...draft, urgentAt } })).toThrow(
    '预计完成',
  );
});
test('任务标签共用身份，改名换色更新引用，删除只移除标签并拒绝无效引用', () => {
  const s = setup();
  const red = s.mutate({ type: 'task-tag.save', name: ' 排障 ', color: 'red' }).createdId!;
  const blue = s.mutate({ type: 'task-tag.save', name: '本周', color: 'blue' }).createdId!;
  const id = s.mutate({ type: 'task.create', draft: { ...draft, tagIds: [red, blue] } }).createdId!;
  expect(s.task(id).tagIds).toEqual(expect.arrayContaining([red, blue]));
  expect(s.snapshot().taskTags).toContainEqual({ id: red, name: '排障', color: 'red' });
  s.mutate({ type: 'task-tag.save', id: red, name: '故障处理', color: 'orange' });
  expect(s.snapshot().taskTags).toContainEqual({ id: red, name: '故障处理', color: 'orange' });
  expect(() => s.mutate({ type: 'task-tag.save', name: ' 本周 ', color: 'gray' })).toThrow('同名');
  expect(() => s.mutate({ type: 'task.edit', id, ...draft, tagIds: ['missing'] })).toThrow('标签');
  expect(s.task(id).tagIds).toEqual(expect.arrayContaining([red, blue]));
  s.saveDraft({ ...draft, tagIds: [red, blue] });
  s.mutate({ type: 'task-tag.delete', id: red });
  expect(s.task(id)).toMatchObject({ title: draft.title, tagIds: [blue] });
  expect(s.snapshot().draft?.tagIds).toEqual([blue]);
  s.mutate({ type: 'task.edit', id, ...draft });
  expect(s.task(id).tagIds).toEqual([blue]);
});
test('tasks only use optional system; project archive does not affect completing or reopening', () => {
  const s = setup();
  const project = s.mutate({ type: 'project.create', name: '一期', color: '#007aff' }).createdId!;
  const system = s.mutate({ type: 'system.save', name: '平台', projectId: project }).createdId!;
  const id = s.mutate({
    type: 'task.create',
    draft: { ...draft, projectId: project, systemId: system },
  }).createdId!;
  expect(s.task(id)).toMatchObject({
    projectId: null,
    systemId: system,
    environmentId: null,
    resourceId: null,
  });
  s.mutate({ type: 'project.archive', id: project, archived: true });
  s.mutate({ type: 'task.complete', id, complete: true });
  s.mutate({ type: 'task.complete', id, complete: false });
  expect(s.project(project).archivedAt).not.toBeNull();
  expect(s.task(id).completedAt).toBeNull();
  s.mutate({ type: 'task.edit', id, ...draft, systemId: null });
  expect(s.task(id).systemId).toBeNull();
});
test('v8 migration freezes previous context and retains IDs, text and times without guessing a system', () => {
  const s = setup(),
    p = s.mutate({ type: 'project.create', name: '旧项目', color: '#007aff' }).createdId!;
  const id = s.mutate({ type: 'task.create', draft }).createdId!;
  const before = s.task(id);
  s.db.exec('ALTER TABLE tasks DROP COLUMN history; PRAGMA user_version=8');
  s.db.prepare('UPDATE tasks SET projectId=? WHERE id=?').run(p, id);
  s.set('draft', { ...draft, projectId: p });
  s.close();
  stores.splice(stores.indexOf(s), 1);
  const again = new Store(s.root);
  stores.push(again);
  expect(again.task(id)).toMatchObject({
    id,
    history: '原项目：旧项目',
    projectId: null,
    systemId: null,
    markdown: before.markdown,
    createdAt: before.createdAt,
    startedAt: before.startedAt,
  });
  expect(again.snapshot().draft).toMatchObject({ history: '原项目：旧项目', projectId: null });
});
test('editing start changes review range but never creation time or completion state', () => {
  const s = setup(),
    id = s.mutate({ type: 'task.create', draft }).createdId!,
    original = s.task(id);
  const start = minute() - 40 * 86400000;
  s.mutate({ type: 'task.dates', id, startedAt: start, completedAt: null });
  expect(s.task(id)).toMatchObject({
    createdAt: original.createdAt,
    startedAt: start,
    completedAt: null,
  });
  const date = new Date(start);
  expect(intersectsMonth(s.task(id), date.getFullYear(), date.getMonth())).toBe(true);
  expect(() =>
    s.mutate({ type: 'task.dates', id, startedAt: minute() + 60000, completedAt: null }),
  ).toThrow();
  s.mutate({ type: 'task.complete', id, complete: true });
  const end = s.task(id).completedAt!;
  expect(() =>
    s.mutate({ type: 'task.dates', id, startedAt: end + 60000, completedAt: end }),
  ).toThrow();
  expect(s.task(id).startedAt).toBe(start);
});

test('batch system assignment is atomic and preserves task content and history', () => {
  const s = setup();
  const systemId = s.mutate({ type: 'system.save', name: '系统' }).createdId!;
  const a = s.mutate({ type: 'task.create', draft }).createdId!;
  const b = s.mutate({ type: 'task.create', draft }).createdId!;
  const before = s.task(a);
  expect(() => s.mutate({ type: 'task.assign-system', ids: [a, 'missing'], systemId })).toThrow();
  expect(s.task(a)).toEqual(before);
  s.mutate({ type: 'task.assign-system', ids: [a, b], systemId });
  expect(s.task(a)).toEqual({ ...before, systemId });
  expect(s.task(b).systemId).toBe(systemId);
  s.mutate({ type: 'task.assign-system', ids: [a, b], systemId: null });
  expect(s.task(a)).toEqual(before);
});
