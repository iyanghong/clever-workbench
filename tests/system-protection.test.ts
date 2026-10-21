import { afterEach, expect, test, vi } from 'vitest';
import { createCipheriv, createDecipheriv, randomBytes } from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { Store } from '../electron/store';
import { Vault } from '../electron/vault';
import { Backups } from '../electron/backup';

const opened: { store: Store; vault: Vault }[] = [];
function device(legacy = false) {
  const key = randomBytes(32);
  const system = {
    available: () => true,
    encrypt(value: string) {
      const iv = randomBytes(12),
        cipher = createCipheriv('aes-256-gcm', key, iv);
      const bytes = Buffer.concat([cipher.update(value, 'utf8'), cipher.final()]);
      return Buffer.concat([iv, cipher.getAuthTag(), bytes]);
    },
    decrypt(value: Buffer) {
      const decipher = createDecipheriv('aes-256-gcm', key, value.subarray(0, 12));
      decipher.setAuthTag(value.subarray(12, 28));
      return Buffer.concat([decipher.update(value.subarray(28)), decipher.final()]).toString();
    },
  };
  const store = new Store(fs.mkdtempSync(path.join(os.tmpdir(), 'workbench-system-protection-')));
  const vault = new Vault(store, () => {}, legacy ? undefined : system);
  opened.push({ store, vault });
  return { store, vault, backups: new Backups(store, () => vault), system };
}
afterEach(() => {
  vi.restoreAllMocks();
  for (const { store, vault } of opened.splice(0)) {
    vault.lock();
    store.close();
    fs.rmSync(store.root, { recursive: true, force: true });
  }
});

test.each([
  ['system', 'system'],
  ['system', 'password'],
  ['password', 'system'],
  ['password', 'password'],
])(
  '恢复 %s 来源到 %s 目标保留目标保护，指针失败后可重试且恢复前副本可迁移',
  async (sourceMode, targetMode) => {
    const source = device(),
      target = device();
    if (sourceMode === 'password') await source.vault.initialize('fixture-source-master');
    if (targetMode === 'password') await target.vault.initialize('fixture-target-master');
    function accountFor(current: ReturnType<typeof device>, name: string) {
      const systemId = current.store.mutate({ type: 'system.save', name }).createdId!;
      const environmentId = current.store.mutate({
        type: 'environment.save',
        systemId,
        name: '测试',
      }).createdId!;
      return current.store.mutate({ type: 'account.save', environmentId, name: '测试账号' })
        .createdId!;
    }
    const imported = accountFor(source, '导入资料'),
      original = accountFor(target, '原有资料');
    source.vault.save(imported, 'password', 'fixture-imported-secret');
    target.vault.save(original, 'password', 'fixture-original-secret');
    await source.vault.configureBackup('fixture-imported-backup-password');
    source.vault.lock();
    await source.backups.automatic(true);
    const archive = path.join(
      source.store.settings().backupDir,
      fs.readdirSync(source.store.settings().backupDir)[0],
    );
    const info = await target.backups.inspect(archive, 'fixture-imported-backup-password');
    const rename = fs.renameSync;
    vi.spyOn(fs, 'renameSync').mockImplementation((from, to) => {
      if (String(to) === path.join(target.store.root, 'CURRENT'))
        throw new Error('模拟指针写入失败');
      return rename(from, to);
    });
    await expect(target.backups.restore(info.token)).rejects.toThrow('指针写入失败');
    expect(target.store.snapshot().accounts[0].id).toBe(original);
    if (targetMode === 'password') await target.vault.unlock('fixture-target-master');
    expect(target.vault.read(original, 'password')).toBe('fixture-original-secret');
    vi.restoreAllMocks();
    await target.backups.restore(info.token);
    expect(target.vault.status().mode).toBe(targetMode);
    if (targetMode === 'password') await target.vault.unlock('fixture-target-master');
    expect(target.vault.read(imported, 'password')).toBe('fixture-imported-secret');
    const recovery = path.join(
      target.store.root,
      'recovery',
      fs.readdirSync(path.join(target.store.root, 'recovery'))[0],
    );
    const other = device();
    await other.backups.restore(
      (await other.backups.inspect(recovery, 'fixture-imported-backup-password')).token,
    );
    expect(other.vault.read(original, 'password')).toBe('fixture-original-secret');
  },
);

