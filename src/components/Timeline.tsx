import { markNewRecordChanged } from '../shared/new-record';
import { Button, Card, Col, DatePicker, Row, Select, Statistic } from 'antd';
import dayjs from 'dayjs';
import { PageHeading, SegmentedControl } from '../shared/WorkspaceUI';
import type { SystemRecord } from '../ledger-types';
import { useEffect, useMemo, useState } from 'react';
import {
  CaretLeftIcon,
  CaretRightIcon,
  CalendarBlankIcon,
  ChartBarHorizontalIcon,
  CheckCircleIcon,
  ClockIcon,
} from '@phosphor-icons/react';
import type { TaskSummary } from '../types';
import { completedInMonth, dateLabel, intersectsMonth } from '../domain';
import { useVirtual } from '../useVirtual';
export function Timeline({
  tasks,
  systems,
  onSelect,
}: {
  tasks: TaskSummary[];
  systems: SystemRecord[];
  onSelect: (id: string) => void;
}) {
  const [clock, setClock] = useState(Date.now());
  useEffect(() => {
    const update = () => setClock(Date.now());
    const timer = setInterval(update, 30000);
    window.addEventListener('focus', update);
    return () => {
      clearInterval(timer);
      window.removeEventListener('focus', update);
    };
  }, []);
  const [zoom, setZoom] = useState<'all' | 'month'>('all');
  const now = new Date(clock),
    [month, setMonth] = useState(
      `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`,
    ),
    [mode, setMode] = useState<'month' | 'project'>('month'),
    [project, setProject] = useState('all');
  const overview = mode === 'project' && zoom === 'all';
  const [year, m] = month.split('-').map(Number);
  const scoped = useMemo(
    () =>
      tasks.filter(
        (t) =>
          t.deletedAt === null &&
          (project === 'all' || (project === 'none' ? !t.systemId : t.systemId === project)),
      ),
    [tasks, project],
  );
  const rows = useMemo(
    () =>
      scoped
        .filter((t) => overview || intersectsMonth(t, year, m - 1, clock))
        .sort((a, b) => a.startedAt - b.startedAt),
    [scoped, overview, year, m, clock],
  );
  const first = !overview
    ? new Date(year, m - 1, 1).getTime()
    : rows.length
      ? new Date(new Date(Math.min(...rows.map((t) => t.startedAt))).setHours(0, 0, 0, 0)).getTime()
      : new Date(year, m - 1, 1).getTime();
  const last = !overview
    ? new Date(year, m, 1).getTime()
    : rows.length
      ? new Date(
          new Date(Math.max(...rows.map((t) => t.completedAt ?? clock))).setHours(24, 0, 0, 0),
        ).getTime()
      : new Date(year, m, 1).getTime();
  const span = Math.max(last - first, 86400000),
    days = Math.round(span / 86400000),
    step = days > 600 ? Math.ceil(days / 20 / 30) * 30 : days > 120 ? 30 : days > 45 ? 7 : 1,
    ticks = Array.from(
      { length: Math.ceil(days / step) },
      (_, i) =>
        new Date(
          new Date(first).getFullYear(),
          new Date(first).getMonth(),
          new Date(first).getDate() + i * step,
        ),
    );
  const { ref, start, end, paddingTop, paddingBottom } = useVirtual(rows.length, 48);
  const move = (delta: number) => {
    const next = new Date(year, m - 1 + delta, 1);
    setMonth(`${next.getFullYear()}-${String(next.getMonth() + 1).padStart(2, '0')}`);
  };
  return (
    <section className="review">
      <PageHeading
        title="工作回顾"
        description="展示任务从开始到完成的日历跨度，未完成任务延伸至当前时间。"
        actions={
          <SegmentedControl
            label="回顾范围"
            value={mode}
            onChange={setMode}
            options={[
              { value: 'month', label: '月度回顾' },
              { value: 'project', label: '系统回顾' },
            ]}
          />
        }
      />
      <div className="review-controls">
        <div className="month-picker">
          {mode === 'project' && (
            <Select
              aria-label="系统时间范围"
              value={zoom}
              onChange={(e) => {
                markNewRecordChanged();
                return setZoom(e as 'all' | 'month');
              }}
            >
              <Select.Option data-value={String('all')} value="all">
                系统全貌
              </Select.Option>
              <Select.Option data-value={String('month')} value="month">
                逐月查看
              </Select.Option>
            </Select>
          )}
          <Button
            htmlType="submit"
            type="text"
            disabled={overview}
            aria-label="上个月"
            onClick={() => move(-1)}
          >
            <CaretLeftIcon />
          </Button>
          <DatePicker
            aria-label="回顾月份"
            picker="month"
            allowClear={false}
            value={dayjs(`${month}-01`)}
            onChange={(value) => value && setMonth(value.format('YYYY-MM'))}
            disabled={overview}
          />
          <Button
            htmlType="submit"
            type="text"
            disabled={overview}
            aria-label="下个月"
            onClick={() => move(1)}
          >
            <CaretRightIcon />
          </Button>
          <Button
            htmlType="submit"
            type="default"
            className="small-button"
            onClick={() =>
              setMonth(`${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`)
            }
          >
            本月
          </Button>
        </div>
        <Select
          aria-label="回顾系统"
          value={project}
          onChange={(e) => {
            markNewRecordChanged();
            return setProject(e);
          }}
        >
          <Select.Option data-value={String('all')} value="all">
            全部系统
          </Select.Option>
          <Select.Option data-value={String('none')} value="none">
            未关联系统
          </Select.Option>
          {systems.map((p) => (
            <Select.Option data-value={String(p.id)} key={p.id} value={p.id}>
              {p.name}
            </Select.Option>
          ))}
        </Select>
      </div>
      <Row gutter={[18, 18]} className="review-metrics">
        <Col xs={8}>
          <Card>
            <Statistic
              title={mode === 'month' ? '本月涉及任务' : '系统任务总数'}
              value={mode === 'month' ? rows.length : scoped.length}
              suffix="项"
            />
          </Card>
        </Col>
        <Col xs={8}>
          <Card>
            <Statistic
              title={mode === 'month' ? '本月完成任务' : '已完成'}
              value={
                scoped.filter((t) =>
                  mode === 'month' ? completedInMonth(t, year, m - 1) : t.completedAt !== null,
                ).length
              }
              suffix="项"
            />
          </Card>
        </Col>
        <Col xs={8}>
          <Card>
            <Statistic
              title="当前未完成"
              value={
                (mode === 'month' ? rows : scoped).filter((t) => t.completedAt === null).length
              }
              suffix="项"
            />
          </Card>
        </Col>
      </Row>
      <div className="timeline-header">
        <div>任务 / 系统</div>
        <div className="timeline-axis">
          {ticks.map((d, i) => (
            <span
              key={i}
              className={d.toDateString() === now.toDateString() ? 'is-today' : ''}
              style={{ left: `${((d.getTime() - first) / span) * 100}%` }}
            >
              {step > 1 ? `${d.getMonth() + 1}/${d.getDate()}` : d.getDate()}
            </span>
          ))}
        </div>
      </div>
      <div className="timeline-body" ref={ref}>
        {!rows.length ? (
          <div className="empty-state">
            <CalendarBlankIcon size={40} weight="duotone" />
            <h3>这个时间段，还没有记录</h3>
            <p>试试其他月份，或先记下一项工作。</p>
          </div>
        ) : (
          <>
            <div style={{ height: paddingTop }} />
            {rows.slice(start, end).map((t) => {
              const p = systems.find((p) => p.id === t.systemId),
                left = Math.max(0, ((t.startedAt - first) / span) * 100),
                right = Math.min(100, (((t.completedAt ?? clock) - first) / span) * 100);
              return (
                <Button
                  htmlType="submit"
                  type="text"
                  className="timeline-row"
                  key={t.id}
                  onClick={() => onSelect(t.id)}
                  title={`${t.title}\n${dateLabel(t.startedAt, true)} → ${t.completedAt ? dateLabel(t.completedAt, true) : '截至现在'}`}
                >
                  <span className="timeline-name">
                    <span
                      className="dot"
                      style={{ background: p ? 'var(--accent)' : 'var(--muted)' }}
                    />
                    {t.title}
                  </span>
                  <span
                    className="timeline-track"
                    style={{ backgroundSize: `${(step / days) * 100}% 100%` }}
                  >
                    {clock >= first && clock < last && (
                      <i
                        className="today-line"
                        style={{ left: `${((clock - first) / span) * 100}%` }}
                      />
                    )}
                    <span
                      className={`timeline-bar ${t.completedAt === null ? 'unfinished' : ''}`}
                      style={{
                        left: `${left}%`,
                        width: `max(9px, ${Math.max(0, right - left)}%)`,
                        backgroundColor: p ? 'var(--accent-fill)' : 'var(--secondary)',
                      }}
                    >
                      {right - left > 16 ? <span>{p?.name ?? '未关联系统'}</span> : null}
                    </span>
                  </span>
                </Button>
              );
            })}
            <div style={{ height: paddingBottom }} />
          </>
        )}
      </div>
      <div className="timeline-legend">
        <span>
          <i />
          已完成
        </span>
        <span>
          <i className="dashed" />
          尚未完成
        </span>
        <span className="spacer" />
        跨度用于回顾，不代表实际工时
      </div>
    </section>
  );
}
