import { Button, Checkbox, Input, Select, ConfigProvider, Table, Tabs, Tag, Collapse } from 'antd';
import { closeNewRecord, saveNewRecord, markNewRecordChanged } from '../../shared/new-record';
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
              <Checkbox
                key={e.id}
                checked={form.value.environmentIds.includes(e.id)}
                onChange={(event) =>
                  form.change({
                    ...form.value,
                    environmentIds: event.target.checked
                      ? [...form.value.environmentIds, e.id]
                      : form.value.environmentIds.filter((id) => id !== e.id),
                  })
                }
              >
                {e.name}
              </Checkbox>
            ))}
        </div>
      )}
      <label className="field-label">
        地点／网络标签
        <Input
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
            <Select
              aria-label="状态"
              value={form.value.status ?? 'active'}
              onChange={(e) => {
                markNewRecordChanged();
                return form.change({
                  ...form.value,
                  status: e as 'active' | 'inactive' | 'unverified',
                });
              }}
            >
              <Select.Option data-value={String('active')} value="active">
                在用
              </Select.Option>
              <Select.Option data-value={String('inactive')} value="inactive">
                停用
              </Select.Option>
              <Select.Option data-value={String('unverified')} value="unverified">
                待确认
              </Select.Option>
            </Select>
          </label>
          <label className="field-label">
            状态说明
            <Input.TextArea
              value={form.value.statusNotes ?? ''}
              onChange={(e) => form.change({ ...form.value, statusNotes: e.target.value })}
            />
          </label>
        </>
      )}
      <Button
        htmlType="submit"
        type="text"
        className="save-indicator"
        onClick={() => void form.flush().catch((e) => host.onError(String(e)))}
      >
        {form.status}
      </Button>
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
          <Input
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
      <Button
        htmlType="submit"
        type="text"
        className="save-indicator"
        onClick={() => void form.flush().catch((e) => host.onError(String(e)))}
      >
        {form.status}
      </Button>
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
      <Button
        htmlType="submit"
        type="text"
        className="save-indicator"
        onClick={() => void form.flush().catch((e) => host.onError(String(e)))}
      >
        {form.status}
      </Button>
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
        <Input value={value.name} onChange={(e) => onChange({ ...value, name: e.target.value })} />
      </label>
      <label className="field-label">
        类型
        <Select
          aria-label="运维类型"
          value={value.kind}
          onChange={(e) => {
            markNewRecordChanged();
            return onChange({ ...value, kind: e as Operation['kind'] });
          }}
        >
          <Select.Option data-value={String('job')} value="job">
            运行作业
          </Select.Option>
          <Select.Option data-value={String('backup')} value="backup">
            备份策略
          </Select.Option>
        </Select>
      </label>
      <label className="field-label">
        频率
        <Input
          placeholder="例如：每日 02:00"
          value={value.frequency}
          onChange={(e) => onChange({ ...value, frequency: e.target.value })}
        />
      </label>
      <label className="field-label">
        状态
        <Select
          aria-label="状态"
          value={value.status}
          onChange={(e) => {
            markNewRecordChanged();
            return onChange({ ...value, status: e as Operation['status'] });
          }}
        >
          <Select.Option data-value={String('active')} value="active">
            在用
          </Select.Option>
          <Select.Option data-value={String('inactive')} value="inactive">
            停用
          </Select.Option>
          <Select.Option data-value={String('unverified')} value="unverified">
            待确认
          </Select.Option>
        </Select>
      </label>
      <label className="field-label">
        环境
        <Select
          aria-label="环境"
          value={value.environmentId ?? ''}
          onChange={(e) => {
            markNewRecordChanged();
            return onChange({ ...value, environmentId: e || null });
          }}
        >
          <Select.Option data-value={String('')} value="">
            系统通用
          </Select.Option>
          {snapshot.environments
            .filter((e) => e.systemId === value.systemId)
            .map((e) => (
              <Select.Option data-value={String(e.id)} key={e.id} value={e.id}>
                {e.name}
              </Select.Option>
            ))}
        </Select>
      </label>
      <label className="field-label">
        关联应用／资源
        <Select
          aria-label="关联应用／资源"
          value={
            value.serviceId
              ? `service:${value.serviceId}`
              : value.resourceId
                ? `resource:${value.resourceId}`
                : ''
          }
          onChange={(e) => {
            markNewRecordChanged();
            const [kind, id] = e.split(':');
            onChange({
              ...value,
              serviceId: kind === 'service' ? id : null,
              resourceId: kind === 'resource' ? id : null,
            });
          }}
        >
          <Select.Option data-value={String('')} value="">
            不关联对象
          </Select.Option>
          {snapshot.services
            .filter((r) => r.systemId === value.systemId)
            .map((r) => (
              <Select.Option
                data-value={String(`service:${r.id}`)}
                key={r.id}
                value={`service:${r.id}`}
              >
                应用 · {r.name}
              </Select.Option>
            ))}
          {snapshot.resources
            .filter((r) => r.systemId === value.systemId)
            .map((r) => (
              <Select.Option
                data-value={String(`resource:${r.id}`)}
                key={r.id}
                value={`resource:${r.id}`}
              >
                {r.name}
              </Select.Option>
            ))}
        </Select>
      </label>
      <label className="field-label">
        步骤文档
        <Select
          aria-label="步骤文档"
          value={value.documentId ?? ''}
          onChange={(e) => {
            markNewRecordChanged();
            return onChange({ ...value, documentId: e || null });
          }}
        >
          <Select.Option data-value={String('')} value="">
            稍后补充
          </Select.Option>
          {snapshot.documents
            .filter((d) => d.systemId === value.systemId && d.deletedAt === null)
            .map((d) => (
              <Select.Option data-value={String(d.id)} key={d.id} value={d.id}>
                {d.title || '未命名文档'}
              </Select.Option>
            ))}
        </Select>
      </label>
      <label className="field-label">
        说明
        <Input.TextArea
          value={value.notes}
          onChange={(e) => onChange({ ...value, notes: e.target.value })}
        />
      </label>
      <Collapse
        className="compact-details"
        ghost
        defaultActiveKey={false ? ['details'] : []}
        items={[
          {
            key: 'details',
            label: <>作业／备份资料（可选）</>,
            forceRender: true,
            children: (
              <>
                <OptionalFields
                  value={value.fields ?? {}}
                  names={operationFields[value.kind]}
                  onChange={(fields) => onChange({ ...value, fields })}
                />
              </>
            ),
          },
        ]}
      />
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
        <ConfigProvider componentDisabled={busy}>
          <fieldset disabled={busy} className="new-record-fields">
            <DeploymentFields
              value={value}
              onChange={(next) => setValue({ ...value, ...next })}
              snapshot={snapshot}
              systemId={systemId}
            />
          </fieldset>
        </ConfigProvider>
        {node && (
          <Button
            type="text"
            htmlType="button"
            className="save-indicator"
            onClick={() => void form.flush().catch((e) => setError(String(e)))}
          >
            {form.status}
          </Button>
        )}
        <div className="modal-actions">
          <Button
            type="default"
            htmlType="button"
            className="secondary-button"
            onClick={close}
            disabled={busy}
          >
            {node ? '关闭' : '取消'}
          </Button>
          <Button
            htmlType="submit"
            type="primary"
            className="primary-button"
            disabled={busy || !value.environmentId || !value.name.trim()}
          >
            {node ? '完成' : '保存节点'}
          </Button>
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
        <Input
          required
          autoFocus
          value={value.name}
          onChange={(e) => onChange({ ...value, name: e.target.value })}
        />
      </label>
      <label className="field-label">
        部署环境
        <Select
          aria-required="true"
          aria-label="部署环境"
          value={value.environmentId}
          onChange={(e) => {
            markNewRecordChanged();
            return onChange({ ...value, environmentId: e });
          }}
        >
          <Select.Option data-value={String('')} value="">
            选择环境
          </Select.Option>
          {snapshot.environments
            .filter((e) => e.systemId === systemId)
            .map((e) => (
              <Select.Option data-value={String(e.id)} key={e.id} value={e.id}>
                {e.name}
              </Select.Option>
            ))}
        </Select>
      </label>
      <label className="field-label">
        运行方式
        <Select
          aria-label="运行方式"
          value={value.mode}
          onChange={(e) => {
            markNewRecordChanged();
            return onChange({ ...value, mode: e as DeploymentNode['mode'] });
          }}
        >
          <Select.Option data-value={String('fixed')} value="fixed">
            固定部署
          </Select.Option>
          <Select.Option data-value={String('scheduled')} value="scheduled">
            按需调度
          </Select.Option>
        </Select>
      </label>
      <label className="field-label">
        服务器（可后补）
        <Select
          aria-label="服务器（可后补）"
          value={value.serverId ?? ''}
          onChange={(e) => {
            markNewRecordChanged();
            return onChange({ ...value, serverId: e || null });
          }}
        >
          <Select.Option data-value={String('')} value="">
            未关联服务器
          </Select.Option>
          {snapshot.resources
            .filter((r) => r.systemId === systemId && r.kind === 'server')
            .map((r) => (
              <Select.Option data-value={String(r.id)} key={r.id} value={r.id}>
                {r.name}
              </Select.Option>
            ))}
        </Select>
      </label>
      {(['address', 'port', 'count', 'notes'] as const).map((key, i) => (
        <label key={key} className="field-label">
          {['独立地址（留空展示服务器地址）', '端口', '节点数量／规模说明', '备注'][i]}
          <Input
            value={value[key]}
            onChange={(e) => onChange({ ...value, [key]: e.target.value })}
          />
        </label>
      ))}
      <Collapse
        className="compact-details"
        ghost
        defaultActiveKey={false ? ['details'] : []}
        items={[
          {
            key: 'details',
            label: <>部署与排障资料（可选）</>,
            forceRender: true,
            children: (
              <>
                <OptionalFields
                  value={value.fields ?? {}}
                  names={nodeFields.filter(
                    (name) =>
                      !['命名空间', '工作负载'].includes(name) ||
                      /kubernetes|k8s/i.test(value.fields?.['部署方式'] ?? ''),
                  )}
                  onChange={(fields) => onChange({ ...value, fields })}
                />
              </>
            ),
          },
        ]}
      />
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
        <Input
          aria-label="项目名称"
          placeholder="项目名称"
          value={name}
          onChange={(e) => setName(e.target.value)}
        />
        <Button
          htmlType="submit"
          type="default"
          className="secondary-button"
          disabled={!name.trim()}
        >
          {editing ? '保存' : '新增项目'}
        </Button>
      </form>
      <Table<Snapshot['projects'][number]>
        rowKey="id"
        dataSource={snapshot.projects}
        pagination={false}
        scroll={{ x: 550 }}
        columns={[
          { title: '项目名称', dataIndex: 'name' },
          {
            title: '相关系统',
            render: (_, project) =>
              snapshot.systems
                .filter((system) =>
                  snapshot.systemProjects.some(
                    (link) => link.systemId === system.id && link.projectId === project.id,
                  ),
                )
                .map((system) => <Tag key={system.id}>{system.name}</Tag>),
          },
          {
            title: '状态',
            render: (_, project) => (
              <Tag color={project.archivedAt ? 'default' : 'processing'}>
                {project.archivedAt ? '已归档' : '进行中'}
              </Tag>
            ),
          },
          {
            title: '操作',
            render: (_, project) => (
              <div className="project-actions">
                <Button
                  type="text"
                  onClick={() => {
                    setEditing(project.id);
                    setName(project.name);
                  }}
                >
                  编辑
                </Button>
                <Button
                  type="text"
                  onClick={() =>
                    void run({
                      type: 'project.archive',
                      id: project.id,
                      archived: !project.archivedAt,
                    })
                  }
                >
                  {project.archivedAt ? '恢复' : '归档'}
                </Button>
                <Button
                  type="text"
                  onClick={() => void run({ type: 'project.delete', id: project.id })}
                >
                  删除空项目
                </Button>
              </div>
            ),
          },
        ]}
      />
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
      <Input
        aria-label={`环境名称 ${environment.name}`}
        value={form.value.name}
        onChange={(event) => form.change({ ...form.value, name: event.target.value })}
      />
      <Input.TextArea
        aria-label={`环境说明 ${environment.name}`}
        value={form.value.notes}
        onChange={(e) => form.change({ ...form.value, notes: e.target.value })}
        placeholder="环境说明（可选）"
      />
      <Button
        htmlType="submit"
        type="text"
        className="save-indicator"
        onClick={() => void form.flush().catch((e) => host.onError(String(e)))}
      >
        {form.status}
      </Button>
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
        <Tabs
          activeKey={section}
          onChange={(key) => setSection(key as typeof section)}
          items={[
            { key: 'basic', label: '基本信息' },
            { key: 'environments', label: '环境管理' },
            { key: 'projects', label: '项目档案' },
          ]}
        />
      </nav>
      <section className="config-panel" hidden={section !== 'basic'} aria-label="基本信息">
        <div className="config-grid">
          <label className="field-label">
            系统名称
            <Input
              aria-label="系统名称"
              value={form.value.name}
              onChange={(e) => form.change({ ...form.value, name: e.target.value })}
            />
          </label>
          <label className="field-label">
            登录地址
            <Input
              aria-label="系统登录地址"
              value={form.value.url}
              onChange={(e) => form.change({ ...form.value, url: e.target.value })}
            />
          </label>
          <label className="field-label">
            当前项目
            <Select
              aria-label="当前项目"
              value={form.value.projectId ?? ''}
              onChange={(e) => {
                markNewRecordChanged();
                return form.change({ ...form.value, projectId: e || null });
              }}
            >
              <Select.Option data-value={String('')} value="">
                暂不关联
              </Select.Option>
              {snapshot.projects
                .filter((p) => !p.archivedAt)
                .map((p) => (
                  <Select.Option data-value={String(p.id)} value={p.id} key={p.id}>
                    {p.name}
                  </Select.Option>
                ))}
            </Select>
          </label>
          <label className="field-label">
            系统说明
            <Input.TextArea
              aria-label="系统说明"
              value={form.value.notes}
              onChange={(e) => form.change({ ...form.value, notes: e.target.value })}
            />
          </label>
        </div>
        <Button
          htmlType="submit"
          type="text"
          className="save-indicator"
          onClick={() => void form.flush().catch((e) => host.onError(String(e)))}
        >
          {form.status}
        </Button>
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
              <Button
                htmlType="submit"
                type="text"
                className="text-button"
                onClick={() => void mutate({ type: 'environment.delete', id: e.id })}
              >
                删除
              </Button>
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
          <Input
            aria-label="新环境名称"
            placeholder="生产、测试…"
            value={environment}
            onChange={(e) => setEnvironment(e.target.value)}
          />
          <Input
            aria-label="新环境说明"
            placeholder="环境说明（可选）"
            value={environmentNotes}
            onChange={(e) => setEnvironmentNotes(e.target.value)}
          />
          <Button
            htmlType="submit"
            type="default"
            className="secondary-button"
            disabled={!environment.trim()}
          >
            新增环境
          </Button>
        </form>
      </section>
      <section className="config-panel" hidden={section !== 'projects'} aria-label="项目档案">
        <ProjectManager snapshot={snapshot} onSnapshot={host.onSnapshot} onError={host.onError} />
      </section>
    </div>
  );
}
