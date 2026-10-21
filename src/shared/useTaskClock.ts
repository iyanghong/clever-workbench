import { useEffect, useState } from 'react';
import type { TaskSummary } from '../types';
import { taskTimeBoundary } from '../task-time';

export function useTaskClock(tasks: TaskSummary[]) {
  const [now, setNow] = useState(Date.now);
  useEffect(() => {
    setNow(Date.now());
  }, [tasks]);
  useEffect(() => {
    const date = new Date(now);
    let next = Math.min(
      now + 60000,
      new Date(date.getFullYear(), date.getMonth(), date.getDate() + 1).getTime(),
    );
    for (const task of tasks) {
      if (!task.dueAt || task.completedAt !== null || task.deletedAt !== null) continue;
      const due = taskTimeBoundary(task.dueAt, true);
      const start = task.urgentAt ? taskTimeBoundary(task.urgentAt) : due - 86400000;
      for (const boundary of [start, due]) if (boundary > now) next = Math.min(next, boundary);
    }
    const update = () => setNow(Date.now());
    const timer = window.setTimeout(update, Math.max(50, next - now));
    window.addEventListener('focus', update);
    document.addEventListener('visibilitychange', update);
    return () => {
      window.clearTimeout(timer);
      window.removeEventListener('focus', update);
      document.removeEventListener('visibilitychange', update);
    };
  }, [tasks, now]);
  return now;
}
