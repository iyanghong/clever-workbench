import { useEffect, useRef, useState } from 'react';
import { PlusIcon, GitBranchIcon, GlobeIcon } from '@phosphor-icons/react';
import type { Snapshot } from '../../types';
import type { EnvironmentRecord, ServiceRecord, DeploymentRecord } from '../../ledger-types';
import type { ModuleProps } from '../../app/modules';
import { useAutosave } from '../../shared/useAutosave';

type EditorHost = {
  onSnapshot: (value: Snapshot) => void;
  registerFlush: ModuleProps['registerFlush'];
  onError: (message: string) => void;
};

export function Environments({
  systemId,
  snapshot,
  flushAll,
  ...host
}: EditorHost & { systemId: string; snapshot: Snapshot; flushAll: () => Promise<void> }) {
  const environments = snapshot.environments.filter((item) => item.systemId === systemId);
  const services = snapshot.services.filter((item) => item.systemId === systemId);
  const [environmentId, setEnvironmentId] = useState<string | null>(null),
    [serviceId, setServiceId] = useState<string | null>(null);
  const [environmentName, setEnvironmentName] = useState(''),
    [serviceName, setServiceName] = useState('');
  const creating = useRef(false);
  const environment = environments.find((item) => item.id === environmentId) ?? environments[0];
  const service = services.find((item) => item.id === serviceId) ?? services[0];
  async function select(change: () => void) {
    try {
      await flushAll();
      change();
    } catch (cause) {
      host.onError(String(cause));
    }
  }
  async function create(kind: 'environment' | 'service') {
    const name = (kind === 'environment' ? environmentName : serviceName).trim();
    if (!name || creating.current) return;
    creating.current = true;
    try {
      await flushAll();
      const result = await window.desktop.mutate(
        kind === 'environment'
          ? { type: 'environment.save', systemId, name }
          : { type: 'service.save', systemId, name },
      );
      host.onSnapshot(result.snapshot);
      if (kind === 'environment') {
        setEnvironmentId(result.createdId!);
        setEnvironmentName('');
      } else {
        setServiceId(result.createdId!);
        setServiceName('');
      }
    } catch (cause) {
      host.onError(String(cause));
    } finally {
      creating.current = false;
    }
  }
  const composing = (event: React.KeyboardEvent<HTMLInputElement>) => {
    if (event.key === 'Enter' && event.nativeEvent.isComposing) event.preventDefault();
  };
  return (
    <section className="system-section environment-workspace" aria-label="环境与服务">
      <div className="section-heading">
        <h3>环境与服务</h3>
        <span>公共信息录一次，部署按环境记录</span>
      </div>
      <div className="entity-toolbar">
        <label className="context-select">
          <GlobeIcon size={17} />
          <select
            aria-label="查看环境"
            value={environment?.id ?? ''}
            onChange={(event) => {
              const id = event.target.value;
              void select(() => setEnvironmentId(id));
            }}
          >
            {!environments.length && <option value="">添加一个环境</option>}
            {environments.map((item) => (
              <option key={item.id} value={item.id}>
                {item.name}
              </option>
            ))}
          </select>
        </label>
        <form
          className="inline-create"
          onSubmit={(event) => {
            event.preventDefault();
            void create('environment');
          }}
        >
          <PlusIcon size={15} />
          <input
            aria-label="新增环境名称"
            list={`environment-names-${systemId}`}
            placeholder="新增环境…"
            value={environmentName}
            onChange={(event) => setEnvironmentName(event.target.value)}
            onKeyDown={composing}
          />
          <datalist id={`environment-names-${systemId}`}>
            <option value="开发" />
            <option value="测试" />
            <option value="生产" />
          </datalist>
          <kbd>↵</kbd>
        </form>
      </div>
      {environment && (
        <EnvironmentEditor key={environment.id} environment={environment} {...host} />
      )}
      <div className="entity-toolbar">
        <label className="context-select">
          <GitBranchIcon size={17} />
          <select
            aria-label="查看服务"
            value={service?.id ?? ''}
            onChange={(event) => {
              const id = event.target.value;
              void select(() => setServiceId(id));
            }}
          >
            {!services.length && <option value="">添加一个服务</option>}
            {services.map((item) => (
              <option key={item.id} value={item.id}>
                {item.name}
              </option>
            ))}
          </select>
        </label>
        <form
          className="inline-create"
          onSubmit={(event) => {
            event.preventDefault();
            void create('service');
          }}
        >
          <PlusIcon size={15} />
          <input
            aria-label="新增服务名称"
            placeholder="新增服务…"
            value={serviceName}
            onChange={(event) => setServiceName(event.target.value)}
            onKeyDown={composing}
          />
          <kbd>↵</kbd>
        </form>
      </div>
      {service ? (
        <ServiceEditor key={service.id} service={service} {...host} />
      ) : (
        <p className="secondary-copy entity-empty">只需名称就能记录服务，仓库与部署信息以后补。</p>
      )}
      {service && environment && (
        <DeploymentEditor
          key={`${service.id}:${environment.id}`}
          serviceId={service.id}
          environment={environment}
          deployment={snapshot.deployments.find(
            (item) => item.serviceId === service.id && item.environmentId === environment.id,
          )}
          {...host}
        />
      )}
    </section>
  );
}

