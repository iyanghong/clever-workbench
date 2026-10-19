import { randomUUID } from 'node:crypto';
import type { DatabaseSync } from 'node:sqlite';
import type {
  DocumentCommand,
  DocumentEdit,
  DocumentRecord,
  DocumentSummary,
} from '../src/document-types';
import type { Ledger } from './ledger';
import { emptyContent } from '../src/domain';

export function initializeDocuments(db: DatabaseSync) {
  db.exec(`CREATE TABLE IF NOT EXISTS documents(
    id TEXT PRIMARY KEY, title TEXT NOT NULL, markdown TEXT NOT NULL, content TEXT NOT NULL,
    projectId TEXT REFERENCES projects(id), systemId TEXT REFERENCES systems(id),
    environmentId TEXT REFERENCES environments(id), resourceId TEXT REFERENCES resources(id),
    createdAt INTEGER NOT NULL, updatedAt INTEGER NOT NULL, deletedAt INTEGER
  ); CREATE INDEX IF NOT EXISTS document_project ON documents(projectId);`);
  for (const [name, table] of [
    ['environmentId', 'environments'],
    ['resourceId', 'resources'],
  ]) {
    if (
      !db
        .prepare('PRAGMA table_info(tasks)')
        .all()
        .some((column) => column.name === name)
    )
      db.exec(`ALTER TABLE tasks ADD COLUMN ${name} TEXT REFERENCES ${table}(id)`);
  }
}
export class Documents {
  constructor(
    private db: DatabaseSync,
    private ledger: Ledger,
    private validate: (value: DocumentEdit) => void,
  ) {}
  snapshot() {
    return this.db
      .prepare(
        'SELECT id,title,projectId,systemId,environmentId,resourceId,createdAt,updatedAt,deletedAt FROM documents ORDER BY updatedAt DESC,rowid DESC',
      )
      .all() as unknown as DocumentSummary[];
  }
  get(id: string): DocumentRecord {
    if (typeof id !== 'string' || id.length > 100) throw new Error('文档标识无效。');
    const row = this.db.prepare('SELECT * FROM documents WHERE id=?').get(id);
    if (!row) throw new Error('文档不存在。');
    return { ...row, content: JSON.parse(row.content as string) } as DocumentRecord;
  }
  search(query: string) {
    if (typeof query !== 'string' || query.length > 1000) throw new Error('查询内容无效或过长。');
    const pattern = `%${query.replace(/[\\%_]/g, '\\$&')}%`;
    return this.db
      .prepare(
        "SELECT id FROM documents WHERE deletedAt IS NULL AND (title LIKE ? ESCAPE '\\' OR markdown LIKE ? ESCAPE '\\') ORDER BY updatedAt DESC",
      )
      .all(pattern, pattern)
      .map((row) => String(row.id));
  }
  mutate(command: DocumentCommand, now: number): string | undefined {
    if (command.type === 'document.create') {
      const context = this.ledger.resolveContext(command.context ?? {});
      const projectId =
        command.projectId === undefined
          ? context.systemId
            ? this.ledger.system(context.systemId).currentProjectId
            : null
          : command.projectId;
      const value: DocumentEdit = {
        ...context,
        projectId,
        title: '',
        markdown: '',
        content: emptyContent(),
      };
      this.validate(value);
      const id = randomUUID();
      this.db
        .prepare('INSERT INTO documents VALUES(?,?,?,?,?,?,?,?,?,?,?)')
        .run(
          id,
          '',
          '',
          JSON.stringify(value.content),
          projectId,
          context.systemId,
          context.environmentId,
          context.resourceId,
          now,
          now,
          null,
        );
      return id;
    }
    const old = this.get(command.id);
    if (command.type === 'document.edit') {
      if (old.deletedAt !== null) throw new Error('请先恢复文档。');
      this.validate(command);
      const context = this.ledger.resolveContext(
        command,
        command.systemId === old.systemId &&
          command.environmentId === old.environmentId &&
          command.resourceId === old.resourceId,
      );
      this.db
        .prepare(
          'UPDATE documents SET title=?,markdown=?,content=?,projectId=?,systemId=?,environmentId=?,resourceId=?,updatedAt=? WHERE id=?',
        )
        .run(
          command.title.trim(),
          command.markdown,
          JSON.stringify(command.content),
          command.projectId,
          context.systemId,
          context.environmentId,
          context.resourceId,
          now,
          old.id,
        );
    } else if (command.type === 'document.delete') {
      if (this.db.prepare('SELECT 1 FROM operations WHERE documentId=?').get(old.id))
        throw new Error('文档仍被运维记录引用，请先解除关联。');
      this.db
        .prepare('UPDATE documents SET deletedAt=? WHERE id=?')
        .run(old.deletedAt ?? now, old.id);
    } else if (command.type === 'document.restore') {
      this.db.prepare('UPDATE documents SET deletedAt=NULL WHERE id=?').run(old.id);
    } else if (command.type === 'document.purge') {
      if (old.deletedAt === null) throw new Error('请先移入回收站。');
      this.db.prepare('DELETE FROM documents WHERE id=?').run(old.id);
    }
  }
}
