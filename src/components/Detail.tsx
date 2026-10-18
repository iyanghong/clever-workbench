import { useEffect, useRef, useState } from 'react';
import {
  XIcon,
  ArrowsOutSimpleIcon,
  ArrowsInSimpleIcon,
  CalendarBlankIcon,
  CaretDownIcon,
  CheckIcon,
  ArrowCounterClockwiseIcon,
  TrashIcon,
  ArrowUpRightIcon,
} from '@phosphor-icons/react';
import type { Draft, Snapshot, Task, Command } from '../types';
import { dateLabel, localInput, minute, validateTimes } from '../domain';
import { ContextPicker, contextLabel } from '../shared/ContextPicker';
import { useAutosave } from '../shared/useAutosave';
import { Editor } from './Editor';
export function Detail({
  task,
  draft,
  snapshot,
  onOpenContext,
  onClose,
  onDiscard,
  onSnapshot,
  onDraft,
  onCreated,
  onError,
  flushRef,
  onCommand,
}: {
  task: Task | null;
  draft: Draft;
  snapshot: Snapshot;
  onOpenContext: (id: string) => Promise<void>;
  onClose: () => void;
  onDiscard: () => void;
  onSnapshot: (s: Snapshot) => void;
  onDraft: (d: Draft | null) => void;
  onCreated: (id: string, s: Snapshot) => void;
  onError: (m: string) => void;
  flushRef: React.MutableRefObject<() => Promise<void>>;
  onCommand: (c: Command) => Promise<boolean | undefined>;
}) {
  const projects = snapshot.projects;
  const pendingImports = useRef<Promise<void>>(Promise.resolve());
  const form = useAutosave<Draft>(
    task
      ? {
          title: task.title,
          content: task.content,
          markdown: task.markdown,
          projectId: task.projectId,
          systemId: task.systemId,
          environmentId: task.environmentId,
          resourceId: task.resourceId,
        }
      : draft,
    async (payload) => {
      if (task) {
        const result = await window.desktop.mutate({ type: 'task.edit', id: task.id, ...payload });
        onSnapshot(result.snapshot);
      } else {
        await window.desktop.saveDraft(payload);
        onDraft(payload);
      }
    },
    onError,
    pendingImports,
  );
  const { value, status, flush: save } = form;
  const latest = useRef(value);
  const [expanded, setExpanded] = useState(false),
    [dates, setDates] = useState(false),
    [start, setStart] = useState(localInput(task?.startedAt ?? draft.startedAt ?? minute())),
    [end, setEnd] = useState(task?.completedAt ? localInput(task.completedAt) : ''),
    [busy, setBusy] = useState(false);
  useEffect(() => {
    flushRef.current = save;
    return () => {
      flushRef.current = async () => {};
    };
  }, [save]);
  function change(next: Draft) {
    latest.current = next;
    form.change(next);
    if (!task) onDraft(next);
  }
  async function create() {
    if (busy) return;
    setBusy(true);
    try {
      await save();
      const result = await window.desktop.mutate({ type: 'task.create', draft: latest.current });
      onDraft(null);
      onCreated(result.createdId!, result.snapshot);
    } catch (e) {
      onError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  }
  useEffect(() => {
    const listener = (e: KeyboardEvent) => {
      if (e.key === 'Enter' && (e.metaKey || e.ctrlKey) && !e.isComposing && !task) {
        e.preventDefault();
        void create();
      }
    };
    window.addEventListener('keydown', listener);
    return () => window.removeEventListener('keydown', listener);
  });
  useEffect(() => {
    setStart(localInput(task?.startedAt ?? draft.startedAt ?? minute()));
    setEnd(task?.completedAt ? localInput(task.completedAt) : '');
  }, [task?.startedAt, task?.completedAt]);
  const deleted = task?.deletedAt != null;
  const currentProject = projects.find((p) => p.id === value.projectId);
  return (
    <aside
      className={`detail ${expanded ? 'expanded' : ''}`}
      aria-label={task ? '任务详情' : '新增任务'}
    >
      <header className="detail-toolbar">
        <span className="eyebrow">{task ? '任务详情' : '新建记录'}</span>
        <div className="spacer" />
        <button
          className="icon-button"
          aria-label={expanded ? '退出放大' : '放大编辑'}
          onClick={() => setExpanded(!expanded)}
        >
          {expanded ? <ArrowsInSimpleIcon size={17} /> : <ArrowsOutSimpleIcon size={17} />}
        </button>
        <button className="icon-button" aria-label="关闭详情" onClick={onClose}>
          <XIcon size={18} />
        </button>
      </header>
      <div className="detail-content">
        <div className="detail-meta">
          <select
            disabled={deleted}
            aria-label="所属项目"
            value={value.projectId ?? ''}
            onChange={(e) => change({ ...value, projectId: e.target.value || null })}
          >
            <option value="">未分类</option>
            {projects
              .filter((p) => p.archivedAt === null || p.id === value.projectId)
              .map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name}
                  {p.archivedAt ? ' · 已归档' : ''}
                </option>
              ))}
          </select>
          <span className="dot" style={{ background: currentProject?.color ?? '#9c9ca3' }} />
          {currentProject?.archivedAt && <span className="tag">已归档</span>}
        </div>
        <details className="compact-details task-context">
          <summary>关联背景{value.systemId ? ` · ${contextLabel(snapshot, value)}` : ''}</summary>
          <ContextPicker
            snapshot={snapshot}
            value={value}
            disabled={deleted}
            onChange={(context) => change({ ...value, ...context })}
          />
          {value.systemId && (
            <button
              className="text-button"
              aria-label="回到关联对象"
              onClick={() =>
                void onOpenContext(value.resourceId ?? value.environmentId ?? value.systemId!)
              }
            >
              <ArrowUpRightIcon size={14} />
              回到台账
            </button>
          )}
        </details>
        <textarea
          disabled={deleted}
          className="detail-title"
          aria-label="任务标题"
          rows={2}
          placeholder="这次，完成什么？"
          value={value.title}
          onChange={(e) => change({ ...value, title: e.target.value.replace(/\n/g, '') })}
        />
        <button disabled={deleted} className="date-summary" onClick={() => setDates(!dates)}>
          <CalendarBlankIcon size={15} />
          <span>
            {dateLabel(task?.startedAt ?? value.startedAt ?? minute())}
            {task?.completedAt ? ` — ${dateLabel(task.completedAt)}` : '开始'}
          </span>
          <CaretDownIcon size={12} className={dates ? 'rotate' : ''} />
        </button>
        {dates && (
          <div className="date-fields">
            <label>
              开始时间
              <input
                type="datetime-local"
                aria-label="开始时间"
                value={start}
                onChange={(e) => setStart(e.target.value)}
              />
            </label>
            {task?.completedAt !== null && task && (
              <label>
                完成时间
                <input
                  type="datetime-local"
                  aria-label="完成时间"
                  value={end}
                  onChange={(e) => setEnd(e.target.value)}
                />
              </label>
            )}
            <div className="date-fields-bottom">
              <small>
                {task ? `录入于 ${dateLabel(task.createdAt, true)}` : '留空使用当前时间'}
              </small>
              <button
                className="small-button"
                onClick={async () => {
                  try {
                    await save();
                    if (task) {
                      const saved = await onCommand({
                        type: 'task.dates',
                        id: task.id,
                        startedAt: minute(new Date(start).getTime()),
                        completedAt:
                          task.completedAt === null ? null : minute(new Date(end).getTime()),
                      });
                      if (!saved) return;
                    } else {
                      const startedAt = minute(new Date(start).getTime());
                      validateTimes(startedAt, null);
                      change({ ...latest.current, startedAt });
                    }
                    setDates(false);
                  } catch (e) {
                    onError(String(e));
                  }
                }}
              >
                应用时间
              </button>
            </div>
          </div>
        )}
        <Editor
          pendingRef={pendingImports}
          readOnly={deleted}
          markdown={value.markdown}
          onChange={(content, markdown) => change({ ...latest.current, content, markdown })}
          onError={onError}
        />
      </div>
      <footer className="detail-footer">
        <button
          className={`save-indicator ${status.startsWith('保存失败') ? 'error-text' : ''}`}
          onClick={() => void save().catch((e) => onError(e.message))}
        >
          <span className={`status-dot ${status === '已保存' ? 'saved' : ''}`} />
          {!task && status === '已保存' ? '草稿已保存' : status}
        </button>
        <div className="spacer" />
        {task && deleted ? (
          <>
            <button
              className="secondary-button"
              onClick={() => void onCommand({ type: 'task.purge', id: task.id })}
            >
              彻底删除
            </button>
            <button
              className="primary-button"
              onClick={() => void onCommand({ type: 'task.restore', id: task.id })}
            >
              恢复任务
            </button>
          </>
        ) : task ? (
          <>
            <button
              className="icon-button danger-hover"
              aria-label="删除任务"
              onClick={async () => {
                await save();
                await onCommand({ type: 'task.delete', id: task.id });
              }}
            >
              <TrashIcon size={17} />
            </button>
            <button
              className={task.completedAt === null ? 'primary-button' : 'secondary-button'}
              onClick={async () => {
                await save();
                await onCommand({
                  type: 'task.complete',
                  id: task.id,
                  complete: task.completedAt === null,
                });
              }}
            >
              {task.completedAt === null ? (
                <CheckIcon size={16} />
              ) : (
                <ArrowCounterClockwiseIcon size={16} />
              )}
              {task.completedAt === null ? '标记完成' : '重新打开'}
            </button>
          </>
        ) : (
          <>
            <button className="text-button" onClick={onDiscard}>
              丢弃
            </button>
            <button
              className="primary-button"
              disabled={!value.title.trim() || busy}
              onClick={create}
            >
              创建任务
              <span className="keyhint">
                {window.desktop.platform === 'darwin' ? '⌘' : 'Ctrl'} ↵
              </span>
            </button>
          </>
        )}
      </footer>
    </aside>
  );
}
