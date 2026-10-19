import { scopeFor } from '../../ledger-workspace-types';
import { useEffect, useRef, useState } from 'react';
import {
  CheckIcon,
  PlusIcon,
  NotePencilIcon,
  StackIcon,
  GlobeIcon,
  UserCircleIcon,
  ArrowUpIcon,
  ArrowDownIcon,
  XIcon,
} from '@phosphor-icons/react';
import type { ModuleProps } from '../../app/modules';
import { routeForHit } from '../../app/modules';
import type { Draft, Snapshot } from '../../types';
import type { Favorite } from '../../home-types';
import { emptyContent, dateLabel } from '../../domain';
import { useSaveGroup } from '../../shared/useSaveGroup';
import { useAutosave } from '../../shared/useAutosave';
import { contextLabel } from '../../shared/ContextPicker';
import { CopyValue } from '../../shared/CopyValue';
import { SecretCopyButton } from '../vault/SecretCopyButton';
import { Dialog } from '../../shared/Dialog';
import { AccessActions } from '../ledger/AccessActions';
import { findTool, registeredTools } from '../tools/registry';

export function HomePage({ navigate, registerFlush, setContext }: ModuleProps) {
  const [snapshot, setSnapshot] = useState<Snapshot | null>(null),
    [error, setError] = useState(''),
    [choosing, setChoosing] = useState(false),
    [query, setQuery] = useState(''),
    [composer, setComposer] = useState(0),
    [undo, setUndo] = useState<string | null>(null);
  const saves = useSaveGroup(registerFlush);
  const [favoritePending, setFavoritePending] = useState<Record<string, boolean>>({});
  const favoriteQueue = useRef(Promise.resolve());
  useEffect(() => saves.register(() => favoriteQueue.current), [saves.register]);
  useEffect(() => {
    setContext({});
    void window.desktop
      .snapshot()
      .then(setSnapshot)
      .catch((cause) => setError(String(cause)));
  }, []);
  async function createDocument() {
    try {
      await saves.flush();
      const result = await window.desktop.mutate({ type: 'document.create' });
      await navigate({ module: 'documents', objectId: result.createdId });
    } catch (cause) {
      setError(String(cause));
    }
  }
  async function favorite(item: Favorite, pinned: boolean) {
    const key = `${item.kind}:${item.id}`;
    setFavoritePending((previous) => ({ ...previous, [key]: pinned }));
    const job = favoriteQueue.current
      .catch(() => {})
      .then(async () => {
        setSnapshot(
          (await window.desktop.mutate({ type: 'favorite.set', ...item, pinned })).snapshot,
        );
      });
    favoriteQueue.current = job.catch(() => {});
    try {
      await job;
    } catch (cause) {
      setError(String(cause));
    } finally {
      setFavoritePending((previous) => {
        const next = { ...previous };
        delete next[key];
        return next;
      });
    }
  }
  async function complete(id: string, done: boolean) {
    try {
      setSnapshot(
        (await window.desktop.mutate({ type: 'task.complete', id, complete: done })).snapshot,
      );
      setUndo(done ? id : null);
    } catch (cause) {
      setError(String(cause));
    }
  }
  const pending =
    snapshot?.tasks
      .filter((item) => item.deletedAt === null && item.completedAt === null)
      .sort((a, b) => b.createdAt - a.createdAt) ?? [];
  const recent = snapshot?.documents.filter((item) => item.deletedAt === null).slice(0, 6) ?? [];
  function scopeName(kind: 'resource' | 'access', id: string, environmentId: string | null) {
    if (!snapshot) return '';
    const scope = scopeFor(snapshot.scopes, kind, id, environmentId);
    return scope.environmentIds.length
      ? scope.environmentIds
          .map((id) => snapshot.environments.find((e) => e.id === id)?.name)
          .join('、')
      : '系统通用';
  }
  function favoriteInfo(item: Favorite) {
    if (!snapshot) return null;
    if (item.kind === 'tool') {
      const tool = findTool(item.id);
      return tool ? { title: tool.title, context: '本地工具', account: null, access: null } : null;
    }
    if (item.kind === 'system') {
      const system = snapshot.systems.find((value) => value.id === item.id);
      return system
        ? {
            title: system.name,
            context:
              snapshot.projects.find((project) => project.id === system.currentProjectId)?.name ??
              '长期系统',
            account: null,
            access: null,
          }
        : null;
    }
    if (item.kind === 'access') {
      const access = snapshot.accessEntries.find((value) => value.id === item.id);
      return access
        ? {
            title: access.name,
            context: `${snapshot.systems.find((s) => s.id === access.systemId)?.name} / ${scopeName('access', access.id, access.environmentId)}`,
            account: null,
            access,
          }
        : null;
    }
    const account = snapshot.accounts.find((value) => value.id === item.id);
    if (!account) return null;
    const environment = snapshot.environments.find((value) => value.id === account.environmentId);
    return {
      title: account.name,
      context: [
        snapshot.systems.find((s) => s.id === account.systemId)?.name,
        account.resourceId
          ? scopeName('resource', account.resourceId, account.environmentId)
          : account.accessId
            ? scopeName('access', account.accessId, account.environmentId)
            : (environment?.name ?? '通用'),
        account.resourceId
          ? snapshot.resources.find((r) => r.id === account.resourceId)?.name
          : snapshot.accessEntries.find((e) => e.id === account.accessId)?.name,
      ]
        .filter(Boolean)
        .join(' / '),
      access: null,
      account,
    };
  }
  const candidates: Favorite[] = snapshot
    ? [
        ...snapshot.systems.map((item) => ({ kind: 'system' as const, id: item.id })),
        ...snapshot.accounts.map((item) => ({ kind: 'account' as const, id: item.id })),
        ...snapshot.accessEntries.map((item) => ({ kind: 'access' as const, id: item.id })),
        ...registeredTools.map((item) => ({ kind: 'tool' as const, id: item.id })),
      ]
    : [];
  return (
    <main className="main home-page">
      <header className="window-toolbar">
        <div className="breadcrumb">
          <StackIcon size={17} />
          <span>个人工作台</span>
        </div>
        <div className="spacer" />
        <button className="toolbar-new" onClick={() => void createDocument()}>
          <NotePencilIcon size={16} />
          写一份方案
        </button>
      </header>
      <div className="home-content">
        <div className="home-heading">
          <span className="eyebrow">
            {new Intl.DateTimeFormat('zh-CN', {
              month: 'long',
              day: 'numeric',
              weekday: 'long',
            }).format(new Date())}
          </span>
          <h1>我的工作台</h1>
          <p>账号、任务与方案，打开就能继续。</p>
        </div>
        <div className="home-grid">
          <section className="home-work">
            <div className="section-heading">
              <h2>
                待办工作 <small>{pending.length}</small>
              </h2>
              <button className="text-button" onClick={() => void navigate({ module: 'tasks' })}>
                全部任务
              </button>
            </div>
            {snapshot && (
              <HomeCapture
                key={composer}
                draft={snapshot.draft}
                registerFlush={saves.register}
                onError={setError}
                onCreated={(next) => {
                  setSnapshot(next);
                  setComposer((value) => value + 1);
                }}
              />
            )}
            <div className="home-task-list">
              {pending.slice(0, 8).map((item) => (
                <div className="home-task" key={item.id}>
                  <button
                    className="home-complete"
                    aria-label={`完成 ${item.title}`}
                    onClick={() => void complete(item.id, true)}
                  >
                    <CheckIcon size={13} />
                  </button>
                  <button
                    className="home-task-open"
                    onClick={() => void navigate({ module: 'tasks', objectId: item.id })}
                  >
                    <strong>{item.title}</strong>
                    <span>
                      {snapshot?.systems.find((system) => system.id === item.systemId)?.name ??
                        '未关联系统'}
                    </span>
                  </button>
                </div>
              ))}
              {!pending.length && (
                <p className="home-empty">暂时没有待办。随手记下一件事，回车即可保存。</p>
              )}
            </div>
            {undo && (
              <div className="home-undo" role="status">
                已完成<button onClick={() => void complete(undo, false)}>撤销</button>
              </div>
            )}
            <section className="home-documents">
              <div className="section-heading">
                <h2>最近文档</h2>
                <button
                  className="text-button"
                  onClick={() => void navigate({ module: 'documents' })}
                >
                  全部文档
                </button>
              </div>
              {recent.map((item) => (
                <button
                  className="home-document"
                  key={item.id}
                  aria-label={`打开文档 ${item.title || '未命名文档'}`}
                  onClick={() => void navigate({ module: 'documents', objectId: item.id })}
                >
                  <NotePencilIcon size={21} />
                  <span>
                    <strong>{item.title || '未命名文档'}</strong>
                    <small>{contextLabel(snapshot!, item) || '未分类'}</small>
                  </span>
                  <time>{dateLabel(item.updatedAt)}</time>
                </button>
              ))}
              {!recent.length && (
                <p className="home-empty">
                  遇到的问题和解决过程，都可以先写下来。
                  <button onClick={() => void createDocument()}>新建文档</button>
                </p>
              )}
            </section>
          </section>
          <section className="home-favorites">
            <div className="section-heading">
              <h2>常用入口</h2>
              <button
                className="text-button"
                onClick={() => {
                  setChoosing(true);
                  setQuery('');
                }}
              >
                选择
              </button>
            </div>
            {snapshot?.favorites.map((item, index) => {
              const info = favoriteInfo(item);
              if (!info) return null;
              const ToolIcon = item.kind === 'tool' ? findTool(item.id)?.Icon : undefined;
              return (
                <div className="favorite-row" key={`${item.kind}:${item.id}`}>
                  <button
                    className="favorite-open"
                    aria-label={`打开常用${item.kind === 'tool' ? '工具' : item.kind === 'system' ? '系统' : item.kind === 'access' ? '访问入口' : '账号'} ${info.title}`}
                    onClick={() =>
                      void navigate(
                        item.kind === 'tool'
                          ? { module: 'tools', objectId: item.id }
                          : routeForHit({ kind: item.kind, id: item.id }),
                      )
                    }
                  >
                    {ToolIcon ? (
                      <ToolIcon size={22} weight="duotone" />
                    ) : item.kind === 'system' ? (
                      <StackIcon size={22} weight="duotone" />
                    ) : item.kind === 'access' ? (
                      <GlobeIcon size={22} />
                    ) : (
                      <UserCircleIcon size={22} weight="duotone" />
                    )}
                    <span>
                      <strong>{info.title}</strong>
                      <small>{info.context}</small>
                    </span>
                  </button>
                  {info.access && (
                    <AccessActions entry={info.access} snapshot={snapshot} onError={setError} />
                  )}
                  {info.account && (
                    <div className="favorite-account-actions">
                      <span>{info.account.username || '无用户名'}</span>
                      <CopyValue
                        value={info.account.username}
                        label={`用户名 ${info.title}`}
                        onError={setError}
                      />
                      {info.account.secretKinds.map((kind) => (
                        <SecretCopyButton
                          key={kind}
                          accountId={item.id}
                          kind={kind}
                          name={info.title}
                          onError={setError}
                        />
                      ))}
                    </div>
                  )}
                  <div className="favorite-order">
                    <button
                      aria-label={`上移常用 ${info.title}`}
                      disabled={index === 0}
                      onClick={() =>
                        void window.desktop
                          .mutate({ type: 'favorite.move', ...item, direction: -1 })
                          .then((result) => setSnapshot(result.snapshot))
                          .catch((cause) => setError(String(cause)))
                      }
                    >
                      <ArrowUpIcon size={13} />
                    </button>
                    <button
                      aria-label={`下移常用 ${info.title}`}
                      disabled={index === snapshot.favorites.length - 1}
                      onClick={() =>
                        void window.desktop
                          .mutate({ type: 'favorite.move', ...item, direction: 1 })
                          .then((result) => setSnapshot(result.snapshot))
                          .catch((cause) => setError(String(cause)))
                      }
                    >
                      <ArrowDownIcon size={13} />
                    </button>
                    <button
                      aria-label={`移出常用 ${info.title}`}
                      onClick={() => void favorite(item, false)}
                    >
                      <XIcon size={13} />
                    </button>
                  </div>
                </div>
              );
            })}
            {!snapshot?.favorites.length && (
              <div className="home-favorites-empty">
                <StackIcon size={33} weight="duotone" />
                <p>把常用系统、访问入口、账号和工具放在这里。</p>
                <button
                  className="secondary-button"
                  onClick={() => {
                    setChoosing(true);
                    setQuery('');
                  }}
                >
                  选择常用对象
                </button>
              </div>
            )}
          </section>
        </div>
      </div>
      {choosing && snapshot && (
        <Dialog
          title="选择常用对象"
          onClose={() => setChoosing(false)}
          error={error}
          className="modal favorite-dialog"
        >
          <label className="field-label">
            查找
            <input
              autoFocus
              aria-label="筛选常用对象"
              placeholder="系统、环境、账号或工具"
              value={query}
              onChange={(event) => setQuery(event.target.value)}
            />
          </label>
          <div className="favorite-picker">
            {candidates
              .filter((item) => {
                const info = favoriteInfo(item);
                return (
                  info &&
                  `${info.title} ${info.context}`.toLowerCase().includes(query.toLowerCase())
                );
              })
              .map((item) => {
                const info = favoriteInfo(item)!;
                return (
                  <label key={`${item.kind}:${item.id}`}>
                    <input
                      type="checkbox"
                      aria-label={`常用 ${info.context} ${info.title}`}
                      checked={
                        favoritePending[`${item.kind}:${item.id}`] ??
                        snapshot.favorites.some(
                          (value) => value.kind === item.kind && value.id === item.id,
                        )
                      }
                      disabled={Object.hasOwn(favoritePending, `${item.kind}:${item.id}`)}
                      onChange={(event) => void favorite(item, event.target.checked)}
                    />
                    <span>
                      <strong>{info.title}</strong>
                      <small>{info.context}</small>
                    </span>
                  </label>
                );
              })}
            {!candidates.length && (
              <p className="home-empty">先从台账建立系统和账号，再添加常用入口。</p>
            )}
          </div>
          <div className="modal-actions">
            <button className="primary-button" onClick={() => setChoosing(false)}>
              完成选择
            </button>
          </div>
        </Dialog>
      )}
      {error && !choosing && (
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
function HomeCapture({
  draft,
  registerFlush,
  onCreated,
  onError,
}: {
  draft: Draft | null;
  registerFlush: ModuleProps['registerFlush'];
  onCreated: (snapshot: Snapshot) => void;
  onError: (message: string) => void;
}) {
  const form = useAutosave<Draft>(
    draft ?? { title: '', markdown: '', content: emptyContent(), projectId: null },
    (value) => window.desktop.saveDraft(value),
    onError,
  );
  useEffect(() => registerFlush(form.flush), [registerFlush, form.flush]);
  const [busy, setBusy] = useState(false),
    creating = useRef(false);
  return (
    <>
      <form
        className="quick-add home-capture"
        onSubmit={async (event) => {
          event.preventDefault();
          if (!form.value.title.trim() || creating.current) return;
          creating.current = true;
          setBusy(true);
          try {
            await form.flush();
            const result = await window.desktop.mutate({ type: 'task.create', draft: form.value });
            onCreated(result.snapshot);
          } catch (cause) {
            onError(String(cause));
          } finally {
            creating.current = false;
            setBusy(false);
          }
        }}
      >
        <PlusIcon size={18} />
        <input
          aria-label="快速新增任务"
          placeholder="记下一件事，回车保存…"
          disabled={busy}
          value={form.value.title}
          onChange={(event) => form.change({ ...form.value, title: event.target.value })}
          onKeyDown={(event) => {
            if (event.key === 'Enter' && event.nativeEvent.isComposing) event.preventDefault();
          }}
        />
        <kbd>↵</kbd>
      </form>
      {form.value.title && (
        <p className="home-capture-hint" role="status">
          <button
            type="button"
            onClick={() => void form.flush().catch((cause) => onError(String(cause)))}
          >
            {form.status}
          </button>{' '}
          · 回车创建任务{form.value.markdown ? ' · 保留上次草稿正文' : ''}
        </p>
      )}
    </>
  );
}
