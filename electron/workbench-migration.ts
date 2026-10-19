import { initializeWorkspaceLedger } from './ledger-workspace';
import type { DatabaseSync } from 'node:sqlite';

/** Preserve old task context as text before removing its live relationships. */
export function migrateWorkbench(db: DatabaseSync) {
  if (
    db
      .prepare('PRAGMA table_info(tasks)')
      .all()
      .some((c) => c.name === 'history')
  ) {
    initializeWorkspaceLedger(db);
    return;
  }
  db.exec('BEGIN IMMEDIATE');
  try {
    db.exec("ALTER TABLE tasks ADD COLUMN history TEXT NOT NULL DEFAULT ''");
    const history = (row: Record<string, unknown>) => {
      const parts: string[] = [];
      for (const [key, table, label] of [
        ['projectId', 'projects', '原项目'],
        ['environmentId', 'environments', '原环境'],
        ['resourceId', 'resources', '原资源'],
      ]) {
        if (row[key]) {
          const item = db.prepare(`SELECT name FROM ${table} WHERE id=?`).get(String(row[key]));
          parts.push(`${label}：${item?.name ?? row[key]}`);
        }
      }
      return parts.join('；');
    };
    for (const row of db.prepare('SELECT * FROM tasks').all()) {
      db.prepare(
        'UPDATE tasks SET history=?,projectId=NULL,environmentId=NULL,resourceId=NULL WHERE id=?',
      ).run(history(row), row.id);
    }
    const preference = db.prepare("SELECT value FROM preferences WHERE key='draft'").get();
    if (preference) {
      const draft = JSON.parse(String(preference.value));
      if (draft)
        db.prepare("UPDATE preferences SET value=? WHERE key='draft'").run(
          JSON.stringify({
            ...draft,
            history: history(draft),
            projectId: null,
            environmentId: null,
            resourceId: null,
          }),
        );
    }
    initializeWorkspaceLedger(db);
    db.exec('COMMIT');
  } catch (error) {
    db.exec('ROLLBACK');
    throw error;
  }
}
