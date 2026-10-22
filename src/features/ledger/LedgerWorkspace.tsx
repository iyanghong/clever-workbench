import { closeNewRecord, saveNewRecord } from '../../shared/new-record';
import { DocumentReferences } from './RecordFields';
import { connectionAddress, resourceConnectionText } from '../../ledger-fields';
import { PageHeading } from '../../shared/WorkspaceUI';
import {
  LedgerCopyProvider,
  LedgerCopyActions,
  LedgerCopyCheckbox,
  LedgerCopySelectionBar,
  CopyableField,
} from './LedgerCopy';
import type { LedgerCopyRef } from '../../ledger-copy-types';
import { QuickTask } from '../tasks/QuickTask';
import { RelatedWork } from './RelatedWork';
import { PasteLedger } from './PasteLedger';
import { useEffect, useRef, useState } from 'react';
import {
  PlusIcon,
  MagnifyingGlassIcon,
  CaretDownIcon,
  ArrowLeftIcon,
  PencilSimpleIcon,
  XIcon,
  StackIcon,
} from '@phosphor-icons/react';
import type { ModuleProps, Route } from '../../app/modules';
import type { CreationContext } from '../../app/actions';
import type { Snapshot, Command } from '../../types';
import type { AccountRecord, ObjectContext } from '../../ledger-types';
import type { DeploymentNode, ScopeKind } from '../../ledger-workspace-types';
import { scopeFor, inEnvironment } from '../../ledger-workspace-types';
import { useSaveGroup } from '../../shared/useSaveGroup';
import { CopyValue } from '../../shared/CopyValue';
import { Dialog } from '../../shared/Dialog';
import { emptyContent } from '../../domain';
import { ResourceEditor } from './Resources';
import { AccessEntryEditor } from './AccessEntryEditor';
import { AccountEditor } from './Accounts';
import { AccountList } from './AccountList';
import { QuickAccess, QuickServer } from './LedgerCaptureForm';
import {
  QuickAccount,
  QuickResource,
  QuickService,
  QuickSystem,
  QuickOperation,
} from './QuickRecord';
import { SystemExportDialog } from './SystemExportDialog';
import { SystemActionsMenu } from './SystemActionsMenu';
import { FavoriteButton } from '../home/FavoriteButton';
import { SecretCopyButton } from '../vault/SecretCopyButton';
import { secretLabels } from '../../vault-types';
import {
  ScopeEditor,
  ServiceEditor,
  OperationEditor,
  NodeDialog,
  SystemConfiguration,
  ProjectManager,
} from './WorkspaceEditors';
import type { EditorHost } from './Environments';
import './ledger-layout.css';

const categories = [
  ['access', '访问入口'],
  ['accounts', '账号'],
  ['servers', '服务器'],
  ['resources', '数据库／中间件'],
  ['services', '应用部署'],
  ['operations', '运行维护'],
  ['documents', '文档'],
] as const;
type Category = (typeof categories)[number][0];
type View = {
  operationKind: 'all' | 'job' | 'backup';
  operationStatus: 'all' | 'active' | 'inactive' | 'unverified';
  category: Category;
  environment: string;
  tag: string;
  query: string;
  scroll: number;
};
const defaultView: View = {
  operationKind: 'all',
  operationStatus: 'all',
  category: 'access',
  environment: 'all',
  tag: 'all',
  query: '',
  scroll: 0,
};
function savedViews(): { system?: string; views: Record<string, View>; recent: string[] } {
  try {
    const value = JSON.parse(localStorage.getItem('ledger-workspace') ?? '{}');
    return {
      system: value.system,
      views: value.views ?? {},
      recent: Array.isArray(value.recent) ? value.recent : [],
    };
  } catch {
    return { views: {}, recent: [] };
  }
}
function selectionContext(
  snapshot: Snapshot | null,
  systemId: string,
  environment: string,
  selected: string | null,
): CreationContext {
  const account = snapshot?.accounts.find((a) => a.id === selected);
  const resource = snapshot?.resources.find((r) => r.id === (account?.resourceId ?? selected));
  const access = snapshot?.accessEntries.find((a) => a.id === (account?.accessId ?? selected));
  const scope = resource
    ? scopeFor(snapshot!.scopes, 'resource', resource.id, resource.environmentId)
    : access
      ? scopeFor(snapshot!.scopes, 'access', access.id, access.environmentId)
      : { environmentIds: account?.environmentId ? [account.environmentId] : [], tags: [] };
  const environmentId =
    !['all', 'common'].includes(environment) &&
    (!scope.environmentIds.length || scope.environmentIds.includes(environment))
      ? environment
      : scope.environmentIds.length === 1
        ? scope.environmentIds[0]
        : null;
  return {
    systemId: systemId || null,
    environmentId,
    resourceId: resource?.id ?? null,
    accessId: access?.id ?? null,
  };
}
type Row = {
  id: string;
  name: string;
  systemId: string;
  environmentId?: string | null;
  address: string;
  notes: string;
  kind: Category;
  extra: string;
};
const stateName = { active: '在用', inactive: '停用', unverified: '待确认' };

