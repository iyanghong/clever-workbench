import type { TaskSummary } from './types';
export const minute = (value = Date.now()) => Math.floor(value / 60000) * 60000;
export const emptyContent = () => ({ type: 'doc', content: [{ type: 'paragraph' }] });
export const dateLabel = (value: number | null, full = false) =>
  value === null
    ? '未完成'
    : new Intl.DateTimeFormat(
        'zh-CN',
        full
          ? {
              year: 'numeric',
              month: '2-digit',
              day: '2-digit',
              hour: '2-digit',
              minute: '2-digit',
              hour12: false,
            }
          : { month: 'short', day: 'numeric' },
      ).format(value);
export function validateTimes(start: number, end: number | null, now = minute()) {
  if (!Number.isSafeInteger(start) || start < 0 || start % 60000 || start > now)
    throw new Error('开始时间应为当前或过去的时间。');
  if (end !== null && (!Number.isSafeInteger(end) || end % 60000 || end < start || end > now))
    throw new Error('完成时间应在开始时间之后，且不晚于现在。');
}
export function intersectsMonth(task: TaskSummary, year: number, month: number, now = Date.now()) {
  const first = new Date(year, month, 1).getTime(),
    next = new Date(year, month + 1, 1).getTime();
  return task.deletedAt === null && task.startedAt < next && (task.completedAt ?? now) >= first;
}
export function completedInMonth(task: TaskSummary, year: number, month: number) {
  return (
    task.deletedAt === null &&
    task.completedAt !== null &&
    task.completedAt >= new Date(year, month, 1).getTime() &&
    task.completedAt < new Date(year, month + 1, 1).getTime()
  );
}
export function localInput(time: number) {
  const d = new Date(time);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}T${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
}
export const projectColors = ['#007aff', '#34a271', '#af52de', '#ed8742', '#e75979', '#5796a1'];
