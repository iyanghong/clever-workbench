import { secretFieldName } from '../src/ledger-fields';
import type { DatabaseSync } from 'node:sqlite';
import { randomUUID } from 'node:crypto';
import type { ResourceConnection } from '../src/ledger-types';

export function ledgerFields(value: unknown): Record<string, string> {
  if (!value || typeof value !== 'object' || Array.isArray(value) || Object.keys(value).length > 50)
    throw new Error('附加字段格式无效，最多支持 50 项。');
  const result: Record<string, string> = {};
  for (const [key, item] of Object.entries(value)) {
    if (!key.trim() || key.length > 80 || ['__proto__', 'prototype', 'constructor'].includes(key))
      throw new Error('附加字段名称无效。');
    if (typeof item !== 'string' || item.length > 3000) throw new Error('附加字段内容无效或过长。');
    result[key] = item;
  }
  return result;
}

export function writeLedgerFields(value: unknown, previous: Record<string, string> = {}) {
  const fields = ledgerFields(value);
  for (const [key, item] of Object.entries(fields))
    if (secretFieldName.test(key) && previous[key] !== item)
      throw new Error('密码、Token 和私钥请存入账号的秘密字段。');
  return fields;
}
export function validateOperationDate(fields: Record<string, string>) {
  const item = fields['最近恢复验证时间'];
  if (!item) return;
  const day = item.slice(0, 10);
  if (
    !/^\d{4}-\d{2}-\d{2}(?:[ T](?:[01]\d|2[0-3]):[0-5]\d)?$/.test(item) ||
    !Number.isFinite(Date.parse(day)) ||
    new Date(day).toISOString().slice(0, 10) !== day
  )
    throw new Error('恢复验证时间应为有效日期或日期时间。');
}

export function migrateLedgerDetails(db: DatabaseSync) {
  db.exec('BEGIN IMMEDIATE');
  try {
    const has = (table: string, column: string) =>
      db
        .prepare(`PRAGMA table_info(${table})`)
        .all()
        .some((r) => r.name === column);
    if (!has('resources', 'connections')) {
      db.exec(
        "ALTER TABLE resources ADD COLUMN connections TEXT NOT NULL DEFAULT '[]'; ALTER TABLE resources ADD COLUMN preferredConnectionId TEXT;",
      );
      for (const row of db
        .prepare(
          "SELECT id,address,port FROM resources WHERE kind<>'server' AND (address<>'' OR port<>'')",
        )
        .all()) {
        const id = randomUUID();
        db.prepare(
          "UPDATE resources SET connections=?,preferredConnectionId=?,address='',port='' WHERE id=?",
        ).run(
          JSON.stringify([
            { id, label: '主连接', address: row.address, port: row.port, role: '', serverId: null },
          ]),
          id,
          row.id,
        );
      }
    }
    for (const table of ['deployment_nodes', 'operations'])
      if (!has(table, 'fields'))
        db.exec(`ALTER TABLE ${table} ADD COLUMN fields TEXT NOT NULL DEFAULT '{}'`);
    db.exec(
      "CREATE TABLE IF NOT EXISTS ledger_document_refs(ownerKind TEXT NOT NULL CHECK(ownerKind IN ('service','node')),ownerId TEXT NOT NULL,documentId TEXT NOT NULL REFERENCES documents(id),PRIMARY KEY(ownerKind,ownerId,documentId))",
    );
    db.exec('COMMIT');
  } catch (error) {
    db.exec('ROLLBACK');
    throw error;
  }
}

