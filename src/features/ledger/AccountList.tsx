import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { CopyIcon, CheckIcon, EyeIcon, EyeSlashIcon } from '@phosphor-icons/react';
import type { Snapshot } from '../../types';
import type { AccountRecord } from '../../ledger-types';
import type { SecretKind } from '../../vault-types';
import { secretLabels } from '../../vault-types';
import { CopyValue } from '../../shared/CopyValue';
import { useVault } from '../vault/VaultProvider';

type AccountRow = { account: AccountRecord; scope: string; owner: string };
export function AccountList({
  rows,
  snapshot,
  selected,
  onOpen,
  onError,
}: {
  rows: AccountRow[];
  snapshot: Snapshot;
  selected: string | null;
  onOpen: (id: string) => void;
  onError: (message: string) => void;
}) {
  const vault = useVault();
  const [values, setValues] = useState<Record<string, string>>({});
  const [reading, setReading] = useState(false);
  const [copying, setCopying] = useState<string | null>(null);
  const [copied, setCopied] = useState<string | null>(null);
  const generation = useRef(0),
    copyingRef = useRef(false),
    readingRef = useRef(false);
  function hide() {
    generation.current++;
    setValues({});
    readingRef.current = false;
    setReading(false);
  }
  // A save may replace a secret without changing the account's ordinary fields.
  useLayoutEffect(() => {
    hide();
    setCopied(null);
  }, [snapshot]);
  useEffect(() => {
    const unsubscribe = window.desktop.onVaultStatus((status) => {
      if (!status.unlocked) {
        hide();
        setCopied(null);
      }
    });
    return () => {
      generation.current++;
      unsubscribe();
    };
  }, []);
  const passwords = rows.filter((row) => row.account.secretKinds.includes('password'));
  const allVisible =
    passwords.length > 0 && passwords.every((row) => values[row.account.id] !== undefined);
  async function reveal(ids: string[]) {
    if (readingRef.current) return;
    readingRef.current = true;
    setReading(true);
    const request = generation.current;
    try {
      if (!(await vault.ensureUnlocked()) || request !== generation.current) return;
      const next: Record<string, string> = {};
      for (const id of ids) {
        next[id] = await window.desktop.readSecret(id, 'password');
        if (request !== generation.current) return;
      }
      setValues((previous) => ({ ...previous, ...next }));
    } catch (cause) {
      if (request === generation.current) onError(String(cause));
    } finally {
      if (request === generation.current) {
        readingRef.current = false;
        setReading(false);
      }
    }
  }
  async function copy(account: AccountRecord, kind?: SecretKind) {
    if (copyingRef.current) return;
    const request = generation.current,
      key = `${account.id}:${kind ?? 'row'}`;
    copyingRef.current = true;
    setCopying(key);
    try {
      if ((kind || account.secretKinds.includes('password')) && !(await vault.ensureUnlocked()))
        return;
      if (request !== generation.current) return;
      if (kind) await window.desktop.copySecret(account.id, kind);
      else await window.desktop.copyAccountText(account.id);
      if (request === generation.current) setCopied(key);
    } catch (cause) {
      if (request === generation.current) onError(String(cause));
    } finally {
      copyingRef.current = false;
      setCopying(null);
    }
  }
  return (
    <>
      <div className="account-list-heading">
        <span>{rows.length} 条记录</span>
        <button
          className="secondary-button"
          disabled={!passwords.length}
          onClick={() => {
            if (reading || allVisible) hide();
            else void reveal(passwords.map((row) => row.account.id));
          }}
        >
          {reading ? (
            <EyeSlashIcon size={16} />
          ) : allVisible ? (
            <EyeSlashIcon size={16} />
          ) : (
            <EyeIcon size={16} />
          )}
          {reading ? '取消显示' : allVisible ? '隐藏当前列表密码' : '显示当前列表密码'}
        </button>
      </div>
      <table className="account-table">
        <thead>
          <tr>
            <th>用途／角色</th>
            <th>用户名</th>
            <th>密码</th>
            <th>所属对象</th>
            <th>复制整行</th>
          </tr>
        </thead>
        <tbody>
          {rows.map(({ account, scope, owner }) => {
            const value = vault.status.unlocked ? values[account.id] : undefined;
            const key = `${account.id}:row`;
            const passwordKey = `${account.id}:password`;
            return (
              <tr key={account.id} className={selected === account.id ? 'selected' : ''}>
                <td>
                  <button onClick={() => onOpen(account.id)}>
                    <strong>{account.name}</strong>
                    <small>{scope}</small>
                  </button>
                </td>
                <td>
                  <div className="account-copy-field">
                    <code>{account.username || '未填写'}</code>
                    <span className="field-copy-action">
                      <CopyValue
                        value={account.username}
                        label={`用户名 ${account.name} ${account.username}`}
                        onError={onError}
                      />
                    </span>
                  </div>
                </td>
                <td>
                  {account.secretKinds.includes('password') ? (
                    <div className="account-copy-field account-password-field">
                      <code
                        aria-label={`${value === undefined ? '隐藏的' : '已显示的'}密码 ${account.name}`}
                      >
                        {value ?? '***'}
                      </code>
                      <button
                        className="icon-button"
                        aria-label={`${value === undefined ? '显示' : '隐藏'}密码 ${account.name}`}
                        title={value === undefined ? '显示密码' : '隐藏密码'}
                        aria-pressed={value !== undefined}
                        disabled={reading}
                        onClick={() => {
                          if (value !== undefined)
                            setValues((previous) => {
                              const next = { ...previous };
                              delete next[account.id];
                              return next;
                            });
                          else void reveal([account.id]);
                        }}
                      >
                        {value === undefined ? <EyeIcon size={16} /> : <EyeSlashIcon size={16} />}
                      </button>
                      <button
                        className="icon-button field-copy-action"
                        aria-label={`复制密码 ${account.name} ${account.username}`}
                        title={copied === passwordKey ? '已复制 · 30 秒后清理' : '复制密码'}
                        disabled={copying !== null}
                        onBlur={() => setCopied(null)}
                        onClick={() => void copy(account, 'password')}
                      >
                        {copied === passwordKey ? <CheckIcon size={16} /> : <CopyIcon size={16} />}
                      </button>
                    </div>
                  ) : (
                    <span className="account-no-password">未保存密码</span>
                  )}
                  {account.secretKinds
                    .filter((kind) => kind !== 'password')
                    .map((kind) => (
                      <button
                        key={kind}
                        className="text-button account-other-secret"
                        aria-label={`复制${secretLabels[kind]} ${account.name} ${account.username}`}
                        disabled={copying !== null}
                        onClick={() => void copy(account, kind)}
                        onBlur={() => setCopied(null)}
                      >
                        {copied === `${account.id}:${kind}`
                          ? '已复制'
                          : `复制${secretLabels[kind]}`}
                      </button>
                    ))}
                </td>
                <td>
                  <span className="account-owner">{owner}</span>
                </td>
                <td>
                  <button
                    className="text-button account-copy-row"
                    aria-label={`复制整行 ${owner} / ${account.name}`}
                    title="复制名称、地址、用户名和密码 · 30 秒后清理"
                    disabled={copying !== null}
                    onBlur={() => setCopied(null)}
                    onClick={() => void copy(account)}
                  >
                    {copied === key ? <CheckIcon size={16} /> : <CopyIcon size={16} />}
                    {copying === key ? '复制中…' : copied === key ? '已复制' : '复制整行'}
                  </button>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </>
  );
}
