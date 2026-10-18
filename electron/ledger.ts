import type { DatabaseSync } from 'node:sqlite';
import { randomUUID } from 'node:crypto';
import type {
  LedgerCommand,
  SystemProject,
  SystemRecord,
  EnvironmentRecord,
  ServiceRecord,
  DeploymentRecord,
  ResourceRecord,
  AccountRecord,
  ObjectContext,
} from '../src/ledger-types';

function field(value: unknown, max: number) {
  if (typeof value !== 'string' || value.length > max) throw new Error('台账内容无效或过长。');
  return value;
}

function resourceFields(value: unknown): Record<string, string> {
  if (!value || typeof value !== 'object' || Array.isArray(value) || Object.keys(value).length > 50)
    throw new Error('附加字段格式无效，最多支持 50 项。');
  const result: Record<string, string> = {};
  for (const [key, item] of Object.entries(value)) {
    if (!key.trim() || key.length > 80 || ['__proto__', 'prototype', 'constructor'].includes(key))
      throw new Error('附加字段名称无效。');
    result[key] = field(item, 3000);
  }
  return result;
}
function resourceRow(row: Record<string, unknown>): ResourceRecord {
  return {
    ...row,
    fields: resourceFields(JSON.parse(field(row.fields, 200_000))),
  } as ResourceRecord;
}

export function initializeLedger(db: DatabaseSync) {
  db.exec(`
    CREATE TABLE IF NOT EXISTS systems(
      id TEXT PRIMARY KEY, name TEXT NOT NULL, notes TEXT NOT NULL, url TEXT NOT NULL,
      currentProjectId TEXT REFERENCES projects(id), createdAt INTEGER NOT NULL, updatedAt INTEGER NOT NULL
    );
    CREATE TABLE IF NOT EXISTS system_projects(
      systemId TEXT NOT NULL REFERENCES systems(id), projectId TEXT NOT NULL REFERENCES projects(id),
      linkedAt INTEGER NOT NULL, PRIMARY KEY(systemId, projectId)
    );
    CREATE TABLE IF NOT EXISTS environments(
      id TEXT PRIMARY KEY, systemId TEXT NOT NULL REFERENCES systems(id), name TEXT NOT NULL,
      notes TEXT NOT NULL, createdAt INTEGER NOT NULL, UNIQUE(systemId,name)
    );
    CREATE TABLE IF NOT EXISTS services(
      id TEXT PRIMARY KEY, systemId TEXT NOT NULL REFERENCES systems(id), name TEXT NOT NULL,
      repository TEXT NOT NULL, notes TEXT NOT NULL, createdAt INTEGER NOT NULL, UNIQUE(systemId,name)
    );
    CREATE TABLE IF NOT EXISTS deployments(
      id TEXT PRIMARY KEY, serviceId TEXT NOT NULL REFERENCES services(id), environmentId TEXT NOT NULL REFERENCES environments(id),
      address TEXT NOT NULL, port TEXT NOT NULL, notes TEXT NOT NULL, UNIQUE(serviceId,environmentId)
    );
    CREATE TABLE IF NOT EXISTS resources(
      id TEXT PRIMARY KEY, environmentId TEXT NOT NULL REFERENCES environments(id), kind TEXT NOT NULL,
      name TEXT NOT NULL, address TEXT NOT NULL, port TEXT NOT NULL, notes TEXT NOT NULL, fields TEXT NOT NULL,
      createdAt INTEGER NOT NULL, updatedAt INTEGER NOT NULL, UNIQUE(environmentId,name)
    );
    CREATE TABLE IF NOT EXISTS accounts(
      id TEXT PRIMARY KEY, environmentId TEXT NOT NULL REFERENCES environments(id), resourceId TEXT REFERENCES resources(id),
      name TEXT NOT NULL, username TEXT NOT NULL, notes TEXT NOT NULL, createdAt INTEGER NOT NULL, updatedAt INTEGER NOT NULL
    );
  `);
  if (
    !db
      .prepare('PRAGMA table_info(tasks)')
      .all()
      .some((column) => column.name === 'systemId')
  ) {
    db.exec('ALTER TABLE tasks ADD COLUMN systemId TEXT REFERENCES systems(id)');
  }
}

