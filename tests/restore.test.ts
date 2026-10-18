import { afterEach, expect, test, vi } from 'vitest';
import fs from 'node:fs';
import fsp from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { DatabaseSync, backup } from 'node:sqlite';
import type { Readable } from 'node:stream';
import * as yazl from 'yazl';
import { encryptArchive } from '../electron/encrypted-archive';
import { Store } from '../electron/store';
import { Vault } from '../electron/vault';
import { Backups } from '../electron/backup';
import { emptyContent } from '../src/domain';
const password = 'fictional-portable-master-password';
const roots: string[] = [],
  stores: Store[] = [],
  vaults: Vault[] = [];
function directory() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'workbench-restore-'));
  roots.push(root);
  return root;
}
function open(root = directory()) {
  const store = new Store(root);
  stores.push(store);
  return store;
}
function protect(store: Store) {
  const vault = new Vault(store);
  vaults.push(vault);
  return vault;
}
const draft = (title: string) => ({
  title,
  markdown: '',
  content: emptyContent(),
  projectId: null,
});
afterEach(() => {
  vi.restoreAllMocks();
  for (const v of vaults.splice(0)) v.lock();
  for (const s of stores.splice(0)) {
    try {
      s.close();
    } catch {}
  }
  for (const root of roots.splice(0)) fs.rmSync(root, { recursive: true, force: true });
});

async function fixture() {
  const store = open(),
    vault = protect(store),
    backups = new Backups(store);
  const projectId = store.mutate({
    type: 'project.create',
    name: '一期',
    color: '#007aff',
  }).createdId!;
  const nextProject = store.mutate({
    type: 'project.create',
    name: '二期',
    color: '#34a271',
  }).createdId!;
  const systemId = store.mutate({ type: 'system.save', name: '长期平台', projectId }).createdId!;
  const environmentId = store.mutate({
    type: 'environment.save',
    systemId,
    name: '生产',
  }).createdId!;
  const resourceId = store.mutate({
    type: 'resource.save',
    environmentId,
    kind: 'redis',
    name: '缓存',
    address: 'redis.internal',
    port: '6379',
  }).createdId!;
  const serviceId = store.mutate({
    type: 'service.save',
    systemId,
    name: '订单服务',
    repository: 'https://example.com/orders.git',
  }).createdId!;
  store.mutate({
    type: 'deployment.save',
    serviceId,
    environmentId,
    address: 'https://orders.example.com',
    port: '8080',
  });
  const accountId = store.mutate({
    type: 'account.save',
    environmentId,
    resourceId,
    name: '缓存连接',
    username: 'orders',
  }).createdId!;
  await vault.initialize(password);
  vault.save(accountId, 'password', 'fictional-resource-secret');
  vault.save(accountId, 'token', 'fictional-token');
  const bytes = Buffer.from(
    'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR4nGNgqPr/HwAEcAJ5Qhlc0gAAAABJRU5ErkJggg==',
    'base64',
  );
  const image = store.importImage(bytes, '现场.png');
  const context = { projectId, systemId, environmentId, resourceId };
  const taskId = store.mutate({
    type: 'task.create',
    draft: { ...draft('排查缓存'), ...context, markdown: `![现场](${image.src})` },
  }).createdId!;
  store.mutate({ type: 'task.complete', id: taskId, complete: true });
  const documentId = store.mutate({ type: 'document.create', context: { resourceId } }).createdId!;
  store.mutate({
    ...store.document(documentId),
    type: 'document.edit',
    markdown: `## 修复方案\n\n![现场](${image.src})`,
  });
  store.mutate({ type: 'document.delete', id: documentId });
  store.saveDraft({
    ...draft('未提交工作'),
    ...context,
    markdown: `草稿\n\n![现场](${image.src})`,
  });
  store.mutate({ type: 'favorite.set', kind: 'account', id: accountId, pinned: true });
  store.mutate({ type: 'system.save', id: systemId, name: '长期平台', projectId: nextProject });
  store.mutate({
    type: 'settings',
    theme: 'dark',
    autoBackup: false,
    reduceMotion: true,
    highContrast: true,
    reduceTransparency: true,
  });
  const expected = store.snapshot(),
    task = store.task(taskId),
    document = store.document(documentId);
  const filename = path.join(directory(), 'portable.cwb');
  vault.lock();
  await backups.create(filename);
  return { store, vault, backups, filename, accountId, expected, task, document, image, bytes };
}

