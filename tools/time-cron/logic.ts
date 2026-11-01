export type ParsedCron = ReturnType<typeof parseCron>;

export function formatDateInput(input: string, now = new Date()) {
  const value = input.trim();
  if (!value) throw new Error('请输入时间戳或日期时间。');
  let date: Date;
  if (/^-?\d+(?:\.\d+)?$/.test(value)) {
    const numeric = Number(value);
    date = new Date(Math.abs(numeric) < 1_000_000_000_000 ? numeric * 1000 : numeric);
  } else date = new Date(value);
  if (!Number.isFinite(date.getTime())) throw new Error('无法识别该时间戳或日期时间。');
  const milliseconds = date.getTime();
  const difference = milliseconds - now.getTime();
  const absolute = Math.abs(difference);
  const units: [number, Intl.RelativeTimeFormatUnit][] = [
    [365 * 24 * 60 * 60 * 1000, 'year'],
    [30 * 24 * 60 * 60 * 1000, 'month'],
    [24 * 60 * 60 * 1000, 'day'],
    [60 * 60 * 1000, 'hour'],
    [60 * 1000, 'minute'],
  ];
  const unit = units.find(([size]) => absolute >= size) ?? [1000, 'second'];
  const amount = Math.round(difference / unit[0]);
  const relative = new Intl.RelativeTimeFormat('zh-CN', { numeric: 'auto' }).format(
    amount,
    unit[1],
  );
  return {
    iso: date.toISOString(),
    local: date.toLocaleString('zh-CN', { hour12: false }),
    seconds: Math.floor(milliseconds / 1000),
    milliseconds,
    relative,
  };
}

type CronField = { values: Set<number>; wildcard: boolean };
function cronField(input: string, minimum: number, maximum: number, weekday = false): CronField {
  const values = new Set<number>();
  if (!input) throw new Error('Cron 字段不能为空。');
  for (const part of input.split(',')) {
    const match = /^(\*|\d+)(?:-(\d+))?(?:\/(\d+))?$/.exec(part);
    if (!match) throw new Error(`无法识别 Cron 字段“${part}”。`);
    const step = match[3] ? Number(match[3]) : 1;
    if (!Number.isInteger(step) || step < 1) throw new Error('Cron 步长必须大于 0。');
    if (match[3] && match[1] !== '*' && !match[2])
      throw new Error('数字起点使用步长时，请写成范围，例如 1-10/2。');
    const start = match[1] === '*' ? minimum : Number(match[1]);
    const end = match[1] === '*' ? maximum : match[2] ? Number(match[2]) : start;
    if (start < minimum || end > maximum || start > end)
      throw new Error(`Cron 数值应在 ${minimum} 到 ${maximum} 之间。`);
    for (let value = start; value <= end; value += step)
      values.add(weekday && value === 7 ? 0 : value);
  }
  return { values, wildcard: input.startsWith('*') };
}

export function parseCron(expression: string) {
  const fields = expression.trim().split(/\s+/);
  if (fields.length !== 5) throw new Error('Cron 应包含分钟、小时、日期、月份、星期五段。');
  return {
    minute: cronField(fields[0], 0, 59),
    hour: cronField(fields[1], 0, 23),
    day: cronField(fields[2], 1, 31),
    month: cronField(fields[3], 1, 12),
    weekday: cronField(fields[4], 0, 7, true),
  };
}

export function nextCronRuns(expression: string, from = new Date(), count = 5) {
  const cron = parseCron(expression);
  const current = new Date(from);
  current.setSeconds(0, 0);
  current.setMinutes(current.getMinutes() + 1);
  const results: Date[] = [];
  const limit = current.getTime() + 4 * 366 * 24 * 60 * 60 * 1000;
  while (current.getTime() <= limit && results.length < count) {
    const day = cron.day.values.has(current.getDate());
    const weekday = cron.weekday.values.has(current.getDay());
    const dayMatches =
      cron.day.wildcard && cron.weekday.wildcard
        ? true
        : cron.day.wildcard
          ? weekday
          : cron.weekday.wildcard
            ? day
            : day || weekday;
    if (
      cron.minute.values.has(current.getMinutes()) &&
      cron.hour.values.has(current.getHours()) &&
      cron.month.values.has(current.getMonth() + 1) &&
      dayMatches
    )
      results.push(new Date(current));
    current.setMinutes(current.getMinutes() + 1);
  }
  if (!results.length) throw new Error('未来四年内没有匹配的执行时间。');
  return results;
}

export function describeCron(expression: string) {
  parseCron(expression);
  const normalized = expression.trim().replace(/\s+/g, ' ');
  if (normalized === '* * * * *') return '每分钟执行';
  const step = /^\*\/(\d+) \* \* \* \*$/.exec(normalized);
  if (step) return `每 ${step[1]} 分钟执行`;
  const daily = /^(\d+) (\d+) \* \* \*$/.exec(normalized);
  if (daily) return `每天 ${daily[2].padStart(2, '0')}:${daily[1].padStart(2, '0')} 执行`;
  return '有效的五段 Cron 表达式，按本机时区执行';
}
