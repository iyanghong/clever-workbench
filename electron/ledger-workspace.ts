import {
  ledgerFields,
  writeLedgerFields,
  validateOperationDate,
  documentIds,
  saveDocumentRefs,
} from './ledger-details';
import type { DatabaseSync } from 'node:sqlite';
import { randomUUID } from 'node:crypto';
import type {
  DeploymentNode,
  LedgerScope,
  Operation,
  ScopeInput,
  ScopeKind,
  WorkspaceLedgerCommand,
} from '../src/ledger-workspace-types';
import { scopeFor } from '../src/ledger-workspace-types';

const ownerTables = {
  resource: 'resources',
  access: 'access_entries',
  service: 'services',
  operation: 'operations',
} as const;
function text(value: unknown, max = 10000): string {
  if (typeof value !== 'string' || value.length > max) throw new Error('台账字段无效或过长。');
  return value;
}
function name(value: unknown) {
  const result = text(value, 1000).trim();
  if (!result) throw new Error('请填写名称。');
  return result;
}
function ids(value: unknown, max = 100): string[] {
  if (!Array.isArray(value) || value.length > max) throw new Error('范围或标签格式无效。');
  const result = value.map((v) => name(v));
  if (new Set(result).size !== result.length) throw new Error('范围或标签不能重复。');
  return result;
}
function port(value: unknown) {
  const result = text(value, 8);
  if (result && (!/^\d+$/.test(result) || +result < 1 || +result > 65535))
    throw new Error('端口应在 1 到 65535 之间。');
  return result;
}
function status(value: unknown) {
  if (!['active', 'inactive', 'unverified'].includes(String(value))) throw new Error('状态无效。');
  return value as Operation['status'];
}
export function initializeWorkspaceLedger(db: DatabaseSync) {
  db.exec(
    'CREATE TABLE IF NOT EXISTS ledger_batches(token TEXT PRIMARY KEY,createdId TEXT NOT NULL,createdAt INTEGER NOT NULL)',
  );
  db.exec(`CREATE TABLE IF NOT EXISTS ledger_scopes(kind TEXT NOT NULL,ownerId TEXT NOT NULL,systemId TEXT NOT NULL REFERENCES systems(id),environmentIds TEXT NOT NULL,tags TEXT NOT NULL,status TEXT NOT NULL,statusNotes TEXT NOT NULL,PRIMARY KEY(kind,ownerId));
  CREATE TABLE IF NOT EXISTS deployment_nodes(id TEXT PRIMARY KEY,serviceId TEXT NOT NULL REFERENCES services(id),environmentId TEXT NOT NULL REFERENCES environments(id),name TEXT NOT NULL,serverId TEXT REFERENCES resources(id),address TEXT NOT NULL,port TEXT NOT NULL,notes TEXT NOT NULL,mode TEXT NOT NULL,count TEXT NOT NULL);
  CREATE TABLE IF NOT EXISTS operations(id TEXT PRIMARY KEY,systemId TEXT NOT NULL REFERENCES systems(id),environmentId TEXT REFERENCES environments(id),serviceId TEXT REFERENCES services(id),resourceId TEXT REFERENCES resources(id),documentId TEXT REFERENCES documents(id),name TEXT NOT NULL,kind TEXT NOT NULL,frequency TEXT NOT NULL,status TEXT NOT NULL,notes TEXT NOT NULL);`);
  db.exec(
    `INSERT OR IGNORE INTO deployment_nodes(id,serviceId,environmentId,name,serverId,address,port,notes,mode,count) SELECT id,serviceId,environmentId,'原部署节点',NULL,address,port,notes,'fixed','' FROM deployments;`,
  );
}
export class WorkspaceLedger {
  constructor(private db: DatabaseSync) {}
  private get(table: string, id: string) {
    const item = this.db.prepare(`SELECT * FROM ${table} WHERE id=?`).get(text(id, 100));
    if (!item) throw new Error('关联对象不存在。');
    return item;
  }
  private owned(table: string, id: string, systemId: string) {
    const item = this.get(table, id);
    if (item.systemId !== systemId) throw new Error('关联对象必须属于同一系统。');
    return item;
  }
  scopes(): LedgerScope[] {
    return this.db
      .prepare('SELECT * FROM ledger_scopes')
      .all()
      .map((r) => ({
        ...r,
        environmentIds: ids(JSON.parse(String(r.environmentIds))),
        tags: ids(JSON.parse(String(r.tags)), 30),
      })) as LedgerScope[];
  }
  snapshot() {
    return {
      scopes: this.scopes(),
      deploymentNodes: this.db
        .prepare('SELECT * FROM deployment_nodes ORDER BY rowid')
        .all()
        .map((r) => ({
          ...r,
          fields: ledgerFields(JSON.parse(String(r.fields))),
          documentIds: documentIds(this.db, 'node', String(r.id)),
        })) as unknown as DeploymentNode[],
      operations: this.db
        .prepare('SELECT * FROM operations ORDER BY rowid')
        .all()
        .map((r) => ({
          ...r,
          fields: ledgerFields(JSON.parse(String(r.fields))),
        })) as unknown as Operation[],
    };
  }
  saveScope(kind: ScopeKind, ownerId: string, input: ScopeInput) {
    if (!Object.hasOwn(ownerTables, kind)) throw new Error('范围类型无效。');
    const owner = this.get(ownerTables[kind], ownerId),
      systemId = String(owner.systemId);
    const environmentIds =
        kind === 'operation'
          ? owner.environmentId
            ? [String(owner.environmentId)]
            : []
          : ids(input.environmentIds),
      tags = ids(input.tags, 30);
    if (tags.some((tag) => tag.length > 80)) throw new Error('标签最多 80 个字符。');

    for (const id of environmentIds) this.owned('environments', id, systemId);
    const state = status(input.status ?? 'active'),
      statusNotes = text(input.statusNotes ?? '', 100000);
    const scopes = this.scopes();
    for (const other of this.db
      .prepare(
        `SELECT * FROM ${ownerTables[kind]} WHERE systemId=? AND lower(name)=lower(?) AND id<>?`,
      )
      .all(systemId, owner.name, ownerId)) {
      const scope = scopeFor(scopes, kind, String(other.id), other.environmentId as string | null);
      if (
        !scope.environmentIds.length ||
        !environmentIds.length ||
        environmentIds.some((e) => scope.environmentIds.includes(e))
      )
        throw new Error('适用范围内有同名记录，请补充区分名称。');
    }
    this.db
      .prepare(
        'INSERT INTO ledger_scopes VALUES(?,?,?,?,?,?,?) ON CONFLICT(kind,ownerId) DO UPDATE SET environmentIds=excluded.environmentIds,tags=excluded.tags,status=excluded.status,statusNotes=excluded.statusNotes',
      )
      .run(
        kind,
        ownerId,
        systemId,
        JSON.stringify(environmentIds),
        JSON.stringify(tags),
        state,
        statusNotes,
      );
    // Keep the legacy single-environment column as a compatibility anchor, not a second scope.
    if (kind === 'resource' || kind === 'access') {
      const primary = environmentIds[0] ?? null;
      this.db
        .prepare(`UPDATE ${ownerTables[kind]} SET environmentId=? WHERE id=?`)
        .run(primary, ownerId);
      this.db
        .prepare(
          `UPDATE accounts SET environmentId=? WHERE ${kind === 'resource' ? 'resourceId' : 'accessId'}=?`,
        )
        .run(primary, ownerId);
    }
    return ownerId;
  }
  saveNode(input: Omit<DeploymentNode, 'id'> & { id?: string }) {
    const service = this.get('services', input.serviceId),
      systemId = String(service.systemId);
    this.owned('environments', input.environmentId, systemId);
    if (input.id) {
      const old = this.get('deployment_nodes', input.id);
      if (old.serviceId !== input.serviceId) throw new Error('部署节点不能移动到其他服务。');
    }
    if (input.serverId && this.owned('resources', input.serverId, systemId).kind !== 'server')
      throw new Error('请选择服务器。');
    if (!['fixed', 'scheduled'].includes(input.mode)) throw new Error('部署方式无效。');
    const title = name(input.name),
      id = input.id ?? randomUUID();
    if (
      this.db
        .prepare(
          'SELECT 1 FROM deployment_nodes WHERE serviceId=? AND environmentId=? AND lower(name)=lower(?) AND id<>?',
        )
        .get(input.serviceId, input.environmentId, title, id)
    )
      throw new Error('已有同名部署节点。');
    this.db
      .prepare(
        `INSERT INTO deployment_nodes(id,serviceId,environmentId,name,serverId,address,port,notes,mode,count) VALUES(?,?,?,?,?,?,?,?,?,?) ON CONFLICT(id) DO UPDATE SET environmentId=excluded.environmentId,name=excluded.name,serverId=excluded.serverId,address=excluded.address,port=excluded.port,notes=excluded.notes,mode=excluded.mode,count=excluded.count`,
      )
      .run(
        id,
        input.serviceId,
        input.environmentId,
        title,
        input.serverId,
        text(input.address),
        port(input.port),
        text(input.notes, 100000),
        input.mode,
        text(input.count, 100),
      );
    if (input.fields !== undefined)
      this.db
        .prepare('UPDATE deployment_nodes SET fields=? WHERE id=?')
        .run(
          JSON.stringify(
            writeLedgerFields(
              input.fields,
              ledgerFields(JSON.parse(String(this.get('deployment_nodes', id).fields))),
            ),
          ),
          id,
        );
    saveDocumentRefs(this.db, 'node', id, systemId, input.documentIds);
    return id;
  }
  saveOperation(input: Omit<Operation, 'id'> & { id?: string }) {
    this.get('systems', input.systemId);
    if (input.id && this.get('operations', input.id).systemId !== input.systemId)
      throw new Error('运维记录不能移动到其他系统。');
    if (input.serviceId && input.resourceId) throw new Error('运维记录只关联一个服务或资源。');
    for (const [table, id] of [
      ['environments', input.environmentId],
      ['services', input.serviceId],
      ['resources', input.resourceId],
      ['documents', input.documentId],
    ])
      if (id) {
        const record = this.owned(table!, id, input.systemId);
        if (table === 'documents' && record.deletedAt !== null)
          throw new Error('请先恢复关联文档。');
      }
    if (!['job', 'backup'].includes(input.kind)) throw new Error('运维类型无效。');
    const id = input.id ?? randomUUID(),
      title = name(input.name);
    if (
      this.db
        .prepare(
          'SELECT 1 FROM operations WHERE systemId=? AND environmentId IS ? AND lower(name)=lower(?) AND id<>?',
        )
        .get(input.systemId, input.environmentId, title, id)
    )
      throw new Error('已有同名运维记录。');
    this.db
      .prepare(
        `INSERT INTO operations(id,systemId,environmentId,serviceId,resourceId,documentId,name,kind,frequency,status,notes) VALUES(?,?,?,?,?,?,?,?,?,?,?) ON CONFLICT(id) DO UPDATE SET environmentId=excluded.environmentId,serviceId=excluded.serviceId,resourceId=excluded.resourceId,documentId=excluded.documentId,name=excluded.name,kind=excluded.kind,frequency=excluded.frequency,status=excluded.status,notes=excluded.notes`,
      )
      .run(
        id,
        input.systemId,
        input.environmentId,
        input.serviceId,
        input.resourceId,
        input.documentId,
        title,
        input.kind,
        text(input.frequency, 1000),
        status(input.status),
        text(input.notes, 100000),
      );
    if (input.fields !== undefined) {
      const fields = writeLedgerFields(
        input.fields,
        ledgerFields(JSON.parse(String(this.get('operations', id).fields))),
      );
      validateOperationDate(fields);
      this.db.prepare('UPDATE operations SET fields=? WHERE id=?').run(JSON.stringify(fields), id);
    }
    const scope = this.scopes().find((s) => s.kind === 'operation' && s.ownerId === id);
    if (scope)
      this.saveScope('operation', id, {
        ...scope,
        environmentIds: input.environmentId ? [input.environmentId] : [],
      });
    return id;
  }
  mutate(command: WorkspaceLedgerCommand) {
    if (command.type === 'scope.save')
      return this.saveScope(command.kind, command.ownerId, command.scope);
    if (command.type === 'node.save') return this.saveNode(command.value);
    if (command.type === 'operation.save') return this.saveOperation(command.value);
    if (command.type === 'node.delete') {
      this.get('deployment_nodes', command.id);
      this.db
        .prepare("DELETE FROM ledger_document_refs WHERE ownerKind='node' AND ownerId=?")
        .run(command.id);
      this.db.prepare('DELETE FROM deployment_nodes WHERE id=?').run(command.id);
      this.db.prepare('DELETE FROM deployments WHERE id=?').run(command.id);
      return;
    }
    if (command.type === 'operation.delete') {
      this.get('operations', command.id);
      this.db
        .prepare('DELETE FROM ledger_scopes WHERE kind=? AND ownerId=?')
        .run('operation', command.id);
      this.db.prepare('DELETE FROM operations WHERE id=?').run(command.id);
      return;
    }
    if (command.type === 'environment.delete') {
      this.get('environments', command.id);
      if (this.scopes().some((s) => s.environmentIds.includes(command.id)))
        throw new Error('环境仍被使用，请先调整适用范围。');
      try {
        this.db.prepare('DELETE FROM environments WHERE id=?').run(command.id);
      } catch {
        throw new Error('环境仍有关联资料，请先处理引用。');
      }
      return;
    }
    if (command.type === 'service.delete') {
      this.get('services', command.id);
      try {
        this.db
          .prepare("DELETE FROM ledger_document_refs WHERE ownerKind='service' AND ownerId=?")
          .run(command.id);
        this.db.prepare('DELETE FROM services WHERE id=?').run(command.id);
        this.db
          .prepare("DELETE FROM ledger_scopes WHERE kind='service' AND ownerId=?")
          .run(command.id);
      } catch {
        throw new Error('服务仍有部署节点或运维记录，请先处理引用。');
      }
    }
  }
  validate() {
    // Reuse write validation inside the caller's isolated backup transaction.
    for (const scope of this.scopes()) {
      if (
        !Object.hasOwn(ownerTables, scope.kind) ||
        this.get(ownerTables[scope.kind], scope.ownerId).systemId !== scope.systemId
      )
        throw new Error('备份范围归属无效。');
      for (const id of scope.environmentIds) this.owned('environments', id, scope.systemId);
      status(scope.status ?? 'active');
      text(scope.statusNotes ?? '', 100000);
    }
    for (const row of this.snapshot().deploymentNodes) this.saveNode(row);
    for (const row of this.snapshot().operations) this.saveOperation(row);
  }
}