test('重设备份密码不改变本机凭据，已生成的备份仍使用旧密码', async () => {
  const source = device();
  await source.vault.configureBackup('fixture-first-backup');
  const original = path.join(source.store.root, 'first.cwb');
  await source.backups.create(original);
  await source.vault.configureBackup('fixture-second-backup');
  const next = path.join(source.store.root, 'second.cwb');
  await source.backups.create(next);
  const target = device();
  await expect(target.backups.inspect(original, 'fixture-second-backup')).rejects.toThrow('密码');
  await target.backups.inspect(original, 'fixture-first-backup');
  await expect(target.backups.inspect(next, 'fixture-first-backup')).rejects.toThrow('密码');
  await target.backups.inspect(next, 'fixture-second-backup');
  expect(source.vault.status().mode).toBe('system');
});

test('系统保护不可用或保护材料丢失时保留密文，不生成替代明文或新密钥', () => {
  const current = device();
  const systemId = current.store.mutate({ type: 'system.save', name: '系统保护故障' }).createdId!;
  const environmentId = current.store.mutate({
    type: 'environment.save',
    systemId,
    name: '测试',
  }).createdId!;
  const accountId = current.store.mutate({
    type: 'account.save',
    environmentId,
    name: '账号',
  }).createdId!;
  current.vault.save(accountId, 'password', 'fixture-protected-secret');
  current.vault.lock();
  const cipher = current.store.db.prepare('SELECT value FROM secrets').get()!.value;
  current.system.available = () => false;
  expect(() => current.vault.read(accountId, 'password')).toThrow('系统加密暂时不可用');
  expect(current.store.db.prepare('SELECT value FROM secrets').get()!.value).toBe(cipher);
  current.system.available = () => true;
  current.store.db.prepare("DELETE FROM preferences WHERE key='systemProtection'").run();
  expect(() => current.vault.read(accountId, 'password')).toThrow('缺少保护材料');
  expect(current.store.get('systemProtection', null)).toBeNull();
  expect(current.store.db.prepare('SELECT value FROM secrets').get()!.value).toBe(cipher);
});

test('已有主密码资料在升级后沿用原备份密码，之后主密码变更不会联动', async () => {
  const legacy = device(true);
  await legacy.vault.initialize('fixture-upgrade-original');
  legacy.vault.lock();
  legacy.store.db
    .prepare("DELETE FROM preferences WHERE key IN ('backupConfig','localProtectionVersion')")
    .run();
  const upgraded = new Vault(legacy.store, () => {}, legacy.system);
  expect(upgraded.status()).toMatchObject({
    mode: 'password',
    backupConfigured: true,
    unlocked: false,
  });
  await upgraded.rotate('fixture-upgrade-original', 'fixture-upgrade-new-master');
  const archive = path.join(legacy.store.root, 'upgraded.cwb');
  await legacy.backups.create(archive);
  const target = device();
  await expect(target.backups.inspect(archive, 'fixture-upgrade-new-master')).rejects.toThrow(
    '密码',
  );
  await target.backups.restore(
    (await target.backups.inspect(archive, 'fixture-upgrade-original')).token,
  );
  expect(target.vault.status()).toMatchObject({ mode: 'system', backupConfigured: true });
});

test('无主密码的系统保护凭据可凭独立备份密码在另一系统身份下完整恢复', async () => {
  const source = device();
  const systemId = source.store.mutate({ type: 'system.save', name: '可迁移系统' }).createdId!;
  const environmentId = source.store.mutate({
    type: 'environment.save',
    systemId,
    name: '生产',
  }).createdId!;
  const account = source.store.mutate({
    type: 'account.save',
    environmentId,
    name: '运维',
  }).createdId!;
  source.vault.save(account, 'password', 'fixture-system-protected-secret');
  expect(source.vault.read(account, 'password')).toBe('fixture-system-protected-secret');
  expect(source.vault.status()).toMatchObject({ mode: 'system', initialized: false });
  await source.vault.configureBackup('fixture-independent-backup-password');
  source.vault.lock();
  const filename = path.join(source.store.root, 'portable.cwb');
  await source.backups.create(filename);
  expect(fs.readFileSync(filename).includes(Buffer.from('fixture-system-protected-secret'))).toBe(
    false,
  );
  const target = device();
  const prepared = await target.backups.inspect(filename, 'fixture-independent-backup-password');
  await target.backups.restore(prepared.token);
  expect(target.vault.read(account, 'password')).toBe('fixture-system-protected-secret');
  expect(target.vault.status()).toMatchObject({
    mode: 'system',
    initialized: false,
    backupConfigured: true,
  });
});