export function checkConnections(
  db: DatabaseSync,
  systemId: string,
  value: unknown,
): ResourceConnection[] {
  if (!Array.isArray(value) || value.length > 100)
    throw new Error('连接格式无效，最多支持 100 组。');
  const seen = new Set<string>();
  return value
    .map((c, i) => {
      if (!c || typeof c !== 'object' || Array.isArray(c)) throw new Error('连接信息无效。');
      for (const [key, max] of [
        ['id', 100],
        ['label', 1000],
        ['address', 10000],
        ['port', 8],
        ['role', 1000],
      ] as const)
        if (typeof c[key] !== 'string' || c[key].length > max)
          throw new Error('连接字段无效或过长。');
      if (!c.id || seen.has(c.id)) throw new Error('连接标识无效或重复。');
      seen.add(c.id);
      const port = c.port.trim();
      if (port && (!/^\d+$/.test(port) || +port < 1 || +port > 65535))
        throw new Error('端口应为 1 到 65535，或留空。');
      if (c.serverId !== null) {
        if (typeof c.serverId !== 'string') throw new Error('关联服务器无效。');
        const server = db.prepare('SELECT systemId,kind FROM resources WHERE id=?').get(c.serverId);
        if (!server || server.systemId !== systemId || server.kind !== 'server')
          throw new Error('请选择本系统的服务器。');
      }
      if (!c.label.trim() && !c.address.trim() && !port && !c.role.trim() && c.serverId === null)
        return null;
      return {
        id: c.id,
        label: c.label.trim() || `连接 ${i + 1}`,
        address: c.address.trim(),
        port,
        role: c.role,
        serverId: c.serverId,
      };
    })
    .filter((c): c is ResourceConnection => c !== null);
}

export function documentIds(db: DatabaseSync, kind: 'service' | 'node', id: string): string[] {
  return db
    .prepare(
      'SELECT documentId FROM ledger_document_refs WHERE ownerKind=? AND ownerId=? ORDER BY rowid',
    )
    .all(kind, id)
    .map((r) => String(r.documentId));
}
export function saveDocumentRefs(
  db: DatabaseSync,
  kind: 'service' | 'node',
  id: string,
  systemId: string,
  value: unknown,
) {
  if (value === undefined) return;
  if (!Array.isArray(value) || value.length > 100 || new Set(value).size !== value.length)
    throw new Error('文档引用格式无效或重复。');
  for (const documentId of value) {
    if (typeof documentId !== 'string') throw new Error('文档引用无效。');
    const doc = db.prepare('SELECT systemId,deletedAt FROM documents WHERE id=?').get(documentId);
    if (!doc || doc.deletedAt !== null || (doc.systemId !== null && doc.systemId !== systemId))
      throw new Error('请选择本系统或通用的未删除文档。');
  }
  db.prepare('DELETE FROM ledger_document_refs WHERE ownerKind=? AND ownerId=?').run(kind, id);
  for (const documentId of value)
    db.prepare('INSERT INTO ledger_document_refs VALUES(?,?,?)').run(kind, id, documentId);
}
export function documentRefOwners(db: DatabaseSync, id: string) {
  return db
    .prepare(
      `SELECT s.systemId,s.name FROM ledger_document_refs r JOIN services s ON s.id=r.ownerId WHERE r.ownerKind='service' AND r.documentId=?
    UNION ALL SELECT s.systemId,n.name FROM ledger_document_refs r JOIN deployment_nodes n ON n.id=r.ownerId JOIN services s ON s.id=n.serviceId WHERE r.ownerKind='node' AND r.documentId=?`,
    )
    .all(id, id);
}
export function validateDocumentRefs(db: DatabaseSync) {
  for (const r of db.prepare('SELECT * FROM ledger_document_refs').all()) {
    if (!['service', 'node'].includes(String(r.ownerKind)))
      throw new Error('文档引用对象类型无效。');
    const owner =
      r.ownerKind === 'service'
        ? db.prepare('SELECT systemId FROM services WHERE id=?').get(r.ownerId)
        : db
            .prepare(
              'SELECT s.systemId FROM deployment_nodes n JOIN services s ON s.id=n.serviceId WHERE n.id=?',
            )
            .get(r.ownerId);
    const doc = db.prepare('SELECT systemId,deletedAt FROM documents WHERE id=?').get(r.documentId);
    if (
      !owner ||
      !doc ||
      doc.deletedAt !== null ||
      (doc.systemId !== null && doc.systemId !== owner.systemId)
    )
      throw new Error('备份文档引用无效。');
  }
}
