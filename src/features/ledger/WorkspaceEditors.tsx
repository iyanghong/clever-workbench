import { closeNewRecord, saveNewRecord } from '../../shared/new-record';
import { OptionalFields, DocumentReferences } from './RecordFields';
import { nodeFields, operationFields } from '../../ledger-fields';
import { useEffect, useState } from 'react';
import type { Snapshot, Command } from '../../types';
import type { ScopeKind, DeploymentNode, Operation } from '../../ledger-workspace-types';
import { scopeFor } from '../../ledger-workspace-types';
import type { EditorHost } from './Environments';
import { useAutosave } from '../../shared/useAutosave';
import { Dialog } from '../../shared/Dialog';

export function ScopeEditor({
  kind,
  id,
  systemId,
  environmentId,
  snapshot,
  ...host
}: EditorHost & {
  kind: ScopeKind;
  id: string;
  systemId: string;
  environmentId?: string | null;
  snapshot: Snapshot;
}) {
  const initial = scopeFor(snapshot.scopes, kind, id, environmentId);
  const form = useAutosave(
    { ...initial, tagsText: initial.tags.join('，') },
    async (value) =>
      host.onSnapshot(
        (
          await window.desktop.mutate({
            type: 'scope.save',
            kind,
            ownerId: id,
            scope: {
              environmentIds:
                kind === 'operation'
                  ? environmentId
                    ? [environmentId]
                    : []
                  : value.environmentIds,
              tags: value.tagsText
                .split(/[,，]/)
                .map((t) => t.trim())
                .filter(Boolean),
              status: value.status,
              statusNotes: value.statusNotes,
            },
          })
        ).snapshot,
      ),
    host.onError,
  );
  useEffect(() => host.registerFlush(form.flush), [host.registerFlush, form.flush]);
  return (
    <section className="scope-editor">
      <h3>适用范围与标签</h3>
      <p className="secondary-copy">
        {kind === 'operation'
          ? '环境由运维记录的环境字段确定。'
          : '不勾选环境即为系统通用；同一记录和账号只维护一份。'}
      </p>
      {kind !== 'operation' && (
        <div className="scope-options">
          {snapshot.environments
            .filter((e) => e.systemId === systemId)
            .map((e) => (
              <label key={e.id}>
                <input
                  type="checkbox"
                  checked={form.value.environmentIds.includes(e.id)}
                  onChange={(event) =>
                    form.change({
                      ...form.value,
                      environmentIds: event.target.checked
                        ? [...form.value.environmentIds, e.id]
                        : form.value.environmentIds.filter((id) => id !== e.id),
                    })
                  }
                />
                {e.name}
              </label>
            ))}
        </div>
      )}
      <label className="field-label">
        地点／网络标签
        <input
          aria-label="地点与网络标签"
          placeholder="例如：内网，广州"
          value={form.value.tagsText}
          onChange={(e) => form.change({ ...form.value, tagsText: e.target.value })}
        />
      </label>
      {kind === 'service' && (
        <>
          <label className="field-label">
            状态
            <select
              value={form.value.status ?? 'active'}
              onChange={(e) =>
                form.change({
                  ...form.value,
                  status: e.target.value as 'active' | 'inactive' | 'unverified',
                })
              }
            >
              <option value="active">在用</option>
              <option value="inactive">停用</option>
              <option value="unverified">待确认</option>
            </select>
          </label>
          <label className="field-label">
            状态说明
            <textarea
              value={form.value.statusNotes ?? ''}
              onChange={(e) => form.change({ ...form.value, statusNotes: e.target.value })}
            />
          </label>
        </>
      )}
      <button
        className="save-indicator"
        onClick={() => void form.flush().catch((e) => host.onError(String(e)))}
      >
        {form.status}
      </button>
    </section>
  );
}

