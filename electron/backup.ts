import { WorkspaceLedger } from './ledger-workspace';
import { migrateWorkbench } from './workbench-migration';
import { migrateTaskPlanning } from './task-migration';
import { TaskTags } from './task-tags';
import fs from 'node:fs';
import fsp from 'node:fs/promises';
import path from 'node:path';
import { randomUUID, createHash } from 'node:crypto';
import { DatabaseSync, backup } from 'node:sqlite';
import { pipeline } from 'node:stream/promises';
import { Transform, Writable, Readable } from 'node:stream';
import * as yazl from 'yazl';
import * as yauzl from 'yauzl';
import {
  Store,
  assetName,
  assetReferences,
  atomicWrite,
  validateDraftFields,
  schemaVersion,
  schemaTables,
} from './store';
import { encryptArchive, decryptArchive, checkEncryptedArchive } from './encrypted-archive';
import { newProtection, type VaultConfig } from './vault-crypto';
import { backupProtection, validateBackupConfig, type BackupConfig } from './backup-crypto';
import { validateFavorites } from './favorites';
import { validateZipSettings } from './tools/zip-validation';
import { verifyVaultIntegrity, type Vault, type RestoreProtection } from './vault';
import { Ledger, validateLedger } from './ledger';
import { migrateSystemLedger } from './ledger-migration';
import { validateTimes } from '../src/domain';
import type { DocumentRecord } from '../src/document-types';
import type { Task, Draft, BackupInfo } from '../src/types';

