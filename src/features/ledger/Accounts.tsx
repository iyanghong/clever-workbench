import { useEffect, useRef, useState } from 'react';
import { CopyIcon, UserCircleIcon, ArrowsLeftRightIcon, TrashIcon } from '@phosphor-icons/react';
import type { Snapshot } from '../../types';
import type { AccountRecord, EnvironmentRecord } from '../../ledger-types';
import type { EditorHost } from './Environments';
import { useAutosave } from '../../shared/useAutosave';
import { FavoriteButton } from '../home/FavoriteButton';
import { useVault } from '../vault/VaultProvider';
import { Secrets } from '../vault/Secrets';
import { CopyValue } from '../../shared/CopyValue';
import { Dialog } from '../../shared/Dialog';

export type AccountTarget = {
  environmentId: string | null;
  resourceId: string | null;
  accessId?: string | null;
  accountId: string;
};
export type AccountNavigation = {
  focusAccount: string | null;
  onOpenAccount: (target: AccountTarget) => void;
};
export function Accounts({
  environment,
  resourceId,
  accessId = null,
  systemId,
  snapshot,
  flushAll,
  focusAccount,
  onOpenAccount,
  ...host
}: EditorHost &
  AccountNavigation & {
    environment: EnvironmentRecord | null;
    systemId?: string;
    accessId?: string | null;
    resourceId: string | null;
    snapshot: Snapshot;
    flushAll: () => Promise<void>;
  }) {
  const [name, setName] = useState(''),
    [selected, setSelected] = useState<string | null>(focusAccount);
  useEffect(() => {
    if (focusAccount) setSelected(focusAccount);
  }, [focusAccount]);
  const busy = useRef(false);
  const ownerSystem =
    systemId ??
    environment?.systemId ??
    snapshot.resources.find((r) => r.id === resourceId)?.systemId ??
    snapshot.accessEntries.find((e) => e.id === accessId)?.systemId;
  const accounts = snapshot.accounts.filter(
    (item) =>
      item.systemId === ownerSystem &&
      item.environmentId === (environment?.id ?? null) &&
      item.resourceId === resourceId &&
      item.accessId === accessId,
  );
  const account = accounts.find((item) => item.id === selected) ?? accounts[0];
  const owner = resourceId
    ? snapshot.resources.find((item) => item.id === resourceId)?.name
    : accessId
      ? snapshot.accessEntries.find((e) => e.id === accessId)?.name
      : '系统账号';
  async function create() {
    if (!name.trim() || busy.current) return;
    busy.current = true;
    try {
      await flushAll();
      const result = await window.desktop.mutate({
        type: 'account.save',
        name,
        environmentId: environment?.id ?? null,
        resourceId,
        accessId,
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
    <section className="accounts-section" aria-label={`${owner}账号`}>
      <div className="entity-toolbar">
        <span className="secondary-copy">
          {environment?.name ?? '通用'} / {owner} · {accounts.length} 个账号
        </span>
        <form
          className="inline-create"
          onSubmit={(event) => {
            event.preventDefault();
            void create();
          }}
        >
          <UserCircleIcon size={17} />
          <input
            aria-label="新增账号用途"
            placeholder="用途或角色，回车添加…"
            value={name}
            onChange={(event) => setName(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === 'Enter' && event.nativeEvent.isComposing) event.preventDefault();
            }}
          />
          <kbd>↵</kbd>
        </form>
      </div>
      <div className="account-list" role="group" aria-label="账号列表">
        {accounts.map((item) => (
          <button
            key={item.id}
            className={`account-row ${item.id === account?.id ? 'selected' : ''}`}
            aria-label={`账号 ${item.name}`}
            onClick={async () => {
              try {
                await flushAll();
                setSelected(item.id);
              } catch (cause) {
                host.onError(String(cause));
              }
            }}
          >
            <UserCircleIcon size={22} weight="duotone" />
            <span>
              <strong>{item.name}</strong>
              <small>{item.username || '未设置用户名'}</small>
            </span>
          </button>
        ))}
      </div>
      {account ? (
        <AccountEditor
          key={account.id}
          account={account}
          revealTarget={focusAccount === account.id}
          snapshot={snapshot}
          flushAll={flushAll}
          onOpenAccount={onOpenAccount}
          {...host}
        />
      ) : (
        <p className="secondary-copy entity-empty">只填用途或角色即可建立账号，用户名可留空。</p>
      )}
    </section>
  );
}

function AccountEditor({
  account,
  revealTarget,
  snapshot,
  flushAll,
  onOpenAccount,
  ...host
}: EditorHost &
  Pick<AccountNavigation, 'onOpenAccount'> & {
    account: AccountRecord;
    revealTarget: boolean;
    snapshot: Snapshot;
    flushAll: () => Promise<void>;
  }) {
  const form = useAutosave(
    { name: account.name, username: account.username, notes: account.notes },
    async (value) => {
      host.onSnapshot(
        (
          await window.desktop.mutate({
            type: 'account.save',
            id: account.id,
            environmentId: account.environmentId,
            resourceId: account.resourceId,
            accessId: account.accessId,
            ...value,
          })
        ).snapshot,
      );
    },
    host.onError,
  );
  useEffect(() => host.registerFlush(form.flush), [host.registerFlush, form.flush]);
  const [modal, setModal] = useState<'copy' | 'move' | 'delete' | null>(null),
    [busy, setBusy] = useState(false);
  const environment = snapshot.environments.find((e) => e.id === account.environmentId);
  const [targetEnvironment, setTargetEnvironment] = useState(account.environmentId ?? ''),
    [targetResource, setTargetResource] = useState(
      account.accessId ? `access:${account.accessId}` : (account.resourceId ?? ''),
    ),
    [targetName, setTargetName] = useState('');
  const [dialogError, setDialogError] = useState('');
  const vault = useVault();
  const [includeSecrets, setIncludeSecrets] = useState(false);
  function open(mode: 'copy' | 'move' | 'delete') {
    setDialogError('');
    setIncludeSecrets(false);
    setTargetEnvironment(account.environmentId ?? '');
    setTargetResource(account.accessId ? `access:${account.accessId}` : (account.resourceId ?? ''));
    setTargetName(mode === 'copy' ? `${form.value.name} 副本` : form.value.name);
    setModal(mode);
  }
  async function confirm() {
    if (busy) return;
    setBusy(true);
    setDialogError('');
    try {
      await flushAll();
      if (modal === 'copy' && includeSecrets && !(await vault.ensureUnlocked())) return;
      const target = {
        environmentId: targetEnvironment || null,
        resourceId: targetResource.startsWith('access:') ? null : targetResource || null,
        accessId: targetResource.startsWith('access:') ? targetResource.slice(7) : null,
      };
      const result =
        modal === 'copy' && includeSecrets
          ? await window.desktop.copyAccountWithSecrets(
              account.id,
              {
                name: targetName,
                ...target,
              },
              account.secretKinds,
            )
          : await window.desktop.mutate(
              modal === 'copy'
                ? {
                    type: 'account.copy',
                    id: account.id,
                    name: targetName,
                    ...target,
                  }
                : modal === 'move'
                  ? {
                      type: 'account.save',
                      id: account.id,
                      name: form.value.name,
                      ...target,
                    }
                  : { type: 'account.delete', id: account.id },
            );
      host.onSnapshot(result.snapshot);
      setModal(null);
      if (modal !== 'delete')
        onOpenAccount({
          ...target,
          accountId: result.createdId ?? account.id,
        });
    } catch (cause) {
      setDialogError(String(cause));
    } finally {
      setBusy(false);
    }
  }
  const targetElement = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (revealTarget) targetElement.current?.scrollIntoView({ block: 'center' });
  }, [revealTarget]);
  const system = snapshot.systems.find((item) => item.id === account.systemId)!;
  return (
    <div ref={targetElement} className="account-editor">
      <div className="record-subheading">
        <strong>
          {system.name} / {environment?.name ?? '通用'} /{' '}
          {account.resourceId
            ? snapshot.resources.find((item) => item.id === account.resourceId)?.name
            : account.accessId
              ? snapshot.accessEntries.find((e) => e.id === account.accessId)?.name
              : '系统账号'}{' '}
          / {account.name}
        </strong>
        <FavoriteButton
          item={{ kind: 'account', id: account.id }}
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
          用途或角色
          <input
            aria-label="账号用途"
            value={form.value.name}
            onChange={(event) => form.change({ ...form.value, name: event.target.value })}
          />
        </label>
        <label>
          用户名
          <div className="inline-field">
            <input
              aria-label="账号用户名"
              placeholder="可留空"
              value={form.value.username}
              onChange={(event) => form.change({ ...form.value, username: event.target.value })}
            />
            <CopyValue label="用户名" value={form.value.username} onError={host.onError} />
          </div>
        </label>
      </div>
      <Secrets account={account} onSnapshot={host.onSnapshot} onError={host.onError} />
      <details className="compact-details">
        <summary>账号说明</summary>
        <p className="field-hint">普通说明。密码、Token 和私钥使用专门的秘密字段。</p>
        <textarea
          aria-label="账号说明"
          placeholder="用途、登录方式或其他普通说明…"
          value={form.value.notes}
          onChange={(event) => form.change({ ...form.value, notes: event.target.value })}
        />
      </details>
      <div className="record-actions">
        <button onClick={() => open('copy')}>
          <CopyIcon size={15} />
          复制账号
        </button>
        <button onClick={() => open('move')}>
          <ArrowsLeftRightIcon size={15} />
          调整归属
        </button>
        <button className="subtle-danger" onClick={() => open('delete')}>
          <TrashIcon size={15} />
          删除账号
        </button>
      </div>
      {modal && (
        <Dialog
          error={dialogError}
          title={modal === 'copy' ? '复制账号' : modal === 'move' ? '调整账号归属' : '删除账号'}
          onClose={() => !busy && setModal(null)}
        >
          <p>
            {modal === 'copy'
              ? '新账号默认只复制用途、用户名与普通说明。'
              : modal === 'move'
                ? `在“${system.name}”内调整账号归属。`
                : `删除“${account.name}”？该账号的已保存秘密也会删除；有关联资料时需先处理引用。`}
          </p>
          {modal === 'copy' && (
            <label>
              副本名称
              <input
                aria-label="账号副本名称"
                value={targetName}
                onChange={(event) => setTargetName(event.target.value)}
              />
            </label>
          )}
          {modal !== 'delete' && (
            <>
              <label>
                环境
                <select
                  aria-label="账号目标环境"
                  value={targetEnvironment}
                  onChange={(event) => {
                    setTargetEnvironment(event.target.value);
                    setTargetResource('');
                  }}
                >
                  <option value="">系统通用</option>
                  {snapshot.environments
                    .filter((item) => item.systemId === system.id)
                    .map((item) => (
                      <option key={item.id} value={item.id}>
                        {item.name}
                      </option>
                    ))}
                </select>
              </label>
              <label>
                归属
                <select
                  aria-label="账号目标归属"
                  value={targetResource}
                  onChange={(event) => setTargetResource(event.target.value)}
                >
                  <option value="">
                    {targetEnvironment ? '系统环境' : '选择服务器或访问入口'}
                  </option>
                  {snapshot.resources
                    .filter(
                      (item) =>
                        item.systemId === system.id &&
                        item.environmentId === (targetEnvironment || null),
                    )
                    .map((item) => (
                      <option key={item.id} value={item.id}>
                        {item.name}
                      </option>
                    ))}
                  {snapshot.accessEntries
                    .filter(
                      (item) =>
                        item.systemId === system.id &&
                        item.environmentId === (targetEnvironment || null),
                    )
                    .map((item) => (
                      <option key={item.id} value={`access:${item.id}`}>
                        访问入口 · {item.name}
                      </option>
                    ))}
                </select>
              </label>
            </>
          )}
          {modal === 'copy' && account.secretKinds.length > 0 && (
            <label className="secret-show">
              <input
                type="checkbox"
                aria-label="同时复制账号秘密"
                checked={includeSecrets}
                onChange={(event) => setIncludeSecrets(event.target.checked)}
              />
              同时复制 {account.secretKinds.length} 项秘密（需要解锁）
            </label>
          )}
          <div className="modal-actions">
            <button className="secondary-button" disabled={busy} onClick={() => setModal(null)}>
              取消
            </button>
            <button
              className={modal === 'delete' ? 'danger-button' : 'primary-button'}
              disabled={
                busy ||
                (modal === 'copy' && !targetName.trim()) ||
                (modal !== 'delete' && !targetEnvironment && !targetResource)
              }
              onClick={() => void confirm()}
            >
              {busy
                ? '处理中…'
                : modal === 'copy'
                  ? '创建副本'
                  : modal === 'move'
                    ? '保存归属'
                    : '确认删除'}
            </button>
          </div>
        </Dialog>
      )}
    </div>
  );
}
