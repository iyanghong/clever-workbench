import { useEffect, useRef, useState } from 'react';
import {
  StackIcon,
  PlusIcon,
  ArrowUpRightIcon,
  CaretRightIcon,
  XIcon,
} from '@phosphor-icons/react';
import type { ModuleProps } from '../../app/modules';
import type { Snapshot } from '../../types';
import { RelatedWork, type RelatedHost } from './RelatedWork';
import type { SystemRecord, ObjectContext } from '../../ledger-types';
import { emptyContent, dateLabel } from '../../domain';
import { useAutosave } from '../../shared/useAutosave';
import { useSaveGroup } from '../../shared/useSaveGroup';
import { Environments } from './Environments';

export function LedgerPage({ route, navigate, registerFlush }: ModuleProps) {
  const [snapshot, setSnapshot] = useState<Snapshot | null>(null);
  const [selected, setSelected] = useState<string | null>(null);
  const [name, setName] = useState(''),
    [error, setError] = useState('');
  const creating = useRef(false);
  const saves = useSaveGroup(registerFlush);
  const input = useRef<HTMLInputElement>(null);
  useEffect(() => {
    void window.desktop
      .snapshot()
      .then((next) => {
        setSnapshot(next);
        const target = route.objectId;
        const account = next.accounts.find((item) => item.id === target),
          resource = next.resources.find((item) => item.id === (account?.resourceId ?? target));
        const environment = next.environments.find(
          (item) => item.id === (resource?.environmentId ?? account?.environmentId ?? target),
        );
        const service = next.services.find((item) => item.id === target);
        const system = next.systems.find(
          (item) => item.id === (environment?.systemId ?? service?.systemId ?? target),
        );
        if (target && !system) setError('关联对象已不存在，请重新选择。');
        setSelected(system?.id ?? next.systems[0]?.id ?? null);
      })
      .catch((cause) => setError(cause.message));
  }, []);
  useEffect(
    () =>
      window.desktop.onNativeCommand((command) => {
        if (command === 'new') input.current?.focus();
      }),
    [],
  );
  async function choose(id: string) {
    try {
      await saves.flush();
      setError('');
      setSelected(id);
    } catch (cause) {
      setError(String(cause));
    }
  }
  async function create() {
    if (!name.trim() || creating.current) return;
    creating.current = true;
    try {
      await saves.flush();
      const result = await window.desktop.mutate({ type: 'system.save', name });
      setSnapshot(result.snapshot);
      setSelected(result.createdId!);
      setName('');
      setError('');
    } catch (cause) {
      setError(String(cause));
    } finally {
      creating.current = false;
    }
  }
  async function createTask(context: Partial<ObjectContext>, title: string) {
    await saves.flush();
    const fresh = await window.desktop.snapshot();
    const system = fresh.systems.find((item) => item.id === context.systemId);
    if (!system) throw new Error('系统不存在。');
    const result = await window.desktop.mutate({
      type: 'task.create',
      draft: {
        title,
        content: emptyContent(),
        markdown: '',
        projectId: system.currentProjectId,
        ...context,
      },
    });
    await navigate({ module: 'tasks', objectId: result.createdId });
  }
  async function createDocument(context: Partial<ObjectContext>) {
    await saves.flush();
    const result = await window.desktop.mutate({ type: 'document.create', context });
    await navigate({ module: 'documents', objectId: result.createdId });
  }
  const system = snapshot?.systems.find((item) => item.id === selected);
  return (
    <main className="main">
      <header className="window-toolbar">
        <div className="breadcrumb">
          <StackIcon size={18} />
          <span>技术台账</span>
        </div>
        <div className="spacer" />
        <button className="toolbar-new" onClick={() => input.current?.focus()}>
          <PlusIcon size={17} />
          新增系统
        </button>
      </header>
      <div className="ledger-layout">
        <aside className="ledger-index" aria-label="系统列表">
          <div className="ledger-index-title">
            <h2>系统</h2>
            <span>{snapshot?.systems.length ?? 0}</span>
          </div>
          <form
            className="ledger-quick"
            onSubmit={(event) => {
              event.preventDefault();
              void create();
            }}
          >
            <PlusIcon size={17} />
            <input
              ref={input}
              aria-label="新增系统名称"
              value={name}
              placeholder="记下一个系统…"
              onChange={(event) => setName(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === 'Enter' && event.nativeEvent.isComposing) event.preventDefault();
              }}
            />
            <kbd>↵</kbd>
          </form>
          <nav>
            {snapshot?.systems.map((item) => (
              <button
                key={item.id}
                className={`ledger-system ${item.id === selected ? 'active' : ''}`}
                onClick={() => void choose(item.id)}
              >
                <span className="system-symbol">
                  <StackIcon size={20} />
                </span>
                <span>
                  <strong>{item.name}</strong>
                  <small>
                    {snapshot.projects.find((project) => project.id === item.currentProjectId)
                      ?.name ?? '未关联当前项目'}
                  </small>
                </span>
                <CaretRightIcon size={13} />
              </button>
            ))}
          </nav>
          <p className="ledger-index-help">系统持续维护，项目保留每个阶段的记录。</p>
        </aside>
        {snapshot && system ? (
          <SystemPanel
            key={system.id}
            system={system}
            snapshot={snapshot}
            onSnapshot={setSnapshot}
            registerFlush={saves.register}
            flushAll={saves.flush}
            onError={setError}
            createTask={createTask}
            createDocument={createDocument}
            navigate={navigate}
            focusId={route.objectId}
          />
        ) : (
          <section className="ledger-empty">
            <StackIcon size={46} weight="duotone" />
            <h2>{snapshot ? '从一个系统开始' : '正在读取台账…'}</h2>
            <p>先记下名称，环境和资料可以慢慢补充。</p>
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

function SystemPanel({
  system,
  snapshot,
  onSnapshot,
  registerFlush,
  flushAll,
  onError,
  createTask,
  createDocument,
  navigate,
  focusId,
}: RelatedHost & {
  focusId?: string;
  system: SystemRecord;
  snapshot: Snapshot;
  onSnapshot: (snapshot: Snapshot) => void;
  registerFlush: ModuleProps['registerFlush'];
  flushAll: () => Promise<void>;
  onError: (message: string) => void;
}) {
  const form = useAutosave(
    { name: system.name, notes: system.notes, url: system.url, projectId: system.currentProjectId },
    async (value) => {
      const result = await window.desktop.mutate({ type: 'system.save', id: system.id, ...value });
      onSnapshot(result.snapshot);
    },
    onError,
  );
  useEffect(() => registerFlush(form.flush), [registerFlush, form.flush]);
  const commit = () => void form.flush().catch((cause) => onError(String(cause)));
  const links = snapshot.systemProjects.filter((link) => link.systemId === system.id);
  return (
    <section className="system-detail">
      <div className="system-detail-heading">
        <span className="eyebrow">长期系统</span>
        <button
          className={`save-indicator ${form.status.startsWith('保存失败') ? 'error-text' : ''}`}
          onClick={commit}
        >
          <span className={`status-dot ${form.status === '已保存' ? 'saved' : ''}`} />
          {form.status}
        </button>
      </div>
      <input
        className="system-title-input"
        aria-label="系统名称"
        value={form.value.name}
        onChange={(event) => form.change({ ...form.value, name: event.target.value })}
        onBlur={commit}
      />
      <div className="system-facts">
        <label>
          <span>当前项目</span>
          <select
            aria-label="当前项目"
            value={form.value.projectId ?? ''}
            onChange={(event) =>
              form.change({ ...form.value, projectId: event.target.value || null })
            }
            onBlur={commit}
          >
            <option value="">暂不关联</option>
            {snapshot.projects
              .filter((project) => project.archivedAt === null)
              .map((project) => (
                <option key={project.id} value={project.id}>
                  {project.name}
                </option>
              ))}
          </select>
        </label>
        <label>
          <span>系统链接</span>
          <div className="inline-field">
            <input
              aria-label="系统链接"
              placeholder="https://…（可选）"
              value={form.value.url}
              onChange={(event) => form.change({ ...form.value, url: event.target.value })}
              onBlur={commit}
            />
            {system.url && (
              <button
                className="icon-button"
                aria-label="打开系统链接"
                onClick={() =>
                  void window.desktop
                    .openExternal(system.url)
                    .catch((cause) => onError(cause.message))
                }
              >
                <ArrowUpRightIcon size={17} />
              </button>
            )}
          </div>
        </label>
      </div>
      <details className="compact-details system-extra">
        <summary>系统说明</summary>
        <label className="system-notes">
          <span>系统说明</span>
          <textarea
            aria-label="系统说明"
            rows={3}
            placeholder="记下用途、负责人或需要留意的事…"
            value={form.value.notes}
            onChange={(event) => form.change({ ...form.value, notes: event.target.value })}
            onBlur={commit}
          />
        </label>
      </details>
      <Environments
        systemId={system.id}
        snapshot={snapshot}
        onSnapshot={onSnapshot}
        registerFlush={registerFlush}
        flushAll={flushAll}
        onError={onError}
        createTask={createTask}
        createDocument={createDocument}
        navigate={navigate}
        focusId={focusId}
      />
      <section className="system-section" aria-label="项目沿革">
        <div className="section-heading">
          <h3>项目沿革</h3>
          <span>切换当前项目，历史记录继续保留</span>
        </div>
        {links.length ? (
          <ul className="project-history">
            {links.map((link) => (
              <li key={link.projectId}>
                <span
                  className="project-dot"
                  style={{
                    background: snapshot.projects.find((project) => project.id === link.projectId)
                      ?.color,
                  }}
                />
                <strong>
                  {snapshot.projects.find((project) => project.id === link.projectId)?.name}
                </strong>
                <span
                  className={
                    link.projectId === system.currentProjectId ? 'current-project-tag' : ''
                  }
                >
                  {link.projectId === system.currentProjectId ? '当前' : '历史'}
                </span>
                <small>{dateLabel(link.linkedAt)}</small>
              </li>
            ))}
          </ul>
        ) : (
          <p className="secondary-copy">关联项目后，在这里保留每个阶段。</p>
        )}
      </section>
      <RelatedWork
        context={{ systemId: system.id }}
        snapshot={snapshot}
        createTask={createTask}
        createDocument={createDocument}
        navigate={navigate}
        onError={onError}
      />
    </section>
  );
}
