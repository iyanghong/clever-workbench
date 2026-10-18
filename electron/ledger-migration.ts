import type { DatabaseSync } from 'node:sqlite';
import { initializeAccessEntries } from './access-entries';

export function migrateSystemLedger(db: DatabaseSync) {
  if (
    db
      .prepare('PRAGMA table_info(resources)')
      .all()
      .some((column) => column.name === 'systemId')
  ) {
    initializeAccessEntries(db);
    if (
      !db
        .prepare('PRAGMA table_info(accounts)')
        .all()
        .some((column) => column.name === 'accessId')
    )
      db.exec('ALTER TABLE accounts ADD COLUMN accessId TEXT REFERENCES access_entries(id)');
    return;
  }
  // Rebuild in one transaction; external references retain the original table names and IDs.
  db.exec('PRAGMA foreign_keys=OFF; BEGIN IMMEDIATE');
  try {
    initializeAccessEntries(db);
    db.exec(`
      CREATE TABLE resources_next(
        id TEXT PRIMARY KEY, systemId TEXT NOT NULL REFERENCES systems(id),
        environmentId TEXT REFERENCES environments(id), kind TEXT NOT NULL,
        name TEXT NOT NULL, address TEXT NOT NULL, port TEXT NOT NULL, notes TEXT NOT NULL, fields TEXT NOT NULL,
        createdAt INTEGER NOT NULL, updatedAt INTEGER NOT NULL, UNIQUE(systemId,environmentId,name)
      );
      INSERT INTO resources_next SELECT r.id,e.systemId,r.environmentId,r.kind,r.name,r.address,r.port,r.notes,r.fields,r.createdAt,r.updatedAt
        FROM resources r JOIN environments e ON e.id=r.environmentId ORDER BY r.rowid;
      CREATE TABLE accounts_next(
        id TEXT PRIMARY KEY, systemId TEXT NOT NULL REFERENCES systems(id),
        environmentId TEXT REFERENCES environments(id), resourceId TEXT REFERENCES resources(id),
        name TEXT NOT NULL, username TEXT NOT NULL, notes TEXT NOT NULL, createdAt INTEGER NOT NULL, updatedAt INTEGER NOT NULL,
        accessId TEXT REFERENCES access_entries(id)
      );
      INSERT INTO accounts_next SELECT a.id,e.systemId,a.environmentId,a.resourceId,a.name,a.username,a.notes,a.createdAt,a.updatedAt,NULL
        FROM accounts a JOIN environments e ON e.id=a.environmentId ORDER BY a.rowid;
    `);
    for (const table of ['resources', 'accounts']) {
      const before = db.prepare(`SELECT count(*) n FROM ${table}`).get()!.n;
      const after = db.prepare(`SELECT count(*) n FROM ${table}_next`).get()!.n;
      if (before !== after) throw new Error('台账升级发现无效归属，原资料已保留。');
    }
    db.exec(`DROP TABLE accounts; DROP TABLE resources;
      ALTER TABLE resources_next RENAME TO resources;
      ALTER TABLE accounts_next RENAME TO accounts;`);
    if (db.prepare('PRAGMA foreign_key_check').all().length)
      throw new Error('台账升级关联校验失败，原资料已保留。');
    db.exec('COMMIT');
  } catch (cause) {
    db.exec('ROLLBACK');
    throw cause;
  } finally {
    db.exec('PRAGMA foreign_keys=ON');
  }
}
