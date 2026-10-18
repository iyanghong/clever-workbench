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
import type { Command, Draft, Project, Snapshot, Task } from '../../types';
import { dateLabel, emptyContent, projectColors } from '../../domain';
import { Detail } from '../../components/Detail';
import { Timeline } from '../../components/Timeline';
import { useVirtual } from '../../useVirtual';
const freshDraft = (projectId: string | null = null): Draft => ({
  title: '',
  content: emptyContent(),
  markdown: '',
  projectId,
});
export type TaskView = 'tasks' | 'review' | 'archive' | 'trash';
function savedNavigation() {
  try {
    const n = JSON.parse(localStorage.getItem('clever-workbench-navigation') ?? '{}');
    return {
      view: (['tasks', 'review', 'archive', 'trash'].includes(n.view)
        ? n.view
        : 'tasks') as TaskView,
      project: typeof n.project === 'string' ? n.project : 'all',
      filter: (['pending', 'completed', 'all'].includes(n.filter) ? n.filter : 'pending') as
        'pending' | 'completed' | 'all',
    };
  } catch {
    return { view: 'tasks' as TaskView, project: 'all', filter: 'pending' as const };
  }
}
const initialNavigation = savedNavigation();
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
  initialProject = 'all',
  initialTaskId,
  registerFlush,
  onNavigate,
  onOpenContext,
  onOpenDocuments,
  setContext,
}: {
  initialView?: TaskView;
  initialProject?: string;
  initialTaskId?: string;
  registerFlush: (save: () => Promise<void>) => () => void;
  onNavigate: (view: TaskView, project?: string) => Promise<void>;
  setContext: (context: CreationContext) => void;
  onOpenContext: (id: string) => Promise<void>;
  onOpenDocuments: (project?: string, trash?: boolean) => Promise<void>;
}) {
  const [snapshot, setSnapshot] = useState<Snapshot | null>(null),
    [view, setView] = useState<TaskView>(initialView),
    [project, setProject] = useState(initialProject),
    [filter, setFilter] = useState<'pending' | 'completed' | 'all'>(initialNavigation.filter),
    [query, setQuery] = useState(''),
    [matches, setMatches] = useState<Set<string> | null>(null),
    [selected, setSelected] = useState<string | null>(initialTaskId ?? null),
    [task, setTask] = useState<Task | null>(null),
    [draft, setDraft] = useState<Draft>(freshDraft()),
    [error, setError] = useState(''),
    [notice, setNotice] = useState<{ text: string; undo?: () => Promise<void> } | null>(null),
    [confirm, setConfirm] = useState<Confirmation | null>(null),
    [projectEditor, setProjectEditor] = useState<Partial<Project> | null>(null),
    [projectName, setProjectName] = useState(''),
    [projectColor, setProjectColor] = useState(projectColors[0]),
    [busy, setBusy] = useState('');
  const draftRef = useRef(draft),
    flushRef = useRef<() => Promise<void>>(async () => {}),
    quickTimer = useRef<ReturnType<typeof setTimeout> | null>(null),
    quickPending = useRef<Promise<void>>(Promise.resolve()),
    searchRef = useRef<HTMLInputElement>(null),
    dialogRef = useRef<HTMLDialogElement>(null),
    projectDialogRef = useRef<HTMLDialogElement>(null),
    creating = useRef(false);
  useEffect(() => {
    localStorage.setItem('clever-workbench-navigation', JSON.stringify({ view, project, filter }));
  }, [view, project, filter]);
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
        if (s.projects.some((item) => item.id === initialProject && item.archivedAt !== null))
          setFilter('all');
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
  useEffect(() => {
    if (confirm) dialogRef.current?.showModal();
  }, [confirm]);
  useEffect(() => {
    if (projectEditor) projectDialogRef.current?.showModal();
  }, [projectEditor]);
  async function flushQuick() {
    if (quickTimer.current) {
      clearTimeout(quickTimer.current);
      quickTimer.current = null;
      const d = draftRef.current;
      quickPending.current = quickPending.current
        .catch(() => {})
        .then(() => window.desktop.saveDraft(d));
    }
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
  async function navigate(next: TaskView, projectId = 'all') {
    try {
      await flush();
      setSelected(null);
      setView(next);
      setProject(projectId);
      await onNavigate(next, projectId);
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
        const p = snapshotRef.current?.projects.find((p) => p.id === project);
        updateDraft(freshDraft(p && p.archivedAt === null ? p.id : null));
      }
      setSelected('new');
    } catch (e) {
      notifyError(String(e));
    }
  }
  useEffect(() => {
    const listener = (e: KeyboardEvent) => {
      if (e.isComposing) return;
      if (e.key === 'Escape' && !confirm && !projectEditor) {
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
    if (quickTimer.current) clearTimeout(quickTimer.current);
    quickTimer.current = setTimeout(() => {
      quickTimer.current = null;
      quickPending.current = quickPending.current
        .catch(() => {})
        .then(() => window.desktop.saveDraft(current));
      void quickPending.current.catch((e) => notifyError(e.message));
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
      if (command.type === 'task.complete' && !command.complete) {
        const item = snapshotRef.current?.tasks.find(
          (t) => t.id === (command as { id: string }).id,
        );
        const p = snapshotRef.current?.projects.find((p) => p.id === item?.projectId);
        if (p?.archivedAt) {
          if (
            !(await ask(
              '恢复项目并重新打开？',
              `“${p.name}”已归档。重新打开任务会同时将项目恢复到常用项目。`,
              '恢复并重新打开',
            ))
          )
            return;
          command = { ...command, restoreProject: true };
        }
      }
      if (command.type === 'task.restore') {
        const item = snapshotRef.current?.tasks.find(
          (t) => t.id === (command as { id: string }).id,
        );
        const p = snapshotRef.current?.projects.find((p) => p.id === item?.projectId);
        if (item?.completedAt === null && p?.archivedAt) {
          const restore = await ask(
            '恢复到哪个位置？',
            '原项目已归档。选择“同时恢复项目”保留归属，选择“恢复到未分类”则保留项目归档状态。',
            '同时恢复项目',
            false,
            '恢复到未分类',
          );
          if (restore === null) return;
          command = { ...command, destination: restore ? 'original' : 'unclassified' };
        }
      }
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
      if (
        command.type === 'project.delete' &&
        !(await ask('删除空项目？', '仅能删除没有关联任务的项目。', '删除项目', true))
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
      if (command.type === 'project.delete') {
        setProject('all');
        setSelected(null);
      }
      if (command.type === 'project.archive') {
        setSelected(null);
        setProject('all');
        setNotice({ text: command.archived ? '项目已归档，历史记录仍可回顾。' : '项目已恢复。' });
      }
      return true;
    } catch (e) {
      notifyError(e instanceof Error ? e.message : String(e));
      return false;
    }
  }
  function editProject(p?: Project) {
    setError('');
    setProjectEditor(p ?? {});
    setProjectName(p?.name ?? '');
    setProjectColor(
      p?.color ?? projectColors[(snapshot?.projects.length ?? 0) % projectColors.length],
    );
  }
  async function saveProject() {
    try {
      const saved = await run(
        projectEditor?.id
          ? { type: 'project.edit', id: projectEditor.id, name: projectName, color: projectColor }
          : { type: 'project.create', name: projectName, color: projectColor },
      );
      if (saved) setProjectEditor(null);
    } catch (e) {
      notifyError(String(e));
    }
  }
  const all = snapshot?.tasks ?? [],
    projects = snapshot?.projects ?? [],
    currentProject = projects.find((p) => p.id === project);
  useEffect(() => {
    if (!selected) setContext({ projectId: currentProject?.id ?? null });
  }, [selected, currentProject?.id]);
  const scoped = useMemo(
    () =>
      all.filter(
        (t) =>
          (view === 'trash' ? t.deletedAt !== null : t.deletedAt === null) &&
          (project === 'all' ||
            (project === 'none' ? t.projectId === null : t.projectId === project)) &&
          (view === 'trash' ||
            project !== 'all' ||
            matches !== null ||
            !projects.some((p) => p.id === t.projectId && p.archivedAt !== null)) &&
          (!matches || matches.has(t.id)),
      ),
    [all, projects, view, project, matches],
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
  const virtual = useVirtual(visible.length, 68);
  useEffect(() => {
    if (virtual.element) virtual.element.scrollTop = 0;
  }, [view, project, filter, query]);
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
        : (currentProject?.name ?? (project === 'none' ? '未分类' : '工作任务'));
  return (
    <div className={`task-workspace ${selected ? 'has-detail' : ''}`}>
      <main className="main">
        <header className="window-toolbar">
          <div className="breadcrumb">
            <SidebarSimpleIcon size={18} />
            <span>工作空间</span>
            <CaretRightIcon size={11} />
            <span>
              {view === 'review' ? '工作回顾' : view === 'archive' ? '归档项目' : listTitle}
            </span>
          </div>
          <div className="spacer" />
          {view === 'tasks' && (
            <div className="project-picker">
              <select
                aria-label="项目范围"
                value={project}
                onChange={(event) => void navigate('tasks', event.target.value)}
              >
                <option value="all">全部项目</option>
                <option value="none">未分类</option>
                {projects
                  .filter((p) => p.archivedAt === null || p.id === project)
                  .map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.name}
                    </option>
                  ))}
              </select>
              <button className="icon-button" aria-label="新增项目" onClick={() => editProject()}>
                <PlusIcon size={16} />
              </button>
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
                  setProject('all');
                  setFilter('all');
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
            <Timeline tasks={all} projects={projects} onSelect={(id) => void select(id)} />
          ) : view === 'archive' ? (
            <section className="archive-page">
              <span className="eyebrow">A LITTLE ROOM FOR WHAT’S NEXT</span>
              <h1>归档项目</h1>
              <p className="page-description">项目可以结束，做过的工作一直都在。</p>
              {projects.filter((p) => p.archivedAt !== null).length ? (
                projects
                  .filter((p) => p.archivedAt !== null)
                  .map((p) => (
                    <div className="archive-row" key={p.id}>
                      <span className="project-dot" style={{ background: p.color }} />
                      <button
                        className="archive-title"
                        onClick={() => {
                          void navigate('tasks', p.id).then(() => setFilter('all'));
                        }}
                      >
                        <strong>{p.name}</strong>
                        <small>
                          {all.filter((t) => t.projectId === p.id && t.deletedAt === null).length}{' '}
                          条记录 · {dateLabel(p.archivedAt)}归档
                        </small>
                      </button>
                      <button
                        className="text-button"
                        aria-label={`查看项目文档 ${p.name}`}
                        onClick={() => void onOpenDocuments(p.id)}
                      >
                        文档{' '}
                        {
                          snapshot.documents.filter(
                            (item) => item.projectId === p.id && item.deletedAt === null,
                          ).length
                        }
                      </button>
                      <button
                        className="secondary-button"
                        onClick={() =>
                          void run({ type: 'project.archive', id: p.id, archived: false })
                        }
                      >
                        恢复项目
                      </button>
                    </div>
                  ))
              ) : (
                <div className="empty-state">
                  <ArchiveIcon size={44} weight="duotone" />
                  <h3>这里会收好结束的项目</h3>
                  <p>完成项目中的任务后，即可归档。</p>
                </div>
              )}
            </section>
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
                {currentProject && (
                  <button
                    className="icon-button project-menu"
                    aria-label="项目设置"
                    onClick={() => editProject(currentProject)}
                  >
                    <DotsThreeIcon size={24} />
                  </button>
                )}
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
                  <span className="list-sort">
                    {filter === 'completed' ? '最近完成优先' : '最近记录优先'}
                  </span>
                </div>
              ) : (
                <p className="page-description">记录会保留在这里，直到你选择恢复或彻底删除。</p>
              )}
              {view !== 'trash' && !currentProject?.archivedAt && (
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
                        project !== 'all' &&
                        project !== 'none'
                      )
                        updateDraft({ ...draftRef.current, projectId: project });
                      quickChange(e.target.value);
                    }}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter' && e.nativeEvent.isComposing) e.preventDefault();
                    }}
                  />
                  <span className="quick-project">
                    {draft.title
                      ? (projects.find((p) => p.id === draft.projectId)?.name ?? '未分类')
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
              <div className="task-list" ref={virtual.ref}>
                {visible.length ? (
                  <>
                    <div style={{ height: virtual.paddingTop }} />
                    {visible.slice(virtual.start, virtual.end).map((t) => {
                      const p = projects.find((p) => p.id === t.projectId);
                      return (
                        <div
                          className={`task-row ${selected === t.id ? 'selected' : ''}`}
                          key={t.id}
                        >
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
                          <button className="task-open" onClick={() => void select(t.id)}>
                            <span className={`task-title ${t.completedAt !== null ? 'done' : ''}`}>
                              {t.title}
                            </span>
                            <span className="task-subtitle">
                              <span className="dot" style={{ background: p?.color ?? '#b1b1b9' }} />
                              {p?.name ?? '未分类'}
                              {p?.archivedAt ? ' · 已归档' : ''}
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
                          setProject('all');
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
        <dialog
          ref={dialogRef}
          className="modal"
          onCancel={(e) => {
            e.preventDefault();
            answer(null);
          }}
        >
          <h2>{confirm.title}</h2>
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
        </dialog>
      )}
      {projectEditor && (
        <dialog ref={projectDialogRef} className="modal" onCancel={() => setProjectEditor(null)}>
          <div className="modal-heading">
            <h2>{projectEditor.id ? '项目设置' : '新建项目'}</h2>
            <button className="icon-button" onClick={() => setProjectEditor(null)}>
              <XIcon />
            </button>
          </div>
          <label className="field-label">
            项目名称
            <input
              aria-label="项目名称"
              autoFocus
              value={projectName}
              placeholder="例如：产品迭代"
              onChange={(e) => setProjectName(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && !e.nativeEvent.isComposing) void saveProject();
              }}
            />
          </label>
          <p className="error-text" role="alert">
            {error}
          </p>
          <div className="color-picker">
            {projectColors.map((color) => (
              <button
                key={color}
                aria-label={`项目颜色 ${color}`}
                aria-pressed={color === projectColor}
                style={{ background: color }}
                onClick={() => setProjectColor(color)}
              >
                {color === projectColor && <CheckIcon weight="bold" size={16} />}
              </button>
            ))}
          </div>
          <div className="modal-actions">
            {projectEditor.id && (
              <button
                className="text-button"
                onClick={() => {
                  setProjectEditor(null);
                  void run({
                    type: 'project.archive',
                    id: projectEditor.id!,
                    archived: !projectEditor.archivedAt,
                  });
                }}
              >
                {projectEditor.archivedAt ? '恢复项目' : '归档项目'}
              </button>
            )}
            {projectEditor.id && (
              <button
                className="text-button danger-text"
                onClick={() => {
                  setProjectEditor(null);
                  void run({ type: 'project.delete', id: projectEditor.id! });
                }}
              >
                删除
              </button>
            )}
            <span className="spacer" />
            <button className="primary-button" disabled={!projectName.trim()} onClick={saveProject}>
              保存项目
            </button>
          </div>
        </dialog>
      )}
    </div>
  );
}
