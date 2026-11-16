import { Button, DatePicker, TimePicker } from 'antd';
import dayjs from 'dayjs';
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
  function commit(input: EventTarget | null) {
    if (disabled || !(input instanceof HTMLInputElement)) return;
    const text = input.value;
    if (input.getAttribute('aria-label') === `${label}日期`) {
      if (
        text !== date &&
        (!text || (dayjs(text).isValid() && dayjs(text).format('YYYY-MM-DD') === text))
      )
        update(text, time);
    } else if (text !== time && date && (!text || /^(?:[01]\d|2[0-3]):[0-5]\d$/.test(text)))
      update(date, text);
  }
  return (
    <div className="task-time-field" onInputCapture={(event) => commit(event.target)}>
      <label>
        {label}日期
        <DatePicker
          aria-label={`${label}日期`}
          disabled={disabled}
          format="YYYY-MM-DD"
          value={date ? dayjs(date) : null}
          needConfirm={false}
          onChange={(next) => update(next?.format('YYYY-MM-DD') ?? '', time)}
          onBlur={(event) => commit(event.target)}
        />
      </label>
      <label>
        时分（可选）
        <TimePicker
          aria-label={`${label}时分`}
          disabled={disabled || !date}
          format="HH:mm"
          value={time ? dayjs(`${date}T${time}`) : null}
          needConfirm={false}
          onChange={(next) => update(date, next?.format('HH:mm') ?? '')}
          onBlur={(event) => commit(event.target)}
        />
      </label>
      {value && (
        <Button
          type="text"
          aria-label={`清除${label}时间`}
          disabled={disabled}
          onClick={() => onChange(null)}
        >
          清除
        </Button>
      )}
    </div>
  );
}
