import type { Snapshot } from '../../types';
import {
  createContext,
  useContext,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  type ReactNode,
} from 'react';
import { CopyIcon } from '@phosphor-icons/react';
import type {
  LedgerCopyRef,
  LedgerCopySelection,
  LedgerCopyPreview,
} from '../../ledger-copy-types';
import { Dialog } from '../../shared/Dialog';
import { useVault } from '../vault/VaultProvider';
import { CopyValue } from '../../shared/CopyValue';

type Context = {
  selected: LedgerCopyRef[];
  setSelected: (refs: LedgerCopyRef[]) => void;
  resolveValue: (read: (snapshot: Snapshot) => string) => Promise<string>;
  busy: boolean;
  copy: (objects: LedgerCopyRef[]) => Promise<void>;
  choose: (objects: LedgerCopyRef[]) => Promise<void>;
};
const CopyContext = createContext<Context | null>(null);
function useCopy() {
  const context = useContext(CopyContext);
  if (!context) throw new Error('缺少资料复制上下文。');
  return context;
}
const same = (a: LedgerCopyRef, b: LedgerCopyRef) => a.kind === b.kind && a.id === b.id;
export function LedgerCopyProvider({
  scopeKey,
  systemId,
  environment,
  beforeCopy,
  onError,
  children,
}: {
  scopeKey: string;
  systemId: string;
  environment: string;
  beforeCopy: () => Promise<void>;
  onError: (message: string) => void;
  children: ReactNode;
}) {
  const vault = useVault(),
    generation = useRef(0),
    working = useRef(false);
  const [selected, setSelected] = useState<LedgerCopyRef[]>([]),
    [busy, setBusy] = useState(false),
    [notice, setNotice] = useState('');
  const [dialog, setDialog] = useState<{
    selection: LedgerCopySelection;
    preview: LedgerCopyPreview;
  } | null>(null);
  const [accounts, setAccounts] = useState<string[]>([]),
    [passwords, setPasswords] = useState(false),
    [error, setError] = useState('');
  useLayoutEffect(() => {
    generation.current++;
    working.current = false;
    setBusy(false);
    setSelected([]);
    setDialog(null);
    setAccounts([]);
    setPasswords(false);
    setError('');
    setNotice('');
  }, [scopeKey]);
  useEffect(
    () => () => {
      generation.current++;
    },
    [],
  );
  useEffect(() => {
    if (!notice) return;
    const timer = setTimeout(() => setNotice(''), 5000);
    return () => clearTimeout(timer);
  }, [notice]);
  async function perform(
    objects: LedgerCopyRef[],
    withAccounts = false,
    accountIds: string[] = [],
    includePasswords = false,
  ) {
    if (working.current) return;
    working.current = true;
    setBusy(true);
    setError('');
    setNotice('');
    const request = generation.current;
    try {
      await beforeCopy();
      if (request !== generation.current) return;
      const selection = { systemId, environment, objects };
      if (withAccounts) {
        const preview = await window.desktop.previewLedgerCopy(selection);
        if (request !== generation.current) return;
        setAccounts([]);
        setPasswords(false);
        setDialog({ selection, preview });
        return;
      }
      if (includePasswords && accountIds.length) {
        const preview = await window.desktop.previewLedgerCopy(selection);
        if (request !== generation.current) return;
        if (
          preview.accounts.some((a) => accountIds.includes(a.id) && a.hasPassword) &&
          !(await vault.ensureUnlocked())
        )
          return;
        if (request !== generation.current) return;
      }
      await window.desktop.copyLedger({ ...selection, accountIds, includePasswords });
      if (request !== generation.current) return;
      setNotice(includePasswords ? '已复制资料 · 含密码的内容将在 30 秒后清理' : '已复制资料');
      setDialog(null);
    } catch (cause) {
      if (request === generation.current) {
        setError(String(cause));
        onError(String(cause));
      }
    } finally {
      if (request === generation.current) {
        working.current = false;
        setBusy(false);
      }
    }
  }
  return (
    <CopyContext.Provider
      value={{
        selected,
        setSelected,
        resolveValue: async (read) => {
          const request = generation.current;
          await beforeCopy();
          const snapshot = await window.desktop.snapshot();
          if (request !== generation.current) throw new Error('复制范围已改变，请重新操作。');
          return read(snapshot);
        },
        busy,
        copy: (objects) => perform(objects),
        choose: (objects) => perform(objects, true),
      }}
    >
      {children}
      {notice && (
        <div className="toast" role="status">
          {notice}
        </div>
      )}
      {dialog && (
        <Dialog
          title="复制资料 · 包含账号"
          description="仅附带本次勾选的账号，密码需要另外选择。"
          closeDisabled={busy}
          onClose={() => {
            if (!busy) setDialog(null);
          }}
          error={error}
        >
          <p>
            {dialog.preview.titles.length} 条资料 · {dialog.preview.environment}
          </p>
          <details className="compact-details">
            <summary>查看资料范围</summary>
            {dialog.preview.titles.map((title, i) => (
              <p key={i}>{title}</p>
            ))}
          </details>
          <div className="copy-account-options">
            {dialog.preview.accounts.map((a) => (
              <label key={a.id}>
                <input
                  type="checkbox"
                  disabled={busy}
                  checked={accounts.includes(a.id)}
                  onChange={(e) =>
                    setAccounts((previous) =>
                      e.target.checked ? [...previous, a.id] : previous.filter((id) => id !== a.id),
                    )
                  }
                  aria-label={`附带账号 ${a.ownerName} / ${a.name}`}
                />
                <span>
                  <strong>
                    {a.ownerName} / {a.name}
                  </strong>
                  <small>
                    {a.username || '未填写用户名'}
                    {!a.hasPassword ? ' · 未保存密码' : ''}
                  </small>
                </span>
              </label>
            ))}
            {!dialog.preview.accounts.length && (
              <p className="secondary-copy">本次范围没有可附带的账号。</p>
            )}
          </div>
          <label className="copy-password-option">
            <input
              type="checkbox"
              disabled={busy || !accounts.length}
              checked={passwords}
              onChange={(e) => setPasswords(e.target.checked)}
            />
            包含密码
          </label>
          <div className="modal-actions">
            <span>已选 {accounts.length} 个账号</span>
            <button className="secondary-button" disabled={busy} onClick={() => setDialog(null)}>
              取消
            </button>
            <button
              className="primary-button"
              disabled={busy || !accounts.length}
              onClick={() => void perform(dialog.selection.objects, false, accounts, passwords)}
            >
              {busy ? '复制中…' : '复制资料'}
            </button>
          </div>
        </Dialog>
      )}
    </CopyContext.Provider>
  );
}
export function LedgerCopyActions({
  objects,
  name = '资料',
}: {
  objects: LedgerCopyRef[];
  name?: string;
}) {
  const c = useCopy();
  return (
    <span className="ledger-copy-actions">
      <button
        type="button"
        className="text-button"
        disabled={c.busy || !objects.length}
        aria-label={`复制资料 ${name}`}
        onClick={() => void c.copy(objects)}
      >
        <CopyIcon size={15} />
        复制资料
      </button>
      <button
        type="button"
        className="text-button copy-with-accounts"
        disabled={c.busy || !objects.length}
        aria-label={`包含账号 ${name}`}
        onClick={() => void c.choose(objects)}
      >
        包含账号…
      </button>
    </span>
  );
}
export function LedgerCopyCheckbox({ object, name }: { object: LedgerCopyRef; name: string }) {
  const c = useCopy();
  return (
    <input
      type="checkbox"
      className="ledger-copy-check"
      aria-label={`选择资料 ${name}`}
      disabled={c.busy}
      checked={c.selected.some((r) => same(r, object))}
      onChange={(e) =>
        c.setSelected(
          e.target.checked ? [...c.selected, object] : c.selected.filter((r) => !same(r, object)),
        )
      }
    />
  );
}
export function LedgerCopySelectionBar({ objects }: { objects: LedgerCopyRef[] }) {
  const c = useCopy(),
    selectAll = useRef<HTMLInputElement>(null),
    selected = objects.filter((r) => c.selected.some((s) => same(r, s)));
  return (
    <div className="ledger-copy-selection">
      <label>
        <input
          type="checkbox"
          aria-label="选择当前资料结果"
          ref={selectAll}
          disabled={c.busy || !objects.length}
          checked={objects.length > 0 && selected.length === objects.length}
          onChange={(e) => c.setSelected(e.target.checked ? objects : [])}
        />
        选择当前结果
      </label>
      <span>已选 {selected.length} 项</span>
      {selected.length > 0 && (
        <>
          <button className="text-button" disabled={c.busy} onClick={() => void c.copy(selected)}>
            复制所选资料
          </button>
          <button className="text-button" disabled={c.busy} onClick={() => void c.choose(selected)}>
            所选资料包含账号…
          </button>
          <button
            className="text-button"
            disabled={c.busy}
            onClick={() => {
              c.setSelected([]);
              selectAll.current?.focus();
            }}
          >
            取消选择
          </button>
        </>
      )}
    </div>
  );
}
export function CopyableField({
  value,
  label,
  onError,
  currentValue,
}: {
  value: string;
  label: string;
  onError: (message: string) => void;
  currentValue: (snapshot: Snapshot) => string;
}) {
  const copying = useCopy();
  return (
    <span className="ledger-copy-field">
      <span>{value || '—'}</span>
      <span className="field-copy-action">
        <CopyValue
          value={value}
          label={label}
          onError={onError}
          resolveValue={() => copying.resolveValue(currentValue)}
        />
      </span>
    </span>
  );
}