export function ServiceEditor({
  id,
  snapshot,
  ...host
}: EditorHost & { id: string; snapshot: Snapshot }) {
  const service = snapshot.services.find((s) => s.id === id)!;
  const form = useAutosave(
    {
      name: service.name,
      repository: service.repository,
      notes: service.notes,
      documentIds: service.documentIds ?? [],
    },
    async (value) =>
      host.onSnapshot(
        (
          await window.desktop.mutate({
            type: 'service.save',
            id,
            systemId: service.systemId,
            ...value,
          })
        ).snapshot,
      ),
    host.onError,
  );
  useEffect(() => host.registerFlush(form.flush), [host.registerFlush, form.flush]);
  return (
    <div className="workspace-fields">
      {(['name', 'repository', 'notes'] as const).map((key, index) => (
        <label className="field-label" key={key}>
          {['服务名称', '代码仓库', '说明'][index]}
          <input
            aria-label={['服务名称', '代码仓库', '服务说明'][index]}
            value={form.value[key]}
            onChange={(e) => form.change({ ...form.value, [key]: e.target.value })}
          />
        </label>
      ))}
      <DocumentReferences
        value={form.value.documentIds}
        systemId={service.systemId}
        snapshot={snapshot}
        onChange={(documentIds) => form.change({ ...form.value, documentIds })}
        onOpen={(id) => void host.navigate({ module: 'documents', objectId: id })}
      />
      <button
        className="save-indicator"
        onClick={() => void form.flush().catch((e) => host.onError(String(e)))}
      >
        {form.status}
      </button>
    </div>
  );
}

export function OperationEditor({
  operation,
  snapshot,
  ...host
}: EditorHost & { operation: Operation; snapshot: Snapshot }) {
  const form = useAutosave(
    operation,
    async (value) =>
      host.onSnapshot((await window.desktop.mutate({ type: 'operation.save', value })).snapshot),
    host.onError,
  );
  useEffect(() => host.registerFlush(form.flush), [host.registerFlush, form.flush]);
  const value = form.value;
  return (
    <div className="workspace-fields">
      <OperationFields
        value={value}
        snapshot={snapshot}
        onChange={(next) => form.change({ ...value, ...next })}
      />
      <button
        className="save-indicator"
        onClick={() => void form.flush().catch((e) => host.onError(String(e)))}
      >
        {form.status}
      </button>
    </div>
  );
}

export function OperationFields({
  value,
  snapshot,
  onChange,
}: {
  value: Omit<Operation, 'id'> & { id?: string };
  snapshot: Snapshot;
  onChange: (value: Omit<Operation, 'id'> & { id?: string }) => void;
}) {
  return (
    <>
      <label className="field-label">
        名称
        <input value={value.name} onChange={(e) => onChange({ ...value, name: e.target.value })} />
      </label>
      <label className="field-label">
        类型
        <select
          aria-label="运维类型"
          value={value.kind}
          onChange={(e) => onChange({ ...value, kind: e.target.value as Operation['kind'] })}
        >
          <option value="job">运行作业</option>
          <option value="backup">备份策略</option>
        </select>
      </label>
      <label className="field-label">
        频率
        <input
          placeholder="例如：每日 02:00"
          value={value.frequency}
          onChange={(e) => onChange({ ...value, frequency: e.target.value })}
        />
      </label>
      <label className="field-label">
        状态
        <select
          value={value.status}
          onChange={(e) => onChange({ ...value, status: e.target.value as Operation['status'] })}
        >
          <option value="active">在用</option>
          <option value="inactive">停用</option>
          <option value="unverified">待确认</option>
        </select>
      </label>
      <label className="field-label">
        环境
        <select
          value={value.environmentId ?? ''}
          onChange={(e) => onChange({ ...value, environmentId: e.target.value || null })}
        >
          <option value="">系统通用</option>
          {snapshot.environments
            .filter((e) => e.systemId === value.systemId)
            .map((e) => (
              <option key={e.id} value={e.id}>
                {e.name}
              </option>
            ))}
        </select>
      </label>
      <label className="field-label">
        关联应用／资源
        <select
          value={
            value.serviceId
              ? `service:${value.serviceId}`
              : value.resourceId
                ? `resource:${value.resourceId}`
                : ''
          }
          onChange={(e) => {
            const [kind, id] = e.target.value.split(':');
            onChange({
              ...value,
              serviceId: kind === 'service' ? id : null,
              resourceId: kind === 'resource' ? id : null,
            });
          }}
        >
          <option value="">不关联对象</option>
          {snapshot.services
            .filter((r) => r.systemId === value.systemId)
            .map((r) => (
              <option key={r.id} value={`service:${r.id}`}>
                应用 · {r.name}
              </option>
            ))}
          {snapshot.resources
            .filter((r) => r.systemId === value.systemId)
            .map((r) => (
              <option key={r.id} value={`resource:${r.id}`}>
                {r.name}
              </option>
            ))}
        </select>
      </label>
      <label className="field-label">
        步骤文档
        <select
          value={value.documentId ?? ''}
          onChange={(e) => onChange({ ...value, documentId: e.target.value || null })}
        >
          <option value="">稍后补充</option>
          {snapshot.documents
            .filter((d) => d.systemId === value.systemId && d.deletedAt === null)
            .map((d) => (
              <option key={d.id} value={d.id}>
                {d.title || '未命名文档'}
              </option>
            ))}
        </select>
      </label>
      <label className="field-label">
        说明
        <textarea
          value={value.notes}
          onChange={(e) => onChange({ ...value, notes: e.target.value })}
        />
      </label>
      <details className="compact-details">
        <summary>作业／备份资料（可选）</summary>
        <OptionalFields
          value={value.fields ?? {}}
          names={operationFields[value.kind]}
          onChange={(fields) => onChange({ ...value, fields })}
        />
      </details>
    </>
  );
}

