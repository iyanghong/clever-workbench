import type { CreationContext } from '../../app/actions';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  PlusIcon,
  MagnifyingGlassIcon,
  TrayIcon,
  ChartBarHorizontalIcon,
  ArchiveIcon,
  TrashIcon,
  GearSixIcon,
  SidebarSimpleIcon,
  CheckIcon,
  ArrowCounterClockwiseIcon,
  DotsThreeIcon,
  XIcon,
  CaretRightIcon,
  FolderSimpleIcon,
  ArrowUpRightIcon,
  ArrowRightIcon,
  CheckCircleIcon,
} from '@phosphor-icons/react';
import type { Command, Draft, Snapshot, Task } from '../../types';
import { dateLabel, emptyContent } from '../../domain';
import { Dialog } from '../../shared/Dialog';
import { Detail } from '../../components/Detail';
import { Timeline } from '../../components/Timeline';
import { useVirtual } from '../../useVirtual';
const freshDraft = (systemId: string | null = null): Draft => ({
  title: '',
  content: emptyContent(),
  markdown: '',
  projectId: null,
  systemId,
});
export type TaskView = 'tasks' | 'review' | 'trash';
function savedNavigation() {
  try {
    const n = JSON.parse(localStorage.getItem('clever-workbench-navigation') ?? '{}');
    return {
      view: (['tasks', 'review', 'trash'].includes(n.view) ? n.view : 'tasks') as TaskView,
      systemScope: typeof n.systemScope === 'string' ? n.systemScope : 'all',
      filter: (['pending', 'completed', 'all'].includes(n.filter) ? n.filter : 'pending') as
        'pending' | 'completed' | 'all',
    };
  } catch {
    return { view: 'tasks' as TaskView, systemScope: 'all', filter: 'pending' as const };
  }
}
type Confirmation = {
  title: string;
  body: string;
  confirm: string;
  cancel?: string;
  danger?: boolean;
  resolve: (answer: boolean | null) => void;
};
export function TaskWorkspace({
  initialView = 'tasks',
  initialSystem = 'all',
  initialTaskId,
  registerFlush,
  onNavigate,
  onOpenContext,
  onOpenDocuments,
  setContext,
}: {
  initialView?: TaskView;
  initialSystem?: string;
  initialTaskId?: string;
  registerFlush: (save: () => Promise<void>) => () => void;
  onNavigate: (view: TaskView, systemScope?: string) => Promise<void>;
  setContext: (context: CreationContext) => void;
  onOpenContext: (id: string) => Promise<void>;
  onOpenDocuments: (systemScope?: string, trash?: boolean) => Promise<void>;
}) {
  const [snapshot, setSnapshot] = useState<Snapshot | null>(null),
    [view, setView] = useState<TaskView>(initialView),
    [systemScope, setSystemScope] = useState(initialSystem),
    [filter, setFilter] = useState<'pending' | 'completed' | 'all'>(savedNavigation().filter),
    [layout, setLayout] = useState<'normal' | 'compact'>(() =>
      localStorage.getItem('task-layout') === 'compact' ? 'compact' : 'normal',
    ),
    [batchMode, setBatchMode] = useState(false),
    [batchIds, setBatchIds] = useState<string[]>([]),
    [batchSystem, setBatchSystem] = useState(''),
    [batchBusy, setBatchBusy] = useState(false),
    [query, setQuery] = useState(''),
    [matches, setMatches] = useState<Set<string> | null>(null),
    [selected, setSelected] = useState<string | null>(initialTaskId ?? null),
    [task, setTask] = useState<Task | null>(null),
    [draft, setDraft] = useState<Draft>(freshDraft()),
    [error, setError] = useState(''),
    [notice, setNotice] = useState<{ text: string; undo?: () => Promise<void> } | null>(null),
    [confirm, setConfirm] = useState<Confirmation | null>(null),
    [busy, setBusy] = useState('');
  useEffect(() => {
    localStorage.setItem('task-layout', layout);
  }, [layout]);
  const draftRef = useRef(draft),
    flushRef = useRef<() => Promise<void>>(async () => {}),
    quickTimer = useRef<ReturnType<typeof setTimeout> | null>(null),
    quickPending = useRef<Promise<void>>(Promise.resolve()),
    quickDirty = useRef(false),
    searchRef = useRef<HTMLInputElement>(null),
    creating = useRef(false);
  useEffect(() => {
    localStorage.setItem(
      'clever-workbench-navigation',
      JSON.stringify({ view, systemScope, filter }),
    );
  }, [view, systemScope, filter]);
  const snapshotRef = useRef(snapshot);
  snapshotRef.current = snapshot;
  const notifyError = useCallback(
    (message: string) =>
      setError(message.replace(/^Error: Error invoking remote method '[^']+': Error: /, '')),
    [],
  );
  const applySnapshot = useCallback((s: Snapshot) => setSnapshot(s), []);
  const updateDraft = useCallback((d: Draft | null) => {
    const next = d ?? freshDraft();
    draftRef.current = next;
    setDraft(next);
  }, []);
  useEffect(() => {
    window.desktop
      .snapshot()
      .then((s) => {
        setSnapshot(s);
        updateDraft(s.draft);
        if (
          !['all', 'none'].includes(initialSystem) &&
          !s.systems.some((item) => item.id === initialSystem)
        )
          setSystemScope('all');
      })
      .catch((e) => notifyError(e.message));
  }, []);
  useEffect(() => {
    if (!selected || selected === 'new') {
      setTask(null);
      return;
    }
    let active = true;
    window.desktop
      .task(selected)
      .then((t) => {
        if (active) setTask(t);
      })
      .catch((e) => notifyError(e.message));
    return () => {
      active = false;
    };
  }, [selected, snapshot?.tasks]);
  useEffect(() => {
    if (!query.trim()) {
      setMatches(null);
      return;
    }
    let active = true;
    const timer = setTimeout(
      () =>
        window.desktop
          .search(query.trim())
          .then((ids) => {
            if (active) setMatches(new Set(ids));
          })
          .catch((e) => notifyError(e.message)),
      150,
    );
    return () => {
      active = false;
      clearTimeout(timer);
    };
  }, [query, snapshot?.tasks]);
  useEffect(() => {
    if (!notice) return;
    const timer = setTimeout(() => setNotice(null), 8000);
    return () => clearTimeout(timer);
  }, [notice]);
  async function flushQuick() {
    if (quickTimer.current) {
      clearTimeout(quickTimer.current);
      quickTimer.current = null;
    }
    quickPending.current = quickPending.current
      .catch(() => {})
      .then(async () => {
        if (!quickDirty.current) return;
        const next = draftRef.current;
        await window.desktop.saveDraft(next);
        if (draftRef.current === next) quickDirty.current = false;
      });
    await quickPending.current;
  }
  async function flush() {
    await flushQuick();
    await flushRef.current();
  }
  useEffect(() => registerFlush(flush));
  const ask = (title: string, body: string, confirm = '确认', danger = false, cancel = '取消') =>
    new Promise<boolean | null>((resolve) =>
      setConfirm({ title, body, confirm, cancel, danger, resolve }),
    );
  const answer = (value: boolean | null) => {
    confirm?.resolve(value);
    setConfirm(null);
  };
  async function navigate(next: TaskView, systemId = 'all') {
    try {
      await flush();
      setSelected(null);
      setView(next);
      setSystemScope(systemId);
      await onNavigate(next, systemId);
      setQuery('');
      setMatches(null);
      if (next === 'tasks') setFilter('pending');
    } catch (e) {
      notifyError(String(e));
    }
  }
  async function select(id: string) {
    try {
      await flush();
      setTask(null);
      setSelected(id);
    } catch (e) {
      notifyError(String(e));
    }
  }
  async function newTask() {
    try {
      await flush();
      if (!draftRef.current.title && !draftRef.current.markdown) {
        const system = snapshotRef.current?.systems.find((item) => item.id === systemScope);
        updateDraft(freshDraft(system?.id ?? null));
      }
      setSelected('new');
    } catch (e) {
      notifyError(String(e));
    }
  }
  useEffect(() => {
    const listener = (e: KeyboardEvent) => {
      if (e.isComposing) return;
      if (e.key === 'Escape' && !confirm) {
        if (selected) void closeDetail();
        else {
          setQuery('');
          setError('');
        }
      }
    };
    window.addEventListener('keydown', listener);
    return () => window.removeEventListener('keydown', listener);
  });
  async function closeDetail() {
    try {
      await flush();
      setSelected(null);
    } catch (e) {
      notifyError(String(e));
    }
  }
  function quickChange(value: string) {
    const current = { ...draftRef.current, title: value };
    updateDraft(current);
    quickDirty.current = true;
    if (quickTimer.current) clearTimeout(quickTimer.current);
    quickTimer.current = setTimeout(() => {
      void flushQuick().catch((e) => notifyError(e.message));
    }, 500);
  }
  async function discardDraft() {
    try {
      await flush();
      if (
        (draftRef.current.title || draftRef.current.markdown) &&
        !(await ask(
          '丢弃这份草稿？',
          '草稿中的文字和图片将不再作为待创建记录保留。',
          '丢弃草稿',
          true,
        ))
      )
        return;
      await window.desktop.saveDraft(null);
      updateDraft(null);
      setSelected(null);
    } catch (e) {
      notifyError(String(e));
    }
  }
  async function quickCreate() {
    if (creating.current || !draftRef.current.title.trim()) return;
    creating.current = true;
    try {
      await flush();
      const current = draftRef.current;
      const result = await window.desktop.mutate({ type: 'task.create', draft: current });
      setSnapshot(result.snapshot);
      updateDraft(null);
      setFilter('pending');
      setSelected(null);
      setNotice({ text: '已记录，接下来专注做好它。' });
    } catch (e) {
      notifyError(String(e));
    } finally {
      creating.current = false;
    }
  }
  async function run(command: Command) {
    try {
      await flush();
      setNotice(null);
      if (
        command.type === 'task.purge' &&
        !(await ask(
          '彻底删除后无法撤销',
          command.id
            ? '将彻底删除这条回收站记录。'
            : '将彻底删除回收站中的全部记录。历史备份不会被修改。',
          '彻底删除',
          true,
        ))
      )
        return;
      const before =
        command.type === 'task.complete'
          ? snapshotRef.current?.tasks.find((t) => t.id === (command as { id: string }).id)
          : null;
      const result = await window.desktop.mutate(command);
      setSnapshot(result.snapshot);
      if (
        command.type === 'task.delete' ||
        command.type === 'task.purge' ||
        command.type === 'task.restore'
      )
        setSelected(null);
      if (command.type === 'task.complete' && before) {
        const id = command.id;
        setNotice({
          text: command.complete ? '又完成一件事。做得不错。' : '任务已重新打开。',
          undo: async () => {
            const response = await window.desktop.mutate({
              type: 'task.complete',
              id,
              complete: before.completedAt !== null,
              ...(before.completedAt !== null ? { completedAt: before.completedAt } : {}),
            });
            setSnapshot(response.snapshot);
            setNotice(null);
          },
        });
      }
      return true;
    } catch (e) {
      notifyError(e instanceof Error ? e.message : String(e));
      return false;
    }
  }
  const all = snapshot?.tasks ?? [],
    systems = snapshot?.systems ?? [],
    currentSystem = systems.find((item) => item.id === systemScope);
  useEffect(() => {
    if (snapshot && !selected) setContext({ systemId: currentSystem?.id ?? null });
  }, [Boolean(snapshot), selected, currentSystem?.id]);
  const scoped = useMemo(
    () =>
      all.filter(
        (t) =>
          (view === 'trash' ? t.deletedAt !== null : t.deletedAt === null) &&
          (systemScope === 'all' ||
            (systemScope === 'none' ? !t.systemId : t.systemId === systemScope)) &&
          (!matches || matches.has(t.id)),
      ),
    [all, view, systemScope, matches],
  );
  const visible = useMemo(
    () =>
      scoped
        .filter(
          (t) =>
            view === 'trash' ||
            filter === 'all' ||
            (filter === 'pending' ? t.completedAt === null : t.completedAt !== null),
        )
        .sort((a, b) => {
          if (view === 'trash') return b.deletedAt! - a.deletedAt!;
          if (filter === 'all' && (a.completedAt === null) !== (b.completedAt === null))
            return a.completedAt === null ? -1 : 1;
          return a.completedAt === null
            ? b.createdAt - a.createdAt
            : (b.completedAt ?? 0) - (a.completedAt ?? 0);
        }),
    [scoped, view, filter],
  );
  useEffect(() => {
    setBatchIds([]);
  }, [systemScope, filter, query, view]);
  async function assignSystem() {
    if (batchBusy) return;
    setBatchBusy(true);
    try {
      if (await run({ type: 'task.assign-system', ids: batchIds, systemId: batchSystem || null })) {
        if (selected && batchIds.includes(selected)) setSelected(null);
        setBatchIds([]);
        setBatchMode(false);
      }
    } finally {
      setBatchBusy(false);
    }
  }
  const virtual = useVirtual(visible.length, layout === 'compact' ? 44 : 68);
  useEffect(() => {
    if (virtual.element) virtual.element.scrollTop = 0;
  }, [view, systemScope, filter, query]);
  const pending = all.filter((t) => t.deletedAt === null && t.completedAt === null).length;
  if (!snapshot)
    return (
      <div className="loading">
        <div className="app-mark">
          <CheckIcon weight="bold" />
        </div>
        <p>{error || '正在打开你的工作台…'}</p>
      </div>
    );
  const listTitle =
    view === 'trash'
      ? '回收站'
      : query
        ? '搜索结果'
        : (currentSystem?.name ?? (systemScope === 'none' ? '未关联系统' : '工作任务'));
  return (
    <div className={`task-workspace ${selected ? 'has-detail' : ''}`}>
      <main className="main">
        <header className="window-toolbar">
          <div className="breadcrumb">
            <SidebarSimpleIcon size={18} />
            <span>工作空间</span>
            <CaretRightIcon size={11} />
            <span>{view === 'review' ? '工作回顾' : listTitle}</span>
          </div>
          <div className="spacer" />
          {view === 'tasks' && (
            <div className="project-picker">
              <select
                aria-label="系统范围"
                value={systemScope}
                onChange={(event) => void navigate('tasks', event.target.value)}
              >
                <option value="all">全部系统</option>
                <option value="none">未关联系统</option>
                {systems.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.name}
                  </option>
                ))}
              </select>
            </div>
          )}
          {view === 'trash' && (
            <button
              className="text-button"
              aria-label="文档回收站"
              onClick={() => void onOpenDocuments(undefined, true)}
            >
              文档回收站
            </button>
          )}
          {view === 'tasks' && (
            <label className="search-field">
              <MagnifyingGlassIcon size={16} />
              <input
                ref={searchRef}
                aria-label="搜索任务"
                value={query}
                placeholder="搜索记录"
                onChange={(e) => {
                  setQuery(e.target.value);
                }}
              />
              <kbd>{window.desktop.platform === 'darwin' ? '⌘' : 'Ctrl'} K</kbd>
            </label>
          )}
          <button className="toolbar-new" aria-label="新增任务" onClick={() => void newTask()}>
            <PlusIcon size={18} />
            <span>新增任务</span>
          </button>
        </header>
        <div className="workspace-content">
          {view === 'review' ? (
            <Timeline tasks={all} systems={systems} onSelect={(id) => void select(id)} />
          ) : (
            <section className="task-page">
              <div className="page-heading">
                <div>
                  <span className="eyebrow">
                    {view === 'trash'
                      ? 'ROOM TO RECONSIDER'
                      : new Date().toLocaleDateString('zh-CN', {
                          month: 'long',
                          day: 'numeric',
                          weekday: 'long',
                        })}
                  </span>
                  <h1>
                    {listTitle}
                    <span className="heading-count">{scoped.length}</span>
                  </h1>
                </div>
                {view === 'trash' && scoped.length > 0 && (
                  <button
                    className="text-button danger-text"
                    onClick={() => void run({ type: 'task.purge' })}
                  >
                    清空回收站
                  </button>
                )}
              </div>
              {view !== 'trash' ? (
                <div className="list-filter">
                  <div className="segmented">
                    {(
                      [
                        { id: 'pending', name: '未完成' },
                        { id: 'completed', name: '已完成' },
                        { id: 'all', name: '全部' },
                      ] as const
                    ).map((f) => (
                      <button
                        key={f.id}
                        className={filter === f.id ? 'active' : ''}
                        onClick={() => setFilter(f.id)}
                      >
                        {f.name}
                        <span>
                          {f.id === 'all'
                            ? scoped.length
                            : scoped.filter((t) =>
                                f.id === 'pending'
                                  ? t.completedAt === null
                                  : t.completedAt !== null,
                              ).length}
                        </span>
                      </button>
                    ))}
                  </div>
                  <div className="segmented" role="group" aria-label="任务布局">
                    {(['normal', 'compact'] as const).map((mode) => (
                      <button
                        key={mode}
                        aria-pressed={layout === mode}
                        className={layout === mode ? 'active' : ''}
                        onClick={() => setLayout(mode)}
                      >
                        {mode === 'normal' ? '正常' : '紧凑'}
                      </button>
                    ))}
                  </div>
                  <button
                    className="text-button"
                    aria-pressed={batchMode}
                    onClick={() => {
                      setBatchMode(!batchMode);
                      setBatchIds([]);
                    }}
                  >
                    批量关联系统
                  </button>
                  <span className="list-sort">
                    {filter === 'completed' ? '最近完成优先' : '最近记录优先'}
                  </span>
                </div>
              ) : (
                <p className="page-description">记录会保留在这里，直到你选择恢复或彻底删除。</p>
              )}
              {view !== 'trash' && (
                <form
                  className="quick-add"
                  onSubmit={(e) => {
                    e.preventDefault();
                    void quickCreate();
                  }}
                >
                  <PlusIcon size={20} />
                  <input
                    aria-label="快速新增任务"
                    placeholder="记下一件要做的事…"
                    value={draft.title}
                    disabled={selected === 'new'}
                    onChange={(e) => {
                      if (
                        !draft.title &&
                        !draft.markdown &&
                        systemScope !== 'all' &&
                        systemScope !== 'none'
                      )
                        updateDraft({
                          ...draftRef.current,
                          projectId: null,
                          systemId: systemScope,
                        });
                      quickChange(e.target.value);
                    }}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter' && e.nativeEvent.isComposing) e.preventDefault();
                    }}
                  />
                  <span className="quick-project">
                    {draft.title
                      ? (systems.find((p) => p.id === draft.systemId)?.name ?? '未关联系统')
                      : ''}
                  </span>
                  <button
                    type="button"
                    className="quick-expand"
                    aria-label="展开详细录入"
                    onClick={() => void newTask()}
                  >
                    <ArrowUpRightIcon size={16} />
                  </button>
                  <kbd>↵</kbd>
                </form>
              )}
              {batchMode && view === 'tasks' && (
                <div className="workspace-query">
                  <label>
                    <input
                      type="checkbox"
                      aria-label="选择当前结果"
                      checked={visible.length > 0 && visible.every((t) => batchIds.includes(t.id))}
                      disabled={batchBusy || visible.length > 1000}
                      onChange={(e) =>
                        setBatchIds(e.target.checked ? visible.map((t) => t.id) : [])
                      }
                    />
                    选择当前结果
                  </label>
                  <span>已选 {batchIds.length} 项</span>
                  <select
                    aria-label="批量关联系统"
                    value={batchSystem}
                    disabled={batchBusy}
                    onChange={(e) => setBatchSystem(e.target.value)}
                  >
                    <option value="">未关联系统</option>
                    {systems.map((s) => (
                      <option key={s.id} value={s.id}>
                        {s.name}
                      </option>
                    ))}
                  </select>
                  <button
                    className="primary-button"
                    disabled={!batchIds.length || batchBusy}
                    onClick={() => void assignSystem()}
                  >
                    应用到所选任务
                  </button>
                </div>
              )}
              <div className="list-section-label">
                <span>
                  {query
                    ? '匹配的记录'
                    : view === 'trash'
                      ? '已删除记录'
                      : filter === 'completed'
                        ? '每一步，都算数'
                        : '把注意力留给重要的事'}
                </span>
                <span>{visible.length} 项</span>
              </div>
              <div
                className={`task-list ${layout === 'compact' ? 'compact-tasks' : ''}`}
                ref={virtual.ref}
              >
                {visible.length ? (
                  <>
                    <div style={{ height: virtual.paddingTop }} />
                    {visible.slice(virtual.start, virtual.end).map((t) => {
                      const p = systems.find((p) => p.id === t.systemId);
                      return (
                        <div
                          className={`task-row ${selected === t.id ? 'selected' : ''}`}
                          key={t.id}
                        >
                          {batchMode && view === 'tasks' && (
                            <input
                              type="checkbox"
                              aria-label={`选择任务 ${t.title}`}
                              checked={batchIds.includes(t.id)}
                              disabled={batchBusy}
                              onChange={(e) =>
                                setBatchIds((ids) =>
                                  e.target.checked
                                    ? [...ids, t.id]
                                    : ids.filter((id) => id !== t.id),
                                )
                              }
                            />
                          )}
                          <button
                            className={`completion ${t.completedAt !== null ? 'checked' : ''}`}
                            aria-label={
                              t.completedAt !== null ? `重新打开 ${t.title}` : `完成 ${t.title}`
                            }
                            disabled={view === 'trash'}
                            onClick={() =>
                              void run({
                                type: 'task.complete',
                                id: t.id,
                                complete: t.completedAt === null,
                              })
                            }
                          >
                            {t.completedAt !== null && <CheckIcon weight="bold" size={13} />}
                          </button>
                          <button
                            className="task-open"
                            title={t.title}
                            onClick={() => void select(t.id)}
                          >
                            <span className={`task-title ${t.completedAt !== null ? 'done' : ''}`}>
                              {t.title}
                            </span>
                            <span className="task-subtitle">
                              <span
                                className="dot"
                                style={{ background: p ? '#007aff' : '#b1b1b9' }}
                              />
                              {p?.name ?? '未关联系统'}
                              <span className="subtitle-divider">·</span>
                              {view === 'trash'
                                ? `${dateLabel(t.deletedAt)}删除`
                                : t.completedAt
                                  ? `${dateLabel(t.completedAt)}完成`
                                  : `${dateLabel(t.startedAt)}开始`}
                            </span>
                          </button>
                          {view === 'trash' ? (
                            <>
                              <button
                                className="icon-button"
                                aria-label={`恢复 ${t.title}`}
                                onClick={() => void run({ type: 'task.restore', id: t.id })}
                              >
                                <ArrowCounterClockwiseIcon size={18} />
                              </button>
                              <button
                                className="icon-button danger-hover"
                                aria-label={`彻底删除 ${t.title}`}
                                onClick={() => void run({ type: 'task.purge', id: t.id })}
                              >
                                <TrashIcon size={17} />
                              </button>
                            </>
                          ) : (
                            <CaretRightIcon className="row-arrow" size={14} />
                          )}
                        </div>
                      );
                    })}
                    <div style={{ height: virtual.paddingBottom }} />
                  </>
                ) : (
                  <div className="empty-state">
                    <div className="empty-orbit">
                      <TrayIcon size={35} weight="duotone" />
                    </div>
                    <h3>
                      {query
                        ? '没有找到这条记录'
                        : view === 'trash'
                          ? '回收站是空的'
                          : filter === 'completed'
                            ? '期待你的第一个完成时刻'
                            : '留一点空间，给专注'}
                    </h3>
                    <p>
                      {query
                        ? '试试其他关键词，或清除筛选。'
                        : view === 'trash'
                          ? '删除的任务可以在这里找回。'
                          : '从一行文字开始，把工作慢慢变成成果。'}
                    </p>
                    {query ? (
                      <button
                        className="secondary-button"
                        onClick={() => {
                          setQuery('');
                          setSystemScope('all');
                          setFilter('all');
                        }}
                      >
                        清除筛选
                      </button>
                    ) : (
                      view !== 'trash' && (
                        <button className="empty-cta" onClick={() => void newTask()}>
                          记下第一件事 <ArrowRightIcon size={16} />
                        </button>
                      )
                    )}
                  </div>
                )}
              </div>
              <footer className="list-footer">
                <span className="status-dot saved" />
                所有记录保存在此设备
                <span className="spacer" />
                <span>{window.desktop.platform === 'darwin' ? '⌘ N' : 'Ctrl N'} 快速记录</span>
              </footer>
            </section>
          )}
          {selected && (selected === 'new' || (task && task.id === selected)) && (
            <Detail
              key={selected}
              task={selected === 'new' ? null : task}
              draft={draft}
              snapshot={snapshot}
              setContext={setContext}
              onOpenContext={onOpenContext}
              onClose={() => void closeDetail()}
              onDiscard={() => void discardDraft()}
              onSnapshot={applySnapshot}
              onDraft={updateDraft}
              onCreated={(id, s) => {
                setSnapshot(s);
                setSelected(id);
                setFilter('pending');
                setView('tasks');
              }}
              onError={notifyError}
              flushRef={flushRef}
              onCommand={run}
            />
          )}
        </div>
      </main>
      {error && (
        <div className="error-banner" role="alert">
          <span>{error}</span>
          <button aria-label="关闭提示" onClick={() => setError('')}>
            <XIcon />
          </button>
        </div>
      )}
      {notice && (
        <div className="toast" role="status">
          <CheckCircleIcon size={19} weight="fill" />
          <span>{notice.text}</span>
          {notice.undo && (
            <button onClick={() => void notice.undo!().catch((e) => notifyError(e.message))}>
              撤销
            </button>
          )}
        </div>
      )}
      {busy && (
        <div className="busy-overlay" role="status">
          <span className="spinner" />
          {busy}
        </div>
      )}
      {confirm && (
        <Dialog title={confirm.title} onClose={() => answer(null)}>
          <p className="multiline">{confirm.body}</p>
          <div className="modal-actions">
            {confirm.cancel !== '取消' && (
              <button className="text-button" onClick={() => answer(null)}>
                取消
              </button>
            )}
            <button className="secondary-button" onClick={() => answer(false)}>
              {confirm.cancel ?? '取消'}
            </button>
            <button
              autoFocus
              className={confirm.danger ? 'danger-button' : 'primary-button'}
              onClick={() => answer(true)}
            >
              {confirm.confirm}
            </button>
          </div>
        </Dialog>
      )}
    </div>
  );
}
