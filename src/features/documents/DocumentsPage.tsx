import { useEffect, useRef, useState } from 'react';
import {
  NotePencilIcon,
  PlusIcon,
  MagnifyingGlassIcon,
  TrashIcon,
  ArrowUpRightIcon,
  XIcon,
  ArrowCounterClockwiseIcon,
} from '@phosphor-icons/react';
import type { ModuleProps } from '../../app/modules';
import type { Snapshot } from '../../types';
import type { DocumentEdit, DocumentRecord } from '../../document-types';
import { Editor } from '../../components/Editor';
import { ContextPicker, contextLabel } from '../../shared/ContextPicker';
import { useAutosave } from '../../shared/useAutosave';
import { useSaveGroup } from '../../shared/useSaveGroup';
import { dateLabel } from '../../domain';
import { Dialog } from '../../shared/Dialog';

export function DocumentsPage({ route, navigate, registerFlush, setContext }: ModuleProps) {
  const [snapshot, setSnapshot] = useState<Snapshot | null>(null),
    [document, setDocument] = useState<DocumentRecord | null>(null),
    [query, setQuery] = useState(''),
    [matches, setMatches] = useState<string[] | null>(null),
    [trash, setTrash] = useState(Boolean(route.trash)),
    [scope, setScope] = useState('all'),
    [error, setError] = useState(''),
    [loading, setLoading] = useState(true);
  const saves = useSaveGroup(registerFlush),
    busy = useRef(false);
  const selectedSummary = snapshot?.documents.find((item) => item.id === document?.id);
  const visibleScope =
    selectedSummary &&
    scope !== 'all' &&
    selectedSummary.systemId !== (scope === 'common' ? null : scope)
      ? 'all'
      : scope;
  useEffect(() => setScope(visibleScope), [visibleScope]);
  useEffect(() => {
    void window.desktop
      .snapshot()
      .then(async (next) => {
        setSnapshot(next);
        if (route.objectId) {
          const record = await window.desktop.document(route.objectId);
          setTrash(record.deletedAt !== null);
          setDocument(record);
        }
      })
      .catch((cause) => setError(String(cause)))
      .finally(() => setLoading(false));
  }, []);
  useEffect(() => {
    let active = true;
    if (!query.trim() || trash) {
      setMatches(null);
      return;
    }
    const timer = setTimeout(() => {
      void window.desktop
        .searchDocuments(query)
        .then((ids) => {
          if (active) setMatches(ids);
        })
        .catch((cause) => {
          if (active) setError(String(cause));
        });
    }, 150);
    return () => {
      active = false;
      clearTimeout(timer);
    };
  }, [query, trash, snapshot]);
  useEffect(() => {
    if (!loading && !document)
      setContext({
        systemId: visibleScope === 'all' || visibleScope === 'common' ? null : visibleScope,
        projectId: route.project && route.project !== 'all' ? route.project : undefined,
      });
  }, [loading, document?.id, route.project, visibleScope]);
  async function select(id: string) {
    try {
      await saves.flush();
      setDocument(await window.desktop.document(id));
      setError('');
    } catch (cause) {
      setError(String(cause));
    }
  }
  async function create() {
    if (busy.current) return;
    busy.current = true;
    try {
      await saves.flush();
      const result = await window.desktop.mutate({
        type: 'document.create',
        context: {
          systemId: visibleScope === 'all' || visibleScope === 'common' ? null : visibleScope,
        },
        projectId: route.project && route.project !== 'all' ? route.project : undefined,
      });
      setSnapshot(result.snapshot);
      setDocument(await window.desktop.document(result.createdId!));
      setTrash(false);
      setQuery('');
    } catch (cause) {
      setError(String(cause));
    } finally {
      busy.current = false;
    }
  }
  async function changeTrash(next: boolean) {
    try {
      await saves.flush();
      setTrash(next);
      setDocument(null);
      setScope('all');
      setQuery('');
      setError('');
    } catch (cause) {
      setError(String(cause));
    }
  }
  async function changeScope(next: string) {
    try {
      await saves.flush();
      setDocument(null);
      setScope(next);
      setError('');
    } catch (cause) {
      setError(String(cause));
    }
  }
  const rows =
    snapshot?.documents.filter(
      (item) =>
        (item.deletedAt !== null) === trash &&
        (visibleScope === 'all' ||
          item.systemId === (visibleScope === 'common' ? null : visibleScope)) &&
        (!route.project || route.project === 'all' || item.projectId === route.project) &&
        (trash
          ? !query || item.title.toLowerCase().includes(query.toLowerCase())
          : matches === null || matches.includes(item.id)),
    ) ?? [];
  return (
    <main className="main documents-page">
      <header className="window-toolbar">
        <div className="breadcrumb">
          <NotePencilIcon size={18} />
          <span>
            {route.project
              ? `${snapshot?.projects.find((item) => item.id === route.project)?.name ?? '项目'} / 文档`
              : '问题与方案'}
          </span>
        </div>
        <div className="spacer" />
        <button className="toolbar-new" onClick={() => void create()}>
          <PlusIcon size={17} />
          新建文档
        </button>
      </header>
      <div className="documents-layout">
        <aside className="documents-index">
          <div className="ledger-index-title">
            <h2>文档</h2>
            <span>{rows.length}</span>
          </div>
          <div className="document-scopes">
            <button aria-pressed={!trash} onClick={() => void changeTrash(false)}>
              全部文档
            </button>
            <button
              aria-label="文档回收站"
              aria-pressed={trash}
              onClick={() => void changeTrash(true)}
            >
              <TrashIcon size={14} />
              回收站
            </button>
          </div>
          <label className="document-scope-filter">
            归属
            <select
              aria-label="文档范围"
              value={visibleScope}
              onChange={(event) => void changeScope(event.target.value)}
            >
              <option value="all">全部文档</option>
              <option value="common">通用文档</option>
              {snapshot?.systems.map((system) => (
                <option key={system.id} value={system.id}>
                  {system.name}
                </option>
              ))}
            </select>
          </label>
          <label className="document-search">
            <MagnifyingGlassIcon size={16} />
            <input
              aria-label="搜索文档"
              placeholder="搜索标题与正文"
              value={query}
              onChange={(event) => setQuery(event.target.value)}
            />
          </label>
          <nav aria-label="文档列表">
            {rows.map((item) => (
              <button
                key={item.id}
                aria-label={`文档 ${item.title || '未命名文档'}`}
                className={`document-list-row ${document?.id === item.id ? 'selected' : ''}`}
                onClick={() => void select(item.id)}
              >
                <strong>{item.title || '未命名文档'}</strong>
                <span>{contextLabel(snapshot!, item) || '通用文档'}</span>
                <small>
                  {dateLabel(item.updatedAt)} ·{' '}
                  {snapshot?.projects.find((project) => project.id === item.projectId)?.name ??
                    '无项目'}
                </small>
              </button>
            ))}
          </nav>
          {!rows.length && (
            <p className="field-hint">
              {query
                ? '没有找到匹配的文档。'
                : trash
                  ? '回收站是空的。'
                  : '先写下来，标题与归属稍后整理。'}
            </p>
          )}
        </aside>
        {snapshot && document ? (
          <DocumentEditor
            key={`${document.id}:${document.deletedAt}`}
            document={document}
            snapshot={snapshot}
            navigate={navigate}
            registerFlush={saves.register}
            setContext={setContext}
            onSnapshot={setSnapshot}
            onError={setError}
            onDocument={setDocument}
          />
        ) : (
          <section className="ledger-empty">
            <NotePencilIcon size={43} weight="duotone" />
            <h2>{trash ? '可恢复的记录' : '把问题和方案留在这里'}</h2>
            <p>{trash ? '选择文档后可恢复或彻底删除。' : '直接开始写，自动保存到本机。'}</p>
            {!trash && (
              <button className="primary-button" onClick={() => void create()}>
                开始一份文档
              </button>
            )}
          </section>
        )}
      </div>
      {error && (
        <div className="error-banner" role="alert">
          <span>{error}</span>
          <button aria-label="关闭提示" onClick={() => setError('')}>
            <XIcon />
          </button>
        </div>
      )}
    </main>
  );
}

