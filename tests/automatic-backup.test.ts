import { afterEach, expect, test, vi } from 'vitest';
import fs from 'node:fs';
import fsp from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { Store } from '../electron/store';
import { Vault } from '../electron/vault';
import { Backups } from '../electron/backup';
import { emptyContent } from '../src/domain';
const stores: Store[] = [];
let vault: Vault | undefined;
const password = 'fictional-automatic-backup-password';
function setup() {
  const store = new Store(fs.mkdtempSync(path.join(os.tmpdir(), 'workbench-auto-')));
  stores.push(store);
  vault = new Vault(store);
  return { store, vault, backups: new Backups(store) };
}
function files(store: Store) {
  const folder = store.settings().backupDir;
  return fs.existsSync(folder)
    ? fs
        .readdirSync(folder)
        .filter((name) => name.endsWith('.cwb'))
        .sort()
    : [];
}
function change(store: Store, title: string) {
  store.mutate({
    type: 'task.create',
    draft: { title, markdown: '', content: emptyContent(), projectId: null },
  });
}
afterEach(() => {
  vi.restoreAllMocks();
  vi.useRealTimers();
  vault?.lock();
  for (const store of stores.splice(0)) {
    try {
      store.close();
    } catch {}
    fs.rmSync(store.root, { recursive: true, force: true });
  }
  vault = undefined;
});

test('有主密码且有变更才每日成功一次，跨日无变更跳过，秘密锁定时自动备份仍可恢复', async () => {
  vi.useFakeTimers({ toFake: ['Date'] });
  vi.setSystemTime(new Date(2026, 9, 1, 10));
  const { store, vault, backups } = setup();
  change(store, '首次记录');
  await backups.automatic();
  expect(files(store)).toHaveLength(0);
  expect(store.settings().lastBackupAt).toBeNull();
  await vault.initialize(password);
  vault.lock();
  vi.useFakeTimers({ toFake: ['Date'] });
  vi.setSystemTime(new Date(2026, 9, 1, 10));
  await backups.automatic();
  expect(files(store)).toHaveLength(1);
  expect(vault.status().unlocked).toBe(false);
  const first = store.settings().lastBackupAt;
  change(store, '当天新增');
  await backups.automatic();
  expect(files(store)).toHaveLength(1);
  expect(store.settings().lastBackupAt).toBe(first);
  vi.setSystemTime(new Date(2026, 9, 2, 10));
  await backups.automatic();
  expect(files(store)).toHaveLength(2);
  vi.setSystemTime(new Date(2026, 9, 3, 10));
  await backups.automatic();
  expect(files(store)).toHaveLength(2);
  store.mutate({ type: 'settings', autoBackup: false });
  change(store, '关闭后新增');
  await backups.automatic();
  expect(files(store)).toHaveLength(2);
  store.mutate({ type: 'settings', autoBackup: true });
  await backups.automatic();
  expect(files(store)).toHaveLength(3);
  const last = files(store).at(-1)!;
  expect(
    await backups.inspect(path.join(store.settings().backupDir, last), password),
  ).toMatchObject({ tasks: 3 });
});

test('导出失败保留已有副本与最近成功日期，自动重试成功；并发手动请求不能假报完成', async () => {
  const { store, vault, backups } = setup();
  await vault.initialize(password);
  vault.lock();
  vi.useFakeTimers({ toFake: ['Date'] });
  vi.setSystemTime(new Date(2026, 9, 1, 10));
  change(store, '原工作');
  await backups.automatic();
  const before = files(store),
    last = store.settings().lastBackupAt;
  vi.setSystemTime(new Date(2026, 9, 2, 10));
  change(store, '新增工作');
  const rename = fsp.rename;
  vi.spyOn(fsp, 'rename').mockImplementation(async (from, to) => {
    if (String(to).endsWith('.cwb')) throw new Error('模拟空间不足');
    return rename(from, to);
  });
  await backups.automatic();
  expect(files(store)).toEqual(before);
  expect(store.settings()).toMatchObject({ lastBackupAt: last, lastBackupError: '模拟空间不足' });
  vi.restoreAllMocks();
  await backups.automatic();
  expect(files(store)).toHaveLength(2);
  expect(store.settings().lastBackupError).toBeNull();
  const exporting = backups.create(path.join(store.root, 'manual.cwb'));
  await Promise.all([exporting, expect(backups.automatic(true)).rejects.toThrow('进行')]);
  const previous = files(store).length;
  await Promise.all([backups.automatic(true), backups.automatic()]);
  expect(files(store)).toHaveLength(previous + 1);
});

test('保留最近 7 份只清理本设备自动创建的文件，不清理手动文件、恢复副本或相似命名文件', async () => {
  const { store, vault, backups } = setup();
  await vault.initialize(password);
  vault.lock();
  const folder = store.settings().backupDir;
  await fs.promises.mkdir(folder, { recursive: true });
  const unrelated = [
    'auto-personal.cwb',
    'auto-2020-01-01T00-00-00-000Z.cwb',
    'before-restore-123.cwb',
    'manual.cwb',
  ];
  for (const name of unrelated) fs.writeFileSync(path.join(folder, name), 'unrelated user content');
  vi.useFakeTimers({ toFake: ['Date'] });
  const created: string[] = [];
  for (let day = 1; day <= 9; day++) {
    vi.setSystemTime(new Date(2026, 9, day, 10));
    change(store, `第 ${day} 天`);
    const before = new Set(files(store));
    await backups.automatic();
    created.push(files(store).find((name) => !before.has(name))!);
  }
  expect(files(store).filter((name) => created.includes(name))).toEqual(created.slice(-7).sort());
  for (const name of unrelated)
    expect(fs.readFileSync(path.join(folder, name), 'utf8')).toBe('unrelated user content');
  const root = store.root;
  store.close();
  const reopened = new Store(root);
  stores.push(reopened);
  vi.setSystemTime(new Date(2026, 9, 10, 10));
  change(reopened, '重启后');
  await new Backups(reopened).automatic();
  expect(files(reopened).filter((name) => !unrelated.includes(name))).toHaveLength(7);
  reopened.close();
});
