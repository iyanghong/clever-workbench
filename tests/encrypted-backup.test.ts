import { afterEach, expect, test, vi } from 'vitest';
import fsp from 'node:fs/promises';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { Store } from '../electron/store';
import { Vault } from '../electron/vault';
import { Backups } from '../electron/backup';
import { emptyContent } from '../src/domain';
let store: Store | undefined, vault: Vault | undefined;
const password = 'fictional-backup-master-password';
async function setup(protectedData = true) {
  store = new Store(fs.mkdtempSync(path.join(os.tmpdir(), 'workbench-encrypted-backup-')));
  vault = new Vault(store);
  if (protectedData) await vault.initialize(password);
  return { store, vault, backups: new Backups(store) };
}
afterEach(() => {
  vi.restoreAllMocks();
  vault?.lock();
  if (store) {
    store.close();
    fs.rmSync(store.root, { recursive: true, force: true });
  }
  store = undefined;
  vault = undefined;
});

test('跨时区恢复保留混合日期与时刻的计划，时区反转不阻断恢复或无关编辑', async () => {
  const previous = process.env.TZ;
  try {
    process.env.TZ = 'Asia/Shanghai';
    const { store, backups } = await setup();
    const draft = {
      title: '跨时区计划',
      projectId: null,
      content: emptyContent(),
      markdown: '',
      dueAt: { kind: 'time' as const, value: Date.parse('2026-10-23T00:00:00Z') },
      urgentAt: { kind: 'date' as const, value: '2026-10-23' },
    };
    const id = store.mutate({ type: 'task.create', draft }).createdId!;
    store.saveDraft(draft);
    const archive = path.join(store.root, 'timezone.cwb');
    await backups.create(archive);
    process.env.TZ = 'America/Los_Angeles';
    await backups.restore((await backups.inspect(archive, password)).token);
    expect(store.task(id)).toMatchObject(draft);
    store.mutate({ ...store.task(id), type: 'task.edit', title: '只改标题' });
    store.saveDraft({ ...draft, title: '继续填写草稿' });
    expect(store.snapshot().draft?.urgentAt).toEqual(draft.urgentAt);
    expect(() =>
      store.mutate({
        ...store.task(id),
        type: 'task.edit',
        urgentAt: { kind: 'date', value: '2026-10-24' },
      }),
    ).toThrow('临期');
  } finally {
    if (previous === undefined) delete process.env.TZ;
    else process.env.TZ = previous;
  }
});

test('任务计划日期和自定义临期起点随完整备份恢复，实际记录时间保持不变', async () => {
  const { store, backups } = await setup();
  const tag = store.mutate({ type: 'task-tag.save', name: '发布', color: 'blue' }).createdId!;
  const id = store.mutate({
    type: 'task.create',
    draft: {
      title: '发布计划',
      projectId: null,
      content: emptyContent(),
      markdown: '',
      dueAt: { kind: 'date', value: '2026-10-23' },
      urgentAt: { kind: 'time', value: Date.parse('2026-10-20T03:00:00Z') },
      tagIds: [tag],
    },
  }).createdId!;
  const before = store.task(id);
  const filename = path.join(store.root, 'task-planning.cwb');
  await backups.create(filename);
  store.mutate({ ...before, type: 'task.edit', id, dueAt: null });
  await backups.restore((await backups.inspect(filename, password)).token);
  expect(store.task(id)).toEqual(before);
  expect(store.snapshot().taskTags).toContainEqual({ id: tag, name: '发布', color: 'blue' });
});