function EnvironmentEditor({
  environment,
  ...host
}: EditorHost & { environment: EnvironmentRecord }) {
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
    <details className="compact-details">
      <summary>
        环境设置<span>{form.status}</span>
      </summary>
      <div className="record-fields">
        <label>
          环境名称
          <input
            aria-label="环境名称"
            value={form.value.name}
            onChange={(event) => form.change({ ...form.value, name: event.target.value })}
          />
        </label>
        <label>
          环境说明
          <input
            aria-label="环境说明"
            value={form.value.notes}
            placeholder="可选"
            onChange={(event) => form.change({ ...form.value, notes: event.target.value })}
          />
        </label>
      </div>
    </details>
  );
}

function ServiceEditor({ service, ...host }: EditorHost & { service: ServiceRecord }) {
  const form = useAutosave(
    { name: service.name, repository: service.repository, notes: service.notes },
    async (value) =>
      host.onSnapshot(
        (
          await window.desktop.mutate({
            type: 'service.save',
            id: service.id,
            systemId: service.systemId,
            ...value,
          })
        ).snapshot,
      ),
    host.onError,
  );
  useEffect(() => host.registerFlush(form.flush), [host.registerFlush, form.flush]);
  return (
    <div className="service-common">
      <div className="record-subheading">
        <span>服务公共信息</span>
        <button
          className="save-indicator"
          onClick={() => void form.flush().catch((cause) => host.onError(String(cause)))}
        >
          {form.status}
        </button>
      </div>
      <div className="record-fields">
        <label>
          服务名称
          <input
            aria-label="服务名称"
            value={form.value.name}
            onChange={(event) => form.change({ ...form.value, name: event.target.value })}
          />
        </label>
        <label>
          代码仓库
          <input
            aria-label="服务仓库"
            placeholder="HTTPS 或 Git SSH 地址（可选）"
            value={form.value.repository}
            onChange={(event) => form.change({ ...form.value, repository: event.target.value })}
          />
        </label>
      </div>
      <details className="compact-details">
        <summary>服务说明</summary>
        <textarea
          aria-label="服务说明"
          value={form.value.notes}
          placeholder="用途、依赖或其他需要记住的信息…"
          onChange={(event) => form.change({ ...form.value, notes: event.target.value })}
        />
      </details>
    </div>
  );
}

function DeploymentEditor({
  serviceId,
  environment,
  deployment,
  ...host
}: EditorHost & {
  serviceId: string;
  environment: EnvironmentRecord;
  deployment?: DeploymentRecord;
}) {
  const form = useAutosave(
    {
      address: deployment?.address ?? '',
      port: deployment?.port ?? '',
      notes: deployment?.notes ?? '',
    },
    async (value) =>
      host.onSnapshot(
        (
          await window.desktop.mutate({
            type: 'deployment.save',
            serviceId,
            environmentId: environment.id,
            ...value,
          })
        ).snapshot,
      ),
    host.onError,
  );
  useEffect(() => host.registerFlush(form.flush), [host.registerFlush, form.flush]);
  return (
    <div className="deployment-editor">
      <div className="record-subheading">
        <strong>
          <span className="environment-dot" />
          {environment.name}部署
        </strong>
        <button
          className="save-indicator"
          onClick={() => void form.flush().catch((cause) => host.onError(String(cause)))}
        >
          {form.status}
        </button>
      </div>
      <div className="record-fields deployment-fields">
        <label>
          部署地址
          <input
            aria-label="部署地址"
            value={form.value.address}
            placeholder="主机、IP 或访问地址（可选）"
            onChange={(event) => form.change({ ...form.value, address: event.target.value })}
          />
        </label>
        <label>
          端口
          <input
            aria-label="部署端口"
            inputMode="numeric"
            value={form.value.port}
            placeholder="可选"
            onChange={(event) => form.change({ ...form.value, port: event.target.value })}
          />
        </label>
      </div>
      <details className="compact-details">
        <summary>部署备注</summary>
        <textarea
          aria-label="部署备注"
          value={form.value.notes}
          placeholder="只记录这个环境下的部署信息…"
          onChange={(event) => form.change({ ...form.value, notes: event.target.value })}
        />
      </details>
    </div>
  );
}
