import { useState } from 'react';
import type { CreationProps } from '../../app/actions';
import type { ResourceKind } from '../../ledger-types';
type Kind = 'system' | 'environment' | 'service' | 'resource' | 'account';
const labels = {
  system: '系统',
  environment: '环境',
  service: '服务',
  resource: '资源',
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
    [resourceKind, setResourceKind] = useState<ResourceKind>('redis');
  const needsEnvironment = kind === 'resource' || kind === 'account',
    needsSystem = kind === 'environment' || kind === 'service';
  const environments = snapshot.environments.filter(
    (item) => !systemId || item.systemId === systemId,
  );
  const valid = name.trim() && (!needsSystem || systemId) && (!needsEnvironment || environmentId);
  return (
    <form
      onSubmit={(event) => {
        event.preventDefault();
        if (!valid) return;
        void execute(async () => {
          const result = await window.desktop.mutate(
            kind === 'system'
              ? {
                  type: 'system.save',
                  name,
                  projectId: snapshot.projects.some(
                    (item) => item.id === context.projectId && item.archivedAt === null,
                  )
                    ? context.projectId
                    : undefined,
                }
              : kind === 'environment'
                ? { type: 'environment.save', name, systemId }
                : kind === 'service'
                  ? { type: 'service.save', name, systemId }
                  : kind === 'resource'
                    ? { type: 'resource.save', name, environmentId, kind: resourceKind }
                    : { type: 'account.save', name, environmentId, resourceId: resourceId || null },
          );
          return { module: 'ledger', objectId: result.createdId };
        });
      }}
    >
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
              setSystemId(environment?.systemId ?? '');
              setResourceId('');
            }}
          >
            <option value="">选择环境</option>
            {environments.map((item) => (
              <option key={item.id} value={item.id}>
                {snapshot.systems.find((system) => system.id === item.systemId)?.name} / {item.name}
              </option>
            ))}
          </select>
        </label>
      )}
      {kind === 'account' && environmentId && (
        <label className="field-label">
          归属
          <select
            aria-label="新账号所属资源"
            value={resourceId}
            onChange={(event) => setResourceId(event.target.value)}
          >
            <option value="">系统环境</option>
            {snapshot.resources
              .filter((item) => item.environmentId === environmentId)
              .map((item) => (
                <option key={item.id} value={item.id}>
                  {item.name}
                </option>
              ))}
          </select>
        </label>
      )}
      {kind === 'resource' && (
        <label className="field-label">
          类型
          <select
            aria-label="新资源类型"
            value={resourceKind}
            onChange={(event) => setResourceKind(event.target.value as ResourceKind)}
          >
            <option value="redis">Redis</option>
            <option value="server">服务器</option>
            <option value="other">其他资源</option>
          </select>
        </label>
      )}
      {((needsSystem && !snapshot.systems.length) ||
        (needsEnvironment && !snapshot.environments.length)) && (
        <p className="field-hint">请先建立系统和环境，再记录其中的资料。</p>
      )}
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
export const QuickResource = (props: CreationProps) => <QuickRecord {...props} kind="resource" />;
export const QuickAccount = (props: CreationProps) => <QuickRecord {...props} kind="account" />;
