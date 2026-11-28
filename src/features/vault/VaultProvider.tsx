import { Button, Checkbox, Input, type InputRef } from 'antd';
import { createContext, useContext, useEffect, useRef, useState, type ReactNode } from 'react';
import { FingerprintIcon, LockKeyIcon, LockKeyOpenIcon } from '@phosphor-icons/react';
import type { VaultStatus } from '../../vault-types';
import { Dialog } from '../../shared/Dialog';
import { useMacUnlockAvailable } from './useMacUnlockAvailable';
type VaultContextValue = {
  status: VaultStatus;
  ensureUnlocked: () => Promise<boolean>;
  ensureBackup: (change?: boolean) => Promise<boolean>;
  enableMaster: () => Promise<boolean>;
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
    [busy, setBusy] = useState<'password' | 'macUnlock' | null>(null);
  const [backupOpen, setBackupOpen] = useState(false),
    [backupPassword, setBackupPassword] = useState(''),
    [backupConfirmation, setBackupConfirmation] = useState(''),
    [backupError, setBackupError] = useState(''),
    [backupBusy, setBackupBusy] = useState(false);
  const request = useRef<{ promise: Promise<boolean>; resolve: (value: boolean) => void } | null>(
      null,
    ),
    attempt = useRef(0);
  const backupRequest = useRef<{
    promise: Promise<boolean>;
    resolve: (value: boolean) => void;
  } | null>(null);
  const backupAttempt = useRef(0);
  const masterInput = useRef<InputRef>(null);
  const unlocking = useRef(false);
  const [macUnlockNotice, setMacUnlockNotice] = useState('');
  const [enrollMac, setEnrollMac] = useState(false);
  const macMode = status.macUnlockMode ?? 'off';
  const canEnrollMac = useMacUnlockAvailable(open && status.initialized && macMode !== 'system');
  function finish(value: boolean) {
    request.current?.resolve(value);
    request.current = null;
    setOpen(false);
    setPassword('');
    setConfirmation('');
    setError('');
    setMacUnlockNotice('');
    setEnrollMac(false);
  }
  function finishBackup(value: boolean) {
    backupRequest.current?.resolve(value);
    backupRequest.current = null;
    setBackupOpen(false);
    setBackupPassword('');
    setBackupConfirmation('');
    setBackupError('');
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
        unlocking.current = false;
        setBusy(null);
        backupAttempt.current++;
        finishBackup(false);
        setBackupBusy(false);
      }
    });
  }, []);
  useEffect(() => {
    if (!status.unlocked) return;
    const events = ['pointerdown', 'pointermove', 'keydown', 'wheel', 'focus'] as const;
    let lastReport = 0;
    let lastActivity = 0;
    let pending: number | undefined;
    const report = () => {
      window.clearTimeout(pending);
      pending = undefined;
      lastReport = Date.now();
      void window.desktop.vaultActivity(lastActivity).catch(() => {});
    };
    const activity = () => {
      lastActivity = Date.now();
      const remaining = lastReport + 10_000 - lastActivity;
      if (remaining <= 0) report();
      else if (pending === undefined) pending = window.setTimeout(report, remaining);
    };
    for (const event of events)
      window.addEventListener(event, activity, { passive: true, capture: event !== 'focus' });
    return () => {
      window.clearTimeout(pending);
      for (const event of events) window.removeEventListener(event, activity, event !== 'focus');
    };
  }, [status.unlocked]);
  async function ensureUnlocked() {
    const current = await window.desktop.vaultStatus();
    setStatus(current);
    if (current.unlocked) return true;
    if (current.mode === 'system') {
      await window.desktop.unlockSystemVault();
      setStatus(await window.desktop.vaultStatus());
      return true;
    }
    return requestPassword();
  }
  function requestPassword() {
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
  async function enableMaster() {
    const current = await window.desktop.vaultStatus();
    setStatus(current);
    if (current.initialized) return true;
    return requestPassword();
  }
  async function ensureBackup(change = false) {
    const current = await window.desktop.vaultStatus();
    setStatus(current);
    if (current.backupConfigured && !change) return true;
    // System protection is requested by configureBackup only after the user confirms saving.
    if (current.mode !== 'system' && !(await ensureUnlocked())) return false;
    if (backupRequest.current) return backupRequest.current.promise;
    let resolve!: (value: boolean) => void;
    const promise = new Promise<boolean>((done) => {
      resolve = done;
    });
    backupRequest.current = { promise, resolve };
    setBackupOpen(true);
    return promise;
  }
  async function cancelBackupSetup() {
    backupAttempt.current++;
    finishBackup(false);
    setBackupBusy(false);
    if (backupBusy) await window.desktop.lockVault();
  }
  async function saveBackupPassword() {
    if (backupBusy) return;
    if (backupPassword !== backupConfirmation) {
      setBackupError('两次备份密码不一致。');
      return;
    }
    const attempt = ++backupAttempt.current;
    setBackupBusy(true);
    setBackupError('');
    try {
      await window.desktop.configureBackup(backupPassword);
      if (attempt !== backupAttempt.current) return;
      setStatus(await window.desktop.vaultStatus());
      finishBackup(true);
    } catch (cause) {
      if (attempt === backupAttempt.current)
        setBackupError(String(cause).replace(/^Error:.*?Error: /, ''));
    } finally {
      if (attempt === backupAttempt.current) setBackupBusy(false);
    }
  }
  async function cancel() {
    const pending = unlocking.current;
    unlocking.current = false;
    attempt.current++;
    finish(false);
    setBusy(null);
    if (pending) await window.desktop.lockVault();
  }
  async function unlock(method: 'password' | 'macUnlock' = 'password') {
    if (unlocking.current || !request.current) return;
    if (!status.initialized && password !== confirmation) {
      setError('两次主密码不一致。');
      return;
    }
    const generation = ++attempt.current;
    unlocking.current = true;
    setBusy(method);
    setError('');
    setMacUnlockNotice('');
    try {
      if (method === 'macUnlock') await window.desktop.unlockWithMac();
      else if (status.initialized && enrollMac)
        await window.desktop.enableMacUnlock(password, true);
      else if (status.initialized) await window.desktop.unlockVault(password);
      else await window.desktop.initializeVault(password);
      if (generation !== attempt.current) return;
      const next = await window.desktop.vaultStatus();
      if (generation !== attempt.current) return;
      setStatus(next);
      finish(next.unlocked);
    } catch (cause) {
      if (generation === attempt.current) {
        const message = String(cause).replace(/^Error:.*?Error: /, '');
        if (method === 'macUnlock') setMacUnlockNotice(message);
        else setError(message);
        masterInput.current?.focus({ preventScroll: true });
      }
    } finally {
      if (generation === attempt.current) {
        unlocking.current = false;
        setBusy(null);
      }
    }
  }
  return (
    <VaultContext.Provider
      value={{
        status,
        ensureUnlocked,
        ensureBackup,
        enableMaster,
        lock: () => window.desktop.lockVault(),
      }}
    >
      {children}
      {open && (
        <Dialog
          title={status.initialized ? '解锁秘密' : '设置主密码'}
          onClose={() => void cancel()}
          onShown={() => {
            masterInput.current?.focus({ preventScroll: true });
            if (status.initialized && macMode !== 'off') void unlock('macUnlock');
          }}
          error={error}
        >
          <p role={macUnlockNotice ? 'status' : undefined}>
            {status.initialized
              ? macUnlockNotice ||
                (macMode === 'system'
                  ? '在 macOS 面板中按指纹或选择使用 Mac 登录密码，也可在此输入工作台主密码。'
                  : '解锁后可以访问秘密。普通台账与文档始终可用。')
              : '主密码用于本机凭据解锁，至少 6 个字符。备份密码单独管理。忘记主密码时可用完整备份恢复凭据。'}
          </p>
          <label>
            主密码
            <Input.Password
              aria-label="主密码"
              ref={masterInput}
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
              <Input.Password
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
          {(canEnrollMac || enrollMac) && macMode !== 'system' && (
            <Checkbox
              className="mac-unlock-opt-in"
              checked={enrollMac}
              disabled={Boolean(busy)}
              onChange={(event) => setEnrollMac(event.target.checked)}
            >
              启用指纹或 Mac 登录密码解锁
            </Checkbox>
          )}
          <div className="modal-actions">
            {macMode !== 'off' && (
              <Button
                htmlType="button"
                className="vault-mac-unlock"
                icon={<FingerprintIcon size={16} />}
                disabled={Boolean(busy)}
                onClick={() => void unlock('macUnlock')}
              >
                {busy === 'macUnlock'
                  ? '等待系统验证…'
                  : macMode === 'touchID'
                    ? '使用 Touch ID'
                    : '使用 Mac 系统验证'}
              </Button>
            )}
            <Button
              htmlType="submit"
              type="default"
              className="secondary-button"
              onClick={() => void cancel()}
            >
              取消
            </Button>
            <Button
              htmlType="submit"
              type="primary"
              className="primary-button"
              disabled={Boolean(busy) || !password || (!status.initialized && password.length < 6)}
              onClick={() => void unlock()}
            >
              {busy === 'password'
                ? enrollMac
                  ? '等待系统验证…'
                  : '处理中…'
                : enrollMac
                  ? '解锁并启用'
                  : status.initialized
                    ? '解锁'
                    : '设置并解锁'}
            </Button>
          </div>
        </Dialog>
      )}
      {backupOpen && (
        <Dialog
          title={status.backupConfigured ? '更改备份密码' : '设置备份密码'}
          onClose={() => void cancelBackupSetup()}
          error={backupError}
        >
          <p>
            备份密码用于恢复全部资料，日常使用和自动备份无需输入。更改后仅影响新备份，旧备份仍使用生成时的密码。
          </p>
          <label>
            备份密码
            <Input.Password
              aria-label="备份密码"
              autoFocus
              autoComplete="new-password"
              value={backupPassword}
              onChange={(event) => setBackupPassword(event.target.value)}
            />
          </label>
          <label>
            确认备份密码
            <Input.Password
              aria-label="确认备份密码"
              autoComplete="new-password"
              value={backupConfirmation}
              onChange={(event) => setBackupConfirmation(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === 'Enter' && !event.nativeEvent.isComposing)
                  void saveBackupPassword();
              }}
            />
          </label>
          <div className="modal-actions">
            <Button
              htmlType="submit"
              type="default"
              className="secondary-button"
              onClick={() => void cancelBackupSetup()}
            >
              取消
            </Button>
            <Button
              htmlType="submit"
              type="primary"
              className="primary-button"
              disabled={backupBusy || backupPassword.length < 6}
              onClick={() => void saveBackupPassword()}
            >
              {backupBusy ? '正在保护备份…' : '保存并继续'}
            </Button>
          </div>
        </Dialog>
      )}
    </VaultContext.Provider>
  );
}
export function VaultControl() {
  const { status, lock, ensureUnlocked } = useVault();
  if (status.mode === 'system')
    return (
      <div className="vault-control" aria-label="系统加密保护">
        <LockKeyIcon size={15} />
        <span>系统加密保护</span>
      </div>
    );
  return (
    <Button
      htmlType="submit"
      type="text"
      className="vault-control"
      aria-label={status.unlocked ? '锁定秘密' : status.initialized ? '解锁秘密' : '设置主密码'}
      onClick={() => void (status.unlocked ? lock() : ensureUnlocked()).catch(() => {})}
    >
      {status.unlocked ? <LockKeyOpenIcon size={15} /> : <LockKeyIcon size={15} />}
      <span>
        {status.unlocked ? '秘密已解锁' : status.initialized ? '秘密已锁定' : '设置主密码'}
      </span>
      {status.unlocked && <small>锁定</small>}
    </Button>
  );
}
