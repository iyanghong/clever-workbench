import { WorkspaceLedger } from './ledger-workspace';
import { migrateWorkbench } from './workbench-migration';
import { DatabaseSync } from 'node:sqlite';
import fs from 'node:fs';
import path from 'node:path';
import { randomUUID, createHash } from 'node:crypto';
import type {
  Asset,
  Command,
  Draft,
  MutationResult,
  Project,
  Settings,
  Snapshot,
  Task,
  TaskSummary,
} from '../src/types';
import { minute, validateTimes } from '../src/domain';
import { validateFavorites } from './favorites';
import { toolCatalog } from '../src/tool-types';
import { searchWorkspace } from './search';
import { initializeVault } from './vault';
import { Documents, initializeDocuments } from './documents';
import { Ledger, initializeLedger } from './ledger';
import { migrateSystemLedger } from './ledger-migration';

export const schemaVersion = 9;
export const schemaTables = [
  'projects',
  'tasks',
  'preferences',
  'systems',
  'system_projects',
  'environments',
  'services',
  'deployments',
  'resources',
  'accounts',
  'access_entries',
  'ledger_scopes',
  'deployment_nodes',
  'operations',
  'ledger_batches',
  'documents',
  'secrets',
];

export function atomicWrite(filename: string, bytes: string | Uint8Array) {
  const temporary = `${filename}.${randomUUID()}.tmp`;
  const fd = fs.openSync(temporary, 'wx', 0o600);
  try {
    fs.writeFileSync(fd, bytes);
    fs.fsyncSync(fd);
  } finally {
    fs.closeSync(fd);
  }
  try {
    fs.renameSync(temporary, filename);
  } catch (error) {
    fs.rmSync(temporary, { force: true });
    throw error;
  }
}
export function text(value: unknown, max = 1000): string {
  if (typeof value !== 'string' || value.length > max) throw new Error('输入内容无效或过长。');
  return value;
}
function title(value: unknown) {
  const result = text(value, 1000).trim();
  if (!result) throw new Error('请先写一个标题。');
  return result;
}
export const assetName = /^[a-f0-9]{64}\.(png|jpg|webp|gif)$/;
export function assetReferences(content: unknown): string[] {
  const matches = JSON.stringify(content).matchAll(
    /workbench-asset:\/\/image\/([a-f0-9]{64}\.(?:png|jpg|webp|gif))/g,
  );
  return [...new Set([...matches].map((m) => m[1]))];
}
export function validateContent(content: any) {
  if (!content || content.type !== 'doc' || JSON.stringify(content).length > 10_000_000)
    throw new Error('正文格式不正确或超过 10 MB。');
  let count = 0;
  const allowed = new Set([
    'doc',
    'paragraph',
    'text',
    'heading',
    'bulletList',
    'orderedList',
    'listItem',
    'taskList',
    'taskItem',
    'blockquote',
    'codeBlock',
    'horizontalRule',
    'hardBreak',
    'image',
    'table',
    'tableRow',
    'tableCell',
    'tableHeader',
  ]);
  function visit(node: any, depth: number) {
    if (++count > 100000 || depth > 64 || !node || !allowed.has(node.type))
      throw new Error('正文结构无效。');
    if (node.type === 'text' && typeof node.text !== 'string') throw new Error('正文文字无效。');
    if (
      node.type === 'image' &&
      !(
        typeof node.attrs?.src === 'string' &&
        /^workbench-asset:\/\/image\/[a-f0-9]{64}\.(png|jpg|webp|gif)$/.test(node.attrs.src)
      )
    )
      throw new Error('图片需要先导入本地。');
    if (
      node.marks &&
      (!Array.isArray(node.marks) ||
        node.marks.some(
          (m: any) =>
            !['bold', 'italic', 'strike', 'code', 'underline', 'link'].includes(m.type) ||
            (m.type === 'link' && !/^https?:\/\//i.test(m.attrs?.href ?? '')),
        ))
    )
      throw new Error('正文包含不支持的链接或格式。');
    if (node.content !== undefined) {
      if (!Array.isArray(node.content)) throw new Error('正文结构无效。');
      for (const child of node.content) visit(child, depth + 1);
    }
  }
  visit(content, 0);
}
export function validateDraftFields(draft: Draft) {
  if (!draft || typeof draft !== 'object') throw new Error('草稿格式无效。');
  text(draft.title, 1000);
  if (draft.history !== undefined) text(draft.history, 5000);
  if (draft.startedAt !== undefined) validateTimes(draft.startedAt, null);
  text(draft.markdown, 10_000_000);
  validateContent(draft.content);
}
export class Store {
  ledger!: Ledger;
  documents!: Documents;
  db: DatabaseSync;
  generation: string;
  directory: string;
  constructor(public root: string) {
    fs.mkdirSync(path.join(root, 'vaults'), { recursive: true });
    const pointer = path.join(root, 'CURRENT');
    this.generation = fs.existsSync(pointer)
      ? fs.readFileSync(pointer, 'utf8').trim()
      : randomUUID();
    if (!/^[a-f0-9-]{36}$/.test(this.generation))
      throw new Error('本地数据指针无效，请从备份恢复。');
    this.directory = path.join(root, 'vaults', this.generation);
    if (fs.existsSync(pointer) && !fs.existsSync(path.join(this.directory, 'database.sqlite')))
      throw new Error('本地数据库缺失，请保留数据目录并恢复备份。');
    fs.mkdirSync(path.join(this.directory, 'assets'), { recursive: true });
    this.db = this.open();
    if (!fs.existsSync(pointer)) atomicWrite(pointer, this.generation);
  }
  open() {
    const db = new DatabaseSync(path.join(this.directory, 'database.sqlite'));
    if (Number(db.prepare('PRAGMA user_version').get()!.user_version) > schemaVersion) {
      db.close();
      throw new Error('此数据由更新版本创建，请使用兼容的应用版本打开。');
    }
    db.exec(`PRAGMA trusted_schema=OFF; PRAGMA journal_mode=WAL; PRAGMA synchronous=FULL; PRAGMA foreign_keys=ON;
   CREATE TABLE IF NOT EXISTS projects(id TEXT PRIMARY KEY, name TEXT NOT NULL, color TEXT NOT NULL, archivedAt INTEGER);
   CREATE UNIQUE INDEX IF NOT EXISTS project_name ON projects(lower(name));
   CREATE TABLE IF NOT EXISTS tasks(id TEXT PRIMARY KEY, title TEXT NOT NULL, content TEXT NOT NULL, markdown TEXT NOT NULL, projectId TEXT REFERENCES projects(id), createdAt INTEGER NOT NULL, startedAt INTEGER NOT NULL, completedAt INTEGER, deletedAt INTEGER);
   CREATE INDEX IF NOT EXISTS task_project ON tasks(projectId);
   CREATE TABLE IF NOT EXISTS preferences(key TEXT PRIMARY KEY, value TEXT NOT NULL);
   `);
    initializeLedger(db);
    migrateSystemLedger(db);
    initializeDocuments(db);
    initializeVault(db);
    migrateWorkbench(db);
    db.exec(`PRAGMA user_version=${schemaVersion}`);
    this.ledger = new Ledger(db);
    this.documents = new Documents(db, this.ledger, (value) => this.validateDraft(value));
    return db;
  }
  get<T>(key: string, fallback: T): T {
    const row = this.db.prepare('SELECT value FROM preferences WHERE key=?').get(key);
    return row ? JSON.parse(row.value as string) : fallback;
  }
  set(key: string, value: unknown) {
    this.db
      .prepare(
        'INSERT INTO preferences VALUES(?,?) ON CONFLICT(key) DO UPDATE SET value=excluded.value',
      )
      .run(key, JSON.stringify(value));
  }
  settings(): Settings {
    return {
      theme: this.get('theme', 'system'),
      autoBackup: this.get('autoBackup', true),
      reduceTransparency: this.get('reduceTransparency', false),
      highContrast: this.get('highContrast', false),
      reduceMotion: this.get('reduceMotion', false),
      backupDir: this.get('backupDir', path.join(this.root, 'backups')),
      lastBackupAt: this.get('lastBackupAt', null),
      lastBackupError: this.get('lastBackupError', null),
    };
  }
  favorites() {
    const favorites = this.get<unknown>('favorites', []);
    validateFavorites(favorites);
    return favorites.filter((item) =>
      item.kind === 'tool'
        ? toolCatalog.some((tool) => tool.id === item.id)
        : this.db
            .prepare(
              `SELECT 1 FROM ${item.kind === 'system' ? 'systems' : item.kind === 'access' ? 'access_entries' : 'accounts'} WHERE id=?`,
            )
            .get(item.id),
    );
  }
  snapshot(): Snapshot {
    return {
      ...this.ledger.snapshot(),
      ...new WorkspaceLedger(this.db).snapshot(),
      favorites: this.favorites(),
      documents: this.documents.snapshot(),
      tasks: this.db
        .prepare(
          'SELECT id,title,projectId,systemId,environmentId,resourceId,createdAt,startedAt,completedAt,deletedAt,history FROM tasks',
        )
        .all() as unknown as TaskSummary[],
      projects: this.db
        .prepare('SELECT * FROM projects ORDER BY name COLLATE NOCASE')
        .all() as unknown as Project[],
      draft: this.get('draft', null),
      settings: this.settings(),
    };
  }
  task(id: string): Task {
    const row = this.db.prepare('SELECT * FROM tasks WHERE id=?').get(text(id));
    if (!row) throw new Error('任务不存在。');
    return { ...row, content: JSON.parse(row.content as string) } as unknown as Task;
  }
  document(id: string) {
    return this.documents.get(id);
  }
  globalSearch(query: string) {
    return searchWorkspace(this.db, this.ledger, query);
  }
  searchDocuments(query: string) {
    return this.documents.search(query);
  }
  project(id: string): Project {
    const row = this.db.prepare('SELECT * FROM projects WHERE id=?').get(text(id));
    if (!row) throw new Error('项目不存在。');
    return row as unknown as Project;
  }
  checkAssets(content: unknown) {
    for (const name of assetReferences(content))
      if (!fs.existsSync(path.join(this.directory, 'assets', name)))
        throw new Error('正文图片文件缺失。');
  }
  validateDraft(draft: Draft) {
    validateDraftFields(draft);
    this.checkAssets(draft.content);
    this.checkAssets(draft.markdown);
    if (draft.projectId !== null) this.project(draft.projectId);
    // Document context is checked by Documents, which can distinguish preserved historical context.
  }
  markChanged() {
    this.set('revision', this.get('revision', 0) + 1);
  }
  saveDraft(draft: Draft | null) {
    if (draft !== null) {
      const { environmentId, resourceId, ...taskDraft } = draft;
      draft = { ...taskDraft, projectId: null };
      this.ledger.resolveContext(draft);
      this.validateDraft(draft);
    }
    this.set('draft', draft);
    this.markChanged();
  }
  search(query: string): string[] {
    const escaped = text(query).replace(/[\\%_]/g, '\\$&');
    return this.db
      .prepare(
        "SELECT id FROM tasks WHERE deletedAt IS NULL AND (title LIKE ? ESCAPE '\\' OR markdown LIKE ? ESCAPE '\\')",
      )
      .all(`%${escaped}%`, `%${escaped}%`)
      .map((r) => r.id as string);
  }
  mutate(command: Command): MutationResult {
    if (!command || typeof command !== 'object') throw new Error('操作无效。');
    let createdId: string | undefined;
    this.db.exec('BEGIN IMMEDIATE');
    try {
      const now = minute();
      switch (command.type) {
        case 'scope.save':
        case 'node.save':
        case 'node.delete':
        case 'operation.save':
        case 'operation.delete':
        case 'environment.delete':
        case 'service.delete': {
          createdId = new WorkspaceLedger(this.db).mutate(command);
          break;
        }
        case 'access.save': {
          createdId = this.ledger.accessEntries.save(command, now);
          break;
        }
        case 'access.delete': {
          this.ledger.deleteAccess(command.id);
          this.set('favorites', this.favorites());
          break;
        }
        case 'access.copy': {
          createdId = this.ledger.copyAccess(command, now).id;
          break;
        }
        case 'favorite.set':
        case 'favorite.move': {
          if (!['system', 'account', 'access', 'tool'].includes(command.kind))
            throw new Error('常用对象类型无效。');
          if (command.kind === 'tool') {
            if (!toolCatalog.some((tool) => tool.id === command.id))
              throw new Error('工具不存在。');
          } else if (command.kind === 'system') this.ledger.system(command.id);
          else if (command.kind === 'access') this.ledger.accessEntries.get(command.id);
          else this.ledger.account(command.id);
          const favorites = this.favorites(),
            index = favorites.findIndex(
              (item) => item.kind === command.kind && item.id === command.id,
            );
          if (command.type === 'favorite.set') {
            if (typeof command.pinned !== 'boolean') throw new Error('常用状态无效。');
            if (command.pinned && index < 0) favorites.push({ kind: command.kind, id: command.id });
            if (!command.pinned && index >= 0) favorites.splice(index, 1);
          } else {
            if (![-1, 1].includes(command.direction) || index < 0)
              throw new Error('常用对象排序无效。');
            const target = Math.max(0, Math.min(favorites.length - 1, index + command.direction));
            [favorites[index], favorites[target]] = [favorites[target], favorites[index]];
          }
          validateFavorites(favorites);
          this.set('favorites', favorites);
          break;
        }
        case 'document.create':
        case 'document.edit':
        case 'document.delete':
        case 'document.restore':
        case 'document.purge': {
          createdId = this.documents.mutate(command, Date.now());
          break;
        }
        case 'account.save': {
          createdId = this.ledger.saveAccount(command, now);
          break;
        }
        case 'account.copy': {
          createdId = this.ledger.copyAccount(command, now);
          break;
        }
        case 'account.delete': {
          this.ledger.deleteAccount(command.id);
          this.set('favorites', this.favorites());
          break;
        }
        case 'resource.save': {
          const id = this.ledger.saveResource(command, now);
          if (!command.id) createdId = id;
          break;
        }
        case 'resource.copy': {
          createdId = this.ledger.copyResource(command, now).id;
          break;
        }
        case 'resource.delete': {
          this.ledger.deleteResource(command.id);
          break;
        }
        case 'environment.save': {
          const id = this.ledger.saveEnvironment(command, now);
          if (!command.id) createdId = id;
          break;
        }
        case 'service.save': {
          const id = this.ledger.saveService(command, now);
          if (!command.id) createdId = id;
          break;
        }
        case 'deployment.save': {
          createdId = this.ledger.saveDeployment(command);
          const legacy = this.db.prepare('SELECT * FROM deployments WHERE id=?').get(createdId)!;
          this.db
            .prepare(
              "INSERT OR IGNORE INTO deployment_nodes(id,serviceId,environmentId,name,serverId,address,port,notes,mode,count) SELECT id,serviceId,environmentId,'原部署节点',NULL,address,port,notes,'fixed','' FROM deployments WHERE id=?",
            )
            .run(createdId);
          new WorkspaceLedger(this.db).saveNode({
            id: createdId,
            serviceId: command.serviceId,
            environmentId: command.environmentId,
            name: '原部署节点',
            serverId: null,
            address: String(legacy.address),
            port: String(legacy.port),
            notes: String(legacy.notes),
            mode: 'fixed',
            count: '',
          });
          break;
        }
        case 'system.save': {
          const id = this.ledger.saveSystem(command, now);
          if (!command.id) createdId = id;
          break;
        }
        case 'task.create': {
          const systemId =
            command.draft.systemId === undefined
              ? this.ledger.resolveContext(command.draft).systemId
              : command.draft.systemId;
          const d = {
            ...command.draft,
            systemId,
            projectId: null,
            environmentId: null,
            resourceId: null,
          };
          this.validateDraft(d);
          const context = this.ledger.resolveContext(d);

          const start = d.startedAt ?? now;
          validateTimes(start, null);
          createdId = randomUUID();
          this.db
            .prepare(
              'INSERT INTO tasks(id,title,content,markdown,projectId,createdAt,startedAt,completedAt,deletedAt,systemId,environmentId,resourceId) VALUES(?,?,?,?,?,?,?,?,?,?,?,?)',
            )
            .run(
              createdId,
              title(d.title),
              JSON.stringify(d.content),
              d.markdown,
              d.projectId,
              now,
              start,
              null,
              null,
              context.systemId,
              context.environmentId,
              context.resourceId,
            );
          if (d.history)
            this.db.prepare('UPDATE tasks SET history=? WHERE id=?').run(d.history, createdId);
          if (command.consumeDraft !== undefined && typeof command.consumeDraft !== 'boolean')
            throw new Error('草稿处理方式无效。');
          if (command.consumeDraft !== false) this.set('draft', null);
          break;
        }
        case 'task.edit': {
          const old = this.task(command.id);
          if (old.deletedAt !== null) throw new Error('请先恢复此任务。');
          this.validateDraft({
            ...command,
            projectId: null,
            environmentId: null,
            resourceId: null,
          });
          this.db
            .prepare('UPDATE tasks SET title=?,content=?,markdown=?,projectId=? WHERE id=?')
            .run(
              title(command.title),
              JSON.stringify(command.content),
              command.markdown,
              null,
              command.id,
            );
          const context = this.ledger.resolveContext({
            systemId: command.systemId === undefined ? old.systemId : command.systemId,
            environmentId: null,
            resourceId: null,
          });
          this.db
            .prepare('UPDATE tasks SET systemId=?,environmentId=?,resourceId=? WHERE id=?')
            .run(context.systemId, context.environmentId, context.resourceId, command.id);
          break;
        }
        case 'task.assign-system': {
          if (!Array.isArray(command.ids) || !command.ids.length || command.ids.length > 1000)
            throw new Error('请选择 1 至 1000 条任务。');
          const context = this.ledger.resolveContext({
            systemId: command.systemId,
            environmentId: null,
            resourceId: null,
          });
          for (const id of new Set(command.ids)) {
            if (typeof id !== 'string' || this.task(id).deletedAt !== null)
              throw new Error('只能调整未删除的任务。');
            this.db.prepare('UPDATE tasks SET systemId=? WHERE id=?').run(context.systemId, id);
          }
          break;
        }
        case 'task.complete': {
          const old = this.task(command.id);
          if (typeof command.complete !== 'boolean' || old.deletedAt !== null)
            throw new Error('当前任务不能进行此操作。');
          if (command.complete === (old.completedAt !== null) && command.completedAt === undefined)
            break;
          const end = command.complete ? (command.completedAt ?? now) : null;
          validateTimes(old.startedAt, end);
          this.db.prepare('UPDATE tasks SET completedAt=? WHERE id=?').run(end, command.id);
          break;
        }
        case 'task.dates': {
          const old = this.task(command.id);
          if (
            old.deletedAt !== null ||
            (old.completedAt === null) !== (command.completedAt === null)
          )
            throw new Error('修改日期不能改变完成状态。');
          validateTimes(command.startedAt, command.completedAt);
          this.db
            .prepare('UPDATE tasks SET startedAt=?,completedAt=? WHERE id=?')
            .run(command.startedAt, command.completedAt, command.id);
          break;
        }
        case 'task.delete': {
          this.task(command.id);
          this.db
            .prepare('UPDATE tasks SET deletedAt=? WHERE id=? AND deletedAt IS NULL')
            .run(now, command.id);
          break;
        }
        case 'task.restore': {
          const old = this.task(command.id);
          if (old.deletedAt === null) break;
          this.db.prepare('UPDATE tasks SET deletedAt=NULL WHERE id=?').run(command.id);
          break;
        }
        case 'task.purge': {
          if (command.id !== undefined)
            this.db
              .prepare('DELETE FROM tasks WHERE id=? AND deletedAt IS NOT NULL')
              .run(text(command.id));
          else this.db.exec('DELETE FROM tasks WHERE deletedAt IS NOT NULL');
          break;
        }
        case 'project.create':
        case 'project.edit': {
          const name = title(command.name);
          if (!/^#[a-fA-F0-9]{6}$/.test(command.color)) throw new Error('项目颜色无效。');
          const duplicate = this.db
            .prepare('SELECT id FROM projects WHERE lower(name)=lower(?)')
            .get(name);
          if (duplicate && (command.type === 'project.create' || duplicate.id !== command.id))
            throw new Error('已有同名项目，请检查归档项目。');
          if (command.type === 'project.create') {
            createdId = randomUUID();
            this.db
              .prepare('INSERT INTO projects VALUES(?,?,?,NULL)')
              .run(createdId, name, command.color);
          } else {
            this.project(command.id);
            this.db
              .prepare('UPDATE projects SET name=?,color=? WHERE id=?')
              .run(name, command.color, command.id);
          }
          break;
        }
        case 'project.archive': {
          this.project(command.id);
          if (typeof command.archived !== 'boolean') throw new Error('项目状态无效。');
          this.db
            .prepare('UPDATE projects SET archivedAt=? WHERE id=?')
            .run(command.archived ? now : null, command.id);
          if (command.archived)
            this.db
              .prepare('UPDATE systems SET currentProjectId=NULL WHERE currentProjectId=?')
              .run(command.id);
          break;
        }
        case 'project.delete': {
          this.project(command.id);
          if (this.db.prepare('SELECT 1 FROM system_projects WHERE projectId=?').get(command.id))
            throw new Error('项目仍有关联系统，请使用归档。');
          if (
            Number(
              this.db.prepare('SELECT count(*) n FROM tasks WHERE projectId=?').get(command.id)!.n,
            ) > 0
          )
            throw new Error('项目仍有关联任务（包括回收站），请使用归档。');
          if (this.db.prepare('SELECT 1 FROM documents WHERE projectId=?').get(command.id))
            throw new Error('项目仍有关联文档（包括回收站），请使用归档。');
          const draft = this.get<Draft | null>('draft', null);
          if (draft?.projectId === command.id) this.set('draft', { ...draft, projectId: null });
          this.db.prepare('DELETE FROM projects WHERE id=?').run(command.id);
          break;
        }
        case 'settings': {
          for (const key of ['reduceTransparency', 'highContrast', 'reduceMotion'] as const) {
            if (command[key] !== undefined) {
              if (typeof command[key] !== 'boolean') throw new Error('外观偏好无效。');
              this.set(key, command[key]);
            }
          }
          if (command.theme !== undefined) {
            if (!['system', 'light', 'dark'].includes(command.theme)) throw new Error('主题无效。');
            this.set('theme', command.theme);
          }
          if (command.autoBackup !== undefined) {
            if (typeof command.autoBackup !== 'boolean') throw new Error('备份设置无效。');
            this.set('autoBackup', command.autoBackup);
          }
          break;
        }
        default:
          throw new Error('不支持的操作。');
      }
      this.markChanged();
      this.db.exec('COMMIT');
    } catch (error) {
      this.db.exec('ROLLBACK');
      throw error;
    }
    return { snapshot: this.snapshot(), createdId };
  }
  importImage(input: Uint8Array, name: string): Asset {
    if (!(input instanceof Uint8Array) || !input.length || input.length > 20 * 1024 * 1024)
      throw new Error('图片不能为空，单张不能超过 20 MB。');
    const b = Buffer.from(input);
    let ext: string | undefined;
    if (b.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]))) ext = 'png';
    else if (b[0] === 255 && b[1] === 216 && b[2] === 255) ext = 'jpg';
    else if (['GIF87a', 'GIF89a'].includes(b.subarray(0, 6).toString())) ext = 'gif';
    else if (b.subarray(0, 4).toString() === 'RIFF' && b.subarray(8, 12).toString() === 'WEBP')
      ext = 'webp';
    if (!ext) throw new Error('支持 PNG、JPEG、WebP 和 GIF 图片。');
    // shortcut: retain unreferenced files for editor undo; add explicit storage cleanup if needed.
    const filename = `${createHash('sha256').update(b).digest('hex')}.${ext}`;
    const target = path.join(this.directory, 'assets', filename);
    if (!fs.existsSync(target)) atomicWrite(target, b);
    return { src: `workbench-asset://image/${filename}`, name: text(name, 1000) };
  }
  close() {
    this.db.close();
  }
}