test('秘密锁定时完整导出整体密文，密码预检覆盖正文草稿图片及秘密且不改变当前资料', async () => {
  const { store, vault, backups } = await setup();
  const systemId = store.mutate({
    type: 'system.save',
    name: 'confidential-system-name-9842',
  }).createdId!;
  const environmentId = store.mutate({
    type: 'environment.save',
    systemId,
    name: '生产',
  }).createdId!;
  const resourceId = store.mutate({
    type: 'resource.save',
    environmentId,
    name: '缓存',
    kind: 'redis',
  }).createdId!;
  const accountId = store.mutate({
    type: 'account.save',
    environmentId,
    resourceId,
    name: '超管',
  }).createdId!;
  vault.save(accountId, 'password', 'exclusive-backup-secret');
  const image = store.importImage(
    Buffer.from(
      'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR4nGNgqPr/HwAEcAJ5Qhlc0gAAAABJRU5ErkJggg==',
      'base64',
    ),
    '截图.png',
  );
  const documentId = store.mutate({ type: 'document.create', context: { resourceId } }).createdId!;
  store.mutate({
    ...store.document(documentId),
    type: 'document.edit',
    title: 'private-document-title-3451',
    markdown: `正文与图片\n\n![截图](${image.src})`,
  });
  store.mutate({ type: 'document.delete', id: documentId });
  store.saveDraft({
    title: 'private-draft-title-9821',
    markdown: `![截图](${image.src})`,
    content: emptyContent(),
    projectId: null,
  });
  vault.lock();
  const before = store.snapshot(),
    filename = path.join(store.root, 'portable.cwb');
  await backups.create(filename);
  const bytes = fs.readFileSync(filename);
  expect(bytes.subarray(0, 8).toString()).toBe('CWBK0001');
  for (const text of [
    'SQLite format 3',
    'confidential-system-name-9842',
    'private-document-title-3451',
    'private-draft-title-9821',
    'exclusive-backup-secret',
    password,
  ])
    expect(bytes.includes(Buffer.from(text))).toBe(false);
  await expect(backups.inspect(filename, 'wrong-backup-password')).rejects.toThrow('密码');
  const info = await backups.inspect(filename, password);
  expect(info).toMatchObject({
    systems: 1,
    resources: 1,
    accounts: 1,
    secrets: 1,
    documents: 1,
    images: 1,
  });
  expect(store.snapshot()).toEqual(before);
  expect(vault.status().unlocked).toBe(false);
  await backups.discard(info.token);
});

test('预检目录写入失败后释放操作状态，原资料保留且可重试', async () => {
  const { store, backups } = await setup();
  const filename = path.join(store.root, 'retry.cwb');
  await backups.create(filename);
  const before = store.snapshot();
  vi.spyOn(fsp, 'mkdir').mockRejectedValueOnce(new Error('模拟预检目录写入失败'));
  await expect(backups.inspect(filename, password)).rejects.toThrow('模拟预检目录写入失败');
  expect(backups.busy).toBe(false);
  expect(store.snapshot()).toEqual(before);
  const info = await backups.inspect(filename, password);
  await backups.discard(info.token);
});

test('未设置备份保护不导出，密文篡改、截断和不兼容格式均拒绝且清理预检目录', async () => {
  const { store, vault, backups } = await setup(false);
  const filename = path.join(store.root, 'protected.cwb');
  await expect(backups.create(filename)).rejects.toThrow('备份密码');
  expect(fs.existsSync(filename)).toBe(false);
  await vault.initialize(password);
  await backups.create(filename);
  const original = fs.readFileSync(filename);
  const damaged = Buffer.from(original);
  damaged[damaged.length - 1] ^= 0xff;
  fs.writeFileSync(filename, damaged);
  await expect(backups.inspect(filename, password)).rejects.toThrow();
  fs.writeFileSync(filename, original.subarray(0, Math.floor(original.length / 2)));
  await expect(backups.inspect(filename, password)).rejects.toThrow();
  fs.writeFileSync(filename, Buffer.from('PK\x03\x04legacy plaintext'));
  await expect(backups.inspect(filename, password)).rejects.toThrow('格式');
  expect(fs.readdirSync(path.join(store.root, 'restore-staging'))).toHaveLength(0);
});

test('未认证头部的长度和 KDF 参数先受限，不对损坏输入启动任意成本派生', async () => {
  const { store, backups } = await setup();
  const filename = path.join(store.root, 'bounded.cwb');
  await backups.create(filename);
  const original = fs.readFileSync(filename);
  const oversized = Buffer.from(original);
  oversized.writeUInt32BE(0x7fffffff, 8);
  fs.writeFileSync(filename, oversized);
  await expect(backups.inspect(filename, password)).rejects.toThrow('头部');
  const length = original.readUInt32BE(8),
    header = JSON.parse(original.subarray(12, 12 + length).toString());
  header.protection.kdf.N = 2 ** 30;
  const raw = Buffer.from(JSON.stringify(header)),
    lead = Buffer.from(original.subarray(0, 12));
  lead.writeUInt32BE(raw.length, 8);
  fs.writeFileSync(filename, Buffer.concat([lead, raw, original.subarray(12 + length)]));
  await expect(backups.inspect(filename, password)).rejects.toThrow('参数');
  expect(fs.readdirSync(path.join(store.root, 'restore-staging'))).toHaveLength(0);
});

