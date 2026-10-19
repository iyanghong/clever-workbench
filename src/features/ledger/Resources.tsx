import { useEffect, useRef, useState } from 'react';
import {
  PlusIcon,
  DatabaseIcon,
  DesktopTowerIcon,
  CopyIcon,
  ArrowUpRightIcon,
  TrashIcon,
} from '@phosphor-icons/react';
import type { Snapshot } from '../../types';
import type { ResourceKind, ResourceRecord, EnvironmentRecord } from '../../ledger-types';
import { serverConfigurationFields } from '../../ledger-types';
import { useAutosave } from '../../shared/useAutosave';
import { CopyValue } from '../../shared/CopyValue';
import { Dialog } from '../../shared/Dialog';
import { useVault } from '../vault/VaultProvider';
import { RelatedWork } from './RelatedWork';
import { Accounts, type AccountNavigation } from './Accounts';
import type { EditorHost } from './Environments';

const kinds = { redis: 'Redis', server: '服务器', database: '数据库', other: '其他资源' };
export function Resources({
  environment,
  snapshot,
  flushAll,
  changeEnvironment,
  focusResource,
  focusAccount,
  onOpenAccount,
  ...host
}: EditorHost &
  AccountNavigation & {
    focusResource: string | null;
    environment: EnvironmentRecord;
    snapshot: Snapshot;
    flushAll: () => Promise<void>;
    changeEnvironment: (id: string) => void;
  }) {
  const resources = snapshot.resources.filter((item) => item.environmentId === environment.id);
  const [selected, setSelected] = useState<string | null>(null),
    [name, setName] = useState(''),
    [kind, setKind] = useState<ResourceKind>('redis');
  useEffect(() => {
    if (focusResource) setSelected(focusResource);
  }, [focusResource]);
  const busy = useRef(false);
  const resource = resources.find((item) => item.id === selected) ?? resources[0];
  useEffect(() => {
    if (resource)
      host.onContext({
        systemId: environment.systemId,
        environmentId: environment.id,
        resourceId: resource.id,
        projectId:
          snapshot.systems.find((item) => item.id === resource.systemId)?.currentProjectId ?? null,
      });
  }, [resource?.id, environment.id, snapshot.systems]);
  async function create() {
    if (!name.trim() || busy.current) return;
    busy.current = true;
    try {
      await flushAll();
      const result = await window.desktop.mutate({
        type: 'resource.save',
        environmentId: environment.id,
        kind,
        name,
      });
      host.onSnapshot(result.snapshot);
      setSelected(result.createdId!);
      setName('');
    } catch (cause) {
      host.onError(String(cause));
    } finally {
      busy.current = false;
    }
  }
  return (
    <section aria-label={`${environment.name}资源`}>
      <div className="entity-toolbar">
        <span className="secondary-copy">
          {environment.name} · {resources.length} 个资源
        </span>
        <form
          className="inline-create"
          onSubmit={(event) => {
            event.preventDefault();
            void create();
          }}
        >
          <select
            aria-label="新增资源类型"
            value={kind}
            onChange={(event) => setKind(event.target.value as ResourceKind)}
          >
            {Object.entries(kinds).map(([value, label]) => (
              <option key={value} value={value}>
                {label}
              </option>
            ))}
          </select>
          <input
            aria-label="新增资源名称"
            placeholder="名称，回车添加…"
            value={name}
            onChange={(event) => setName(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === 'Enter' && event.nativeEvent.isComposing) event.preventDefault();
            }}
          />
          <kbd>↵</kbd>
        </form>
      </div>
      <div className="resource-list" role="group" aria-label="资源列表">
        {resources.map((item) => (
          <button
            key={item.id}
            className={`resource-chip ${item.id === resource?.id ? 'selected' : ''}`}
            aria-label={`资源 ${item.name}`}
            onClick={async () => {
              try {
                await flushAll();
                setSelected(item.id);
              } catch (cause) {
                host.onError(String(cause));
              }
            }}
          >
            {item.kind === 'server' ? <DesktopTowerIcon size={17} /> : <DatabaseIcon size={17} />}
            <span>{item.name}</span>
            <small>{kinds[item.kind]}</small>
          </button>
        ))}
      </div>
      {resource ? (
        <>
          <ResourceEditor
            key={resource.id}
            resource={resource}
            environment={environment}
            snapshot={snapshot}
            flushAll={flushAll}
            {...host}
            onOpen={(id) =>
              void host
                .navigate({ module: 'ledger', objectId: id })
                .catch((cause) => host.onError(String(cause)))
            }
          />
          <Accounts
            key={`${environment.id}:${resource.id}`}
            environment={environment}
            resourceId={resource.id}
            snapshot={snapshot}
            flushAll={flushAll}
            focusAccount={focusAccount}
            onOpenAccount={onOpenAccount}
            {...host}
          />
          <RelatedWork
            context={{
              systemId: environment.systemId,
              environmentId: environment.id,
              resourceId: resource.id,
            }}
            snapshot={snapshot}
            {...host}
          />
        </>
      ) : (
        <p className="entity-empty secondary-copy">先记一个名称。地址、端口和账号可以随时补。</p>
      )}
    </section>
  );
}

