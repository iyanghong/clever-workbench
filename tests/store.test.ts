import { afterEach, describe, expect, test, vi } from 'vitest';
import fs from 'node:fs';
import fsp from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { Store } from '../electron/store';
import { Vault } from '../electron/vault';
import { Backups } from '../electron/backup';
import { emptyContent, minute, intersectsMonth, completedInMonth } from '../src/domain';
import type { Draft } from '../src/types';
const backupPassword = 'fictional-test-backup-password';
async function createBackup(backups: Backups, file: string) {
  if (!backups.store.get('vaultConfig', null)) {
    const vault = new Vault(backups.store);
    await vault.initialize(backupPassword);
    vault.lock();
  }
  return backups.create(file);
}
const roots: string[] = [],
  stores: Store[] = [];
function setup() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'clever-workbench-test-'));
  roots.push(root);
  const store = new Store(root);
  stores.push(store);
  return store;
}
function draft(title = '修复登录错误'): Draft {
  return { title, content: emptyContent(), markdown: '', projectId: null };
}
const png = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR4nGNgqPr/HwAEcAJ5Qhlc0gAAAABJRU5ErkJggg==',
  'base64',
);
afterEach(() => {
  vi.restoreAllMocks();
  for (const store of stores.splice(0))
    try {
      store.close();
    } catch {}
  for (const root of roots.splice(0)) fs.rmSync(root, { recursive: true, force: true });
});
describe('local task model', () => {
  test('quick capture and past completion preserve creation time', () => {
    const s = setup();
    expect(() => s.mutate({ type: 'task.create', draft: draft('   ') })).toThrow();
    const { createdId: id } = s.mutate({ type: 'task.create', draft: draft() });
    const original = s.task(id!);
    const start = minute() - 3 * 86400000,
      end = minute() - 86400000;
    s.mutate({ type: 'task.complete', id: id!, complete: true });
    s.mutate({ type: 'task.dates', id: id!, startedAt: start, completedAt: end });
    expect(s.task(id!).createdAt).toBe(original.createdAt);
    expect(s.task(id!).completedAt).toBe(end);
    expect(() =>
      s.mutate({ type: 'task.dates', id: id!, startedAt: end + 60000, completedAt: end }),
    ).toThrow();
    expect(s.task(id!).startedAt).toBe(start);
  });
  test('archive, reopen, trash and restore preserve project invariant', () => {
    const s = setup();
    const p = s.mutate({ type: 'project.create', name: '网站', color: '#007aff' }).createdId!;
    const id = s.mutate({ type: 'task.create', draft: { ...draft(), projectId: p } }).createdId!;
    expect(() => s.mutate({ type: 'project.archive', id: p, archived: true })).toThrow();
    s.mutate({ type: 'task.complete', id, complete: true });
    const done = s.task(id).completedAt;
    s.mutate({ type: 'task.complete', id, complete: true });
    expect(s.task(id).completedAt).toBe(done);
    s.mutate({ type: 'project.archive', id: p, archived: true });
    expect(() => s.mutate({ type: 'task.complete', id, complete: false })).toThrow();
    s.mutate({ type: 'task.complete', id, complete: false, restoreProject: true });
    expect(s.project(p).archivedAt).toBeNull();
    s.mutate({ type: 'task.delete', id });
    s.mutate({ type: 'project.archive', id: p, archived: true });
    expect(() => s.mutate({ type: 'task.restore', id })).toThrow();
    s.mutate({ type: 'task.restore', id, destination: 'unclassified' });
    expect(s.task(id).projectId).toBeNull();
    expect(s.task(id).deletedAt).toBeNull();
  });
  test('search escapes SQL wildcards and omits trash', () => {
    const s = setup();
    const a = s.mutate({ type: 'task.create', draft: draft('完成 100% 覆盖') }).createdId!;
    s.mutate({ type: 'task.create', draft: draft('其他内容') });
    expect(s.search('%')).toEqual([a]);
    s.mutate({ type: 'task.delete', id: a });
    expect(s.search('%')).toEqual([]);
  });
  test('image import checks format and draft persists across restarts', () => {
    const s = setup();
    expect(() => s.importImage(Buffer.from('<svg/>'), 'fake.png')).toThrow();
    const asset = s.importImage(png, '截图.png');
    const d = {
      ...draft(),
      content: {
        type: 'doc',
        content: [{ type: 'image', attrs: { src: asset.src, alt: '截图' } }],
      },
    };
    s.saveDraft(d);
    s.close();
    const again = new Store(s.root);
    stores.push(again);
    expect(again.snapshot().draft).toEqual(d);
    expect(
      fs.readFileSync(path.join(again.directory, 'assets', asset.src.split('/').at(-1)!)),
    ).toEqual(png);
  });
  test('cross-month bars and completion metrics differ', () => {
    const t = {
      id: 'x',
      title: 'x',
      projectId: null,
      createdAt: 0,
      startedAt: new Date(2026, 8, 28).getTime(),
      completedAt: new Date(2026, 9, 3).getTime(),
      deletedAt: null,
    };
    expect(intersectsMonth(t, 2026, 8)).toBe(true);
    expect(intersectsMonth(t, 2026, 9)).toBe(true);
    expect(completedInMonth(t, 2026, 8)).toBe(false);
    expect(completedInMonth(t, 2026, 9)).toBe(true);
  });
});
describe('complete backups', () => {
  test('roundtrip includes images, trash, draft and original timestamps', async () => {
    const s = setup(),
      b = new Backups(s),
      asset = s.importImage(png, 'a.png');
    const d = {
      ...draft(),
      content: { type: 'doc', content: [{ type: 'image', attrs: { src: asset.src } }] },
    };
    const id = s.mutate({ type: 'task.create', draft: d }).createdId!;
    s.mutate({ type: 'task.delete', id });
    s.saveDraft({ ...d, title: '未提交草稿' });
    const original = s.task(id);
    const file = path.join(s.root, 'export.zip');
    await createBackup(b, file);
    s.mutate({ type: 'task.purge' });
    s.saveDraft(null);
    const info = await b.inspect(file, backupPassword);
    expect(info.images).toBe(1);
    expect(info.tasks).toBe(1);
    await b.restore(info.token);
    expect(s.task(id)).toEqual(original);
    expect(s.snapshot().draft?.title).toBe('未提交草稿');
    expect(fs.readdirSync(path.join(s.root, 'recovery'))).toHaveLength(1);
  });
  test('damaged backup leaves current data untouched', async () => {
    const s = setup(),
      b = new Backups(s);
    const id = s.mutate({ type: 'task.create', draft: draft() }).createdId!;
    const file = path.join(s.root, 'broken.zip');
    await createBackup(b, file);
    const bytes = await fsp.readFile(file);
    await fsp.writeFile(file, bytes.subarray(0, bytes.length / 2));
    await expect(b.inspect(file, backupPassword)).rejects.toThrow();
    expect(s.task(id).title).toBe('修复登录错误');
  });
  test('failed CURRENT swap reopens original database', async () => {
    const s = setup(),
      b = new Backups(s);
    const id = s.mutate({ type: 'task.create', draft: draft('原记录') }).createdId!;
    const file = path.join(s.root, 'valid.zip');
    await createBackup(b, file);
    const info = await b.inspect(file, backupPassword);
    s.mutate({ type: 'task.create', draft: draft('恢复前新增') });
    const original = fs.renameSync;
    vi.spyOn(fs, 'renameSync').mockImplementation((from, to) => {
      if (String(to).endsWith('CURRENT')) throw new Error('模拟磁盘失败');
      return original(from, to);
    });
    await expect(b.restore(info.token)).rejects.toThrow('模拟磁盘失败');
    expect(s.snapshot().tasks).toHaveLength(2);
    expect(s.task(id).title).toBe('原记录');
  });
  test('10,000 task summaries and search remain bounded', () => {
    const s = setup();
    const stmt = s.db.prepare(
      'INSERT INTO tasks(id,title,content,markdown,projectId,createdAt,startedAt,completedAt,deletedAt) VALUES(?,?,?,?,?,?,?,?,?)',
    );
    s.db.exec('BEGIN');
    for (let i = 0; i < 10000; i++)
      stmt.run(
        `task-${i}`,
        `功能开发 ${i}`,
        JSON.stringify(emptyContent()),
        `测试日志 ${i}`,
        null,
        minute(),
        minute(),
        null,
        null,
      );
    s.db.exec('COMMIT');
    const start = performance.now();
    expect(s.snapshot().tasks).toHaveLength(10000);
    expect(s.search('日志 9999')).toEqual(['task-9999']);
    const ms = performance.now() - start;
    console.log(`10,000 tasks: snapshot + search ${ms.toFixed(1)} ms`);
    expect(ms).toBeLessThan(2000);
  });
});
