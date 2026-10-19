import { useEffect, useState } from 'react';
import {
  ArrowUpRightIcon,
  ArrowUpIcon,
  ArrowDownIcon,
  PlusIcon,
  TrashIcon,
  CopyIcon,
  StarIcon,
} from '@phosphor-icons/react';
import type { AccessEntry } from '../../ledger-types';
import type { Snapshot } from '../../types';
import type { EditorHost } from './Environments';
import { useAutosave } from '../../shared/useAutosave';
import { CopyValue } from '../../shared/CopyValue';
import { Dialog } from '../../shared/Dialog';
import { FavoriteButton } from '../home/FavoriteButton';
import { useVault } from '../vault/VaultProvider';

export function AccessEntryEditor({
  entry,
  snapshot,
  flushAll,
  scopeManaged = false,
  ...host
}: EditorHost & {
  entry: AccessEntry;
  scopeManaged?: boolean;
  snapshot: Snapshot;
  flushAll: () => Promise<void>;
}) {
  const form = useAutosave(
    {
      name: entry.name,
      notes: entry.notes,
      environmentId: entry.environmentId,
      addresses: entry.addresses,
      preferredAddressId: entry.preferredAddressId,
    },
    async (value) => {
      host.onSnapshot(
        (
          await window.desktop.mutate({
            type: 'access.save',
            id: entry.id,
            systemId: entry.systemId,
            ...value,
            environmentId: scopeManaged ? entry.environmentId : value.environmentId,
          })
        ).snapshot,
      );
    },
    host.onError,
  );
  useEffect(() => host.registerFlush(form.flush), [host.registerFlush, form.flush]);
  const [modal, setModal] = useState<'copy' | 'delete' | null>(null),
    [busy, setBusy] = useState(false),
    [error, setError] = useState('');
  const [copyName, setCopyName] = useState(''),
    [copySystem, setCopySystem] = useState(entry.systemId),
    [copyEnvironment, setCopyEnvironment] = useState(entry.environmentId ?? ''),
    [includeSecrets, setIncludeSecrets] = useState(false);
  const vault = useVault(),
    accounts = snapshot.accounts.filter((a) => a.accessId === entry.id);
  const secretCount = accounts.reduce((count, a) => count + a.secretKinds.length, 0);
  const updateAddresses = (addresses: AccessEntry['addresses']) =>
    form.change({
      ...form.value,
      addresses,
      preferredAddressId: addresses.some((a) => a.id === form.value.preferredAddressId)
        ? form.value.preferredAddressId
        : (addresses[0]?.id ?? null),
    });
  function open(mode: 'copy' | 'delete') {
    setError('');
    setIncludeSecrets(false);
    setCopyName(`${form.value.name} 副本`);
    setCopySystem(entry.systemId);
    setCopyEnvironment(entry.environmentId ?? '');
    setModal(mode);
  }
  async function confirm() {
    if (busy) return;
    setBusy(true);
    setError('');
    try {
      await flushAll();
      if (modal === 'copy' && includeSecrets && !(await vault.ensureUnlocked())) return;
      const target = {
        name: copyName,
        systemId: copySystem,
        environmentId:
          copySystem === entry.systemId && (copyEnvironment || null) === entry.environmentId
            ? undefined
            : copyEnvironment || null,
      };
      const result =
        modal === 'delete'
          ? await window.desktop.mutate({ type: 'access.delete', id: entry.id })
          : includeSecrets
            ? await window.desktop.copyAccessWithSecrets(entry.id, target)
            : await window.desktop.mutate({ type: 'access.copy', id: entry.id, ...target });
      host.onSnapshot(result.snapshot);
      setModal(null);
      if (result.createdId) await host.navigate({ module: 'ledger', objectId: result.createdId });
    } catch (cause) {
      setError(String(cause));
    } finally {
      setBusy(false);
    }
  }
  return (
    <div className="access-entry-editor">
      <div className="record-subheading">
        <strong>
          {snapshot.systems.find((s) => s.id === entry.systemId)?.name} /{' '}
          {snapshot.environments.find((e) => e.id === entry.environmentId)?.name ?? '通用'} /{' '}
          {entry.name}
        </strong>
        <FavoriteButton
          item={{ kind: 'access', id: entry.id }}
          snapshot={snapshot}
          onSnapshot={host.onSnapshot}
          onError={host.onError}
        />
        <button
          className="save-indicator"
          onClick={() => void form.flush().catch((cause) => host.onError(String(cause)))}
        >
          {form.status}
        </button>
      </div>
      <div className="record-fields">
        <label>
          名称
          <input
            aria-label="入口名称"
            value={form.value.name}
            onChange={(event) => form.change({ ...form.value, name: event.target.value })}
          />
        </label>
        {!scopeManaged && (
          <label>
            环境
            <select
              aria-label="入口所属环境"
              value={form.value.environmentId ?? ''}
              onChange={(event) =>
                form.change({ ...form.value, environmentId: event.target.value || null })
              }
            >
              <option value="">系统通用</option>
              {snapshot.environments
                .filter((e) => e.systemId === entry.systemId)
                .map((e) => (
                  <option key={e.id} value={e.id}>
                    {e.name}
                  </option>
                ))}
            </select>
          </label>
        )}
      </div>
      <div className="section-heading access-address-heading">
        <h3>登录地址</h3>
        <button
          className="text-button"
          onClick={() =>
            updateAddresses([
              ...form.value.addresses,
              {
                id: crypto.randomUUID(),
                label: form.value.addresses.length
                  ? `地址 ${form.value.addresses.length + 1}`
                  : '主地址',
                url: '',
              },
            ])
          }
        >
          <PlusIcon size={15} />
          添加地址
        </button>
      </div>
      <div className="access-addresses">
        {form.value.addresses.map((address, index) => (
          <div className="access-address-row" key={address.id}>
            <label>
              名称
              <input
                aria-label={`地址名称 ${index + 1}`}
                value={address.label}
                onChange={(event) =>
                  updateAddresses(
                    form.value.addresses.map((a) =>
                      a.id === address.id ? { ...a, label: event.target.value } : a,
                    ),
                  )
                }
              />
            </label>
            <label>
              网址
              <input
                aria-label={`登录地址 ${index + 1}`}
                placeholder="https://…"
                value={address.url}
                onChange={(event) =>
                  updateAddresses(
                    form.value.addresses.map((a) =>
                      a.id === address.id ? { ...a, url: event.target.value } : a,
                    ),
                  )
                }
              />
            </label>
            <div className="address-actions">
              <button
                className="icon-button"
                aria-label={`设为常用地址 ${address.label}`}
                aria-pressed={form.value.preferredAddressId === address.id}
                title="常用地址"
                onClick={() => form.change({ ...form.value, preferredAddressId: address.id })}
              >
                <StarIcon
                  weight={form.value.preferredAddressId === address.id ? 'fill' : 'regular'}
                  size={16}
                />
              </button>
              <CopyValue
                resolveValue={async () => {
                  await flushAll();
                  return address.url;
                }}
                value={address.url}
                label={`地址 ${address.label}`}
                onError={host.onError}
              />
              <button
                className="icon-button"
                aria-label={`打开 ${entry.name} ${address.label}`}
                disabled={!/^https?:\/\//i.test(address.url)}
                onClick={() =>
                  void window.desktop
                    .openExternal(address.url)
                    .catch((cause) => host.onError(String(cause)))
                }
              >
                <ArrowUpRightIcon size={16} />
              </button>
              {([-1, 1] as const).map((direction) => (
                <button
                  key={direction}
                  className="icon-button"
                  aria-label={`${direction < 0 ? '上移' : '下移'}地址 ${address.label}`}
                  disabled={direction < 0 ? index === 0 : index === form.value.addresses.length - 1}
                  onClick={() => {
                    const next = [...form.value.addresses];
                    [next[index], next[index + direction]] = [next[index + direction], next[index]];
                    updateAddresses(next);
                  }}
                >
                  {direction < 0 ? <ArrowUpIcon size={14} /> : <ArrowDownIcon size={14} />}
                </button>
              ))}
              <button
                className="icon-button subtle-danger"
                aria-label={`删除地址 ${address.label}`}
                onClick={() =>
                  updateAddresses(form.value.addresses.filter((a) => a.id !== address.id))
                }
              >
                <TrashIcon size={15} />
              </button>
            </div>
          </div>
        ))}
        {!form.value.addresses.length && (
          <p className="secondary-copy">尚未记录地址，账号仍可单独保存。</p>
        )}
      </div>
      {accounts.length > 0 && (
        <label className="preferred-account">
          常用账号
          <select
            aria-label="入口常用账号"
            value={entry.preferredAccountId ?? accounts[0].id}
            onChange={(event) => {
              const id = event.target.value;
              void (async () => {
                try {
                  await flushAll();
                  host.onSnapshot(
                    (
                      await window.desktop.mutate({
                        type: 'access.save',
                        id: entry.id,
                        preferredAccountId: id,
                      })
                    ).snapshot,
                  );
                } catch (cause) {
                  host.onError(String(cause));
                }
              })();
            }}
          >
            {accounts.map((a) => (
              <option key={a.id} value={a.id}>
                {a.name} · {a.username || '无用户名'}
              </option>
            ))}
          </select>
        </label>
      )}
      <details className="compact-details">
        <summary>入口说明</summary>
        <textarea
          aria-label="入口说明"
          value={form.value.notes}
          placeholder="普通说明，密码请放在账号秘密中"
          onChange={(event) => form.change({ ...form.value, notes: event.target.value })}
        />
      </details>
      <div className="record-actions">
        <button onClick={() => open('copy')}>
          <CopyIcon size={15} />
          复制访问入口
        </button>
        <button className="subtle-danger" onClick={() => open('delete')}>
          <TrashIcon size={15} />
          删除访问入口
        </button>
      </div>
      {modal && (
        <Dialog
          title={modal === 'copy' ? '复制访问入口' : '删除访问入口'}
          error={error}
          onClose={() => !busy && setModal(null)}
        >
          {modal === 'copy' ? (
            <>
              <p>地址和账号元数据复制为独立记录，秘密需明确选择。</p>
              <label>
                副本名称
                <input
                  aria-label="入口副本名称"
                  value={copyName}
                  onChange={(event) => setCopyName(event.target.value)}
                />
              </label>
              <label>
                目标系统
                <select
                  aria-label="入口副本系统"
                  value={copySystem}
                  onChange={(event) => {
                    setCopySystem(event.target.value);
                    setCopyEnvironment('');
                  }}
                >
                  {snapshot.systems.map((s) => (
                    <option key={s.id} value={s.id}>
                      {s.name}
                    </option>
                  ))}
                </select>
              </label>
              <label>
                目标环境
                <select
                  aria-label="入口副本环境"
                  value={copyEnvironment}
                  onChange={(event) => setCopyEnvironment(event.target.value)}
                >
                  <option value="">系统通用</option>
                  {snapshot.environments
                    .filter((e) => e.systemId === copySystem)
                    .map((e) => (
                      <option key={e.id} value={e.id}>
                        {e.name}
                      </option>
                    ))}
                </select>
              </label>
              {secretCount > 0 && (
                <label className="secret-show">
                  <input
                    type="checkbox"
                    aria-label="同时复制入口秘密"
                    checked={includeSecrets}
                    onChange={(event) => setIncludeSecrets(event.target.checked)}
                  />
                  同时复制 {secretCount} 项秘密（需要解锁）
                </label>
              )}
            </>
          ) : (
            <p>
              删除“{entry.name}”及其 {entry.addresses.length} 个地址、{accounts.length} 个账号和{' '}
              {secretCount} 项秘密？这不会删除任务或文档。
            </p>
          )}
          <div className="modal-actions">
            <button className="secondary-button" disabled={busy} onClick={() => setModal(null)}>
              取消
            </button>
            <button
              className={modal === 'delete' ? 'danger-button' : 'primary-button'}
              disabled={busy || (modal === 'copy' && !copyName.trim())}
              onClick={() => void confirm()}
            >
              {modal === 'copy' ? '创建副本' : '确认删除'}
            </button>
          </div>
        </Dialog>
      )}
    </div>
  );
}