export function ResourceEditor({
  resource,
  environment,
  serverView = false,
  scopeManaged = false,
  snapshot,
  flushAll,
  onOpen,
  ...host
}: EditorHost & {
  resource: ResourceRecord;
  environment: EnvironmentRecord | null;
  serverView?: boolean;
  scopeManaged?: boolean;
  snapshot: Snapshot;
  flushAll: () => Promise<void>;
  onOpen: (id: string) => void;
}) {
  const form = useAutosave(
    {
      name: resource.name,
      environmentId: resource.environmentId,
      kind: resource.kind,
      address: resource.address,
      port: resource.port,
      notes: resource.notes,
      fields: resource.fields,
    },
    async (value) => {
      host.onSnapshot(
        (
          await window.desktop.mutate({
            type: 'resource.save',
            id: resource.id,
            systemId: resource.systemId,
            ...value,
            environmentId: scopeManaged ? resource.environmentId : value.environmentId,
          })
        ).snapshot,
      );
    },
    host.onError,
  );
  useEffect(() => host.registerFlush(form.flush), [host.registerFlush, form.flush]);
  const [modal, setModal] = useState<'copy' | 'delete' | null>(null),
    [copyName, setCopyName] = useState(`${resource.name} 副本`),
    [copyEnvironment, setCopyEnvironment] = useState(resource.environmentId ?? ''),
    [copySystem, setCopySystem] = useState(resource.systemId);
  const [fieldName, setFieldName] = useState(''),
    [fieldValue, setFieldValue] = useState(''),
    [busy, setBusy] = useState(false);
  const [dialogError, setDialogError] = useState('');
  const vault = useVault();
  const [includeSecrets, setIncludeSecrets] = useState(false);
  const secretCount = snapshot.accounts
    .filter((item) => item.resourceId === resource.id)
    .reduce((count, item) => count + item.secretKinds.length, 0);
  async function confirm() {
    if (busy) return;
    setBusy(true);
    setDialogError('');
    try {
      await flushAll();
      if (modal === 'copy' && includeSecrets && !(await vault.ensureUnlocked())) return;
      const result =
        modal === 'copy' && includeSecrets
          ? await window.desktop.copyResourceWithSecrets(resource.id, {
              name: copyName,
              systemId: copySystem,
              environmentId:
                copySystem === resource.systemId &&
                (copyEnvironment || null) === resource.environmentId
                  ? undefined
                  : copyEnvironment || null,
            })
          : await window.desktop.mutate(
              modal === 'copy'
                ? {
                    type: 'resource.copy',
                    id: resource.id,
                    name: copyName,
                    systemId: copySystem,
                    environmentId:
                      copySystem === resource.systemId &&
                      (copyEnvironment || null) === resource.environmentId
                        ? undefined
                        : copyEnvironment || null,
                  }
                : { type: 'resource.delete', id: resource.id },
            );
      host.onSnapshot(result.snapshot);
      setModal(null);
      if (result.createdId) onOpen(result.createdId);
    } catch (cause) {
      setDialogError(String(cause));
    } finally {
      setBusy(false);
    }
  }
  return (
    <div className="resource-editor">
      <div className="record-subheading">
        <strong>
          {snapshot.systems.find((item) => item.id === resource.systemId)?.name} /{' '}
          {environment?.name ?? '通用'} / {resource.name}
        </strong>
        <button
          className="save-indicator"
          onClick={() => void form.flush().catch((cause) => host.onError(String(cause)))}
        >
          {form.status}
        </button>
      </div>
      <div className="record-fields resource-name-fields">
        <label>
          名称
          <input
            aria-label="资源名称"
            value={form.value.name}
            onChange={(event) => form.change({ ...form.value, name: event.target.value })}
          />
        </label>
        {!serverView && (
          <label>
            类型
            <select
              aria-label="资源类型"
              value={form.value.kind}
              onChange={(event) =>
                form.change({ ...form.value, kind: event.target.value as ResourceKind })
              }
            >
              {Object.entries(kinds).map(([value, label]) => (
                <option key={value} value={value}>
                  {label}
                </option>
              ))}
            </select>
          </label>
        )}
      </div>
      {resource.kind === 'server' && (
        <div className="record-fields">
          <label>
            用途
            <input
              aria-label="服务器用途"
              value={form.value.fields['用途'] ?? ''}
              placeholder="如订单应用、缓存或定时任务"
              onChange={(event) =>
                form.change({
                  ...form.value,
                  fields: { ...form.value.fields, 用途: event.target.value },
                })
              }
            />
          </label>
          {serverView && !scopeManaged && (
            <label>
              环境
              <select
                aria-label="服务器所属环境"
                value={form.value.environmentId ?? ''}
                onChange={(event) =>
                  form.change({ ...form.value, environmentId: event.target.value || null })
                }
              >
                <option value="">系统通用</option>
                {snapshot.environments
                  .filter((e) => e.systemId === resource.systemId)
                  .map((e) => (
                    <option key={e.id} value={e.id}>
                      {e.name}
                    </option>
                  ))}
              </select>
            </label>
          )}
        </div>
      )}
      <div className="record-fields deployment-fields">
        <label>
          地址
          <div className="inline-field">
            <input
              aria-label="资源地址"
              placeholder={resource.kind === 'server' ? 'IP 或 SSH 主机名' : '主机名、IP 或 URL'}
              value={form.value.address}
              onChange={(event) => form.change({ ...form.value, address: event.target.value })}
            />
            <CopyValue value={form.value.address} label="资源地址" onError={host.onError} />
            {/^https?:\/\//i.test(form.value.address) && (
              <button
                className="icon-button"
                aria-label="打开资源链接"
                onClick={() =>
                  void window.desktop
                    .openExternal(form.value.address)
                    .catch((cause) => host.onError(String(cause)))
                }
              >
                <ArrowUpRightIcon size={17} />
              </button>
            )}
          </div>
        </label>
        <label>
          端口
          <div className="inline-field">
            <input
              aria-label="资源端口"
              inputMode="numeric"
              placeholder={
                resource.kind === 'redis' ? '6379' : resource.kind === 'server' ? '22' : '可选'
              }
              value={form.value.port}
              onChange={(event) => form.change({ ...form.value, port: event.target.value })}
            />
            <CopyValue value={form.value.port} label="资源端口" onError={host.onError} />
          </div>
        </label>
      </div>
      {resource.kind === 'server' && (
        <div className="record-fields server-configuration">
          {serverConfigurationFields.map((field) => (
            <label key={field}>
              {field}
              <input
                aria-label={`服务器${field}`}
                value={form.value.fields[field] ?? ''}
                placeholder="可选"
                onChange={(event) =>
                  form.change({
                    ...form.value,
                    fields: { ...form.value.fields, [field]: event.target.value },
                  })
                }
              />
            </label>
          ))}
        </div>
      )}
      {resource.kind === 'database' && (
        <div className="record-fields">
          {['类型', '版本', '实例', '库名', '主备', '目录', '配置', '日志'].map((field) => (
            <label key={field}>
              {field}
              <input
                aria-label={`数据库${field}`}
                value={form.value.fields[field] ?? ''}
                onChange={(e) =>
                  form.change({
                    ...form.value,
                    fields: { ...form.value.fields, [field]: e.target.value },
                  })
                }
              />
            </label>
          ))}
        </div>
      )}
      <details className="compact-details">
        <summary>附加信息</summary>
        <p className="field-hint">
          连接方式、数据库编号等普通信息。密码、Token 和私钥请存入账号的秘密字段。
        </p>
        {Object.entries(form.value.fields)
          .filter(
            ([key]) =>
              resource.kind !== 'server' || !['用途', ...serverConfigurationFields].includes(key),
          )
          .map(([key, value]) => (
            <div className="extra-field" key={key}>
              <label>
                {key}
                <input
                  aria-label={`附加字段 ${key}`}
                  value={value}
                  onChange={(event) =>
                    form.change({
                      ...form.value,
                      fields: { ...form.value.fields, [key]: event.target.value },
                    })
                  }
                />
              </label>
              <CopyValue value={value} label={key} onError={host.onError} />
              <button
                className="icon-button"
                aria-label={`删除字段 ${key}`}
                onClick={() => {
                  const fields = { ...form.value.fields };
                  delete fields[key];
                  form.change({ ...form.value, fields });
                }}
              >
                <TrashIcon size={15} />
              </button>
            </div>
          ))}
        <div className="extra-field">
          <input
            aria-label="新字段名称"
            placeholder="字段名称，如 SSH 方式"
            value={fieldName}
            onChange={(event) => setFieldName(event.target.value)}
          />
          <input
            aria-label="新字段值"
            placeholder="内容"
            value={fieldValue}
            onChange={(event) => setFieldValue(event.target.value)}
          />
          <button
            className="icon-button"
            aria-label="添加字段"
            disabled={!fieldName.trim()}
            onClick={() => {
              const key = fieldName.trim();
              if (
                Object.hasOwn(form.value.fields, key) ||
                ['__proto__', 'prototype', 'constructor'].includes(key)
              ) {
                host.onError('字段名称已存在或不可使用。');
                return;
              }
              form.change({ ...form.value, fields: { ...form.value.fields, [key]: fieldValue } });
              setFieldName('');
              setFieldValue('');
            }}
          >
            <PlusIcon size={17} />
          </button>
        </div>
        <textarea
          aria-label="资源说明"
          placeholder="普通说明，按需记录…"
          value={form.value.notes}
          onChange={(event) => form.change({ ...form.value, notes: event.target.value })}
        />
      </details>
      <div className="record-actions">
        <button
          onClick={() => {
            setDialogError('');
            setIncludeSecrets(false);
            setCopyName(`${form.value.name} 副本`);
            setCopySystem(resource.systemId);
            setCopyEnvironment(resource.environmentId ?? '');
            setModal('copy');
          }}
        >
          <CopyIcon size={15} />
          复制资源
        </button>
        <button
          className="subtle-danger"
          onClick={() => {
            setDialogError('');
            setModal('delete');
          }}
        >
          <TrashIcon size={15} />
          删除资源
        </button>
      </div>
      {modal && (
        <Dialog
          error={dialogError}
          title={modal === 'copy' ? '复制资源' : '删除资源'}
          onClose={() => !busy && setModal(null)}
        >
          {modal === 'copy' ? (
            <>
              <p>创建独立资源，复制普通资料及账号元数据；秘密需要明确选择。</p>
              <label>
                名称
                <input
                  aria-label="副本名称"
                  value={copyName}
                  onChange={(event) => setCopyName(event.target.value)}
                />
              </label>
              {resource.kind === 'server' && (
                <label>
                  目标系统
                  <select
                    aria-label="副本目标系统"
                    value={copySystem}
                    onChange={(event) => {
                      setCopySystem(event.target.value);
                      setCopyEnvironment('');
                    }}
                  >
                    {snapshot.systems.map((item) => (
                      <option key={item.id} value={item.id}>
                        {item.name}
                      </option>
                    ))}
                  </select>
                </label>
              )}
              <label>
                目标环境
                <select
                  aria-label="副本目标环境"
                  value={copyEnvironment}
                  onChange={(event) => setCopyEnvironment(event.target.value)}
                >
                  {resource.kind === 'server' && <option value="">系统通用</option>}
                  {snapshot.environments
                    .filter((item) => item.systemId === copySystem)
                    .map((item) => (
                      <option value={item.id} key={item.id}>
                        {item.name}
                      </option>
                    ))}
                </select>
              </label>
            </>
          ) : (
            <p>删除“{resource.name}”？有关联账号或资料的资源需要先处理引用。</p>
          )}
          {modal === 'copy' && secretCount > 0 && (
            <label className="secret-show">
              <input
                type="checkbox"
                aria-label="同时复制资源账号和秘密"
                checked={includeSecrets}
                onChange={(event) => setIncludeSecrets(event.target.checked)}
              />
              同时复制账号及 {secretCount} 项秘密（需要解锁）
            </label>
          )}
          <div className="modal-actions">
            <button disabled={busy} onClick={() => setModal(null)}>
              取消
            </button>
            <button
              className="primary-button"
              disabled={busy || (modal === 'copy' && !copyName.trim())}
              onClick={() => void confirm()}
            >
              {busy ? '处理中…' : modal === 'copy' ? '创建副本' : '确认删除'}
            </button>
          </div>
        </Dialog>
      )}
    </div>
  );
}