test('外层加密有效但秘密本身已损坏时，预检拒绝且不产生可恢复令牌', async () => {
  const { store, vault, backups } = await setup();
  const systemId = store.mutate({ type: 'system.save', name: '损坏验证' }).createdId!;
  const environmentId = store.mutate({
    type: 'environment.save',
    systemId,
    name: '生产',
  }).createdId!;
  const accountId = store.mutate({ type: 'account.save', environmentId, name: '账号' }).createdId!;
  vault.save(accountId, 'password', 'fictional-before-corruption');
  vault.lock();
  const original = String(
    store.db.prepare('SELECT value FROM secrets WHERE accountId=?').get(accountId)!.value,
  );
  const corrupt = JSON.parse(original),
    tag = Buffer.from(corrupt.tag, 'base64');
  tag[0] ^= 1;
  corrupt.tag = tag.toString('base64');
  store.db
    .prepare('UPDATE secrets SET value=? WHERE accountId=?')
    .run(JSON.stringify(corrupt), accountId);
  const filename = path.join(store.root, 'broken-secret.cwb');
  await backups.create(filename);
  const before = store.snapshot();
  await expect(backups.inspect(filename, password)).rejects.toThrow('校验');
  expect(backups.prepared.size).toBe(0);
  expect(store.snapshot()).toEqual(before);
  expect(vault.status().unlocked).toBe(false);
  expect(fs.readdirSync(path.join(store.root, 'restore-staging'))).toHaveLength(0);
});

test('预检拒绝已损坏的资料密钥，以及正常写入不接受的草稿开始时间', async () => {
  const { store, vault, backups } = await setup();
  vault.lock();
  const original = vault.config();
  const changed = structuredClone(original),
    tag = Buffer.from(changed.key.tag, 'base64');
  tag[0] ^= 1;
  changed.key.tag = tag.toString('base64');
  store.set('backupConfig', changed);
  const filename = path.join(store.root, 'bad-material.cwb');
  await backups.create(filename);
  await expect(backups.inspect(filename, password)).rejects.toThrow('校验');
  store.set('backupConfig', original);
  const draft = {
    title: '损坏的草稿',
    markdown: '',
    content: emptyContent(),
    projectId: null,
    startedAt: -1,
  };
  expect(() => store.saveDraft(draft)).toThrow('开始时间');
  store.set('draft', draft);
  await backups.create(filename);
  await expect(backups.inspect(filename, password)).rejects.toThrow('开始时间');
  expect(backups.prepared.size).toBe(0);
});

test('即使外层认证成功，内外保护材料不一致也不能获得恢复令牌', async () => {
  const { store, vault, backups } = await setup(),
    outer = vault.config();
  await vault.rotate(password, password);
  const current = vault.config();
  const { backup } = await import('node:sqlite'),
    { createHash } = await import('node:crypto'),
    yazl = await import('yazl'),
    { encryptArchive } = await import('../electron/encrypted-archive');
  const database = path.join(store.root, 'mixed.sqlite');
  await backup(store.db, database);
  const bytes = fs.readFileSync(database);
  const manifest = {
    format: 'clever-workbench',
    version: 1,
    createdAt: new Date().toISOString(),
    tasks: 0,
    projects: 0,
    documents: 0,
    systems: 0,
    resources: 0,
    accounts: 0,
    secrets: 0,
    files: {
      'database.sqlite': {
        size: bytes.length,
        sha256: createHash('sha256').update(bytes).digest('hex'),
      },
    },
  };
  const archive = new yazl.ZipFile(),
    filename = path.join(store.root, 'mixed.cwb');
  const writing = encryptArchive(
    archive.outputStream as import('node:stream').Readable,
    filename,
    outer,
  );
  archive.addBuffer(Buffer.from(JSON.stringify(manifest)), 'manifest.json');
  archive.addBuffer(bytes, 'database.sqlite');
  archive.end();
  await writing;
  await expect(backups.inspect(filename, password)).rejects.toThrow('保护材料不一致');
  expect(backups.prepared.size).toBe(0);
  expect(vault.config()).toEqual(current);
  expect(vault.status().unlocked).toBe(false);
});