test('更改本机主密码轮换资料密钥，但完整备份仍只使用独立备份密码恢复', async () => {
  const source = device(true);
  await source.vault.initialize('fixture-old-master');
  const systemId = source.store.mutate({ type: 'system.save', name: '密码分离' }).createdId!;
  const environmentId = source.store.mutate({
    type: 'environment.save',
    systemId,
    name: '测试',
  }).createdId!;
  const account = source.store.mutate({
    type: 'account.save',
    environmentId,
    name: '运维',
  }).createdId!;
  source.vault.save(account, 'password', 'fixture-rotated-data-secret');
  await source.vault.configureBackup('fixture-independent-backup');
  await source.vault.rotate('fixture-old-master', 'fixture-new-master');
  const filename = path.join(source.store.root, 'after-rotation.cwb');
  await source.backups.create(filename);
  const target = device();
  await expect(target.backups.inspect(filename, 'fixture-new-master')).rejects.toThrow('密码');
  await target.backups.restore(
    (await target.backups.inspect(filename, 'fixture-independent-backup')).token,
  );
  expect(target.vault.read(account, 'password')).toBe('fixture-rotated-data-secret');
});

test('真实旧格式备份可迁移到系统保护，旧任务新增计划字段为空', async () => {
  const target = device();
  const info = await target.backups.inspect(
    path.resolve('tests/fixtures/backups/legacy-v9.cwb'),
    'fixture-legacy-backup-password',
  );
  expect(info).toMatchObject({ tasks: 1, secrets: 1 });
  await target.backups.restore(info.token);
  const snapshot = target.store.snapshot();
  expect(snapshot.tasks[0]).toMatchObject({
    title: '旧格式任务',
    dueAt: null,
    urgentAt: null,
    tagIds: [],
  });
  expect(target.vault.read(snapshot.accounts[0].id, 'password')).toBe('fixture-legacy-secret');
  expect(target.vault.status()).toMatchObject({ mode: 'system', backupConfigured: true });
});

test('主密码可开启关闭并重新开启，转换失败保留凭据和原模式，备份密码保持独立', async () => {
  const source = device();
  const systemId = source.store.mutate({ type: 'system.save', name: '保护切换' }).createdId!;
  const environmentId = source.store.mutate({
    type: 'environment.save',
    systemId,
    name: '测试',
  }).createdId!;
  const account = source.store.mutate({
    type: 'account.save',
    environmentId,
    name: '账号',
  }).createdId!;
  source.vault.save(account, 'token', 'fixture-switch-secret');
  await source.vault.configureBackup('fixture-stable-backup-password');
  await source.vault.initialize('fixture-master-password');
  expect(source.vault.status()).toMatchObject({ mode: 'password', initialized: true });
  source.vault.lock();
  expect(() => source.vault.read(account, 'token')).toThrow('解锁');
  await source.vault.unlock('fixture-master-password');
  await expect(source.vault.disableMaster('wrong-password')).rejects.toThrow('密码');
  const encrypt = source.system.encrypt;
  source.system.encrypt = () => {
    throw new Error('模拟系统加密失败');
  };
  await expect(source.vault.disableMaster('fixture-master-password')).rejects.toThrow(
    '系统加密失败',
  );
  expect(source.vault.status()).toMatchObject({ mode: 'password' });
  expect(source.vault.read(account, 'token')).toBe('fixture-switch-secret');
  source.system.encrypt = encrypt;
  await source.vault.disableMaster('fixture-master-password');
  expect(source.vault.status()).toMatchObject({ mode: 'system', initialized: false });
  expect(source.vault.read(account, 'token')).toBe('fixture-switch-secret');
  await source.vault.initialize('fixture-second-master-password');
  const filename = path.join(source.store.root, 'switched.cwb');
  await source.backups.create(filename);
  const target = device();
  await target.backups.restore(
    (await target.backups.inspect(filename, 'fixture-stable-backup-password')).token,
  );
  expect(target.vault.read(account, 'token')).toBe('fixture-switch-secret');
});
