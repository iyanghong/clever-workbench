import { useEffect, useMemo, useState } from 'react';
import {
  CaretLeftIcon,
  CaretRightIcon,
  CalendarBlankIcon,
  ChartBarHorizontalIcon,
  CheckCircleIcon,
  ClockIcon,
} from '@phosphor-icons/react';
import type { Project, TaskSummary } from '../types';
import { completedInMonth, dateLabel, intersectsMonth } from '../domain';
import { useVirtual } from '../useVirtual';
export function Timeline({
  tasks,
  projects,
  onSelect,
}: {
  tasks: TaskSummary[];
  projects: Project[];
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
          (project === 'all' ||
            (project === 'none' ? t.projectId === null : t.projectId === project)),
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
      <div className="review-heading">
        <div>
          <span className="eyebrow">WORK, IN PERSPECTIVE</span>
          <h1>
            看见每一步进展<span className="heading-dot">.</span>
          </h1>
          <p>把做过的事，连成时间里的轨迹。</p>
        </div>
        <div className="segmented">
          <button className={mode === 'month' ? 'active' : ''} onClick={() => setMode('month')}>
            月度回顾
          </button>
          <button className={mode === 'project' ? 'active' : ''} onClick={() => setMode('project')}>
            项目回顾
          </button>
        </div>
      </div>
      <div className="review-controls">
        <div className="month-picker">
          {mode === 'project' && (
            <select
              aria-label="项目时间范围"
              value={zoom}
              onChange={(e) => setZoom(e.target.value as 'all' | 'month')}
            >
              <option value="all">项目全貌</option>
              <option value="month">逐月查看</option>
            </select>
          )}
          <button disabled={overview} aria-label="上个月" onClick={() => move(-1)}>
            <CaretLeftIcon />
          </button>
          <input
            aria-label="回顾月份"
            type="month"
            value={month}
            onChange={(e) => e.target.value && setMonth(e.target.value)}
            disabled={overview}
          />
          <button disabled={overview} aria-label="下个月" onClick={() => move(1)}>
            <CaretRightIcon />
          </button>
          <button
            className="small-button"
            onClick={() =>
              setMonth(`${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`)
            }
          >
            本月
          </button>
        </div>
        <select aria-label="回顾项目" value={project} onChange={(e) => setProject(e.target.value)}>
          <option value="all">全部项目</option>
          <option value="none">未分类</option>
          {projects.map((p) => (
            <option key={p.id} value={p.id}>
              {p.name}
              {p.archivedAt ? ' · 已归档' : ''}
            </option>
          ))}
        </select>
      </div>
      <div className="review-stats">
        <div>
          <span>{mode === 'month' ? '本月涉及任务' : '项目任务总数'}</span>
          <strong>
            {(mode === 'month' ? rows.length : scoped.length).toString().padStart(2, '0')}
          </strong>
          <ChartBarHorizontalIcon />
        </div>
        <div>
          <span>{mode === 'month' ? '本月完成任务' : '已完成'}</span>
          <strong>
            {scoped
              .filter((t) =>
                mode === 'month' ? completedInMonth(t, year, m - 1) : t.completedAt !== null,
              )
              .length.toString()
              .padStart(2, '0')}
          </strong>
          <CheckCircleIcon />
        </div>
        <div>
          <span>当前未完成</span>
          <strong>
            {(mode === 'month' ? rows : scoped)
              .filter((t) => t.completedAt === null)
              .length.toString()
              .padStart(2, '0')}
          </strong>
          <ClockIcon />
        </div>
      </div>
      <div className="timeline-header">
        <div>任务 / 项目</div>
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
              const p = projects.find((p) => p.id === t.projectId),
                left = Math.max(0, ((t.startedAt - first) / span) * 100),
                right = Math.min(100, (((t.completedAt ?? clock) - first) / span) * 100);
              return (
                <button
                  className="timeline-row"
                  key={t.id}
                  onClick={() => onSelect(t.id)}
                  title={`${t.title}\n${dateLabel(t.startedAt, true)} → ${t.completedAt ? dateLabel(t.completedAt, true) : '截至现在'}`}
                >
                  <span className="timeline-name">
                    <span className="dot" style={{ background: p?.color ?? '#92929a' }} />
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
                        backgroundColor: p?.color ?? '#7c8799',
                      }}
                    >
                      {right - left > 16 ? <span>{p?.name ?? '未分类'}</span> : null}
                    </span>
                  </span>
                </button>
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