export function NodeDialog({
  node,
  environmentId,
  serviceId,
  systemId,
  snapshot,
  onClose,
  onSaved,
  registerFlush,
}: {
  node?: DeploymentNode;
  environmentId?: string;
  serviceId: string;
  systemId: string;
  snapshot: Snapshot;
  onClose: () => void;
  onSaved: (snapshot: Snapshot) => void;
  registerFlush: EditorHost['registerFlush'];
}) {
  const [error, setError] = useState(''),
    [busy, setBusy] = useState(false);
  const form = useAutosave<Omit<DeploymentNode, 'id'> & { id?: string }>(
    node ?? {
      serviceId,
      environmentId:
        environmentId ?? snapshot.environments.find((e) => e.systemId === systemId)?.id ?? '',
      name: '',
      serverId: null,
      address: '',
      port: '',
      notes: '',
      mode: 'fixed',
      count: '',
    },
    async (value) => {
      if (node) onSaved((await window.desktop.mutate({ type: 'node.save', value })).snapshot);
    },
    setError,
  );
  const value = form.value,
    setValue = form.change;
  useEffect(
    () => (node ? registerFlush(form.flush) : undefined),
    [node?.id, registerFlush, form.flush],
  );
  async function saveAndClose() {
    if (busy) return;
    setBusy(true);
    try {
      if (node) await form.flush();
      else
        onSaved(
          (await saveNewRecord(() => window.desktop.mutate({ type: 'node.save', value }))).snapshot,
        );
      onClose();
    } catch (e) {
      setError(String(e));
    } finally {
      setBusy(false);
    }
  }
  function close() {
    if (busy) return;
    if (node) void saveAndClose();
    else closeNewRecord(onClose);
  }
  return (
    <Dialog title={node ? '编辑部署节点' : '新增部署节点'} error={error} onClose={close}>
      <form
        data-new-record={node ? undefined : ''}
        aria-busy={busy}
        onChangeCapture={(e) => {
          if (!node) e.currentTarget.dataset.dirty = 'true';
        }}
        onSubmit={(e) => {
          e.preventDefault();
          void saveAndClose();
        }}
      >
        <fieldset disabled={busy} className="new-record-fields">
          <DeploymentFields
            value={value}
            onChange={(next) => setValue({ ...value, ...next })}
            snapshot={snapshot}
            systemId={systemId}
          />
        </fieldset>
        {node && (
          <button
            type="button"
            className="save-indicator"
            onClick={() => void form.flush().catch((e) => setError(String(e)))}
          >
            {form.status}
          </button>
        )}
        <div className="modal-actions">
          <button type="button" className="secondary-button" onClick={close} disabled={busy}>
            {node ? '关闭' : '取消'}
          </button>
          <button
            className="primary-button"
            disabled={busy || !value.environmentId || !value.name.trim()}
          >
            {node ? '完成' : '保存节点'}
          </button>
        </div>
      </form>
    </Dialog>
  );
}

