import { QuickResourceCapture } from './LedgerCaptureForm';
import { DeploymentFields, OperationFields } from './WorkspaceEditors';
import { DocumentReferences } from './RecordFields';
import type { DeploymentNode, Operation } from '../../ledger-workspace-types';
import { useVault } from '../vault/VaultProvider';
import { useState } from 'react';
import type { CreationProps } from '../../app/actions';
type Kind = 'system' | 'environment' | 'service' | 'account';
const labels = {
  system: '系统',
  environment: '环境',
  service: '服务',
  account: '账号',
};
function QuickRecord({
  kind,
  snapshot,
  context,
  busy,
  execute,
  cancel,
}: CreationProps & { kind: Kind }) {
  const [name, setName] = useState(''),
    [systemId, setSystemId] = useState(context.systemId ?? ''),
    [environmentId, setEnvironmentId] = useState(context.environmentId ?? ''),
    [resourceId, setResourceId] = useState(context.resourceId ?? ''),
    [accessId, setAccessId] = useState(context.accessId ?? '');
  const [notes, setNotes] = useState(''),
    [url, setUrl] = useState(''),
    [repository, setRepository] = useState('');
  const [username, setUsername] = useState(''),
    [password, setPassword] = useState(''),
    [token, setToken] = useState(''),
    [privateKey, setPrivateKey] = useState('');
  const [documentIds, setDocumentIds] = useState<string[]>([]);
  const [withNode, setWithNode] = useState(false);
  const [firstNode, setFirstNode] = useState<Omit<DeploymentNode, 'id' | 'serviceId'>>({
    name: '',
    environmentId: context.environmentId ?? '',
    serverId: null,
    address: '',
    port: '',
    notes: '',
    mode: 'fixed',
    count: '',
  });
  const vault = useVault();
  const needsEnvironment = kind === 'account',
    needsSystem = kind === 'environment' || kind === 'service';
  const environments = snapshot.environments.filter(
    (item) => !systemId || item.systemId === systemId,
  );
  const valid =
    name.trim() &&
    (!needsSystem || systemId) &&
    (!needsEnvironment || environmentId || (systemId && (resourceId || accessId)));
  return (
    <form
      data-new-record
      onChangeCapture={(e) => {
        e.currentTarget.dataset.dirty = 'true';
      }}
      aria-busy={busy}
      onSubmit={(event) => {
        event.preventDefault();
        if (!valid) return;
        void execute(async () => {
          if (kind === 'account') {
            if ((password || token || privateKey) && !(await vault.ensureUnlocked()))
              throw new Error('未保存，请完成解锁后重试。');
            const result = await window.desktop.captureLedger({
              kind: 'account',
              systemId,
              environmentId: environmentId || null,
              resourceId: resourceId || null,
              accessId: accessId || null,
              name,
              username,
              password,
              token,
              privateKey,
              notes,
            });
            return { module: 'ledger', objectId: result.createdId };
          }
          const result = await window.desktop.mutate(
            kind === 'system'
              ? {
                  type: 'system.save',
                  name,
                  url,
                  notes,
                  projectId: snapshot.projects.some(
                    (item) => item.id === context.projectId && item.archivedAt === null,
                  )
                    ? context.projectId
                    : undefined,
                }
              : kind === 'environment'
                ? { type: 'environment.save', name, systemId, notes }
                : {
                    type: 'service.save',
                    name,
                    systemId,
                    notes,
                    repository,
                    documentIds,
                    firstNode: withNode ? firstNode : undefined,
                  },
          );
          return { module: 'ledger', objectId: result.createdId };
        });
      }}
    >
      <fieldset disabled={busy} className="new-record-fields">
        <label className="field-label">
          {kind === 'account' ? '用途或角色' : '名称'}
          <input
            autoFocus
            aria-label={`快速新建${labels[kind]}名称`}
            value={name}
            onChange={(event) => setName(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === 'Enter' && event.nativeEvent.isComposing) event.preventDefault();
            }}
          />
        </label>
        {(needsSystem || needsEnvironment) && (
          <label className="field-label">
            系统
            <select
              aria-label="新记录所属系统"
              value={systemId}
              onChange={(event) => {
                setSystemId(event.target.value);
                setEnvironmentId('');
                setResourceId('');
                setAccessId('');
                setDocumentIds([]);
                setFirstNode({ ...firstNode, environmentId: '', serverId: null, documentIds: [] });
              }}
            >
              <option value="">{needsEnvironment ? '选择系统或直接选环境' : '选择系统'}</option>
              {snapshot.systems.map((item) => (
                <option key={item.id} value={item.id}>
                  {item.name}
                </option>
              ))}
            </select>
          </label>
        )}
        {needsEnvironment && (
          <label className="field-label">
            环境
            <select
              aria-label="新记录所属环境"
              value={environmentId}
              onChange={(event) => {
                const environment = snapshot.environments.find(
                  (item) => item.id === event.target.value,
                );
                setEnvironmentId(event.target.value);
                setSystemId(environment?.systemId ?? systemId);
                setResourceId('');
                setAccessId('');
              }}
            >
              <option value="">{'系统通用'}</option>
              {environments.map((item) => (
                <option key={item.id} value={item.id}>
                  {snapshot.systems.find((system) => system.id === item.systemId)?.name} /{' '}
                  {item.name}
                </option>
              ))}
            </select>
          </label>
        )}
        {kind === 'account' && (environmentId || systemId) && (
          <label className="field-label">
            归属
            <select
              aria-label="新账号所属资源"
              value={accessId ? `access:${accessId}` : resourceId}
              onChange={(event) => {
                const value = event.target.value;
                setAccessId(value.startsWith('access:') ? value.slice(7) : '');
                setResourceId(value.startsWith('access:') ? '' : value);
              }}
            >
              <option value="">{environmentId ? '系统环境' : '选择服务器或访问入口'}</option>
              {snapshot.resources
                .filter(
                  (item) =>
                    item.systemId === systemId && item.environmentId === (environmentId || null),
                )
                .map((item) => (
                  <option key={item.id} value={item.id}>
                    {item.name}
                  </option>
                ))}
              {snapshot.accessEntries
                .filter(
                  (item) =>
                    item.systemId === systemId && item.environmentId === (environmentId || null),
                )
                .map((item) => (
                  <option key={item.id} value={`access:${item.id}`}>
                    访问入口 · {item.name}
                  </option>
                ))}
            </select>
          </label>
        )}
        {kind === 'system' && (
          <label className="field-label">
            登录地址
            <input
              value={url}
              onChange={(e) => setUrl(e.target.value)}
              placeholder="https://…（可选）"
            />
          </label>
        )}
        {kind === 'account' && (
          <>
            <label className="field-label">
              用户名
              <input
                aria-label="新账号用户名"
                autoComplete="off"
                value={username}
                onChange={(e) => setUsername(e.target.value)}
              />
            </label>
            <label className="field-label">
              密码
              <input
                aria-label="新账号密码"
                type="password"
                autoComplete="new-password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
              />
            </label>
            <details className="compact-details">
              <summary>其他凭据（可选）</summary>
              <label>
                Token
                <input
                  type="password"
                  autoComplete="new-password"
                  value={token}
                  onChange={(e) => setToken(e.target.value)}
                />
              </label>
              <label>
                私钥
                <textarea
                  className="secret-input"
                  autoComplete="off"
                  value={privateKey}
                  onChange={(e) => setPrivateKey(e.target.value)}
                />
              </label>
            </details>
          </>
        )}
        {kind === 'service' && (
          <label className="field-label">
            代码仓库
            <input value={repository} onChange={(e) => setRepository(e.target.value)} />
          </label>
        )}
        <label className="field-label">
          {kind === 'service' ? '用途／说明' : '说明'}
          <textarea value={notes} onChange={(e) => setNotes(e.target.value)} />
        </label>
        {kind === 'service' && (
          <>
            <label>
              <input
                type="checkbox"
                checked={withNode}
                onChange={(e) => setWithNode(e.target.checked)}
              />
              同时记录部署
            </label>
            {withNode && (
              <DeploymentFields
                value={firstNode}
                onChange={setFirstNode}
                systemId={systemId}
                snapshot={snapshot}
              />
            )}
            <details className="compact-details">
              <summary>操作文档（可选）</summary>
              <DocumentReferences
                value={documentIds}
                systemId={systemId}
                snapshot={snapshot}
                onChange={setDocumentIds}
              />
            </details>
          </>
        )}
      </fieldset>
      <div className="modal-actions">
        <button type="button" className="secondary-button" disabled={busy} onClick={cancel}>
          取消
        </button>
        <button className="primary-button" disabled={busy || !valid}>
          创建{labels[kind]}
        </button>
      </div>
    </form>
  );
}
export const QuickSystem = (props: CreationProps) => <QuickRecord {...props} kind="system" />;
export const QuickEnvironment = (props: CreationProps) => (
  <QuickRecord {...props} kind="environment" />
);
export const QuickService = (props: CreationProps) => <QuickRecord {...props} kind="service" />;
export const QuickResource = QuickResourceCapture;
export const QuickAccount = (props: CreationProps) => <QuickRecord {...props} kind="account" />;

