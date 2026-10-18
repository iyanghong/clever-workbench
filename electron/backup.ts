import fs from 'node:fs';
import fsp from 'node:fs/promises';
import path from 'node:path';
import { randomUUID, createHash } from 'node:crypto';
import { DatabaseSync, backup } from 'node:sqlite';
import { pipeline } from 'node:stream/promises';
import { Transform, Writable } from 'node:stream';
import * as yazl from 'yazl';
import * as yauzl from 'yauzl';
import {
  Store,
  assetName,
  assetReferences,
  atomicWrite,
  validateContent,
  schemaVersion,
  schemaTables,
} from './store';
import { validateFavorites } from './favorites';
import { validateVault } from './vault';
import { Ledger, validateLedger } from './ledger';
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
export class Backups {
  busy = false;
  prepared = new Map<string, { directory: string; manifest: Manifest }>();
  constructor(public store: Store) {
    fs.rmSync(path.join(store.root, 'restore-staging'), { recursive: true, force: true });
  }
  async discard(token: string) {
    const prepared = this.prepared.get(token);
    if (prepared && prepared.directory !== this.store.directory) {
      await fsp.rm(prepared.directory, { recursive: true, force: true });
      this.prepared.delete(token);
    }
  }
  async create(filename: string) {
    if (this.busy) throw new Error('另一项备份或恢复正在进行，请稍后再试。');
    this.busy = true;
    const staging = path.join(this.store.root, `backup-${randomUUID()}`),
      temporary = `${filename}.${randomUUID()}.tmp`;
    try {
      await fsp.mkdir(staging, { recursive: true });
      const database = path.join(staging, 'database.sqlite');
      await backup(this.store.db, database);
      const snapshot = new DatabaseSync(database, { readOnly: true });
      let names: string[], tasks: number, projects: number, documents: number;
      try {
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
      for (const item of sources) {
        const stat = await fsp.stat(item.file);
        files[item.name] = { size: stat.size, sha256: await hashFile(item.file) };
      }
      const manifest: Manifest = {
        format: 'clever-workbench',
        version: 1,
        createdAt: new Date().toISOString(),
        tasks,
        projects,
        documents,
        files,
      };
      await fsp.mkdir(path.dirname(filename), { recursive: true });
      const archive = new yazl.ZipFile();
      const output = fs.createWriteStream(temporary, { mode: 0o600 });
      const writing = pipeline(archive.outputStream, output);
      archive.addBuffer(Buffer.from(JSON.stringify(manifest)), 'manifest.json');
      for (const item of sources) archive.addFile(item.file, item.name);
      archive.end();
      await writing;
      const handle = await fsp.open(temporary, 'r');
      try {
        await handle.sync();
      } finally {
        await handle.close();
      }
      await fsp.rename(temporary, filename);
      return manifest;
    } finally {
      this.busy = false;
      await fsp.rm(staging, { recursive: true, force: true });
      await fsp.rm(temporary, { force: true });
    }
  }
  async inspect(filename: string): Promise<BackupInfo> {
    if (this.busy) throw new Error('请等待正在进行的备份完成。');
    this.busy = true;
    for (const token of this.prepared.keys()) await this.discard(token);
    const directory = path.join(this.store.root, 'restore-staging', randomUUID());
    await fsp.mkdir(path.join(directory, 'assets'), { recursive: true });
    try {
      let manifest: Manifest | undefined;
      let total = 0;
      const received = new Set<string>();
      const archive = await new Promise<yauzl.ZipFile>((resolve, reject) =>
        yauzl.open(filename, { lazyEntries: true, validateEntrySizes: true }, (err, zip) =>
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
      validateDatabase(directory, manifest);
      const token = randomUUID();
      this.prepared.set(token, { directory, manifest });
      return {
        token,
        createdAt: manifest.createdAt,
        tasks: manifest.tasks,
        projects: manifest.projects,
        documents: manifest.documents,
        images: Object.keys(manifest.files).filter((n) => n.startsWith('assets/')).length,
      };
    } catch (e) {
      await fsp.rm(directory, { recursive: true, force: true });
      throw e;
    } finally {
      this.busy = false;
    }
  }
  async restore(token: string) {
    const prepared = this.prepared.get(token);
    if (!prepared) throw new Error('请重新选择并校验备份。');
    const recovery = path.join(
      this.store.root,
      'recovery',
      `before-restore-${Date.now()}.cleverplan.zip`,
    );
    await this.create(recovery);
    this.busy = true;
    const oldDirectory = this.store.directory,
      oldGeneration = this.store.generation,
      deviceSettings = this.store.settings();
    try {
      const replacement = new DatabaseSync(path.join(prepared.directory, 'database.sqlite'));
      try {
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
      this.prepared.delete(token);
      return this.store.snapshot();
    } finally {
      this.busy = false;
    }
  }
  async automatic(force = false) {
    const settings = this.store.settings();
    const now = new Date();
    const last = settings.lastBackupAt ? new Date(settings.lastBackupAt) : null;
    if (
      this.busy ||
      (!force &&
        (!settings.autoBackup ||
          this.store.get<number>('revision', 0) === 0 ||
          this.store.get<number>('revision', 0) ===
            this.store.get<number>('lastBackupRevision', -1) ||
          (last && last.toDateString() === now.toDateString())))
    )
      return;
    const revision = this.store.get('revision', 0);
    try {
      const filename = path.join(
        settings.backupDir,
        `auto-${now.toISOString().replace(/[:.]/g, '-')}.cleverplan.zip`,
      );
      await this.create(filename);
      this.store.set('lastBackupAt', Date.now());
      this.store.set('lastBackupRevision', revision);
      this.store.set('lastBackupError', null);
      const files = (await fsp.readdir(settings.backupDir))
        .filter((n) => /^auto-.*\.cleverplan\.zip$/.test(n))
        .sort()
        .reverse();
      for (const name of files.slice(7)) await fsp.unlink(path.join(settings.backupDir, name));
    } catch (e) {
      this.store.set('lastBackupError', e instanceof Error ? e.message : String(e));
    }
  }
}
function validateDatabase(directory: string, manifest: Manifest) {
  const db = new DatabaseSync(path.join(directory, 'database.sqlite'), { readOnly: true });
  try {
    if (
      Number(db.prepare('PRAGMA user_version').get()!.user_version) !== schemaVersion ||
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
    validateLedger(db);
    validateVault(db);
    const ledger = new Ledger(db);
    for (const row of db.prepare('SELECT key,value FROM preferences').all()) {
      const value = JSON.parse(row.value as string);
      if (row.key === 'favorites') validateFavorites(value);
      if (
        (row.key === 'theme' && !['system', 'light', 'dark'].includes(value)) ||
        (row.key === 'autoBackup' && typeof value !== 'boolean') ||
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
      const task = row as unknown as Task;
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
      validateContent(content);
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
      if (draft) {
        if (
          typeof draft.title !== 'string' ||
          typeof draft.markdown !== 'string' ||
          (draft.projectId !== null && !projectMap.has(draft.projectId))
        )
          throw new Error('草稿无效。');
        validateContent(draft.content);
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
      ledger.resolveContext(document);
      if (document.projectId !== null && !projectMap.has(document.projectId))
        throw new Error('文档项目丢失。');
      const content = JSON.parse(row.content as string);
      validateContent(content);
      for (const name of assetReferences([content, document.markdown]))
        if (!manifest.files[`assets/${name}`]) throw new Error('文档图片缺失。');
    }
    if (documents.length !== manifest.documents) throw new Error('备份文档数量不一致。');
    if (rows.length !== manifest.tasks || projects.length !== manifest.projects)
      throw new Error('备份记录数量不一致。');
  } finally {
    db.close();
  }
}
