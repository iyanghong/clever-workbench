import type { TaskSummary } from './types';
import { taskTimeBoundary, taskTimeLabel } from './task-time';

export type TaskGrouping = 'created' | 'due';
export type TaskUrgency = 'overdue' | 'near' | 'normal';
export type TaskListRow =
  { kind: 'group'; id: string; label: string; count: number } | { kind: 'task'; task: TaskSummary };

export function taskUrgency(task: TaskSummary, now = Date.now()): TaskUrgency {
  if (task.completedAt !== null || task.deletedAt !== null || !task.dueAt) return 'normal';
  const due = taskTimeBoundary(task.dueAt, true);
  const start = task.urgentAt ? taskTimeBoundary(task.urgentAt) : due - 86400000;
  return now >= due ? 'overdue' : now >= start ? 'near' : 'normal';
}

export function taskTimingLabel(task: TaskSummary, now = Date.now()) {
  if (!task.dueAt) return '';
  const urgency = taskUrgency(task, now);
  return `${urgency === 'overdue' ? '已逾期' : urgency === 'near' ? '即将到期' : '预计'} · ${taskTimeLabel(task.dueAt)}`;
}

export function sortTasks(
  tasks: TaskSummary[],
  grouping: TaskGrouping = 'created',
  now = Date.now(),
) {
  const rank = { overdue: 0, near: 1, normal: 2 };
  return [...tasks].sort((a, b) => {
    const status = Number(a.completedAt !== null) - Number(b.completedAt !== null);
    if (status) return status;
    const aUrgency = taskUrgency(a, now),
      bUrgency = taskUrgency(b, now);
    const priority = rank[aUrgency] - rank[bUrgency];
    if (priority) return priority;
    if (aUrgency !== 'normal' || grouping === 'due') {
      const due =
        (a.dueAt ? taskTimeBoundary(a.dueAt, true) : Infinity) -
        (b.dueAt ? taskTimeBoundary(b.dueAt, true) : Infinity);
      if (due) return due;
    }
    return b.createdAt - a.createdAt || a.id.localeCompare(b.id);
  });
}

export function taskRows(
  tasks: TaskSummary[],
  grouping: TaskGrouping = 'created',
  now = Date.now(),
): TaskListRow[] {
  const groups = new Map<
    string,
    { label: string; tasks: TaskSummary[]; complete: boolean; order: number; month: number }
  >();
  const today = new Date(now);
  today.setHours(0, 0, 0, 0);
  const day = (offset: number) =>
    new Date(today.getFullYear(), today.getMonth(), today.getDate() + offset).getTime();
  for (const task of sortTasks(tasks, grouping, now)) {
    const urgency = taskUrgency(task, now),
      complete = task.completedAt !== null;
    let key: string,
      label: string,
      order: number,
      month = 0;
    if (urgency !== 'normal') {
      key = urgency;
      label = urgency === 'overdue' ? '逾期' : '临期';
      order = urgency === 'overdue' ? 0 : 1;
    } else if (grouping === 'created') {
      const created = new Date(task.createdAt);
      month = created.getFullYear() * 12 + created.getMonth();
      key = `month-${month}`;
      label = `${created.getFullYear()} 年 ${created.getMonth() + 1} 月`;
      order = 2;
    } else if (!task.dueAt) {
      key = 'unplanned';
      label = '未设置';
      order = 7;
    } else {
      const date = taskTimeBoundary(task.dueAt);
      if (date < day(0)) {
        key = 'past';
        label = '过去日期';
        order = 2;
      } else if (date < day(1)) {
        key = 'today';
        label = '今天';
        order = 3;
      } else if (date < day(2)) {
        key = 'tomorrow';
        label = '明天';
        order = 4;
      } else if (date < day(8)) {
        key = 'week';
        label = '未来 7 天内';
        order = 5;
      } else {
        key = 'later';
        label = '更晚';
        order = 6;
      }
    }
    const id = `${complete ? 'completed' : 'pending'}-${key}`;
    if (!groups.has(id))
      groups.set(id, {
        label: `${complete ? '已完成 · ' : ''}${label}`,
        tasks: [],
        complete,
        order,
        month,
      });
    groups.get(id)!.tasks.push(task);
  }
  return [...groups]
    .sort(
      ([, a], [, b]) =>
        Number(a.complete) - Number(b.complete) || a.order - b.order || b.month - a.month,
    )
    .flatMap(([id, group]) => [
      { kind: 'group', id, label: group.label, count: group.tasks.length } as TaskListRow,
      ...group.tasks.map((task): TaskListRow => ({ kind: 'task', task })),
    ]);
}
