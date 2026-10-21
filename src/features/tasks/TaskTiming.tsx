import { ClockIcon, WarningCircleIcon } from '@phosphor-icons/react';
import type { TaskSummary } from '../../types';
import { taskTimingLabel, taskUrgency } from '../../task-list';

export function TaskTiming({ task, now }: { task: TaskSummary; now: number }) {
  if (!task.dueAt) return null;
  const urgency = taskUrgency(task, now);
  const Icon = urgency === 'overdue' ? WarningCircleIcon : ClockIcon;
  return (
    <span className={`task-timing urgency-${urgency}`}>
      <Icon size={13} aria-hidden="true" />
      {taskTimingLabel(task, now)}
    </span>
  );
}
