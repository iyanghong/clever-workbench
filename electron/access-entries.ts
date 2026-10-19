import { WorkspaceLedger } from './ledger-workspace';
import type { DatabaseSync } from 'node:sqlite';
import { randomUUID } from 'node:crypto';
import type { AccessAddress, AccessEntry, AccessSave } from '../src/ledger-types';

export function initializeAccessEntries(db: DatabaseSync) {
  db.exec(`CREATE TABLE IF NOT EXISTS access_entries(
    id TEXT PRIMARY KEY, systemId TEXT NOT NULL REFERENCES systems(id), environmentId TEXT REFERENCES environments(id),
    name TEXT NOT NULL, notes TEXT NOT NULL, addresses TEXT NOT NULL, preferredAddressId TEXT,
    preferredAccountId TEXT, createdAt INTEGER NOT NULL, updatedAt INTEGER NOT NULL
  )`);
}
function text(value: unknown, max: number) {
  if (typeof value !== 'string' || value.length > max) throw new Error('访问入口内容无效或过长。');
  return value;
}
function addresses(value: unknown, allowNew: boolean): AccessAddress[] {
  if (!Array.isArray(value) || value.length > 50) throw new Error('每个入口最多支持 50 个地址。');
  const ids = new Set<string>(),
    labels = new Set<string>();
  return value.map((item) => {
    if (!item || typeof item !== 'object') throw new Error('地址格式无效。');
    const id = item.id === undefined && allowNew ? randomUUID() : text(item.id, 100);
    const label = text(item.label, 100).trim(),
      url = text(item.url, 10_000).trim();
    if (!id || !label || ids.has(id) || labels.has(label))
      throw new Error('地址名称不能为空或重复。');
    let parsed: URL;
    try {
      parsed = new URL(url);
    } catch {
      throw new Error('请填写完整的 HTTP(S) 地址。');
    }
    if (!['http:', 'https:'].includes(parsed.protocol) || parsed.username || parsed.password)
      throw new Error('地址仅支持 HTTP(S)，账号密码请放在秘密字段中。');
    ids.add(id);
    labels.add(label);
    return { id, label, url };
  });
}
export class AccessEntries {
  constructor(private db: DatabaseSync) {}
  get(id: string): AccessEntry {
    const row = this.db.prepare('SELECT * FROM access_entries WHERE id=?').get(text(id, 100));
    if (!row) throw new Error('访问入口不存在。');
    return {
      ...row,
      addresses: addresses(JSON.parse(text(row.addresses, 600_000)), false),
    } as AccessEntry;
  }
  list() {
    return this.db
      .prepare('SELECT id FROM access_entries ORDER BY createdAt,rowid')
      .all()
      .map((row) => this.get(String(row.id)));
  }
  save(command: AccessSave, now: number) {
    const previous = command.id ? this.get(command.id) : null;
    const id = previous?.id ?? randomUUID(),
      systemId = text(command.systemId ?? previous?.systemId, 100);
    if (!this.db.prepare('SELECT 1 FROM systems WHERE id=?').get(systemId))
      throw new Error('系统不存在。');
    if (previous && previous.systemId !== systemId)
      throw new Error('入口不能移动到其他系统，请复制。');
    const requestedEnvironment =
      command.environmentId === undefined
        ? (previous?.environmentId ?? null)
        : command.environmentId;
    const environmentId = requestedEnvironment === null ? null : text(requestedEnvironment, 100);
    if (
      environmentId !== null &&
      this.db.prepare('SELECT systemId FROM environments WHERE id=?').get(environmentId)
        ?.systemId !== systemId
    )
      throw new Error('入口和环境必须属于同一系统。');
    const name = text(command.name ?? previous?.name, 1000).trim(),
      notes = text(command.notes ?? previous?.notes ?? '', 100_000);
    if (!name) throw new Error('请填写入口名称。');
    const duplicate = this.db
      .prepare(
        'SELECT id FROM access_entries WHERE systemId=? AND environmentId IS ? AND lower(name)=lower(?)',
      )
      .get(systemId, environmentId, name);
    if (duplicate && duplicate.id !== id) throw new Error('这个归属下已有同名入口。');
    const items = addresses(command.addresses ?? previous?.addresses ?? [], true);
    let preferredAddressId =
      command.preferredAddressId === undefined
        ? previous?.preferredAddressId
        : command.preferredAddressId;
    if (command.preferredAddressId && !items.some((a) => a.id === command.preferredAddressId))
      throw new Error('常用地址不属于这个入口。');
    if (!items.some((a) => a.id === preferredAddressId)) preferredAddressId = items[0]?.id ?? null;
    let preferredAccountId =
      command.preferredAccountId === undefined
        ? previous?.preferredAccountId
        : command.preferredAccountId;
    if (
      preferredAccountId &&
      !this.db
        .prepare('SELECT 1 FROM accounts WHERE id=? AND accessId=?')
        .get(preferredAccountId, id)
    )
      throw new Error('常用账号不属于这个入口。');
    preferredAccountId ??= this.db
      .prepare('SELECT id FROM accounts WHERE accessId=? ORDER BY createdAt,rowid')
      .get(id)?.id as string | undefined;
    this.db
      .prepare(
        `INSERT INTO access_entries VALUES(?,?,?,?,?,?,?,?,?,?) ON CONFLICT(id) DO UPDATE SET
      environmentId=excluded.environmentId,name=excluded.name,notes=excluded.notes,addresses=excluded.addresses,
      preferredAddressId=excluded.preferredAddressId,preferredAccountId=excluded.preferredAccountId,updatedAt=excluded.updatedAt`,
      )
      .run(
        id,
        systemId,
        environmentId,
        name,
        notes,
        JSON.stringify(items),
        preferredAddressId ?? null,
        preferredAccountId ?? null,
        previous?.createdAt ?? now,
        now,
      );
    this.db.prepare('UPDATE accounts SET environmentId=? WHERE accessId=?').run(environmentId, id);
    const workspace = new WorkspaceLedger(this.db);
    const scope = workspace.scopes().find((s) => s.kind === 'access' && s.ownerId === id);
    workspace.saveScope(
      'access',
      id,
      scope && previous?.environmentId === environmentId
        ? scope
        : { environmentIds: environmentId ? [environmentId] : [], tags: scope?.tags ?? [] },
    );
    return id;
  }
  refreshPreferredAccount(id: string) {
    this.db
      .prepare(
        `UPDATE access_entries SET preferredAccountId=(SELECT id FROM accounts WHERE accessId=? ORDER BY createdAt,rowid LIMIT 1)
      WHERE id=? AND (preferredAccountId IS NULL OR NOT EXISTS(SELECT 1 FROM accounts WHERE id=preferredAccountId AND accessId=?))`,
      )
      .run(id, id, id);
  }
  validate() {
    for (const entry of this.list()) {
      if (!entry.name.trim() || entry.name.length > 1000 || entry.notes.length > 100_000)
        throw new Error('备份入口信息无效。');
      if (
        entry.environmentId !== null &&
        this.db.prepare('SELECT systemId FROM environments WHERE id=?').get(entry.environmentId)
          ?.systemId !== entry.systemId
      )
        throw new Error('备份入口环境不一致。');
      if (
        (entry.preferredAddressId !== null &&
          !entry.addresses.some((a) => a.id === entry.preferredAddressId)) ||
        (entry.preferredAccountId !== null &&
          !this.db
            .prepare('SELECT 1 FROM accounts WHERE id=? AND accessId=?')
            .get(entry.preferredAccountId, entry.id))
      )
        throw new Error('备份入口常用项无效。');
    }
  }
}
