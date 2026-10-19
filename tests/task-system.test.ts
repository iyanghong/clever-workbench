import { afterEach, expect, test } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { Store } from '../electron/store';
import { emptyContent, minute, intersectsMonth } from '../src/domain';
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
  for (const s of stores.splice(0)) s.close();
  for (const root of roots.splice(0)) fs.rmSync(root, { recursive: true, force: true });
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