export function QuickOperation(props: CreationProps) {
  const [value, setValue] = useState<Omit<Operation, 'id'>>({
    systemId: props.context.systemId ?? '',
    environmentId: props.context.environmentId ?? null,
    serviceId: null,
    resourceId: null,
    documentId: null,
    name: '',
    kind: 'job',
    frequency: '',
    status: 'unverified',
    notes: '',
    fields: {},
  });
  return (
    <form
      data-new-record
      onChangeCapture={(e) => {
        e.currentTarget.dataset.dirty = 'true';
      }}
      aria-busy={props.busy}
      onSubmit={(e) => {
        e.preventDefault();
        if (!value.name.trim() || props.busy) return;
        void props.execute(async () => {
          const result = await window.desktop.mutate({ type: 'operation.save', value });
          return { module: 'ledger', objectId: result.createdId };
        });
      }}
    >
      <fieldset disabled={props.busy} className="new-record-fields">
        <OperationFields value={value} onChange={setValue} snapshot={props.snapshot} />
      </fieldset>
      <div className="modal-actions">
        <button
          type="button"
          className="secondary-button"
          disabled={props.busy}
          onClick={props.cancel}
        >
          取消
        </button>
        <button className="primary-button" disabled={props.busy || !value.name.trim()}>
          创建运维记录
        </button>
      </div>
    </form>
  );
}