export class Ledger {
  constructor(private db: DatabaseSync) {}
  system(id: string): SystemRecord {
    const row = this.db.prepare('SELECT * FROM systems WHERE id=?').get(field(id, 100));
    if (!row) throw new Error('系统不存在。');
    return row as unknown as SystemRecord;
  }
  snapshot() {
    return {
      accounts: this.db
        .prepare('SELECT * FROM accounts ORDER BY createdAt,rowid')
        .all()
        .map((row) => ({
          ...row,
          secretKinds: this.db
            .prepare('SELECT kind FROM secrets WHERE accountId=? ORDER BY kind')
            .all(row.id)
            .map((secret) => secret.kind),
        })) as unknown as AccountRecord[],
      resources: this.db
        .prepare('SELECT * FROM resources ORDER BY createdAt,rowid')
        .all()
        .map(resourceRow),
      environments: this.db
        .prepare('SELECT * FROM environments ORDER BY createdAt,rowid')
        .all() as unknown as EnvironmentRecord[],
      services: this.db
        .prepare('SELECT * FROM services ORDER BY createdAt,rowid')
        .all() as unknown as ServiceRecord[],
      deployments: this.db
        .prepare('SELECT * FROM deployments ORDER BY rowid')
        .all() as unknown as DeploymentRecord[],
      systems: this.db
        .prepare('SELECT * FROM systems ORDER BY createdAt, rowid')
        .all() as unknown as SystemRecord[],
      systemProjects: this.db
        .prepare('SELECT * FROM system_projects ORDER BY linkedAt, rowid')
        .all() as unknown as SystemProject[],
    };
  }
  saveSystem(command: Extract<LedgerCommand, { type: 'system.save' }>, now: number): string {
    const existing = command.id ? this.system(command.id) : null;
    const name = field(command.name, 1000).trim();
    if (!name) throw new Error('请填写系统名称。');
    const notes = field(command.notes ?? existing?.notes ?? '', 100_000);
    const url = field(command.url ?? existing?.url ?? '', 10_000).trim();
    if (url && !/^https?:\/\//i.test(url))
      throw new Error('系统链接应以 http:// 或 https:// 开头。');
    const projectId =
      command.projectId === undefined ? (existing?.currentProjectId ?? null) : command.projectId;
    if (projectId !== null) {
      const project = this.db
        .prepare('SELECT archivedAt FROM projects WHERE id=?')
        .get(field(projectId, 100));
      if (!project) throw new Error('项目不存在。');
      if (project.archivedAt !== null) throw new Error('请先恢复项目，再将它设为当前项目。');
    }
    const id = existing?.id ?? randomUUID();
    this.db
      .prepare(
        `INSERT INTO systems VALUES(?,?,?,?,?,?,?)
      ON CONFLICT(id) DO UPDATE SET name=excluded.name,notes=excluded.notes,url=excluded.url,
      currentProjectId=excluded.currentProjectId,updatedAt=excluded.updatedAt`,
      )
      .run(id, name, notes, url, projectId, existing?.createdAt ?? now, now);
    if (projectId !== null)
      this.db
        .prepare('INSERT OR IGNORE INTO system_projects VALUES(?,?,?)')
        .run(id, projectId, now);
    return id;
  }
  environment(id: string): EnvironmentRecord {
    const row = this.db.prepare('SELECT * FROM environments WHERE id=?').get(field(id, 100));
    if (!row) throw new Error('环境不存在。');
    return row as unknown as EnvironmentRecord;
  }
  service(id: string): ServiceRecord {
    const row = this.db.prepare('SELECT * FROM services WHERE id=?').get(field(id, 100));
    if (!row) throw new Error('服务不存在。');
    return row as unknown as ServiceRecord;
  }
  saveEnvironment(command: Extract<LedgerCommand, { type: 'environment.save' }>, now: number) {
    this.system(command.systemId);
    const previous = command.id ? this.environment(command.id) : null;
    if (previous && previous.systemId !== command.systemId)
      throw new Error('已有环境不能移动到其他系统。');
    const name = field(command.name, 1000).trim();
    if (!name) throw new Error('请填写环境名称。');
    const duplicate = this.db
      .prepare('SELECT id FROM environments WHERE systemId=? AND lower(name)=lower(?)')
      .get(command.systemId, name);
    if (duplicate && duplicate.id !== previous?.id) throw new Error('这个系统中已有同名环境。');
    const id = previous?.id ?? randomUUID();
    this.db
      .prepare(
        `INSERT INTO environments VALUES(?,?,?,?,?) ON CONFLICT(id) DO UPDATE SET name=excluded.name,notes=excluded.notes`,
      )
      .run(
        id,
        command.systemId,
        name,
        field(command.notes ?? previous?.notes ?? '', 100_000),
        previous?.createdAt ?? now,
      );
    return id;
  }
  saveService(command: Extract<LedgerCommand, { type: 'service.save' }>, now: number) {
    this.system(command.systemId);
    const previous = command.id ? this.service(command.id) : null;
    if (previous && previous.systemId !== command.systemId)
      throw new Error('已有服务不能移动到其他系统。');
    const name = field(command.name, 1000).trim();
    if (!name) throw new Error('请填写服务名称。');
    const duplicate = this.db
      .prepare('SELECT id FROM services WHERE systemId=? AND lower(name)=lower(?)')
      .get(command.systemId, name);
    if (duplicate && duplicate.id !== previous?.id) throw new Error('这个系统中已有同名服务。');
    const id = previous?.id ?? randomUUID();
    this.db
      .prepare(
        `INSERT INTO services VALUES(?,?,?,?,?,?) ON CONFLICT(id) DO UPDATE SET name=excluded.name,repository=excluded.repository,notes=excluded.notes`,
      )
      .run(
        id,
        command.systemId,
        name,
        field(command.repository ?? previous?.repository ?? '', 10_000),
        field(command.notes ?? previous?.notes ?? '', 100_000),
        previous?.createdAt ?? now,
      );
    return id;
  }
  saveDeployment(command: Extract<LedgerCommand, { type: 'deployment.save' }>) {
    const service = this.service(command.serviceId),
      environment = this.environment(command.environmentId);
    if (service.systemId !== environment.systemId)
      throw new Error('服务与部署环境必须属于同一系统。');
    const previous = this.db
      .prepare('SELECT * FROM deployments WHERE serviceId=? AND environmentId=?')
      .get(service.id, environment.id) as DeploymentRecord | undefined;
    const address = field(command.address ?? previous?.address ?? '', 10_000).trim();
    const port = field(command.port ?? previous?.port ?? '', 8).trim();
    if (port && (!/^\d+$/.test(port) || Number(port) < 1 || Number(port) > 65535))
      throw new Error('端口应为 1 到 65535，或留空。');
    const id = previous?.id ?? randomUUID();
    this.db
      .prepare(
        `INSERT INTO deployments VALUES(?,?,?,?,?,?) ON CONFLICT(serviceId,environmentId) DO UPDATE SET address=excluded.address,port=excluded.port,notes=excluded.notes`,
      )
      .run(
        id,
        service.id,
        environment.id,
        address,
        port,
        field(command.notes ?? previous?.notes ?? '', 100_000),
      );
    return id;
  }
  resolveContext(input: Partial<ObjectContext>): ObjectContext {
    const resourceId = input.resourceId ?? null;
    const resource = resourceId ? this.resource(resourceId) : null;
    if (
      resource &&
      input.environmentId !== undefined &&
      input.environmentId !== resource.environmentId
    )
      throw new Error('资源与背景环境不一致。');
    const environmentId = resource?.environmentId ?? input.environmentId ?? null;
    const environment = environmentId ? this.environment(environmentId) : null;
    if (environment && input.systemId !== undefined && input.systemId !== environment.systemId)
      throw new Error('环境与背景系统不一致。');
    const systemId = environment?.systemId ?? input.systemId ?? null;
    if (systemId) this.system(systemId);
    return { systemId, environmentId, resourceId };
  }
  account(id: string): AccountRecord {
    const row = this.db.prepare('SELECT * FROM accounts WHERE id=?').get(field(id, 100));
    if (!row) throw new Error('账号不存在。');
    return row as unknown as AccountRecord;
  }
  accountTarget(environmentId: string, resourceId: string | null) {
    const environment = this.environment(environmentId);
    if (resourceId !== null && this.resource(resourceId).environmentId !== environmentId)
      throw new Error('账号与资源必须属于同一环境。');
    return environment;
  }
  saveAccount(command: Extract<LedgerCommand, { type: 'account.save' }>, now: number) {
    const previous = command.id ? this.account(command.id) : null;
    const resourceId =
      command.resourceId === undefined ? (previous?.resourceId ?? null) : command.resourceId;
    const environment = this.accountTarget(command.environmentId, resourceId);
    if (previous && this.environment(previous.environmentId).systemId !== environment.systemId)
      throw new Error('账号的归属必须在同一系统内调整。');
    const name = field(command.name, 1000).trim();
    if (!name) throw new Error('请填写账号用途或角色。');
    const duplicate = this.db
      .prepare(
        'SELECT id FROM accounts WHERE environmentId=? AND resourceId IS ? AND lower(name)=lower(?)',
      )
      .get(environment.id, resourceId, name);
    if (duplicate && duplicate.id !== previous?.id)
      throw new Error('这个归属下已有同名账号，请使用不同的用途或角色。');
    const id = previous?.id ?? randomUUID();
    this.db
      .prepare(
        `INSERT INTO accounts VALUES(?,?,?,?,?,?,?,?) ON CONFLICT(id) DO UPDATE SET
      environmentId=excluded.environmentId,resourceId=excluded.resourceId,name=excluded.name,username=excluded.username,notes=excluded.notes,updatedAt=excluded.updatedAt`,
      )
      .run(
        id,
        environment.id,
        resourceId,
        name,
        field(command.username ?? previous?.username ?? '', 10_000),
        field(command.notes ?? previous?.notes ?? '', 100_000),
        previous?.createdAt ?? now,
        now,
      );
    return id;
  }
  copyAccount(command: Extract<LedgerCommand, { type: 'account.copy' }>, now: number) {
    const source = this.account(command.id),
      environmentId = command.environmentId ?? source.environmentId;
    const resourceId = command.resourceId === undefined ? source.resourceId : command.resourceId;
    if (
      this.environment(source.environmentId).systemId !== this.environment(environmentId).systemId
    )
      throw new Error('账号副本请选择同一系统内的归属。');
    let name = command.name ?? `${source.name.slice(0, 960)} 副本`;
    if (command.name === undefined) {
      let index = 2;
      while (
        this.db
          .prepare(
            'SELECT 1 FROM accounts WHERE environmentId=? AND resourceId IS ? AND lower(name)=lower(?)',
          )
          .get(environmentId, resourceId, name)
      )
        name = `${source.name.slice(0, 960)} 副本 ${index++}`;
    }
    // Copy only explicitly listed metadata. Vault contents use a separate authenticated operation.
    return this.saveAccount(
      {
        type: 'account.save',
        environmentId,
        resourceId,
        name,
        username: source.username,
        notes: source.notes,
      },
      now,
    );
  }
  deleteAccount(id: string) {
    this.account(id);
    try {
      this.db.prepare('DELETE FROM accounts WHERE id=?').run(id);
    } catch (cause) {
      if (cause instanceof Error && cause.message.includes('FOREIGN KEY'))
        throw new Error('账号仍有关联资料，请先处理引用。');
      throw cause;
    }
  }
  resource(id: string): ResourceRecord {
    const row = this.db.prepare('SELECT * FROM resources WHERE id=?').get(field(id, 100));
    if (!row) throw new Error('资源不存在。');
    return resourceRow(row);
  }
  saveResource(command: Extract<LedgerCommand, { type: 'resource.save' }>, now: number) {
    this.environment(command.environmentId);
    const previous = command.id ? this.resource(command.id) : null;
    if (previous && previous.environmentId !== command.environmentId)
      throw new Error('已有资源的环境不能直接改变，请复制为新资源。');
    if (!['redis', 'server', 'other'].includes(command.kind)) throw new Error('资源类型无效。');
    const name = field(command.name, 1000).trim();
    if (!name) throw new Error('请填写资源名称。');
    const duplicate = this.db
      .prepare('SELECT id FROM resources WHERE environmentId=? AND lower(name)=lower(?)')
      .get(command.environmentId, name);
    if (duplicate && duplicate.id !== previous?.id) throw new Error('这个环境中已有同名资源。');
    const address = field(command.address ?? previous?.address ?? '', 10_000).trim();
    const port = field(command.port ?? previous?.port ?? '', 8).trim();
    if (port && (!/^\d+$/.test(port) || Number(port) < 1 || Number(port) > 65535))
      throw new Error('端口应为 1 到 65535，或留空。');
    const fields = resourceFields(command.fields ?? previous?.fields ?? {});
    const id = previous?.id ?? randomUUID();
    this.db
      .prepare(
        `INSERT INTO resources VALUES(?,?,?,?,?,?,?,?,?,?) ON CONFLICT(id) DO UPDATE SET
      kind=excluded.kind,name=excluded.name,address=excluded.address,port=excluded.port,notes=excluded.notes,fields=excluded.fields,updatedAt=excluded.updatedAt`,
      )
      .run(
        id,
        command.environmentId,
        command.kind,
        name,
        address,
        port,
        field(command.notes ?? previous?.notes ?? '', 100_000),
        JSON.stringify(fields),
        previous?.createdAt ?? now,
        now,
      );
    return id;
  }
  copyResource(command: Extract<LedgerCommand, { type: 'resource.copy' }>, now: number) {
    const source = this.resource(command.id),
      environmentId = command.environmentId ?? source.environmentId;
    let name = command.name ?? `${source.name.slice(0, 960)} 副本`;
    if (command.name === undefined) {
      let index = 2;
      while (
        this.db
          .prepare('SELECT 1 FROM resources WHERE environmentId=? AND lower(name)=lower(?)')
          .get(environmentId, name)
      )
        name = `${source.name.slice(0, 960)} 副本 ${index++}`;
    }
    return this.saveResource(
      {
        type: 'resource.save',
        environmentId,
        kind: source.kind,
        name,
        address: source.address,
        port: source.port,
        notes: source.notes,
        fields: source.fields,
      },
      now,
    );
  }
  deleteResource(id: string) {
    this.resource(id);
    try {
      this.db.prepare('DELETE FROM resources WHERE id=?').run(id);
    } catch (cause) {
      if (cause instanceof Error && cause.message.includes('FOREIGN KEY'))
        throw new Error('资源仍有关联资料，请先处理引用。');
      throw cause;
    }
  }
}

export function validateLedger(db: DatabaseSync) {
  const ledger = new Ledger(db);
  for (const row of db.prepare('SELECT * FROM accounts').all()) {
    ledger.accountTarget(
      field(row.environmentId, 100),
      row.resourceId === null ? null : field(row.resourceId, 100),
    );
    if (!field(row.name, 1000).trim()) throw new Error('备份账号用途无效。');
    field(row.username, 10_000);
    field(row.notes, 100_000);
  }
  for (const raw of db.prepare('SELECT * FROM resources').all()) {
    const row = resourceRow(raw);
    ledger.environment(field(row.environmentId, 100));
    if (!field(row.name, 1000).trim() || !['redis', 'server', 'other'].includes(row.kind))
      throw new Error('备份资源信息无效。');
    field(row.address, 10_000);
    field(row.notes, 100_000);
    const port = field(row.port, 8);
    if (port && (!/^\d+$/.test(port) || Number(port) < 1 || Number(port) > 65535))
      throw new Error('备份资源端口无效。');
  }
  for (const row of db.prepare('SELECT * FROM environments').all()) {
    ledger.system(field(row.systemId, 100));
    if (!field(row.name, 1000).trim()) throw new Error('备份环境名称无效。');
    field(row.notes, 100_000);
  }
  for (const row of db.prepare('SELECT * FROM services').all()) {
    ledger.system(field(row.systemId, 100));
    if (!field(row.name, 1000).trim()) throw new Error('备份服务名称无效。');
    field(row.repository, 10_000);
    field(row.notes, 100_000);
  }
  for (const row of db.prepare('SELECT * FROM deployments').all()) {
    if (
      ledger.service(field(row.serviceId, 100)).systemId !==
      ledger.environment(field(row.environmentId, 100)).systemId
    )
      throw new Error('备份部署关联无效。');
    field(row.address, 10_000);
    field(row.notes, 100_000);
    const port = field(row.port, 8);
    if (port && (!/^\d+$/.test(port) || Number(port) < 1 || Number(port) > 65535))
      throw new Error('备份端口无效。');
  }
  for (const row of db.prepare('SELECT * FROM systems').all()) {
    if (!field(row.name, 1000).trim()) throw new Error('备份系统名称无效。');
    field(row.notes, 100_000);
    const url = field(row.url, 10_000);
    if (url && !/^https?:\/\//i.test(url)) throw new Error('备份系统链接无效。');
    if (row.currentProjectId !== null) {
      const link = db
        .prepare('SELECT 1 FROM system_projects WHERE systemId=? AND projectId=?')
        .get(row.id, row.currentProjectId);
      const project = db
        .prepare('SELECT archivedAt FROM projects WHERE id=?')
        .get(row.currentProjectId);
      if (!link || !project || project.archivedAt !== null)
        throw new Error('备份当前项目关联无效。');
    }
  }
}