test(
  '无原应用目录的新设备完整恢复，保留本机目录和恢复前副本，可重启编辑与再次导出',
  { timeout: 15_000 },
  async () => {
    const source = await fixture();
    source.store.close();
    fs.rmSync(source.store.root, { recursive: true, force: true });
    const store = open(),
      backups = new Backups(store),
      vault = protect(store),
      oldId = store.mutate({ type: 'task.create', draft: draft('新设备原有记录') }).createdId!;
    const backupDir = store.settings().backupDir;
    const info = await backups.inspect(source.filename, password);
    expect(store.task(oldId).title).toBe('新设备原有记录');
    // Confirmation uses the verified staging copy even if the selected file is replaced later.
    fs.writeFileSync(source.filename, 'replaced after preview');
    await backups.restore(info.token);
    const actual = store.snapshot();
    for (const key of [
      'projects',
      'tasks',
      'systems',
      'systemProjects',
      'environments',
      'services',
      'deployments',
      'resources',
      'accounts',
      'documents',
      'favorites',
      'draft',
    ] as const)
      expect(actual[key]).toEqual(source.expected[key]);
    expect(store.task(source.task.id)).toEqual(source.task);
    expect(store.document(source.document.id)).toEqual(source.document);
    expect(store.settings()).toMatchObject({
      theme: 'dark',
      backupDir,
      lastBackupAt: null,
      reduceMotion: true,
      highContrast: true,
      reduceTransparency: true,
    });
    expect(vault.status()).toEqual({ initialized: true, unlocked: false });
    await vault.unlock(password);
    expect(vault.read(source.accountId, 'password')).toBe('fictional-resource-secret');
    vault.lock();
    expect(
      fs.readFileSync(path.join(store.directory, 'assets', source.image.src.split('/').at(-1)!)),
    ).toEqual(source.bytes);
    const recovery = path.join(
      store.root,
      'recovery',
      fs.readdirSync(path.join(store.root, 'recovery'))[0],
    );
    const previous = open(),
      previousBackups = new Backups(previous);
    await previousBackups.restore((await previousBackups.inspect(recovery, password)).token);
    expect(previous.task(oldId).title).toBe('新设备原有记录');
    store.close();
    const reopened = open(store.root),
      again = new Backups(reopened);
    reopened.mutate({ type: 'document.restore', id: source.document.id });
    reopened.mutate({
      ...reopened.document(source.document.id),
      type: 'document.edit',
      markdown: '恢复后继续编辑',
    });
    expect(reopened.document(source.document.id).markdown).toBe('恢复后继续编辑');
    const next = path.join(directory(), 're-export.cwb');
    await again.create(next);
    expect(await again.inspect(next, password)).toMatchObject({
      tasks: 1,
      documents: 1,
      secrets: 2,
      images: 1,
    });
  },
);

test('恢复切换后撤销原解锁会话，密码派生中的迟到解锁也不能落到新资料', async () => {
  const source = await fixture();
  await source.vault.unlock(password);
  await source.backups.restore((await source.backups.inspect(source.filename, password)).token);
  expect(source.vault.status().unlocked).toBe(false);
  expect(() => source.vault.save(source.accountId, 'password', 'should not save')).toThrow('解锁');
  const next = await source.backups.inspect(source.filename, password);
  const unlocking = source.vault.unlock(password);
  const outcome = expect(unlocking).rejects.toThrow('取消');
  await source.backups.restore(next.token);
  await outcome;
  expect(source.vault.status().unlocked).toBe(false);
  await source.vault.unlock(password);
  expect(source.vault.read(source.accountId, 'password')).toBe('fictional-resource-secret');
});

test('恢复前副本写入失败保留当前记录、秘密和预检结果，解除故障后可以重试', async () => {
  const source = await fixture();
  source.store.mutate({ type: 'task.create', draft: draft('导出后新增') });
  await source.vault.unlock(password);
  source.vault.save(source.accountId, 'password', 'updated-after-backup');
  source.vault.lock();
  const before = source.store.snapshot(),
    generation = source.store.generation,
    info = await source.backups.inspect(source.filename, password);
  const rename = fsp.rename;
  vi.spyOn(fsp, 'rename').mockImplementation(async (from, to) => {
    if (String(to).includes('before-restore-')) throw new Error('模拟恢复前副本写入失败');
    return rename(from, to);
  });
  await expect(source.backups.restore(info.token)).rejects.toThrow('模拟恢复前副本写入失败');
  expect(source.store.snapshot()).toEqual(before);
  expect(source.store.generation).toBe(generation);
  expect(source.backups.busy).toBe(false);
  await source.vault.unlock(password);
  expect(source.vault.read(source.accountId, 'password')).toBe('updated-after-backup');
  source.vault.lock();
  vi.restoreAllMocks();
  await source.backups.restore(info.token);
  await source.vault.unlock(password);
  expect(source.vault.read(source.accountId, 'password')).toBe('fictional-resource-secret');
});

test('即使认证成功，缺失引用图片或不支持的数据库版本也不能进入恢复确认', async () => {
  const source = await fixture(),
    before = source.store.snapshot(),
    temporary = directory(),
    database = path.join(temporary, 'database.sqlite');
  await backup(source.store.db, database);
  for (const invalid of ['missing-image', 'future-version']) {
    if (invalid === 'future-version') {
      const db = new DatabaseSync(database);
      db.exec('PRAGMA user_version=999');
      db.close();
    }
    const bytes = fs.readFileSync(database),
      archive = new yazl.ZipFile(),
      filename = path.join(temporary, `${invalid}.cwb`);
    const manifest = {
      format: 'clever-workbench',
      version: 1,
      createdAt: new Date().toISOString(),
      tasks: 1,
      projects: 2,
      documents: 1,
      systems: 1,
      resources: 1,
      accounts: 1,
      secrets: 2,
      files: {
        'database.sqlite': {
          size: bytes.length,
          sha256: createHash('sha256').update(bytes).digest('hex'),
        },
      },
    };
    const writing = encryptArchive(
      archive.outputStream as Readable,
      filename,
      source.vault.config(),
    );
    archive.addBuffer(Buffer.from(JSON.stringify(manifest)), 'manifest.json');
    archive.addBuffer(bytes, 'database.sqlite');
    archive.end();
    await writing;
    await expect(source.backups.inspect(filename, password)).rejects.toThrow(
      invalid === 'missing-image' ? '图片' : '数据库',
    );
    expect(source.store.snapshot()).toEqual(before);
    expect(source.backups.prepared.size).toBe(0);
    expect(fs.readdirSync(path.join(source.store.root, 'restore-staging'))).toHaveLength(0);
  }
});
