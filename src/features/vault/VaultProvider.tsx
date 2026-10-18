import { createContext, useContext, useEffect, useRef, useState, type ReactNode } from 'react';
import { LockKeyIcon, LockKeyOpenIcon } from '@phosphor-icons/react';
import type { VaultStatus } from '../../vault-types';
import { Dialog } from '../../shared/Dialog';
type VaultContextValue = {
  status: VaultStatus;
  ensureUnlocked: () => Promise<boolean>;
  lock: () => Promise<void>;
};
const VaultContext = createContext<VaultContextValue | null>(null);
export function useVault() {
  const value = useContext(VaultContext);
  if (!value) throw new Error('缺少秘密会话。');
  return value;
}

export function VaultProvider({ children }: { children: ReactNode }) {
  const [status, setStatus] = useState<VaultStatus>({ initialized: false, unlocked: false });
  const [open, setOpen] = useState(false),
    [password, setPassword] = useState(''),
    [confirmation, setConfirmation] = useState(''),
    [error, setError] = useState(''),
    [busy, setBusy] = useState(false);
  const request = useRef<{ promise: Promise<boolean>; resolve: (value: boolean) => void } | null>(
      null,
    ),
    attempt = useRef(0);
  function finish(value: boolean) {
    request.current?.resolve(value);
    request.current = null;
    setOpen(false);
    setPassword('');
    setConfirmation('');
    setError('');
  }
  useEffect(() => {
    void window.desktop
      .vaultStatus()
      .then(setStatus)
      .catch(() => {});
    return window.desktop.onVaultStatus((next) => {
      setStatus(next);
      if (!next.unlocked) {
        attempt.current++;
        finish(false);
        setBusy(false);
      }
    });
  }, []);
  useEffect(() => {
    let last = 0;
    const activity = () => {
      if (Date.now() - last < 10_000) return;
      last = Date.now();
      void window.desktop.vaultActivity().catch(() => {});
    };
    for (const event of ['pointerdown', 'keydown', 'wheel', 'focus'])
      window.addEventListener(event, activity, { passive: true });
    return () => {
      for (const event of ['pointerdown', 'keydown', 'wheel', 'focus'])
        window.removeEventListener(event, activity);
    };
  }, []);
  async function ensureUnlocked() {
    const current = await window.desktop.vaultStatus();
    setStatus(current);
    if (current.unlocked) return true;
    if (request.current) return request.current.promise;
    let resolve!: (value: boolean) => void;
    const promise = new Promise<boolean>((done) => {
      resolve = done;
    });
    request.current = { promise, resolve };
    setOpen(true);
    setError('');
    return promise;
  }
  async function cancel() {
    attempt.current++;
    finish(false);
    setBusy(false);
    await window.desktop.lockVault();
  }
  async function unlock() {
    if (busy) return;
    if (!status.initialized && password !== confirmation) {
      setError('两次主密码不一致。');
      return;
    }
    const generation = ++attempt.current;
    setBusy(true);
    setError('');
    try {
      if (status.initialized) await window.desktop.unlockVault(password);
      else await window.desktop.initializeVault(password);
      if (generation !== attempt.current) return;
      setStatus(await window.desktop.vaultStatus());
      finish(true);
    } catch (cause) {
      if (generation === attempt.current) setError(String(cause).replace(/^Error:.*?Error: /, ''));
    } finally {
      if (generation === attempt.current) setBusy(false);
    }
  }
  return (
    <VaultContext.Provider
      value={{ status, ensureUnlocked, lock: () => window.desktop.lockVault() }}
    >
      {children}
      {open && (
        <Dialog
          title={status.initialized ? '解锁秘密' : '设置主密码'}
          onClose={() => void cancel()}
          error={error}
        >
          <p>
            {status.initialized
              ? '解锁后可以访问秘密。普通台账与文档始终可用。'
              : '使用至少 12 个字符的主密码保护秘密与完整备份。忘记主密码且没有可解锁副本时，秘密无法恢复。'}
          </p>
          <label>
            主密码
            <input
              type="password"
              aria-label="主密码"
              autoFocus
              autoComplete={status.initialized ? 'current-password' : 'new-password'}
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === 'Enter' && !event.nativeEvent.isComposing) void unlock();
              }}
            />
          </label>
          {!status.initialized && (
            <label>
              确认主密码
              <input
                type="password"
                aria-label="确认主密码"
                autoComplete="new-password"
                value={confirmation}
                onChange={(event) => setConfirmation(event.target.value)}
                onKeyDown={(event) => {
                  if (event.key === 'Enter' && !event.nativeEvent.isComposing) void unlock();
                }}
              />
            </label>
          )}
          <div className="modal-actions">
            <button className="secondary-button" onClick={() => void cancel()}>
              取消
            </button>
            <button
              className="primary-button"
              disabled={busy || !password || (!status.initialized && password.length < 12)}
              onClick={() => void unlock()}
            >
              {busy ? '处理中…' : status.initialized ? '解锁' : '设置并解锁'}
            </button>
          </div>
        </Dialog>
      )}
    </VaultContext.Provider>
  );
}
export function VaultControl() {
  const { status, lock, ensureUnlocked } = useVault();
  return (
    <button
      className="vault-control"
      aria-label={status.unlocked ? '锁定秘密' : status.initialized ? '解锁秘密' : '设置主密码'}
      onClick={() => void (status.unlocked ? lock() : ensureUnlocked()).catch(() => {})}
    >
      {status.unlocked ? <LockKeyOpenIcon size={15} /> : <LockKeyIcon size={15} />}
      <span>
        {status.unlocked ? '秘密已解锁' : status.initialized ? '秘密已锁定' : '设置主密码'}
      </span>
      {status.unlocked && <small>锁定</small>}
    </button>
  );
}