function currentRecord<T extends { id: string }>(records: T[], id: string): T {
  const record = records.find((r) => r.id === id);
  if (!record) throw new Error('记录或关联资料已不存在，请刷新后重新选择。');
  return record;
}
function currentNodeAddress(snapshot: Snapshot, id: string) {
  const n = currentRecord(snapshot.deploymentNodes, id);
  const server = n.serverId ? currentRecord(snapshot.resources, n.serverId) : undefined;
  const address = n.address || server?.address || '';
  return address + (address && n.port ? `:${n.port}` : '');
}
function currentRowValue(snapshot: Snapshot, row: Row): string {
  if (row.kind === 'accounts') return currentRecord(snapshot.accounts, row.id).username;
  const record =
    row.kind === 'services'
      ? snapshot.services.find((r) => r.id === row.id)
      : row.kind === 'operations'
        ? snapshot.operations.find((r) => r.id === row.id)
        : row.kind === 'access'
          ? snapshot.accessEntries.find((r) => r.id === row.id)
          : snapshot.resources.find((r) => r.id === row.id);
  if (!record) throw new Error('记录已不存在，请刷新后重新选择。');
  if ('repository' in record) return record.repository;
  if ('frequency' in record) return record.frequency;
  if ('addresses' in record)
    return (
      (record.addresses.find((a) => a.id === record.preferredAddressId) ?? record.addresses[0])
        ?.url ?? ''
    );
  return record.address + (record.port ? `:${record.port}` : '');
}
function copyRef(row: Row): LedgerCopyRef | null {
  const kind =
    row.kind === 'servers' || row.kind === 'resources'
      ? 'resource'
      : row.kind === 'services'
        ? 'service'
        : row.kind === 'operations'
          ? 'operation'
          : row.kind === 'access'
            ? 'access'
            : null;
  return kind ? { kind, id: row.id } : null;
}
export function LedgerWorkspace({ route, navigate, registerFlush, setContext }: ModuleProps) {
  const [snapshot, setSnapshot] = useState<Snapshot | null>(null),
    [systemId, setSystemId] = useState(''),
    [view, setView] = useState<View>(defaultView),
    [selected, setSelected] = useState<string | null>(null),
    [editing, setEditing] = useState(false),
    [error, setError] = useState('');
  const [picker, setPicker] = useState(false),
    [systemQuery, setSystemQuery] = useState(''),
    [info, setInfo] = useState(false),
    [exporting, setExporting] = useState(false),
    [relatedOpen, setRelatedOpen] = useState(false),
    [capture, setCapture] = useState<string | null>(null),
    [captureContext, setCaptureContext] = useState<CreationContext>({}),
    [busy, setBusy] = useState(false),
    [operationName, setOperationName] = useState(''),
    [node, setNode] = useState<DeploymentNode | 'new' | null>(null),
    [deletion, setDeletion] = useState<Command | null>(null);
  const saves = useSaveGroup(registerFlush),
    memory = useRef(savedViews()),
    list = useRef<HTMLDivElement>(null),
    systemSearch = useRef<HTMLInputElement>(null);
  useEffect(() => {
    if (picker) systemSearch.current?.focus();
  }, [picker]);
  function locate(s: Snapshot, id?: string) {
    const account = s.accounts.find((r) => r.id === id),
      access = s.accessEntries.find((r) => r.id === id),
      resource = s.resources.find((r) => r.id === id),
      service = s.services.find((r) => r.id === id),
      operation = s.operations.find((r) => r.id === id),
      deployment = s.deploymentNodes.find((r) => r.id === id),
      environment = s.environments.find((r) => r.id === id);
    const serviceOwner = deployment
      ? s.services.find((r) => r.id === deployment.serviceId)
      : service;
    const owner = account ?? access ?? resource ?? serviceOwner ?? operation ?? environment;
    const target = s.systems.find((r) => r.id === (owner?.systemId ?? id));
    const kind: Category = account
      ? 'accounts'
      : access
        ? 'access'
        : resource
          ? resource.kind === 'server'
            ? 'servers'
            : 'resources'
          : serviceOwner
            ? 'services'
            : operation
              ? 'operations'
              : 'access';
    return {
      system: target?.id,
      environment: environment?.id,
      category: kind,
      id: deployment ? deployment.serviceId : owner && !environment ? id : null,
    };
  }
  useEffect(() => {
    let live = true;
    void window.desktop
      .snapshot()
      .then((s) => {
        if (!live) return;
        setSnapshot(s);
        const target = locate(s, route.objectId);
        const id =
          target.system ??
          s.systems.find((r) => r.id === memory.current.system)?.id ??
          s.systems[0]?.id ??
          '';
        setSystemId(id);
        const saved = memory.current.views[id];
        setView({
          ...defaultView,
          ...saved,
          ...(route.objectId
            ? {
                category: target.category,
                environment: target.environment ?? 'all',
                query: '',
                tag: 'all',
              }
            : {}),
        });
        setSelected(target.id ?? null);
      })
      .catch((e) => setError(String(e)));
    return () => {
      live = false;
    };
  }, []);
  useEffect(() => {
    if (!systemId) return;
    memory.current.system = systemId;
    memory.current.recent = [
      systemId,
      ...memory.current.recent.filter((id) => id !== systemId),
    ].slice(0, 10);
    memory.current.views[systemId] = view;
    localStorage.setItem('ledger-workspace', JSON.stringify(memory.current));
  }, [systemId, view]);
  useEffect(() => {
    setContext(selectionContext(snapshot, systemId, view.environment, selected));
  }, [snapshot, systemId, view.environment, selected]);
  useEffect(() => {
    if (list.current && !selected)
      list.current.scrollTop = memory.current.views[systemId]?.scroll ?? 0;
  }, [systemId, view.category, Boolean(snapshot), selected]);
  async function transition(action: () => void) {
    try {
      await saves.flush();
      setError('');
      action();
    } catch (e) {
      setError(String(e));
    }
  }
  function chooseSystem(id: string) {
    void transition(() => {
      setSystemId(id);
      setView({ ...defaultView, ...memory.current.views[id] });
      setSelected(null);
      setEditing(false);
      setPicker(false);
    });
  }
  function changeView(next: Partial<View>) {
    void transition(() => {
      setView((v) => ({ ...v, ...next, scroll: 0 }));
      if (
        next.category !== undefined ||
        next.environment !== undefined ||
        next.tag !== undefined ||
        next.operationKind !== undefined ||
        next.operationStatus !== undefined
      ) {
        setSelected(null);
        setEditing(false);
      }
    });
  }
  async function run(command: Command) {
    await saves.flush();
    const result = await window.desktop.mutate(command);
    setSnapshot(result.snapshot);
    return result;
  }
  async function createTask(context: Partial<ObjectContext>, title: string) {
    const result = await run({
      type: 'task.create',
      consumeDraft: false,
      draft: {
        title,
        content: emptyContent(),
        markdown: '',
        projectId: null,
        systemId: context.systemId ?? systemId,
      },
    });
    await navigate({ module: 'tasks', objectId: result.createdId });
  }
  async function createDocument(context: Partial<ObjectContext>) {
    const result = await run({ type: 'document.create', context });
    const service = snapshot?.services.find((s) => s.id === selected);
    if (service && result.createdId)
      await run({
        type: 'service.save',
        id: service.id,
        systemId: service.systemId,
        name: service.name,
        documentIds: [...(service.documentIds ?? []), result.createdId],
      });
    await navigate({ module: 'documents', objectId: result.createdId });
  }
  const host: EditorHost = {
    onSnapshot: setSnapshot,
    registerFlush: saves.register,
    onError: setError,
    onContext: setContext,
    createTask,
    createDocument,
    navigate,
  };
  const system = snapshot?.systems.find((s) => s.id === systemId);
  function captureNew(kind: string, context?: CreationContext) {
    void transition(() => {
      setPicker(false);
      setCapture(kind);
      setCaptureContext(
        context ?? {
          systemId,
          environmentId: !['all', 'common'].includes(view.environment) ? view.environment : null,
        },
      );
    });
  }
  async function execute(operation: () => Promise<Route>) {
    if (busy) return;
    setBusy(true);
    try {
      await saves.flush();
      const target = await saveNewRecord(operation);
      if (target.module !== 'ledger') {
        setCapture(null);
        await navigate(target);
        return;
      }
      const s = await window.desktop.snapshot();
      setSnapshot(s);
      const found = locate(s, target.objectId);
      if (found.system) {
        setSystemId(found.system);
        setView({
          ...defaultView,
          category: found.category,
          environment: found.environment ?? 'all',
        });
        setSelected(found.id ?? null);
        setEditing(false);
      }
      setCapture(null);
    } catch (e) {
      setError(String(e));
    } finally {
      setBusy(false);
    }
  }
  if (!snapshot)
    return (
      <main className="main">
        <p>{error || '正在读取台账…'}</p>
      </main>
    );
  const rows: Row[] = [
    ...snapshot.accessEntries.map((r) => ({
      id: r.id,
      name: r.name,
      systemId: r.systemId,
      environmentId: r.environmentId,
      address: r.addresses.find((a) => a.id === r.preferredAddressId)?.url ?? '',
      notes: r.notes,
      kind: 'access' as const,
      extra: `${snapshot.accounts.filter((a) => a.accessId === r.id).length} 个账号`,
    })),
    ...snapshot.resources.map((r) => ({
      id: r.id,
      name: r.name,
      systemId: r.systemId,
      environmentId: r.environmentId,
      address: r.address + (r.port ? `:${r.port}` : ''),
      notes:
        r.notes +
        ' ' +
        Object.values(r.fields).join(' ') +
        ' ' +
        resourceConnectionText(r, snapshot.resources),
      kind: r.kind === 'server' ? ('servers' as const) : ('resources' as const),
      extra:
        r.fields['用途'] ??
        r.fields['类型'] ??
        (r.kind === 'redis' ? 'Redis' : r.kind === 'database' ? '数据库' : r.notes),
    })),
    ...snapshot.accounts.map((r) => ({
      id: r.id,
      name: r.name,
      systemId: r.systemId,
      environmentId: r.environmentId,
      address: r.username,
      notes: r.notes,
      kind: 'accounts' as const,
      extra:
        snapshot.resources.find((o) => o.id === r.resourceId)?.name ??
        snapshot.accessEntries.find((o) => o.id === r.accessId)?.name ??
        snapshot.systems.find((o) => o.id === r.systemId)?.name ??
        '系统环境账号',
    })),
    ...snapshot.services.map((r) => ({
      id: r.id,
      name: r.name,
      systemId: r.systemId,
      address: r.repository,
      notes:
        r.notes +
        ' ' +
        snapshot.deploymentNodes
          .filter((n) => n.serviceId === r.id)
          .map((n) => [n.name, n.address, n.port, ...Object.values(n.fields ?? {})].join(' '))
          .join(' '),
      kind: 'services' as const,
      extra: `${snapshot.deploymentNodes.filter((n) => n.serviceId === r.id).length} 个部署节点 · ${stateName[scopeFor(snapshot.scopes, 'service', r.id).status ?? 'active']}`,
    })),
    ...snapshot.operations.map((r) => ({
      id: r.id,
      name: r.name,
      systemId: r.systemId,
      environmentId: r.environmentId,
      address: r.frequency,
      notes: r.notes + ' ' + Object.values(r.fields ?? {}).join(' '),
      kind: 'operations' as const,
      extra: `${r.kind === 'backup' ? '备份策略' : '运行作业'} · ${stateName[r.status]}`,
    })),
    ...snapshot.documents
      .filter((d) => d.deletedAt === null && d.systemId)
      .map((r) => ({
        id: r.id,
        name: r.title || '未命名文档',
        systemId: r.systemId!,
        environmentId: r.environmentId,
        address: 'Markdown 文档',
        notes: '',
        kind: 'documents' as const,
        extra: new Date(r.updatedAt).toLocaleDateString(),
      })),
  ];
  function rowScope(row: Row) {
    let kind: ScopeKind | undefined =
      row.kind === 'access'
        ? 'access'
        : row.kind === 'servers' || row.kind === 'resources'
          ? 'resource'
          : row.kind === 'services'
            ? 'service'
            : row.kind === 'operations'
              ? 'operation'
              : undefined;
    let id = row.id,
      environmentId = row.environmentId;
    if (row.kind === 'accounts') {
      const account = snapshot!.accounts.find((a) => a.id === row.id)!;
      kind = account.resourceId ? 'resource' : account.accessId ? 'access' : undefined;
      id = account.resourceId ?? account.accessId ?? id;
    }
    return kind
      ? scopeFor(snapshot!.scopes, kind, id, environmentId)
      : { environmentIds: environmentId ? [environmentId] : [], tags: [] };
  }
  function scopeLabel(row: Row) {
    const scope = rowScope(row);
    return [
      scope.environmentIds.length
        ? scope.environmentIds
            .map((id) => snapshot!.environments.find((e) => e.id === id)?.name ?? '已移除环境')
            .join('、')
        : '系统通用',
      ...scope.tags,
    ].join(' · ');
  }
  const visible = rows.filter(
    (r) =>
      r.systemId === systemId &&
      r.kind === view.category &&
      inEnvironment(rowScope(r), view.environment) &&
      (view.tag === 'all' || rowScope(r).tags.includes(view.tag)) &&
      (r.kind !== 'operations' ||
        ((view.operationKind === 'all' ||
          snapshot.operations.find((o) => o.id === r.id)?.kind === view.operationKind) &&
          (view.operationStatus === 'all' ||
            snapshot.operations.find((o) => o.id === r.id)?.status === view.operationStatus))) &&
      `${r.name} ${r.address} ${r.extra} ${r.notes}`
        .toLowerCase()
        .includes(view.query.trim().toLowerCase()),
  );
  const picked = rows.find((r) => r.id === selected && r.systemId === systemId),
    resource = snapshot.resources.find((r) => r.id === selected),
    access = snapshot.accessEntries.find((r) => r.id === selected),
    account = snapshot.accounts.find((r) => r.id === selected),
    service = snapshot.services.find((r) => r.id === selected),
    operation = snapshot.operations.find((r) => r.id === selected);
  const ownedAccounts = account
    ? [account]
    : snapshot.accounts.filter((a) =>
        resource ? a.resourceId === resource.id : access ? a.accessId === access.id : false,
      );
  const selectedScopeKind: ScopeKind | undefined = resource
    ? 'resource'
    : access
      ? 'access'
      : service
        ? 'service'
        : operation
          ? 'operation'
          : undefined;
  const tags = [
    ...new Set(snapshot.scopes.filter((s) => s.systemId === systemId).flatMap((s) => s.tags)),
  ];
  const Form =
    capture === 'task'
      ? QuickTask
      : capture === 'access'
        ? QuickAccess
        : capture === 'servers'
          ? QuickServer
          : capture === 'resources'
            ? QuickResource
            : capture === 'accounts'
              ? QuickAccount
              : capture === 'services'
                ? QuickService
                : capture === 'system'
                  ? QuickSystem
                  : null;
  function openRow(row: Row) {
    void transition(() => {
      if (row.kind === 'documents') {
        void navigate({ module: 'documents', objectId: row.id });
        return;
      }
      setSelected(row.id);
      setEditing(false);
    });
  }
  function accountView(item: AccountRecord) {
    return (
      <div key={item.id} className="workspace-account">
        <div>
          <strong>{item.name}</strong>
          <code>{item.username || '未填写用户名'}</code>
        </div>
        <div className="workspace-account-actions">
          <CopyValue
            value={item.username}
            label={`用户名 ${item.name} ${item.username}`}
            onError={setError}
          />
          {item.secretKinds.map((kind) => (
            <SecretCopyButton
              key={kind}
              accountId={item.id}
              kind={kind}
              name={`${item.name} ${item.username}`}
              onError={setError}
              beforeCopy={saves.flush}
            />
          ))}
          <FavoriteButton
            item={{ kind: 'account', id: item.id }}
            snapshot={snapshot!}
            onSnapshot={setSnapshot}
            onError={setError}
          />
          <button
            className="text-button"
            onClick={() =>
              void transition(() => {
                setSelected(item.id);
                setView((v) => ({ ...v, category: 'accounts' }));
                setEditing(true);
              })
            }
          >
            编辑账号
          </button>
        </div>
      </div>
    );
  }
  function summaryAccounts(row: Row) {
    const accounts = snapshot!.accounts.filter((item) =>
      row.kind === 'accounts'
        ? item.id === row.id
        : item.resourceId === row.id || item.accessId === row.id,
    );
    return accounts.map((item) => (
      <div className="workspace-summary-account" key={item.id}>
        {row.kind !== 'accounts' && (
          <CopyableField
            value={item.username}
            label={`用户名 ${item.name} ${item.username}`}
            currentValue={(current) => currentRecord(current.accounts, item.id).username}
            onError={setError}
          />
        )}
        {item.secretKinds.map((kind) => (
          <span className="workspace-summary-secret" key={kind}>
            {secretLabels[kind]}
            <SecretCopyButton
              accountId={item.id}
              kind={kind}
              name={`${item.name} ${item.username}`}
              beforeCopy={saves.flush}
              onError={setError}
            />
          </span>
        ))}
      </div>
    ));
  }
  const content = (
    <main className="main ledger-workspace">
      <header className="window-toolbar ledger-workspace-header">
        <div className="breadcrumb">
          <StackIcon size={18} />
          <span>台账</span>
        </div>
        <button
          className="system-switcher"
          aria-label="切换系统"
          aria-haspopup="dialog"
          aria-expanded={picker}
          onClick={() =>
            void transition(() => {
              setSystemQuery('');
              setPicker(true);
            })
          }
        >
          {system?.name ?? '选择系统'}
          <CaretDownIcon size={14} />
        </button>
        <div className="spacer" />
        {system && (
          <>
            <button
              className="text-button"
              onClick={() => void transition(() => setRelatedOpen(true))}
            >
              相关工作
            </button>
            <SystemActionsMenu
              onInfo={() => void transition(() => setInfo(true))}
              onExport={() => void transition(() => setExporting(true))}
            />
            <FavoriteButton
              item={{ kind: 'system', id: systemId }}
              snapshot={snapshot}
              onSnapshot={setSnapshot}
              onError={setError}
            />
          </>
        )}
      </header>
      {system ? (
        <>
          <div className="workspace-category-toolbar">
            <nav className="workspace-categories" aria-label="系统资料类型">
              {categories.map(([id, label]) => (
                <button
                  key={id}
                  aria-pressed={view.category === id}
                  onClick={() => changeView({ category: id, query: '' })}
                >
                  {label}
                </button>
              ))}
            </nav>
            <div className="workspace-category-actions">
              <button className="secondary-button" onClick={() => captureNew('paste')}>
                批量录入
              </button>
              <button
                className="primary-button"
                onClick={() =>
                  view.category === 'documents'
                    ? void createDocument({
                        systemId,
                        environmentId: !['all', 'common'].includes(view.environment)
                          ? view.environment
                          : null,
                      }).catch((e) => setError(String(e)))
                    : captureNew(view.category)
                }
              >
                <PlusIcon size={16} />
                新增{categories.find((c) => c[0] === view.category)?.[1]}
              </button>
            </div>
          </div>
          <div className={`workspace-browser ${picked ? 'show-inspector' : ''}`}>
            <section className="workspace-results" aria-label="台账清单">
              <div className="workspace-query">
                <label className="workspace-search">
                  <MagnifyingGlassIcon />
                  <input
                    aria-label="搜索台账清单"
                    placeholder={`搜索${categories.find((c) => c[0] === view.category)?.[1]}…`}
                    value={view.query}
                    onChange={(e) => changeView({ query: e.target.value })}
                  />
                </label>
                <select
                  aria-label="台账环境筛选"
                  value={view.environment}
                  onChange={(e) => changeView({ environment: e.target.value })}
                >
                  <option value="all">全部环境</option>
                  <option value="common">仅系统通用</option>
                  {snapshot.environments
                    .filter((e) => e.systemId === systemId)
                    .map((e) => (
                      <option value={e.id} key={e.id}>
                        {e.name}
                      </option>
                    ))}
                </select>
                <select
                  aria-label="台账标签筛选"
                  value={view.tag}
                  onChange={(e) => changeView({ tag: e.target.value })}
                >
                  <option value="all">全部标签</option>
                  {tags.map((t) => (
                    <option key={t}>{t}</option>
                  ))}
                </select>
                {view.category === 'operations' && (
                  <>
                    <select
                      aria-label="运维类型筛选"
                      value={view.operationKind}
                      onChange={(e) =>
                        changeView({ operationKind: e.target.value as View['operationKind'] })
                      }
                    >
                      <option value="all">全部运维类型</option>
                      <option value="job">运行作业</option>
                      <option value="backup">备份策略</option>
                    </select>
                    <select
                      aria-label="运维状态筛选"
                      value={view.operationStatus}
                      onChange={(e) =>
                        changeView({ operationStatus: e.target.value as View['operationStatus'] })
                      }
                    >
                      <option value="all">全部状态</option>
                      <option value="active">在用</option>
                      <option value="inactive">停用</option>
                      <option value="unverified">待确认</option>
                    </select>
                  </>
                )}
              </div>

              {(view.category !== 'accounts' || picked) && (
                <div className="workspace-result-count">
                  {visible.length} 条记录
                  {view.category !== 'documents' && view.category !== 'accounts' && (
                    <LedgerCopySelectionBar
                      objects={visible.flatMap((row) => {
                        const ref = copyRef(row);
                        return ref ? [ref] : [];
                      })}
                    />
                  )}
                </div>
              )}
              <div
                key={picked ? 'summary' : 'table'}
                className="workspace-list"
                ref={list}
                onScroll={(e) => {
                  if (picked || !e.currentTarget.offsetParent) return;
                  const scroll = e.currentTarget.scrollTop;
                  memory.current.views[systemId] = { ...view, scroll };
                  localStorage.setItem('ledger-workspace', JSON.stringify(memory.current));
                }}
              >
                {picked ? (
                  <ul className="workspace-summary" aria-label="台账摘要清单">
                    {visible.map((row) => (
                      <li key={row.id} aria-current={selected === row.id ? 'true' : undefined}>
                        {copyRef(row) && (
                          <LedgerCopyCheckbox object={copyRef(row)!} name={row.name} />
                        )}
                        <button className="workspace-summary-open" onClick={() => openRow(row)}>
                          <strong>{row.name}</strong>
                          <small>{scopeLabel(row)}</small>
                        </button>
                        <div className="workspace-summary-content">
                          <CopyableField
                            value={row.address}
                            currentValue={(snapshot) => currentRowValue(snapshot, row)}
                            label={
                              row.kind === 'accounts'
                                ? `用户名 ${row.name} ${row.address}`
                                : row.kind === 'services'
                                  ? '代码仓库'
                                  : row.kind === 'operations'
                                    ? '频率'
                                    : '地址'
                            }
                            onError={setError}
                          />
                          {row.extra && <p title={row.extra}>{row.extra}</p>}
                          {summaryAccounts(row)}
                        </div>
                      </li>
                    ))}
                  </ul>
                ) : view.category === 'accounts' ? (
                  <AccountList
                    key={JSON.stringify([systemId, view.environment, view.tag, view.query])}
                    snapshot={snapshot}
                    rows={visible.map((row) => ({
                      account: snapshot.accounts.find((a) => a.id === row.id)!,
                      scope: scopeLabel(row),
                      owner: row.extra,
                    }))}
                    selected={selected}
                    onOpen={(id) => {
                      const row = visible.find((r) => r.id === id);
                      if (row) openRow(row);
                    }}
                    onError={setError}
                  />
                ) : (
                  <table className="ledger-object-table">
                    <thead>
                      <tr>
                        <th>名称</th>
                        <th>{view.category === 'operations' ? '频率' : '地址／信息'}</th>
                        <th>说明</th>
                        <th className="workspace-row-actions">快捷操作</th>
                      </tr>
                    </thead>
                    <tbody>
                      {visible.map((row) => (
                        <tr key={row.id} className={selected === row.id ? 'selected' : ''}>
                          <td>
                            {copyRef(row) && (
                              <LedgerCopyCheckbox object={copyRef(row)!} name={row.name} />
                            )}
                            <button onClick={() => openRow(row)}>
                              <strong>{row.name}</strong>
                              <small>{scopeLabel(row)}</small>
                            </button>
                          </td>
                          <td>
                            {copyRef(row) ? (
                              <CopyableField
                                value={row.address}
                                currentValue={(snapshot) => currentRowValue(snapshot, row)}
                                label={
                                  row.kind === 'services'
                                    ? '代码仓库'
                                    : row.kind === 'operations'
                                      ? '频率'
                                      : '地址'
                                }
                                onError={setError}
                              />
                            ) : (
                              <span className="workspace-value">{row.address || '—'}</span>
                            )}
                          </td>
                          <td>{row.extra || '—'}</td>
                          <td className="workspace-row-actions">
                            {copyRef(row) && (
                              <LedgerCopyActions objects={[copyRef(row)!]} name={row.name} />
                            )}
                            {row.kind === 'access' && row.address ? (
                              <button
                                className="text-button"
                                aria-label={`打开 ${row.name}`}
                                onClick={() =>
                                  void window.desktop
                                    .openExternal(row.address)
                                    .catch((e) => setError(String(e)))
                                }
                              >
                                打开
                              </button>
                            ) : row.kind === 'servers' || row.kind === 'resources' ? (
                              <button className="text-button" onClick={() => openRow(row)}>
                                {snapshot.accounts.filter((a) => a.resourceId === row.id).length}{' '}
                                个账号
                              </button>
                            ) : null}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                )}
                {!visible.length && (
                  <div className="empty-state">
                    <h3>这里还没有符合条件的记录</h3>
                    <p>可快速新建，或调整环境与标签筛选。</p>
                  </div>
                )}
              </div>
            </section>
            {picked && (
              <aside className="workspace-inspector" aria-label="台账详情">
                <div className="workspace-inspector-toolbar">
                  <button
                    className="text-button"
                    onClick={() =>
                      void transition(() => {
                        setSelected(null);
                        setEditing(false);
                      })
                    }
                  >
                    <ArrowLeftIcon size={15} />
                    返回清单
                  </button>
                  <button
                    className="secondary-button"
                    onClick={() => void transition(() => setEditing(!editing))}
                  >
                    <PencilSimpleIcon size={15} />
                    {editing ? '完成编辑' : '编辑'}
                  </button>
                </div>
                <small className="secondary-copy">
                  {categories.find((c) => c[0] === picked.kind)?.[1]}
                </small>
                <h2>{picked.name}</h2>
                {copyRef(picked) && (
                  <LedgerCopyActions objects={[copyRef(picked)!]} name={picked.name} />
                )}
                {!editing && (
                  <p className="workspace-address">
                    <CopyableField
                      value={picked.address}
                      currentValue={(s) => currentRowValue(s, picked)}
                      label={
                        picked.kind === 'services'
                          ? '代码仓库'
                          : picked.kind === 'operations'
                            ? '频率'
                            : picked.kind === 'accounts'
                              ? '用户名'
                              : '地址'
                      }
                      onError={setError}
                    />
                  </p>
                )}
                <p className="secondary-copy">{scopeLabel(picked)}</p>
                {editing ? (
                  <div className="workspace-edit-form">
                    {resource && (
                      <ResourceEditor
                        key={resource.id}
                        {...host}
                        resource={resource}
                        environment={
                          snapshot.environments.find((e) => e.id === resource.environmentId) ?? null
                        }
                        scopeManaged
                        serverView={resource.kind === 'server'}
                        snapshot={snapshot}
                        flushAll={saves.flush}
                        onOpen={(id) =>
                          void navigate({ module: 'ledger', objectId: id }).catch((e) =>
                            setError(String(e)),
                          )
                        }
                      />
                    )}{' '}
                    {access && (
                      <AccessEntryEditor
                        key={access.id}
                        {...host}
                        entry={access}
                        scopeManaged
                        snapshot={snapshot}
                        flushAll={saves.flush}
                      />
                    )}{' '}
                    {account && (
                      <AccountEditor
                        key={account.id}
                        {...host}
                        account={account}
                        revealTarget
                        snapshot={snapshot}
                        flushAll={saves.flush}
                        onOpenAccount={(target) =>
                          void transition(() => {
                            setSelected(target.accountId);
                            setEditing(true);
                          })
                        }
                      />
                    )}{' '}
                    {service && (
                      <ServiceEditor
                        key={service.id}
                        {...host}
                        id={service.id}
                        snapshot={snapshot}
                      />
                    )}{' '}
                    {operation && (
                      <OperationEditor
                        key={operation.id}
                        {...host}
                        operation={operation}
                        snapshot={snapshot}
                      />
                    )}{' '}
                    {selectedScopeKind && (
                      <ScopeEditor
                        key={`${picked.id}-scope`}
                        {...host}
                        kind={selectedScopeKind}
                        id={picked.id}
                        systemId={systemId}
                        environmentId={picked.environmentId}
                        snapshot={snapshot}
                      />
                    )}
                  </div>
                ) : (
                  <>
                    {(resource || access || account) && (
                      <section>
                        <div className="section-heading">
                          <h3>账号 {ownedAccounts.length}</h3>
                          {!account && (
                            <button
                              className="text-button"
                              onClick={() =>
                                captureNew('accounts', {
                                  systemId,
                                  environmentId:
                                    resource?.environmentId ?? access?.environmentId ?? null,
                                  resourceId: resource?.id ?? null,
                                  accessId: access?.id ?? null,
                                })
                              }
                            >
                              新增账号
                            </button>
                          )}
                        </div>
                        {ownedAccounts.length ? (
                          ownedAccounts.map(accountView)
                        ) : (
                          <p className="secondary-copy">尚未录入账号</p>
                        )}
                      </section>
                    )}
                    {account && <p>所属对象：{picked.extra}</p>}
                    {access && (
                      <section>
                        <h3>访问地址</h3>
                        {access.addresses.map((address) => (
                          <div className="workspace-address-row" key={address.id}>
                            <div>
                              <strong>
                                {address.label}
                                {address.id === access.preferredAddressId ? ' · 常用' : ''}
                              </strong>
                              <p>{address.url}</p>
                            </div>
                            <button
                              className="text-button"
                              onClick={() =>
                                void window.desktop
                                  .openExternal(address.url)
                                  .catch((e) => setError(String(e)))
                              }
                            >
                              打开
                            </button>
                            <CopyValue
                              value={address.url}
                              resolveValue={async () => {
                                await saves.flush();
                                const current = await window.desktop.snapshot();
                                return currentRecord(
                                  currentRecord(current.accessEntries, access.id).addresses,
                                  address.id,
                                ).url;
                              }}
                              label={address.label}
                              onError={setError}
                            />
                          </div>
                        ))}
                        <FavoriteButton
                          item={{ kind: 'access', id: access.id }}
                          snapshot={snapshot}
                          onSnapshot={setSnapshot}
                          onError={setError}
                        />
                      </section>
                    )}
                    <section>
                      <div className="workspace-account-actions">
                        <button
                          className="text-button"
                          onClick={() =>
                            void createDocument(
                              selectionContext(snapshot, systemId, view.environment, selected),
                            ).catch((e) => setError(String(e)))
                          }
                        >
                          为当前对象写文档
                        </button>
                        <button
                          className="text-button"
                          onClick={() => captureNew('task', { systemId })}
                        >
                          记录工作任务
                        </button>
                      </div>
                      <h3>说明</h3>
                      <p className="multiline">
                        {resource?.fields['用途'] ||
                          resource?.notes ||
                          access?.notes ||
                          account?.notes ||
                          service?.notes ||
                          operation?.notes ||
                          '暂未填写'}
                      </p>
                    </section>
                    {resource && resource.kind !== 'server' && (
                      <section>
                        <h3>连接信息</h3>
                        {(resource.connections ?? []).map((c) => (
                          <div className="workspace-node" key={c.id}>
                            <strong>
                              {c.label}
                              {c.id === resource.preferredConnectionId ? '（常用）' : ''}
                            </strong>
                            <CopyableField
                              value={
                                connectionAddress(c, snapshot.resources) +
                                (c.port ? ':' + c.port : '')
                              }
                              label={`连接 ${c.label}`}
                              onError={setError}
                              currentValue={(next) => {
                                const r = currentRecord(next.resources, resource.id);
                                const live = r.connections?.find((v) => v.id === c.id);
                                if (!live) throw new Error('连接已删除，请重新选择。');
                                return (
                                  connectionAddress(live, next.resources) +
                                  (live.port ? ':' + live.port : '')
                                );
                              }}
                            />
                            <p>
                              {c.role}
                              {c.serverId
                                ? ` · ${snapshot.resources.find((r) => r.id === c.serverId)?.name}`
                                : ''}
                            </p>
                            {!c.address && c.serverId && <small>地址来自服务器</small>}
                          </div>
                        ))}
                      </section>
                    )}
                    {service && (
                      <DocumentReferences
                        value={service.documentIds ?? []}
                        systemId={systemId}
                        snapshot={snapshot}
                        onOpen={(id) => void navigate({ module: 'documents', objectId: id })}
                      />
                    )}
                    {operation && (
                      <dl className="workspace-properties">
                        {Object.entries(operation.fields ?? {})
                          .filter(([, v]) => v)
                          .map(([key, value]) => (
                            <div key={key}>
                              <dt>{key}</dt>
                              <dd>{value}</dd>
                            </div>
                          ))}
                      </dl>
                    )}
                    {resource && (
                      <details className="compact-details">
                        <summary>基本信息与配置</summary>
                        <dl className="workspace-properties">
                          <dt>端口</dt>
                          <dd>
                            <CopyableField
                              value={resource.port}
                              currentValue={(s) => currentRecord(s.resources, resource.id).port}
                              label="端口"
                              onError={setError}
                            />
                          </dd>
                          {Object.entries(resource.fields).map(([key, value]) => (
                            <div key={key}>
                              <dt>{key}</dt>
                              <dd>
                                <CopyableField
                                  value={value}
                                  currentValue={(s) =>
                                    currentRecord(s.resources, resource.id).fields[key] ?? ''
                                  }
                                  label={key}
                                  onError={setError}
                                />
                              </dd>
                            </div>
                          ))}
                        </dl>
                      </details>
                    )}
                    {service && (
                      <section>
                        <div className="section-heading">
                          <h3>部署节点</h3>
                          <button className="text-button" onClick={() => setNode('new')}>
                            新增节点
                          </button>
                          <button
                            className="text-button"
                            onClick={() => setDeletion({ type: 'service.delete', id: service.id })}
                          >
                            删除服务
                          </button>
                        </div>
                        {snapshot.deploymentNodes
                          .filter(
                            (n) =>
                              n.serviceId === service.id &&
                              (view.environment === 'all' || n.environmentId === view.environment),
                          )
                          .map((n) => {
                            const server = snapshot.resources.find((r) => r.id === n.serverId);
                            return (
                              <div className="workspace-node" key={n.id}>
                                <strong>{n.name}</strong>
                                <LedgerCopyActions
                                  objects={[{ kind: 'node', id: n.id }]}
                                  name={n.name}
                                />
                                <p>
                                  {
                                    snapshot.environments.find((e) => e.id === n.environmentId)
                                      ?.name
                                  }{' '}
                                  ·{' '}
                                  {n.mode === 'scheduled'
                                    ? `按需调度 ${n.count}`
                                    : (server?.name ?? '服务器待补充')}
                                </p>
                                <CopyableField
                                  value={
                                    (n.address || server?.address || '') +
                                    (n.port ? `:${n.port}` : '')
                                  }
                                  currentValue={(s) => currentNodeAddress(s, n.id)}
                                  label="节点地址"
                                  onError={setError}
                                />
                                {!n.address && server && <small>地址来自服务器</small>}
                                <p>{n.notes}</p>
                                <dl className="workspace-properties">
                                  {Object.entries(n.fields ?? {})
                                    .filter(([, v]) => v)
                                    .map(([key, value]) => (
                                      <div key={key}>
                                        <dt>{key}</dt>
                                        <dd>{value}</dd>
                                      </div>
                                    ))}
                                </dl>
                                <DocumentReferences
                                  value={n.documentIds ?? []}
                                  systemId={systemId}
                                  snapshot={snapshot}
                                  onOpen={(id) =>
                                    void navigate({ module: 'documents', objectId: id })
                                  }
                                />
                                <button className="text-button" onClick={() => setNode(n)}>
                                  编辑节点
                                </button>
                                <button
                                  className="text-button"
                                  onClick={() => setDeletion({ type: 'node.delete', id: n.id })}
                                >
                                  删除节点
                                </button>
                              </div>
                            );
                          })}
                      </section>
                    )}
                    {operation && (
                      <section>
                        <dl className="workspace-properties">
                          <dt>频率</dt>
                          <dd>
                            <CopyableField
                              value={operation.frequency}
                              currentValue={(s) =>
                                currentRecord(s.operations, operation.id).frequency
                              }
                              label="频率"
                              onError={setError}
                            />
                          </dd>
                          <dt>状态</dt>
                          <dd>{stateName[operation.status]}</dd>
                          <dt>关联对象</dt>
                          <dd>
                            {snapshot.resources.find((r) => r.id === operation.resourceId)?.name ??
                              snapshot.services.find((r) => r.id === operation.serviceId)?.name ??
                              '未关联'}
                          </dd>
                        </dl>
                        {operation.documentId && (
                          <button
                            className="text-button"
                            onClick={() =>
                              void navigate({
                                module: 'documents',
                                objectId: operation.documentId!,
                              })
                            }
                          >
                            阅读步骤文档
                          </button>
                        )}
                        <button
                          className="text-button"
                          onClick={() =>
                            setDeletion({ type: 'operation.delete', id: operation.id })
                          }
                        >
                          删除运维记录
                        </button>
                      </section>
                    )}
                    {(resource || service) &&
                      snapshot.operations.some(
                        (o) => o.resourceId === resource?.id || o.serviceId === service?.id,
                      ) && (
                        <section>
                          <h3>相关运行维护</h3>
                          {snapshot.operations
                            .filter(
                              (o) =>
                                (resource && o.resourceId === resource.id) ||
                                (service && o.serviceId === service.id),
                            )
                            .map((o) => (
                              <button
                                key={o.id}
                                className="workspace-link"
                                onClick={() =>
                                  void transition(() => {
                                    setView((v) => ({ ...v, category: 'operations' }));
                                    setSelected(o.id);
                                  })
                                }
                              >
                                {o.name} · {stateName[o.status]}
                              </button>
                            ))}
                        </section>
                      )}
                    {!service &&
                      snapshot.documents.some(
                        (d) =>
                          d.systemId === systemId &&
                          d.deletedAt === null &&
                          (!resource || d.resourceId === resource.id),
                      ) && (
                        <details className="compact-details">
                          <summary>相关文档</summary>
                          {snapshot.documents
                            .filter(
                              (d) =>
                                d.systemId === systemId &&
                                d.deletedAt === null &&
                                (!resource || d.resourceId === resource.id),
                            )
                            .map((d) => (
                              <button
                                className="workspace-link"
                                key={d.id}
                                onClick={() =>
                                  void navigate({ module: 'documents', objectId: d.id })
                                }
                              >
                                {d.title || '未命名文档'}
                              </button>
                            ))}
                        </details>
                      )}
                  </>
                )}
              </aside>
            )}
          </div>
        </>
      ) : (
        <div className="empty-state">
          <h2>从一个系统开始</h2>
          <p>名称即可创建，其他信息随时补充。</p>
          <button className="primary-button" onClick={() => captureNew('system')}>
            新增系统
          </button>
        </div>
      )}
      {picker && (
        <Dialog title="切换系统" onClose={() => setPicker(false)}>
          <input
            ref={systemSearch}
            aria-label="搜索系统"
            placeholder="搜索系统…"
            value={systemQuery}
            onChange={(e) => setSystemQuery(e.target.value)}
          />
          <div className="system-picker-list">
            {[...snapshot.systems]
              .sort(
                (a, b) =>
                  Number(snapshot.favorites.some((f) => f.kind === 'system' && f.id === b.id)) -
                    Number(snapshot.favorites.some((f) => f.kind === 'system' && f.id === a.id)) ||
                  (memory.current.recent.indexOf(a.id) < 0
                    ? 99
                    : memory.current.recent.indexOf(a.id)) -
                    (memory.current.recent.indexOf(b.id) < 0
                      ? 99
                      : memory.current.recent.indexOf(b.id)),
              )
              .filter((s) => s.name.toLowerCase().includes(systemQuery.toLowerCase()))
              .map((s) => (
                <button className="workspace-link" key={s.id} onClick={() => chooseSystem(s.id)}>
                  {s.name}
                  {s.id === systemId ? ' · 当前' : ''}
                  {snapshot.favorites.some((f) => f.kind === 'system' && f.id === s.id)
                    ? ' · 常用'
                    : memory.current.recent.includes(s.id)
                      ? ' · 最近'
                      : ''}
                </button>
              ))}
          </div>
          <div className="modal-actions">
            <button className="primary-button" onClick={() => captureNew('system', {})}>
              <PlusIcon size={16} />
              新增系统
            </button>
          </div>
        </Dialog>
      )}
      {info && system && (
        <Dialog
          title="系统信息"
          description="维护系统资料、部署环境与项目沿革。"
          className="modal workspace-config"
          onClose={() => void transition(() => setInfo(false))}
          error={error}
        >
          <SystemConfiguration {...host} id={systemId} snapshot={snapshot} />
          <div className="modal-actions">
            <button
              className="primary-button"
              onClick={() => void transition(() => setInfo(false))}
            >
              完成
            </button>
          </div>
        </Dialog>
      )}
      {exporting && system && (
        <SystemExportDialog
          systemId={systemId}
          snapshot={snapshot}
          onClose={() => setExporting(false)}
        />
      )}
      {relatedOpen && system && (
        <Dialog
          title="系统相关工作"
          onClose={() => void transition(() => setRelatedOpen(false))}
          error={error}
        >
          <RelatedWork {...host} snapshot={snapshot} context={{ systemId }} />
        </Dialog>
      )}
      {capture && Form && (
        <Dialog
          title={`新增${capture === 'task' ? '任务' : capture === 'system' ? '系统' : categories.find((c) => c[0] === capture)?.[1]}`}
          onClose={() => {
            if (!busy) void transition(() => setCapture(null));
          }}
          error={error}
        >
          <Form
            snapshot={snapshot}
            context={captureContext}
            busy={busy}
            execute={execute}
            cancel={() => closeNewRecord(() => setCapture(null))}
          />
        </Dialog>
      )}
      {capture === 'operations' && (
        <Dialog
          title="新增运维记录"
          description="先记下名称，频率、状态和关联对象可以稍后补充。"
          closeDisabled={busy}
          onClose={() => !busy && setCapture(null)}
          error={error}
        >
          <QuickOperation
            snapshot={snapshot}
            context={captureContext}
            busy={busy}
            execute={execute}
            cancel={() => closeNewRecord(() => setCapture(null))}
          />
        </Dialog>
      )}
      {capture === 'paste' && (
        <PasteLedger
          snapshot={snapshot}
          systemId={systemId}
          environmentId={captureContext.environmentId ?? null}
          initialKind={
            view.category === 'access'
              ? 'access'
              : view.category === 'accounts'
                ? 'account'
                : view.category === 'resources'
                  ? 'database'
                  : view.category === 'services'
                    ? 'service'
                    : view.category === 'operations'
                      ? view.operationKind === 'backup'
                        ? 'backup'
                        : 'job'
                      : 'server'
          }
          registerFlush={saves.register}
          onClose={() => setCapture(null)}
          onSaved={(s, id) => {
            setSnapshot(s);
            const found = locate(s, id);
            if (found.id) {
              setView((v) => ({
                ...v,
                category: found.category,
                environment: 'all',
                query: '',
                tag: 'all',
              }));
              setSelected(found.id);
              setEditing(false);
            }
          }}
        />
      )}
      {node && service && (
        <NodeDialog
          node={node === 'new' ? undefined : node}
          environmentId={
            ['all', 'common'].includes(view.environment) ? undefined : view.environment
          }
          serviceId={service.id}
          systemId={systemId}
          snapshot={snapshot}
          onSaved={setSnapshot}
          registerFlush={saves.register}
          onClose={() => setNode(null)}
        />
      )}
      {deletion && (
        <Dialog title="删除这条记录？" onClose={() => setDeletion(null)} error={error}>
          <p>相关引用需要先处理，删除不会自动转移其他资料。</p>
          <div className="modal-actions">
            <button className="secondary-button" onClick={() => setDeletion(null)}>
              取消
            </button>
            <button
              className="danger-button"
              onClick={() =>
                void run(deletion)
                  .then(() => setDeletion(null))
                  .catch((e) => setError(String(e)))
              }
            >
              删除
            </button>
          </div>
        </Dialog>
      )}
      {error && !info && (
        <div role="alert" className="error-banner">
          <span>{error}</span>
          <button aria-label="关闭提示" onClick={() => setError('')}>
            <XIcon />
          </button>
        </div>
      )}
    </main>
  );
  return (
    <LedgerCopyProvider
      scopeKey={JSON.stringify([
        systemId,
        view.category,
        view.environment,
        view.tag,
        view.query,
        view.operationKind,
        view.operationStatus,
      ])}
      systemId={systemId}
      environment={view.environment}
      beforeCopy={saves.flush}
      onError={setError}
    >
      {content}
    </LedgerCopyProvider>
  );
}

export function ProjectArchiveWorkspace() {
  const [snapshot, setSnapshot] = useState<Snapshot | null>(null),
    [error, setError] = useState('');
  useEffect(() => {
    void window.desktop
      .snapshot()
      .then(setSnapshot)
      .catch((e) => setError(String(e)));
  }, []);
  return (
    <main className="main">
      <section className="archive-page">
        <PageHeading
          title="项目档案"
          description="项目用于记录系统的阶段历史，工作任务只关联系统。"
        />
        {snapshot && (
          <ProjectManager snapshot={snapshot} onSnapshot={setSnapshot} onError={setError} />
        )}
        <p role="alert">{error}</p>
      </section>
    </main>
  );
}
