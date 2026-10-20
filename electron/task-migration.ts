import type { DatabaseSync } from 'node:sqlite';

export function migrateTaskPlanning(db: DatabaseSync) {
  const columns = new Set(
    db
      .prepare('PRAGMA table_info(tasks)')
      .all()
      .map((row) => row.name),
  );
  if (!columns.has('dueAt')) db.exec('ALTER TABLE tasks ADD COLUMN dueAt TEXT');
  if (!columns.has('urgentAt')) db.exec('ALTER TABLE tasks ADD COLUMN urgentAt TEXT');
  db.exec(`CREATE TABLE IF NOT EXISTS task_tags(
    id TEXT PRIMARY KEY, name TEXT NOT NULL, nameKey TEXT NOT NULL UNIQUE, color TEXT NOT NULL);
    CREATE TABLE IF NOT EXISTS task_tag_links(
    taskId TEXT NOT NULL REFERENCES tasks(id) ON DELETE CASCADE,
    tagId TEXT NOT NULL REFERENCES task_tags(id) ON DELETE CASCADE, PRIMARY KEY(taskId,tagId));
    CREATE INDEX IF NOT EXISTS task_tag_by_tag ON task_tag_links(tagId);`);
}