function DocumentEditor({
  document,
  snapshot,
  navigate,
  registerFlush,
  onSnapshot,
  onError,
  onDocument,
  setContext,
}: {
  document: DocumentRecord;
  setContext: ModuleProps['setContext'];
  snapshot: Snapshot;
  navigate: ModuleProps['navigate'];
  registerFlush: ModuleProps['registerFlush'];
  onSnapshot: (snapshot: Snapshot) => void;
  onError: (message: string) => void;
  onDocument: (document: DocumentRecord | null) => void;
}) {
  const pending = useRef<Promise<void>>(Promise.resolve());
  const form = useAutosave<DocumentEdit>(
    {
      title: document.title,
      markdown: document.markdown,
      content: document.content,
      projectId: document.projectId,
      systemId: document.systemId,
      environmentId: document.environmentId,
      resourceId: document.resourceId,
    },
    async (value) => {
      onSnapshot(
        (await window.desktop.mutate({ type: 'document.edit', id: document.id, ...value }))
          .snapshot,
      );
    },
    onError,
    pending,
  );
  useEffect(() => {
    setContext({
      systemId: form.value.systemId,
      environmentId: form.value.environmentId,
      resourceId: form.value.resourceId,
      projectId: form.value.projectId,
    });
  }, [form.value.systemId, form.value.environmentId, form.value.resourceId, form.value.projectId]);
  const latest = useRef(form.value);
  latest.current = form.value;
  useEffect(() => registerFlush(form.flush), [registerFlush, form.flush]);
  const [purge, setPurge] = useState(false),
    [busy, setBusy] = useState(false),
    [dialogError, setDialogError] = useState('');
  const deleted = document.deletedAt !== null;
  async function action(type: 'document.delete' | 'document.restore' | 'document.purge') {
    if (busy) return;
    setBusy(true);
    try {
      await form.flush();
      const result = await window.desktop.mutate({ type, id: document.id });
      onSnapshot(result.snapshot);
      setPurge(false);
      onDocument(null);
    } catch (cause) {
      if (type === 'document.purge') setDialogError(String(cause));
      else onError(String(cause));
    } finally {
      setBusy(false);
    }
  }
  return (
    <section className="document-editor" aria-label="文档详情">
      <div className="record-subheading">
        <span>{deleted ? '回收站中的文档' : `创建于 ${dateLabel(document.createdAt)}`}</span>
        <button
          className="save-indicator"
          onClick={() => void form.flush().catch((cause) => onError(String(cause)))}
        >
          {form.status}
        </button>
      </div>
      <input
        className="document-title"
        aria-label="文档标题"
        placeholder="未命名文档"
        value={form.value.title}
        disabled={deleted}
        onChange={(event) => form.change({ ...form.value, title: event.target.value })}
      />
      <div className="document-context">
        <ContextPicker
          mode="system"
          unassignedSystemLabel="通用文档"
          snapshot={snapshot}
          value={form.value}
          disabled={deleted}
          onChange={(context) => form.change({ ...form.value, ...context })}
        />
        <label>
          项目（可选）
          <select
            aria-label="文档所属项目"
            value={form.value.projectId ?? ''}
            disabled={deleted}
            onChange={(event) =>
              form.change({ ...form.value, projectId: event.target.value || null })
            }
          >
            <option value="">未分类</option>
            {snapshot.projects.map((project) => (
              <option key={project.id} value={project.id}>
                {project.name}
                {project.archivedAt ? ' · 已归档' : ''}
              </option>
            ))}
          </select>
        </label>
        {form.value.systemId && (
          <button
            className="text-button"
            aria-label="回到关联对象"
            onClick={() =>
              void navigate({
                module: 'ledger',
                objectId: form.value.resourceId ?? form.value.environmentId ?? form.value.systemId!,
              })
            }
          >
            {contextLabel(snapshot, form.value)}
            <ArrowUpRightIcon size={14} />
          </button>
        )}
      </div>
      <details className="compact-details">
        <summary>关联背景</summary>
        <ContextPicker
          mode="details"
          snapshot={snapshot}
          value={form.value}
          disabled={deleted}
          onChange={(context) => form.change({ ...form.value, ...context })}
        />
      </details>
      <Editor
        markdown={form.value.markdown}
        readOnly={deleted}
        pendingRef={pending}
        onChange={(content, markdown) => {
          const value = { ...latest.current, content, markdown };
          latest.current = value;
          form.change(value);
        }}
        onError={onError}
      />
      <div className="document-footer">
        <span>自动保存 · 标题和归属均可后补</span>
        <div className="spacer" />
        {deleted ? (
          <>
            <button className="text-button" disabled={busy} onClick={() => setPurge(true)}>
              彻底删除
            </button>
            <button
              className="primary-button"
              disabled={busy}
              onClick={() => void action('document.restore')}
            >
              <ArrowCounterClockwiseIcon size={15} />
              恢复文档
            </button>
          </>
        ) : (
          <button
            className="text-button"
            disabled={busy}
            onClick={() => void action('document.delete')}
          >
            <TrashIcon size={15} />
            删除文档
          </button>
        )}
      </div>
      {purge && (
        <Dialog title="彻底删除文档" onClose={() => !busy && setPurge(false)} error={dialogError}>
          <p>“{document.title || '未命名文档'}”将无法从回收站恢复。</p>
          <div className="modal-actions">
            <button className="secondary-button" disabled={busy} onClick={() => setPurge(false)}>
              取消
            </button>
            <button
              className="danger-button"
              disabled={busy}
              onClick={() => void action('document.purge')}
            >
              彻底删除
            </button>
          </div>
        </Dialog>
      )}
    </section>
  );
}