export function DeploymentFields({
  value,
  onChange,
  snapshot,
  systemId,
}: {
  value: Omit<DeploymentNode, 'id' | 'serviceId'>;
  onChange: (value: Omit<DeploymentNode, 'id' | 'serviceId'>) => void;
  snapshot: Snapshot;
  systemId: string;
}) {
  return (
    <>
      <label className="field-label">
        节点名称
        <input
          required
          autoFocus
          value={value.name}
          onChange={(e) => onChange({ ...value, name: e.target.value })}
        />
      </label>
      <label className="field-label">
        部署环境
        <select
          required
          aria-label="部署环境"
          value={value.environmentId}
          onChange={(e) => onChange({ ...value, environmentId: e.target.value })}
        >
          <option value="">选择环境</option>
          {snapshot.environments
            .filter((e) => e.systemId === systemId)
            .map((e) => (
              <option key={e.id} value={e.id}>
                {e.name}
              </option>
            ))}
        </select>
      </label>
      <label className="field-label">
        运行方式
        <select
          value={value.mode}
          onChange={(e) => onChange({ ...value, mode: e.target.value as DeploymentNode['mode'] })}
        >
          <option value="fixed">固定部署</option>
          <option value="scheduled">按需调度</option>
        </select>
      </label>
      <label className="field-label">
        服务器（可后补）
        <select
          value={value.serverId ?? ''}
          onChange={(e) => onChange({ ...value, serverId: e.target.value || null })}
        >
          <option value="">未关联服务器</option>
          {snapshot.resources
            .filter((r) => r.systemId === systemId && r.kind === 'server')
            .map((r) => (
              <option key={r.id} value={r.id}>
                {r.name}
              </option>
            ))}
        </select>
      </label>
      {(['address', 'port', 'count', 'notes'] as const).map((key, i) => (
        <label key={key} className="field-label">
          {['独立地址（留空展示服务器地址）', '端口', '节点数量／规模说明', '备注'][i]}
          <input
            value={value[key]}
            onChange={(e) => onChange({ ...value, [key]: e.target.value })}
          />
        </label>
      ))}
      <details className="compact-details">
        <summary>部署与排障资料（可选）</summary>
        <OptionalFields
          value={value.fields ?? {}}
          names={nodeFields.filter(
            (name) =>
              !['命名空间', '工作负载'].includes(name) ||
              /kubernetes|k8s/i.test(value.fields?.['部署方式'] ?? ''),
          )}
          onChange={(fields) => onChange({ ...value, fields })}
        />
      </details>
      <DocumentReferences
        value={value.documentIds ?? []}
        systemId={systemId}
        snapshot={snapshot}
        onChange={(documentIds) => onChange({ ...value, documentIds })}
      />
    </>
  );
}

