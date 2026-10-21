export type TaskTime = { kind: 'date'; value: string } | { kind: 'time'; value: number };

export function validateTaskTime(value: unknown): asserts value is TaskTime | null | undefined {
  if (value == null) return;
  if (typeof value !== 'object') throw new Error('任务时间格式无效。');
  const time = value as TaskTime;
  if (time.kind === 'date' && typeof time.value === 'string') {
    if (
      /^[1-9]\d{3}-\d{2}-\d{2}$/.test(time.value) &&
      Number.isFinite(Date.parse(`${time.value}T00:00:00Z`)) &&
      new Date(`${time.value}T00:00:00Z`).toISOString().slice(0, 10) === time.value
    )
      return;
  }
  if (
    time.kind === 'time' &&
    typeof time.value === 'number' &&
    Number.isSafeInteger(time.value) &&
    time.value >= 0 &&
    time.value < 253402300800000 &&
    time.value % 60000 === 0
  )
    return;
  throw new Error('请填写有效的任务日期或时分。');
}

export function taskTimeBoundary(time: TaskTime, endOfDay = false): number {
  if (time.kind === 'time') return time.value;
  const [year, month, day] = time.value.split('-').map(Number);
  return new Date(year, month - 1, day + (endOfDay ? 1 : 0)).getTime();
}

export function validateTaskPlanningShape(dueAt?: TaskTime | null, urgentAt?: TaskTime | null) {
  validateTaskTime(dueAt);
  validateTaskTime(urgentAt);
  if (urgentAt && !dueAt) throw new Error('设置临期开始时间前，请先填写预计完成时间。');
}
export function validateTaskPlanning(dueAt?: TaskTime | null, urgentAt?: TaskTime | null) {
  validateTaskPlanningShape(dueAt, urgentAt);
  if (dueAt && urgentAt && taskTimeBoundary(urgentAt) > taskTimeBoundary(dueAt, true))
    throw new Error('临期开始时间不能晚于预计完成时间，请调整日期。');
}

export function taskTimeLabel(time?: TaskTime | null): string {
  if (!time) return '未设置';
  return time.kind === 'date'
    ? time.value
    : new Intl.DateTimeFormat('zh-CN', { dateStyle: 'short', timeStyle: 'short' }).format(
        time.value,
      );
}