type Manifest = {
  format: 'clever-workbench';
  version: 1;
  createdAt: string;
  tasks: number;
  projects: number;
  documents: number;
  systems: number;
  accessEntries?: number;
  resources: number;
  accounts: number;
  secrets: number;
  files: Record<string, { size: number; sha256: string }>;
};
async function hashFile(filename: string) {
  const hash = createHash('sha256');
  await pipeline(
    fs.createReadStream(filename),
    new Writable({
      write(chunk, _, done) {
        hash.update(chunk);
        done();
      },
    }),
  );
  return hash.digest('hex');
}
function safeEntry(name: string) {
  return (
    name === 'manifest.json' ||
    name === 'database.sqlite' ||
    (name.startsWith('assets/') && assetName.test(name.slice(7)))
  );
}
function backupFailure(cause: unknown) {
  const code = (cause as NodeJS.ErrnoException)?.code;
  if (code === 'ENOSPC')
    return new Error('磁盘空间不足，请释放空间或更改备份目录后重试。', { cause });
  if (code === 'EACCES' || code === 'EPERM')
    return new Error('无法写入备份目录，请检查权限或更改目录后重试。', { cause });
  if (['ENOENT', 'EEXIST', 'ENOTDIR'].includes(code ?? ''))
    return new Error('备份目录无法使用，请重新选择目录后重试。', { cause });
  return cause instanceof Error ? cause : new Error(String(cause));
}
export class Backups {
  busy = false;
  private idleWaiters = new Set<() => void>();
  prepared = new Map<
    string,
    {
      directory: string;
      manifest: Manifest;
      protection: BackupConfig;
      key: Buffer;
      legacyRestore?: VaultConfig;
    }
  >();
  constructor(
    public store: Store,
    private vault?: () => Vault,
  ) {
    fs.rmSync(path.join(store.root, 'restore-staging'), { recursive: true, force: true });
  }
  whenIdle() {
    if (!this.busy) return Promise.resolve();
    return new Promise<void>((resolve) => this.idleWaiters.add(resolve));
  }
  private finish() {
    this.busy = false;
    for (const resolve of this.idleWaiters) resolve();
    this.idleWaiters.clear();
  }
  async discard(token: string) {
    const prepared = this.prepared.get(token);
    if (prepared && prepared.directory !== this.store.directory) {
      prepared.key.fill(0);
      this.prepared.delete(token);
      await fsp.rm(prepared.directory, { recursive: true, force: true });
    }
  }
  async create(filename: string, fallbackProtection?: BackupConfig) {
    if (this.busy) throw new Error('另一项备份或恢复正在进行，请稍后再试。');
    this.busy = true;
    try {
      return await this.writeArchive(filename, fallbackProtection);
    } catch (cause) {
      throw backupFailure(cause);
    } finally {
      this.finish();
    }
  }
  private async writeArchive(filename: string, fallbackProtection?: BackupConfig) {
    const staging = path.join(this.store.root, `backup-${randomUUID()}`),
      temporary = `${filename}.${randomUUID()}.tmp`;
    try {
      await fsp.mkdir(staging, { recursive: true });
      const database = path.join(staging, 'database.sqlite');
      await backup(this.store.db, database);
      const snapshot = new DatabaseSync(database);
      let names: string[],
        tasks: number,
        projects: number,
        documents: number,
        systems: number,
        accessEntries: number,
        resources: number,
        accounts: number,
        secrets: number,
        protection: BackupConfig;
      try {
        const value = backupProtection(snapshot) ?? fallbackProtection;
        if (!value) throw new Error('请先设置独立备份密码，再启用完整加密备份。');
        validateBackupConfig(value);
        protection = value;
        snapshot.exec('PRAGMA journal_mode=DELETE');
        const set = snapshot.prepare(
          'INSERT INTO preferences(key,value) VALUES(?,?) ON CONFLICT(key) DO UPDATE SET value=excluded.value',
        );
        set.run('vaultConfig', JSON.stringify(protection));
        set.run('backupConfig', JSON.stringify(protection));
        snapshot.prepare("DELETE FROM preferences WHERE key='systemProtection'").run();
        systems = Number(snapshot.prepare('SELECT count(*) n FROM systems').get()!.n);
        accessEntries = Number(snapshot.prepare('SELECT count(*) n FROM access_entries').get()!.n);
        resources = Number(snapshot.prepare('SELECT count(*) n FROM resources').get()!.n);
        accounts = Number(snapshot.prepare('SELECT count(*) n FROM accounts').get()!.n);
        secrets = Number(snapshot.prepare('SELECT count(*) n FROM secrets').get()!.n);
        const contents = snapshot
          .prepare(
            'SELECT content,markdown FROM tasks UNION ALL SELECT content,markdown FROM documents',
          )
          .all()
          .flatMap((r) => [JSON.parse(r.content as string), r.markdown]);
        const draft = snapshot.prepare("SELECT value FROM preferences WHERE key='draft'").get();
        if (draft) contents.push(JSON.parse(draft.value as string));
        names = [...new Set(contents.flatMap(assetReferences))];
        tasks = Number(snapshot.prepare('SELECT count(*) n FROM tasks').get()!.n);
        documents = Number(snapshot.prepare('SELECT count(*) n FROM documents').get()!.n);
        projects = Number(snapshot.prepare('SELECT count(*) n FROM projects').get()!.n);
      } finally {
        snapshot.close();
      }
      const files: Manifest['files'] = {};
      const sources: { name: string; file: string }[] = [
        { name: 'database.sqlite', file: database },
        ...names.map((name) => ({
          name: `assets/${name}`,
          file: path.join(this.store.directory, 'assets', name),
        })),
      ];
      let totalSize = 0;
      if (sources.length > 100000) throw new Error('备份文件数量超过容量。');
      for (const item of sources) {
        const stat = await fsp.stat(item.file);
        if (
          !stat.isFile() ||
          stat.size > (item.name === 'database.sqlite' ? 512 * 1024 ** 2 : 2 * 1024 ** 3) ||
          (totalSize += stat.size) > 10 * 1024 ** 3
        )
          throw new Error('备份资料超过恢复容量。');
        files[item.name] = { size: stat.size, sha256: await hashFile(item.file) };
      }
      const manifest: Manifest = {
        format: 'clever-workbench',
        version: 1,
        createdAt: new Date().toISOString(),
        tasks,
        projects,
        documents,
        systems,
        accessEntries,
        resources,
        accounts,
        secrets,
        files,
      };
      await fsp.mkdir(path.dirname(filename), { recursive: true });
      const archive = new yazl.ZipFile();
      const zipStream = archive.outputStream as Readable;
      archive.on('error', (error) => zipStream.destroy(error));
      const writing = encryptArchive(zipStream, temporary, protection);
      void writing.catch(() => zipStream.destroy());
      archive.addBuffer(Buffer.from(JSON.stringify(manifest)), 'manifest.json');
      for (const item of sources) archive.addFile(item.file, item.name);
      archive.end();
      await writing;
      // Windows FlushFileBuffers requires a handle opened for writing.
      const handle = await fsp.open(temporary, 'r+');
      try {
        await handle.sync();
      } finally {
        await handle.close();
      }
      await fsp.rename(temporary, filename);
      return manifest;
    } finally {
      const cleanup = await Promise.allSettled([
        fsp.rm(staging, { recursive: true, force: true }),
        fsp.rm(temporary, { force: true }),
      ]);
      const failure = cleanup.find((result) => result.status === 'rejected');
      if (failure?.status === 'rejected') throw failure.reason;
    }
  }
  async inspect(filename: string, password: unknown): Promise<BackupInfo> {
    if (this.busy) throw new Error('请等待正在进行的备份完成。');
    this.busy = true;
    const directory = path.join(this.store.root, 'restore-staging', randomUUID());
    let restoredKey: Buffer | undefined;
    try {
      for (const token of this.prepared.keys()) await this.discard(token);
      await fsp.mkdir(path.join(directory, 'assets'), { recursive: true });
      const payload = path.join(directory, 'payload.zip');
      const protection = await decryptArchive(filename, payload, password);
      let manifest: Manifest | undefined;
      let total = 0;
      const received = new Set<string>();
      const archive = await new Promise<yauzl.ZipFile>((resolve, reject) =>
        yauzl.open(payload, { lazyEntries: true, validateEntrySizes: true }, (err, zip) =>
          err ? reject(err) : resolve(zip!),
        ),
      );
      await new Promise<void>((resolve, reject) => {
        const fail = (e: unknown) => {
          archive.close();
          reject(e);
        };
        archive.on('error', fail);
        archive.on('end', resolve);
        archive.on('entry', async (entry: yauzl.Entry) => {
          try {
            const name = entry.fileName;
            if (
              !safeEntry(name) ||
              received.has(name) ||
              entry.uncompressedSize > 2 * 1024 ** 3 ||
              (total += entry.uncompressedSize) > 10 * 1024 ** 3
            )
              throw new Error('备份包含无效文件、重复条目或超过恢复容量。');
            received.add(name);
            const stream = await new Promise<NodeJS.ReadableStream>((res, rej) =>
              archive.openReadStream(entry, (err, s) => (err ? rej(err) : res(s!))),
            );
            if (name === 'manifest.json') {
              if (manifest || entry.uncompressedSize > 4 * 1024 ** 2)
                throw new Error('备份清单无效。');
              const chunks: Buffer[] = [];
              let bytes = 0;
              for await (const chunk of stream as any) {
                bytes += chunk.length;
                if (bytes > 4 * 1024 ** 2) throw new Error('备份清单过大。');
                chunks.push(chunk);
              }
              manifest = JSON.parse(Buffer.concat(chunks).toString());
              if (
                !manifest ||
                manifest.format !== 'clever-workbench' ||
                manifest.version !== 1 ||
                !manifest.files ||
                !manifest.files['database.sqlite'] ||
                Object.keys(manifest.files).length > 100000
              )
                throw new Error('备份格式或版本不兼容。');
              for (const [key, file] of Object.entries(manifest.files))
                if (
                  !safeEntry(key) ||
                  key === 'manifest.json' ||
                  !Number.isSafeInteger(file.size) ||
                  file.size < 0 ||
                  !/^[a-f0-9]{64}$/.test(file.sha256)
                )
                  throw new Error('备份文件清单无效。');
            } else {
              const metadata = manifest?.files[name];
              if (
                !metadata ||
                metadata.size !== entry.uncompressedSize ||
                (name === 'database.sqlite' && metadata.size > 512 * 1024 ** 2)
              )
                throw new Error('备份清单与文件不一致。');
              const hash = createHash('sha256');
              let size = 0;
              const verify = new Transform({
                transform(chunk, _, done) {
                  size += chunk.length;
                  if (size > metadata.size) return done(new Error('备份解压大小异常。'));
                  hash.update(chunk);
                  done(null, chunk);
                },
              });
              await pipeline(
                stream as any,
                verify,
                fs.createWriteStream(path.join(directory, name), { flags: 'wx', mode: 0o600 }),
              );
              if (size !== metadata.size || hash.digest('hex') !== metadata.sha256)
                throw new Error('备份文件损坏，校验未通过。');
            }
            archive.readEntry();
          } catch (e) {
            fail(e);
          }
        });
        archive.readEntry();
      });
      if (!manifest || Object.keys(manifest.files).some((name) => !received.has(name)))
        throw new Error('备份缺少必要文件。');
      await fsp.rm(payload, { force: true });
      restoredKey = await validateDatabase(directory, manifest, password, protection);
      const legacyRestore =
        !this.vault && protection.version === 2
          ? await newProtection(password, restoredKey)
          : undefined;
      const token = randomUUID();
      this.prepared.set(token, {
        directory,
        manifest,
        protection,
        key: restoredKey,
        legacyRestore,
      });
      restoredKey = undefined;
      return {
        token,
        createdAt: manifest.createdAt,
        tasks: manifest.tasks,
        projects: manifest.projects,
        documents: manifest.documents,
        systems: manifest.systems,
        accessEntries: manifest.accessEntries ?? 0,
        resources: manifest.resources,
        accounts: manifest.accounts,
        secrets: manifest.secrets,
        images: Object.keys(manifest.files).filter((n) => n.startsWith('assets/')).length,
      };
    } catch (e) {
      restoredKey?.fill(0);
      await fsp.rm(directory, { recursive: true, force: true });
      throw e;
    } finally {
      this.finish();
    }
  }
  async restore(token: string) {
    if (this.busy) throw new Error('另一项备份或恢复正在进行，请稍后再试。');
    const prepared = this.prepared.get(token);
    if (!prepared) throw new Error('请重新选择并校验备份。');
    const recovery = path.join(
      this.store.root,
      'recovery',
      `before-restore-${Date.now()}-${randomUUID()}.cwb`,
    );
    this.busy = true;
    const oldDirectory = this.store.directory,
      oldGeneration = this.store.generation,
      deviceSettings = this.store.settings();
    let localProtection: RestoreProtection | undefined;
    try {
      const vault = this.vault?.();
      const recoveryProtection =
        backupProtection(this.store.db) ??
        (vault ? vault.recoveryProtection(prepared.protection) : prepared.protection);
      localProtection = vault?.prepareRestore();
      vault?.lock();
      await this.writeArchive(recovery, recoveryProtection);
      const replacement = new DatabaseSync(path.join(prepared.directory, 'database.sqlite'));
      let rebound: ReturnType<RestoreProtection['apply']> | undefined;
      try {
        replacement.exec('BEGIN IMMEDIATE');
        if (localProtection)
          rebound = localProtection.apply(replacement, prepared.key, prepared.protection);
        else if (prepared.legacyRestore)
          replacement
            .prepare("UPDATE preferences SET value=? WHERE key='vaultConfig'")
            .run(JSON.stringify(prepared.legacyRestore));
        for (const [key, value] of Object.entries({
          backupDir: deviceSettings.backupDir,
          lastBackupAt: null,
          lastBackupError: null,
          lastBackupRevision: -1,
        }))
          replacement
            .prepare(
              'INSERT INTO preferences VALUES(?,?) ON CONFLICT(key) DO UPDATE SET value=excluded.value',
            )
            .run(key, JSON.stringify(value));
        replacement.exec('COMMIT');
        if (rebound) {
          prepared.key.fill(0);
          prepared.key = rebound.key;
          prepared.protection = rebound.backup;
          rebound = undefined;
        }
      } catch (cause) {
        rebound?.key.fill(0);
        replacement.exec('ROLLBACK');
        throw cause;
      } finally {
        replacement.close();
      }
      const target = path.join(this.store.root, 'vaults', path.basename(prepared.directory));
      if (target !== prepared.directory) {
        await fsp.rename(prepared.directory, target);
        prepared.directory = target;
      }
      this.store.close();
      this.store.directory = prepared.directory;
      this.store.generation = path.basename(prepared.directory);
      try {
        this.store.db = this.store.open();
        atomicWrite(path.join(this.store.root, 'CURRENT'), this.store.generation);
      } catch (e) {
        try {
          this.store.db.close();
        } catch {}
        this.store.directory = oldDirectory;
        this.store.generation = oldGeneration;
        this.store.db = this.store.open();
        throw e;
      }
      prepared.key.fill(0);
      this.prepared.delete(token);
      return this.store.snapshot();
    } finally {
      localProtection?.dispose();
      this.finish();
    }
  }
  async automatic(force = false) {
    if (this.busy) {
      if (force) throw new Error('另一项备份或恢复正在进行，请稍后再试。');
      return;
    }
    const settings = this.store.settings();
    if (backupProtection(this.store.db) === null) {
      if (force) throw new Error('请先设置独立备份密码，再启用完整加密备份。');
      return;
    }
    const now = new Date();
    const last = settings.lastBackupAt ? new Date(settings.lastBackupAt) : null;
    if (
      !force &&
      (!settings.autoBackup ||
        this.store.get<number>('revision', 0) === 0 ||
        this.store.get<number>('revision', 0) ===
          this.store.get<number>('lastBackupRevision', -1) ||
        (last && last.toDateString() === now.toDateString()))
    )
      return;
    const revision = this.store.get('revision', 0);
    this.busy = true;
    try {
      const owner = this.automaticOwner();
      const filename = path.join(
        settings.backupDir,
        `auto-${owner}-${now.toISOString().replace(/[:.]/g, '-')}-${randomUUID()}.cwb`,
      );
      await this.writeArchive(filename);
      this.store.set('lastBackupAt', Date.now());
      this.store.set('lastBackupRevision', revision);
      this.store.set('lastBackupError', null);
      const pattern = new RegExp(
        `^auto-${owner}-\\d{4}-\\d{2}-\\d{2}T\\d{2}-\\d{2}-\\d{2}-\\d{3}Z-[a-f0-9-]{36}\\.cwb$`,
      );
      const files: string[] = [];
      for (const entry of await fsp.readdir(settings.backupDir, { withFileTypes: true })) {
        if (!entry.isFile() || !pattern.test(entry.name)) continue;
        try {
          await checkEncryptedArchive(path.join(settings.backupDir, entry.name));
        } catch {
          continue;
        }
        files.push(entry.name);
      }
      files.sort().reverse();
      for (const name of files.slice(7)) await fsp.unlink(path.join(settings.backupDir, name));
    } catch (e) {
      this.store.set('lastBackupError', backupFailure(e).message);
    } finally {
      this.finish();
    }
  }
  private automaticOwner() {
    // Device-local identity is deliberately outside portable preferences.
    const filename = path.join(this.store.root, 'AUTO_BACKUP_OWNER');
    if (!fs.existsSync(filename)) atomicWrite(filename, randomUUID());
    const owner = fs.readFileSync(filename, 'utf8').trim();
    if (!/^[a-f0-9-]{36}$/.test(owner))
      throw new Error('自动备份标识损坏，请保留备份目录并检查本机资料。');
    return owner;
  }
}
async function validateDatabase(
  directory: string,
  manifest: Manifest,
  password: unknown,
  protection: BackupConfig,
) {
  // This is the authenticated, isolated extraction; never migrate the source or active database.
  const db = new DatabaseSync(path.join(directory, 'database.sqlite'));
  let key: Buffer | undefined;
  try {
    db.exec('PRAGMA trusted_schema=OFF; PRAGMA foreign_keys=ON');
    const version = Number(db.prepare('PRAGMA user_version').get()!.user_version);
    if (
      !Number.isInteger(version) ||
      version < 7 ||
      version > schemaVersion ||
      Object.values(db.prepare('PRAGMA integrity_check').get()!)[0] !== 'ok' ||
      db.prepare('PRAGMA foreign_key_check').all().length
    )
      throw new Error('数据库校验失败。');
    if (
      db
        .prepare(
          `SELECT name FROM sqlite_master WHERE type IN ('trigger','view') OR (type='table' AND name NOT IN (${schemaTables.map(() => '?').join(',')}))`,
        )
        .all(...schemaTables).length
    )
      throw new Error('备份数据库结构不兼容。');
    key = await verifyVaultIntegrity(db, password, protection);
    if (version < schemaVersion) {
      migrateSystemLedger(db);
      migrateWorkbench(db);
      migrateTaskPlanning(db);
      db.exec(`PRAGMA user_version=${schemaVersion}`);
    }
    validateLedger(db);
    const taskTags = new TaskTags(db);
    taskTags.validate();
    db.exec('SAVEPOINT validate_workspace');
    try {
      new WorkspaceLedger(db).validate();
    } finally {
      db.exec('ROLLBACK TO validate_workspace; RELEASE validate_workspace');
    }
    const ledger = new Ledger(db);
    for (const row of db.prepare('SELECT key,value FROM preferences').all()) {
      const value = JSON.parse(row.value as string);
      if (row.key === 'favorites') validateFavorites(value);
      if (row.key === 'zipTextSettings') validateZipSettings(value);
      if (
        (row.key === 'theme' && !['system', 'light', 'dark'].includes(value)) ||
        (['autoBackup', 'reduceTransparency', 'highContrast', 'reduceMotion'].includes(
          String(row.key),
        ) &&
          typeof value !== 'boolean') ||
        (row.key === 'revision' && (!Number.isSafeInteger(value) || value < 0))
      )
        throw new Error('备份设置无效。');
    }
    const projects = db.prepare('SELECT * FROM projects').all();
    const projectMap = new Map(projects.map((p) => [p.id, p]));
    const names = new Set<string>();
    for (const p of projects) {
      if (
        typeof p.id !== 'string' ||
        typeof p.name !== 'string' ||
        !p.name.trim() ||
        p.name.length > 1000 ||
        !/^#[a-f0-9]{6}$/i.test(p.color as string) ||
        names.has(p.name.toLowerCase()) ||
        (p.archivedAt !== null && !Number.isSafeInteger(p.archivedAt))
      )
        throw new Error('项目记录无效。');
      names.add(p.name.toLowerCase());
    }
    const rows = db.prepare('SELECT * FROM tasks').all();
    for (const row of rows) {
      const task = {
        ...row,
        dueAt: row.dueAt ? JSON.parse(String(row.dueAt)) : null,
        urgentAt: row.urgentAt ? JSON.parse(String(row.urgentAt)) : null,
      } as unknown as Task;
      validateTimes(task.startedAt, task.completedAt);
      ledger.resolveContext(task);
      if (
        !task.title?.trim() ||
        task.title.length > 1000 ||
        !Number.isSafeInteger(task.createdAt) ||
        (task.deletedAt !== null && !Number.isSafeInteger(task.deletedAt)) ||
        typeof task.markdown !== 'string'
      )
        throw new Error('任务记录无效。');
      const content = JSON.parse(row.content as string);
      validateDraftFields({ ...task, content });
      for (const name of assetReferences([content, task.markdown]))
        if (!manifest.files[`assets/${name}`]) throw new Error('备份缺少正文图片。');
      if (task.projectId !== null && !projectMap.has(task.projectId))
        throw new Error('任务项目丢失。');
      if (
        task.deletedAt === null &&
        task.completedAt === null &&
        projectMap.get(task.projectId)?.archivedAt
      )
        throw new Error('归档项目中存在未完成任务。');
    }
    const draftRow = db.prepare("SELECT value FROM preferences WHERE key='draft'").get();
    if (draftRow) {
      const draft = JSON.parse(draftRow.value as string) as Draft | null;
      if (draft !== null) {
        validateDraftFields(draft);
        taskTags.validateIds(draft.tagIds);
        if (draft.projectId !== null && !projectMap.has(draft.projectId))
          throw new Error('草稿无效。');
        ledger.resolveContext(draft);
        for (const name of assetReferences([draft.content, draft.markdown]))
          if (!manifest.files[`assets/${name}`]) throw new Error('草稿图片缺失。');
      }
    }
    const documents = db.prepare('SELECT * FROM documents').all();
    for (const row of documents) {
      const document = row as unknown as DocumentRecord;
      if (
        typeof document.title !== 'string' ||
        document.title.length > 1000 ||
        typeof document.markdown !== 'string' ||
        document.markdown.length > 10_000_000 ||
        !Number.isSafeInteger(document.createdAt) ||
        !Number.isSafeInteger(document.updatedAt) ||
        (document.deletedAt !== null && !Number.isSafeInteger(document.deletedAt))
      )
        throw new Error('文档记录无效。');
      ledger.resolveContext(document, true);
      if (document.projectId !== null && !projectMap.has(document.projectId))
        throw new Error('文档项目丢失。');
      const content = JSON.parse(row.content as string);
      validateDraftFields({ ...document, content });
      for (const name of assetReferences([content, document.markdown]))
        if (!manifest.files[`assets/${name}`]) throw new Error('文档图片缺失。');
    }
    for (const table of ['systems', 'resources', 'accounts', 'secrets'] as const)
      if (Number(db.prepare(`SELECT count(*) n FROM ${table}`).get()!.n) !== manifest[table])
        throw new Error('备份台账数量不一致。');
    if (
      Number(db.prepare('SELECT count(*) n FROM access_entries').get()!.n) !==
      (manifest.accessEntries ?? 0)
    )
      throw new Error('备份访问入口数量不一致。');
    if (documents.length !== manifest.documents) throw new Error('备份文档数量不一致。');
    if (rows.length !== manifest.tasks || projects.length !== manifest.projects)
      throw new Error('备份记录数量不一致。');
    return key;
  } catch (cause) {
    key?.fill(0);
    throw cause;
  } finally {
    try {
      db.close();
    } catch (cause) {
      key?.fill(0);
      throw cause;
    }
  }
}
