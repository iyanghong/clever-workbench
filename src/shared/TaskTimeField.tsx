import { localInput } from '../domain';
import type { TaskTime } from '../task-time';

export function TaskTimeField({
  label,
  value,
  onChange,
  disabled = false,
}: {
  label: string;
  value?: TaskTime | null;
  onChange: (value: TaskTime | null) => void;
  disabled?: boolean;
}) {
  const date =
    value?.kind === 'date' ? value.value : value ? localInput(value.value).slice(0, 10) : '';
  const time = value?.kind === 'time' ? localInput(value.value).slice(11, 16) : '';
  function update(day: string, hours: string) {
    if (!day) return onChange(null);
    onChange(
      hours
        ? { kind: 'time', value: new Date(`${day}T${hours}`).getTime() }
        : { kind: 'date', value: day },
    );
  }
  return (
    <div className="task-time-field">
      <label>
        {label}日期
        <input
          type="date"
          aria-label={`${label}日期`}
          disabled={disabled}
          value={date}
          onChange={(event) => update(event.target.value, time)}
        />
      </label>
      <label>
        时分（可选）
        <input
          type="time"
          aria-label={`${label}时分`}
          disabled={disabled || !date}
          value={time}
          onChange={(event) => update(date, event.target.value)}
        />
      </label>
      {value && (
        <button
          type="button"
          className="text-button"
          aria-label={`清除${label}时间`}
          disabled={disabled}
          onClick={() => onChange(null)}
        >
          清除
        </button>
      )}
    </div>
  );
}
