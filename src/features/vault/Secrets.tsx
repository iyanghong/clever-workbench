import { useEffect, useRef, useState } from 'react';
import {
  EyeIcon,
  EyeSlashIcon,
  PencilSimpleIcon,
  PlusIcon,
  ShieldCheckIcon,
} from '@phosphor-icons/react';
import type { AccountRecord } from '../../ledger-types';
import type { Snapshot } from '../../types';
import { secretLabels, type SecretKind } from '../../vault-types';
import { useVault } from './VaultProvider';
import { Dialog } from '../../shared/Dialog';
export function Secrets({
  account,
  onSnapshot,
  onError,
}: {
  account: AccountRecord;
  onSnapshot: (snapshot: Snapshot) => void;
  onError: (message: string) => void;
}) {
  const vault = useVault();
  const [visible, setVisible] = useState<Partial<Record<SecretKind, string>>>({}),
    [editing, setEditing] = useState<SecretKind | null>(null),
    [value, setValue] = useState(''),
    [showInput, setShowInput] = useState(false),
    [error, setError] = useState(''),
    [busy, setBusy] = useState(false);
  const generation = useRef(0);
  useEffect(() => {
    const unsubscribe = window.desktop.onVaultStatus((status) => {
      if (!status.unlocked) {
        generation.current++;
        setVisible({});
        setEditing(null);
        setValue('');
        setShowInput(false);
        setError('');
        setBusy(false);
      }
    });
    return () => {
      generation.current++;
      unsubscribe();
    };
  }, []);
  async function reveal(kind: SecretKind) {
    if (visible[kind] !== undefined) {
      setVisible((previous) => ({ ...previous, [kind]: undefined }));
      return;
    }
    try {
      if (!(await vault.ensureUnlocked())) return;
      const request = generation.current,
        result = await window.desktop.readSecret(account.id, kind);
      if (request === generation.current)
        setVisible((previous) => ({ ...previous, [kind]: result }));
    } catch (cause) {
      onError(String(cause));
    }
  }
  async function edit(kind: SecretKind) {
    try {
      if (await vault.ensureUnlocked()) {
        setValue('');
        setShowInput(false);
        setError('');
        setEditing(kind);
      }
    } catch (cause) {
      onError(String(cause));
    }
  }
  function close() {
    setEditing(null);
    setValue('');
    setShowInput(false);
    setError('');
  }
  async function save(remove = false) {
    if (!editing || busy) return;
    setBusy(true);
    const request = generation.current;
    try {
      const result = remove
        ? await window.desktop.removeSecret(account.id, editing)
        : await window.desktop.saveSecret(account.id, editing, value);
      if (request !== generation.current) return;
      onSnapshot(result);
      setVisible({});
      close();
    } catch (cause) {
      if (request === generation.current) setError(String(cause));
    } finally {
      if (request === generation.current) setBusy(false);
    }
  }
  return (
    <section className="secrets" aria-label="账号秘密">
      <div className="record-subheading">
        <strong>
          <ShieldCheckIcon size={15} />
          秘密
        </strong>
        <span>{vault.status.unlocked ? '已解锁 · 默认遮蔽' : '按需解锁'}</span>
      </div>
      {(Object.keys(secretLabels) as SecretKind[]).map((kind) => (
        <div className="secret-row" key={kind}>
          <span>{secretLabels[kind]}</span>
          {account.secretKinds.includes(kind) ? (
            <>
              {visible[kind] === undefined ? (
                <span className="secret-mask">••••••••</span>
              ) : (
                <textarea
                  readOnly
                  aria-label={`已显示的${secretLabels[kind]}`}
                  value={visible[kind]}
                  spellCheck={false}
                  rows={kind === 'privateKey' ? 5 : 1}
                />
              )}
              <button
                className="icon-button"
                aria-label={`${visible[kind] === undefined ? '查看' : '隐藏'}${secretLabels[kind]}`}
                onClick={() => void reveal(kind)}
              >
                {visible[kind] === undefined ? <EyeIcon size={16} /> : <EyeSlashIcon size={16} />}
              </button>
              <button
                className="icon-button"
                aria-label={`修改${secretLabels[kind]}`}
                onClick={() => void edit(kind)}
              >
                <PencilSimpleIcon size={15} />
              </button>
            </>
          ) : (
            <>
              <span className="secret-empty">未保存</span>
              <button
                className="text-button"
                aria-label={`添加${secretLabels[kind]}`}
                onClick={() => void edit(kind)}
              >
                <PlusIcon size={14} />
                添加
              </button>
            </>
          )}
        </div>
      ))}
      {editing && (
        <Dialog
          title={`编辑${secretLabels[editing]}`}
          onClose={() => !busy && close()}
          error={error}
        >
          <p>
            单独加密保存。
            {account.secretKinds.includes(editing)
              ? '输入新内容会替换现有秘密。'
              : '普通说明不会自动加密。'}
          </p>
          <label>
            秘密内容
            {editing === 'privateKey' ? (
              <textarea
                aria-label="秘密内容"
                className={`secret-input ${showInput ? '' : 'masked-secret'}`}
                autoFocus
                value={value}
                onChange={(event) => setValue(event.target.value)}
                spellCheck={false}
              />
            ) : (
              <input
                type={showInput ? 'text' : 'password'}
                aria-label="秘密内容"
                autoFocus
                autoComplete="off"
                value={value}
                onChange={(event) => setValue(event.target.value)}
              />
            )}
          </label>
          <label className="secret-show">
            <input
              type="checkbox"
              checked={showInput}
              onChange={(event) => setShowInput(event.target.checked)}
            />
            显示输入
          </label>
          <div className="modal-actions">
            {account.secretKinds.includes(editing) && (
              <button
                className="text-button danger-text"
                disabled={busy}
                onClick={() => void save(true)}
              >
                移除秘密
              </button>
            )}
            <span className="spacer" />
            <button className="secondary-button" disabled={busy} onClick={close}>
              取消
            </button>
            <button
              className="primary-button"
              disabled={busy || !value}
              onClick={() => void save()}
            >
              保存秘密
            </button>
          </div>
        </Dialog>
      )}
    </section>
  );
}