export function ProjectManager({
  snapshot,
  onSnapshot,
  onError,
}: {
  snapshot: Snapshot;
  onSnapshot: (s: Snapshot) => void;
  onError: (message: string) => void;
}) {
  const [name, setName] = useState(''),
    [editing, setEditing] = useState<string | null>(null);
  async function run(command: Command) {
    try {
      onSnapshot((await window.desktop.mutate(command)).snapshot);
      return true;
    } catch (e) {
      onError(String(e));
      return false;
    }
  }
  return (
    <section className="project-manager">
      <div className="config-section-heading">
        <h3>项目档案</h3>
        <p>管理阶段项目；归档后仍保留系统关联历史。</p>
      </div>
      <form
        className="ledger-quick"
        onSubmit={(e) => {
          e.preventDefault();
          void run(
            editing
              ? {
                  type: 'project.edit',
                  id: editing,
                  name,
                  color: snapshot.projects.find((p) => p.id === editing)!.color,
                }
              : { type: 'project.create', name, color: '#007aff' },
          ).then((ok) => {
            if (ok) {
              setName('');
              setEditing(null);
            }
          });
        }}
      >
        <input
          aria-label="项目名称"
          placeholder="项目名称"
          value={name}
          onChange={(e) => setName(e.target.value)}
        />
        <button className="secondary-button" disabled={!name.trim()}>
          {editing ? '保存' : '新增项目'}
        </button>
      </form>
      {snapshot.projects.map((p) => (
        <div className="workspace-management-row" key={p.id}>
          <span>
            {p.name}
            {p.archivedAt ? ' · 已归档' : ''}
          </span>
          <button
            className="text-button"
            onClick={() => {
              setEditing(p.id);
              setName(p.name);
            }}
          >
            编辑
          </button>
          <button
            className="text-button"
            onClick={() => void run({ type: 'project.archive', id: p.id, archived: !p.archivedAt })}
          >
            {p.archivedAt ? '恢复' : '归档'}
          </button>
          <button
            className="text-button"
            onClick={() => void run({ type: 'project.delete', id: p.id })}
          >
            删除空项目
          </button>
        </div>
      ))}
    </section>
  );
}

function EnvironmentEditor({
  environment,
  host,
}: {
  environment: Snapshot['environments'][number];
  host: EditorHost;
}) {
  const form = useAutosave(
    { name: environment.name, notes: environment.notes },
    async (value) =>
      host.onSnapshot(
        (
          await window.desktop.mutate({
            type: 'environment.save',
            id: environment.id,
            systemId: environment.systemId,
            ...value,
          })
        ).snapshot,
      ),
    host.onError,
  );
  useEffect(() => host.registerFlush(form.flush), [host.registerFlush, form.flush]);
  return (
    <>
      <input
        aria-label={`环境名称 ${environment.name}`}
        value={form.value.name}
        onChange={(event) => form.change({ ...form.value, name: event.target.value })}
      />
      <textarea
        aria-label={`环境说明 ${environment.name}`}
        value={form.value.notes}
        onChange={(e) => form.change({ ...form.value, notes: e.target.value })}
        placeholder="环境说明（可选）"
      />
      <button
        className="save-indicator"
        onClick={() => void form.flush().catch((e) => host.onError(String(e)))}
      >
        {form.status}
      </button>
    </>
  );
}

