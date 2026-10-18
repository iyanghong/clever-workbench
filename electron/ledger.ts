import type { DatabaseSync } from 'node:sqlite';
import { randomUUID } from 'node:crypto';
import type {
  LedgerCommand,
  SystemProject,
  SystemRecord,
  EnvironmentRecord,
  ServiceRecord,
  DeploymentRecord,
} from '../src/ledger-types';

function field(value: unknown, max: number) {
  if (typeof value !== 'string' || value.length > max) throw new Error('台账内容无效或过长。');
  return value;
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
}

export function validateLedger(db: DatabaseSync) {
  const ledger = new Ledger(db);
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
