import { markNewRecordChanged } from '../../shared/new-record';
import { Button, Card, Empty, Input, Select, Collapse } from 'antd';
import { useEffect, useRef, useState } from 'react';
import {
  NotePencilIcon,
  PlusIcon,
  MagnifyingGlassIcon,
  TrashIcon,
  ArrowUpRightIcon,
  XIcon,
  ArrowCounterClockwiseIcon,
  ArrowsOutSimpleIcon,
  ArrowsInSimpleIcon,
  ListBulletsIcon,
} from '@phosphor-icons/react';
import { DocumentOutline, useDocumentOutline } from './DocumentOutline';
import type { ModuleProps } from '../../app/modules';
import type { Snapshot } from '../../types';
import type { DocumentEdit, DocumentRecord } from '../../document-types';
import { Editor } from '../../components/Editor';
import { ContextPicker, contextLabel } from '../../shared/ContextPicker';
import { useAutosave } from '../../shared/useAutosave';
import { useSaveGroup } from '../../shared/useSaveGroup';
import { dateLabel } from '../../domain';
import { Dialog } from '../../shared/Dialog';
import { GuidanceButton } from '../guidance/Guidance';

export function DocumentsPage({ route, navigate, registerFlush, setContext }: ModuleProps) {
  const [snapshot, setSnapshot] = useState<Snapshot | null>(null),
    [document, setDocument] = useState<DocumentRecord | null>(null),
    [query, setQuery] = useState(''),
    [matches, setMatches] = useState<string[] | null>(null),
    [trash, setTrash] = useState(Boolean(route.trash)),
    [scope, setScope] = useState('all'),
    [error, setError] = useState(''),
    [focusMode, setFocusMode] = useState(false),
    [loading, setLoading] = useState(true);
  const saves = useSaveGroup(registerFlush),
    busy = useRef(false);
  useEffect(() => {
    if (!document) setFocusMode(false);
  }, [document]);
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
    <main className="main documents-page" aria-busy={loading || !snapshot}>
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
        {trash ? (
          <GuidanceButton guideId="recycle-documents" accessibleLabel="文档回收站使用指引" />
        ) : (
          <GuidanceButton placement="documents" accessibleLabel="文档使用指引" />
        )}
        <Button
          htmlType="submit"
          type="primary"
          className="toolbar-new"
          onClick={() => void create()}
        >
          <PlusIcon size={17} />
          新建文档
        </Button>
      </header>
      <div className={`documents-layout ${focusMode ? 'focused' : ''}`}>
        <Card className="documents-index">
          <div className="ledger-index-title">
            <h2>文档</h2>
            <span>{rows.length}</span>
          </div>
          <div className="document-scopes">
            <Button
              htmlType="submit"
              type="text"
              aria-pressed={!trash}
              onClick={() => void changeTrash(false)}
            >
              全部文档
            </Button>
            <Button
              htmlType="submit"
              type="text"
              aria-label="文档回收站"
              aria-pressed={trash}
              onClick={() => void changeTrash(true)}
            >
              <TrashIcon size={14} />
              回收站
            </Button>
          </div>
          <label className="document-scope-filter">
            归属
            <Select
              aria-label="文档范围"
              value={visibleScope}
              onChange={(event) => {
                markNewRecordChanged();
                return void changeScope(event);
              }}
            >
              <Select.Option data-value={String('all')} value="all">
                全部文档
              </Select.Option>
              <Select.Option data-value={String('common')} value="common">
                通用文档
              </Select.Option>
              {snapshot?.systems.map((system) => (
                <Select.Option data-value={String(system.id)} key={system.id} value={system.id}>
                  {system.name}
                </Select.Option>
              ))}
            </Select>
          </label>
          <label className="document-search">
            <MagnifyingGlassIcon size={16} />
            <Input
              aria-label="搜索文档"
              placeholder="搜索标题与正文"
              value={query}
              onChange={(event) => setQuery(event.target.value)}
            />
          </label>
          <nav aria-label="文档列表">
            {rows.map((item) => (
              <Button
                htmlType="submit"
                type="text"
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
              </Button>
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
        </Card>
        {snapshot && document ? (
          <DocumentEditor
            key={`${document.id}:${document.deletedAt}`}
            document={document}
            snapshot={snapshot}
            navigate={navigate}
            registerFlush={saves.register}
            setContext={setContext}
            focused={focusMode}
            onToggleFocus={() => setFocusMode((focused) => !focused)}
            onSnapshot={setSnapshot}
            onError={setError}
            onDocument={setDocument}
          />
        ) : (
          <section className="ledger-empty">
            <Empty
              image={Empty.PRESENTED_IMAGE_SIMPLE}
              description={
                <>
                  <h2>{trash ? '可恢复的记录' : '把问题和方案留在这里'}</h2>
                  <p>{trash ? '选择文档后可恢复或彻底删除。' : '直接开始写，自动保存到本机。'}</p>
                </>
              }
            >
              {!trash && (
                <Button
                  htmlType="submit"
                  type="primary"
                  className="primary-button"
                  onClick={() => void create()}
                >
                  开始一份文档
                </Button>
              )}
            </Empty>
          </section>
        )}
      </div>
      {error && (
        <div className="error-banner" role="alert">
          <span>{error}</span>
          <Button htmlType="submit" type="text" aria-label="关闭提示" onClick={() => setError('')}>
            <XIcon />
          </Button>
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
  focused,
  onToggleFocus,
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
  focused: boolean;
  onToggleFocus: () => void;
  onSnapshot: (snapshot: Snapshot) => void;
  onError: (message: string) => void;
  onDocument: (document: DocumentRecord | null) => void;
}) {
  const editorFlush = useRef(() => {});
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
    editorFlush,
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
  const sectionRef = useRef<HTMLElement>(null);
  const outline = useDocumentOutline(sectionRef, focused);
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
    <section
      ref={sectionRef}
      className="document-editor"
      aria-label="文档详情"
      data-outline={focused && outline.open ? outline.layout : undefined}
    >
      <div className="record-subheading">
        <span>{deleted ? '回收站中的文档' : `创建于 ${dateLabel(document.createdAt)}`}</span>
        <div className="document-header-actions">
          <Button
            htmlType="submit"
            type="text"
            className="save-indicator"
            onClick={() => void form.flush().catch((cause) => onError(String(cause)))}
          >
            {form.status}
          </Button>
          {focused && (
            <Button
              htmlType="submit"
              type="text"
              className="text-button document-outline-toggle"
              aria-expanded={outline.open}
              aria-controls="document-focus-outline"
              onClick={() => outline.setOpen((open) => !open)}
            >
              <ListBulletsIcon size={15} />
              大纲
            </Button>
          )}
          <Button
            htmlType="submit"
            type="text"
            className="text-button document-focus-toggle"
            aria-pressed={focused}
            onClick={onToggleFocus}
          >
            {focused ? <ArrowsInSimpleIcon size={15} /> : <ArrowsOutSimpleIcon size={15} />}
            {focused ? '退出专注' : '专注编辑'}
          </Button>
        </div>
      </div>
      <Input
        className="document-title"
        aria-label="文档标题"
        placeholder="未命名文档"
        value={form.value.title}
        disabled={deleted}
        onChange={(event) => form.change({ ...form.value, title: event.target.value })}
      />
      <div className="document-metadata">
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
            <Select
              aria-label="文档所属项目"
              value={form.value.projectId ?? ''}
              disabled={deleted}
              onChange={(event) => {
                markNewRecordChanged();
                return form.change({ ...form.value, projectId: event || null });
              }}
            >
              <Select.Option data-value={String('')} value="">
                未分类
              </Select.Option>
              {snapshot.projects.map((project) => (
                <Select.Option data-value={String(project.id)} key={project.id} value={project.id}>
                  {project.name}
                  {project.archivedAt ? ' · 已归档' : ''}
                </Select.Option>
              ))}
            </Select>
          </label>
          {form.value.systemId && (
            <Button
              htmlType="submit"
              type="text"
              className="text-button"
              aria-label="回到关联对象"
              onClick={() =>
                void navigate({
                  module: 'ledger',
                  objectId:
                    form.value.resourceId ?? form.value.environmentId ?? form.value.systemId!,
                })
              }
            >
              {contextLabel(snapshot, form.value)}
              <ArrowUpRightIcon size={14} />
            </Button>
          )}
        </div>
        <Collapse
          className="compact-details"
          ghost
          defaultActiveKey={false ? ['details'] : []}
          items={[
            {
              key: 'details',
              label: <>关联背景</>,
              forceRender: true,
              children: (
                <>
                  <ContextPicker
                    mode="details"
                    snapshot={snapshot}
                    value={form.value}
                    disabled={deleted}
                    onChange={(context) => form.change({ ...form.value, ...context })}
                  />
                </>
              ),
            },
          ]}
        />
      </div>
      <Editor
        markdown={form.value.markdown}
        readOnly={deleted}
        flushRef={editorFlush}
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
            <Button
              htmlType="submit"
              type="text"
              className="text-button"
              disabled={busy}
              onClick={() => setPurge(true)}
            >
              彻底删除
            </Button>
            <Button
              htmlType="submit"
              type="primary"
              className="primary-button"
              disabled={busy}
              onClick={() => void action('document.restore')}
            >
              <ArrowCounterClockwiseIcon size={15} />
              恢复文档
            </Button>
          </>
        ) : (
          <Button
            htmlType="submit"
            type="text"
            className="text-button"
            disabled={busy}
            onClick={() => void action('document.delete')}
          >
            <TrashIcon size={15} />
            删除文档
          </Button>
        )}
      </div>
      {focused && outline.open && (
        <DocumentOutline
          layout={outline.layout}
          headings={outline.headings}
          activeId={outline.activeId}
          onLayout={outline.setLayout}
          onClose={() => outline.setOpen(false)}
          onNavigate={outline.navigate}
        />
      )}
      {purge && (
        <Dialog title="彻底删除文档" onClose={() => !busy && setPurge(false)} error={dialogError}>
          <p>“{document.title || '未命名文档'}”将无法从回收站恢复。</p>
          <div className="modal-actions">
            <Button
              htmlType="submit"
              type="default"
              className="secondary-button"
              disabled={busy}
              onClick={() => setPurge(false)}
            >
              取消
            </Button>
            <Button
              htmlType="submit"
              type="primary"
              danger
              className="danger-button"
              disabled={busy}
              onClick={() => void action('document.purge')}
            >
              彻底删除
            </Button>
          </div>
        </Dialog>
      )}
    </section>
  );
}