export function SystemConfiguration({
  id,
  snapshot,
  ...host
}: EditorHost & { id: string; snapshot: Snapshot }) {
  const system = snapshot.systems.find((s) => s.id === id)!;
  const form = useAutosave(
    { name: system.name, notes: system.notes, url: system.url, projectId: system.currentProjectId },
    async (value) =>
      host.onSnapshot(
        (await window.desktop.mutate({ type: 'system.save', id, ...value })).snapshot,
      ),
    host.onError,
  );
  const [environmentNotes, setEnvironmentNotes] = useState('');
  const [environment, setEnvironment] = useState(''),
    [section, setSection] = useState<'basic' | 'environments' | 'projects'>('basic');
  useEffect(() => host.registerFlush(form.flush), [host.registerFlush, form.flush]);
  async function mutate(command: Command) {
    try {
      await form.flush();
      host.onSnapshot((await window.desktop.mutate(command)).snapshot);
      return true;
    } catch (e) {
      host.onError(String(e));
      return false;
    }
  }
  return (
    <div className="system-configuration">
      <nav className="config-tabs" aria-label="系统信息分区">
        {(
          [
            ['basic', '基本信息'],
            ['environments', '环境管理'],
            ['projects', '项目档案'],
          ] as const
        ).map(([key, label]) => (
          <button
            key={key}
            type="button"
            aria-pressed={section === key}
            onClick={() => setSection(key)}
          >
            {label}
          </button>
        ))}
      </nav>
      <section className="config-panel" hidden={section !== 'basic'} aria-label="基本信息">
        <div className="config-grid">
          <label className="field-label">
            系统名称
            <input
              aria-label="系统名称"
              value={form.value.name}
              onChange={(e) => form.change({ ...form.value, name: e.target.value })}
            />
          </label>
          <label className="field-label">
            登录地址
            <input
              aria-label="系统登录地址"
              value={form.value.url}
              onChange={(e) => form.change({ ...form.value, url: e.target.value })}
            />
          </label>
          <label className="field-label">
            当前项目
            <select
              aria-label="当前项目"
              value={form.value.projectId ?? ''}
              onChange={(e) => form.change({ ...form.value, projectId: e.target.value || null })}
            >
              <option value="">暂不关联</option>
              {snapshot.projects
                .filter((p) => !p.archivedAt)
                .map((p) => (
                  <option value={p.id} key={p.id}>
                    {p.name}
                  </option>
                ))}
            </select>
          </label>
          <label className="field-label">
            系统说明
            <textarea
              aria-label="系统说明"
              value={form.value.notes}
              onChange={(e) => form.change({ ...form.value, notes: e.target.value })}
            />
          </label>
        </div>
        <button
          className="save-indicator"
          onClick={() => void form.flush().catch((e) => host.onError(String(e)))}
        >
          {form.status}
        </button>
        <section className="config-history">
          <h3>项目沿革</h3>
          {!snapshot.systemProjects.some((link) => link.systemId === id) && (
            <p className="secondary-copy">尚未关联项目，可随时补充。</p>
          )}
          {snapshot.systemProjects
            .filter((link) => link.systemId === id)
            .map((link) => (
              <p className="config-history-row" key={link.projectId}>
                {snapshot.projects.find((p) => p.id === link.projectId)?.name} ·{' '}
                {link.projectId === system.currentProjectId ? '当前' : '历史'}
              </p>
            ))}
        </section>
      </section>
      <section className="config-panel" hidden={section !== 'environments'} aria-label="环境管理">
        <div className="config-section-heading">
          <h3>部署环境</h3>
          <p>按实际部署划分环境，地点与网络可用标签补充。</p>
        </div>
        {snapshot.environments
          .filter((e) => e.systemId === id)
          .map((e) => (
            <div className="workspace-management-row" key={e.id}>
              <EnvironmentEditor environment={e} host={host} />
              <button
                className="text-button"
                onClick={() => void mutate({ type: 'environment.delete', id: e.id })}
              >
                删除
              </button>
            </div>
          ))}
        <form
          className="ledger-quick"
          onSubmit={(e) => {
            e.preventDefault();
            void mutate({
              type: 'environment.save',
              systemId: id,
              name: environment,
              notes: environmentNotes,
            }).then((ok) => {
              if (ok) {
                setEnvironment('');
                setEnvironmentNotes('');
              }
            });
          }}
        >
          <input
            aria-label="新环境名称"
            placeholder="生产、测试…"
            value={environment}
            onChange={(e) => setEnvironment(e.target.value)}
          />
          <input
            aria-label="新环境说明"
            placeholder="环境说明（可选）"
            value={environmentNotes}
            onChange={(e) => setEnvironmentNotes(e.target.value)}
          />
          <button className="secondary-button" disabled={!environment.trim()}>
            新增环境
          </button>
        </form>
      </section>
      <section className="config-panel" hidden={section !== 'projects'} aria-label="项目档案">
        <ProjectManager snapshot={snapshot} onSnapshot={host.onSnapshot} onError={host.onError} />
      </section>
    </div>
  );
}
