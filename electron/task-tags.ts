import { randomUUID } from 'node:crypto';
import type { DatabaseSync } from 'node:sqlite';
import { taskTagColors, validateTagIds, type TaskTag } from '../src/task-tags';

function tagName(name: unknown, color: unknown) {
  if (
    typeof name !== 'string' ||
    !name.trim() ||
    name.length > 1000 ||
    typeof color !== 'string' ||
    !Object.hasOwn(taskTagColors, color)
  )
    throw new Error('请填写标签名称并选择有效颜色。');
  return name.trim();
}

export class TaskTags {
  constructor(private db: DatabaseSync) {}
  list(): TaskTag[] {
    return this.db
      .prepare('SELECT id,name,color FROM task_tags ORDER BY name COLLATE NOCASE')
      .all() as TaskTag[];
  }
  assignments() {
    const result = new Map<string, string[]>();
    for (const row of this.db
      .prepare('SELECT taskId,tagId FROM task_tag_links ORDER BY tagId')
      .all()) {
      const id = String(row.taskId);
      if (!result.has(id)) result.set(id, []);
      result.get(id)!.push(String(row.tagId));
    }
    return result;
  }
  idsForTask(taskId: string) {
    return this.db
      .prepare('SELECT tagId FROM task_tag_links WHERE taskId=? ORDER BY tagId')
      .all(taskId)
      .map((row) => String(row.tagId));
  }
  validateIds(ids: unknown) {
    validateTagIds(ids);
    for (const id of ids ?? []) {
      if (!this.db.prepare('SELECT 1 FROM task_tags WHERE id=?').get(id))
        throw new Error('任务标签已不存在，请重新选择。');
    }
  }
  assign(taskId: string, ids: string[]) {
    this.validateIds(ids);
    this.db.prepare('DELETE FROM task_tag_links WHERE taskId=?').run(taskId);
    const insert = this.db.prepare('INSERT INTO task_tag_links(taskId,tagId) VALUES(?,?)');
    for (const id of new Set(ids)) insert.run(taskId, id);
  }
  save(input: { id?: string; name: string; color: TaskTag['color'] }) {
    const name = tagName(input.name, input.color),
      key = name.toLowerCase();
    if (
      input.id !== undefined &&
      (typeof input.id !== 'string' ||
        !this.db.prepare('SELECT 1 FROM task_tags WHERE id=?').get(input.id))
    )
      throw new Error('任务标签不存在。');
    const duplicate = this.db.prepare('SELECT id FROM task_tags WHERE nameKey=?').get(key);
    if (duplicate && duplicate.id !== input.id) throw new Error('已有同名任务标签。');
    const id = input.id ?? randomUUID();
    this.db
      .prepare(
        'INSERT INTO task_tags(id,name,nameKey,color) VALUES(?,?,?,?) ON CONFLICT(id) DO UPDATE SET name=excluded.name,nameKey=excluded.nameKey,color=excluded.color',
      )
      .run(id, name, key, input.color);
    return id;
  }
  delete(id: string) {
    if (typeof id !== 'string' || !this.db.prepare('SELECT 1 FROM task_tags WHERE id=?').get(id))
      throw new Error('任务标签不存在。');
    this.db.prepare('DELETE FROM task_tags WHERE id=?').run(id);
  }
  validate() {
    for (const row of this.db.prepare('SELECT * FROM task_tags').all()) {
      const name = tagName(row.name, row.color);
      if (
        typeof row.id !== 'string' ||
        !row.id ||
        row.name !== name ||
        row.nameKey !== name.toLowerCase()
      )
        throw new Error('任务标签记录无效。');
    }
    if (this.db.prepare('PRAGMA foreign_key_check').all().length)
      throw new Error('任务标签关联无效。');
  }
}
