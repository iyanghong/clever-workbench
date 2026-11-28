import { Button, Input, type InputRef } from 'antd';
import { useEffect, useRef, useState } from 'react';
import { Dialog } from '../../shared/Dialog';
export const masterPasswordActions = {
  change: {
    title: '更改主密码',
    description: '只更改本机凭据的解锁密码。成功后需重新解锁，备份密码保持不变。',
    submit: '保存新主密码',
    success: '主密码已更改，秘密已锁定。备份密码保持不变。',
  },
  disable: {
    title: '关闭主密码',
    description:
      '验证当前主密码后，凭据改由系统账户加密保管，日常无需应用主密码。备份密码保持不变。',
    submit: '验证并关闭主密码',
    success: '主密码已关闭，凭据由系统加密保护。',
  },
  macUnlock: {
    title: '启用 Mac 系统解锁',
    description:
      '先输入工作台主密码，再按 macOS 提示验证指纹或 Mac 登录密码。授权仅在这台 Mac 生效。',
    submit: '继续系统验证',
    success: '已启用 Mac 系统解锁。',
  },
} as const;
export type MasterPasswordAction = keyof typeof masterPasswordActions;
export function MasterPasswordDialog({
  onClose,
  onSuccess,
  action,
}: {
  onClose: () => void;
  onSuccess: () => void;
  action: MasterPasswordAction;
}) {
  const changing = action === 'change';
  const labels = masterPasswordActions[action];
  const [current, setCurrent] = useState(''),
    [next, setNext] = useState(''),
    [confirmation, setConfirmation] = useState(''),
    [busy, setBusy] = useState(false),
    [error, setError] = useState('');
  const working = useRef(false);
  const currentInput = useRef<InputRef>(null);
  const clear = () => {
    setCurrent('');
    setNext('');
    setConfirmation('');
  };
  useEffect(
    () =>
      window.desktop.onVaultStatus((status) => {
        if (!status.unlocked) clear();
      }),
    [],
  );
  function close() {
    if (!working.current) {
      clear();
      onClose();
    }
  }
  async function submit() {
    if (working.current) return;
    if (changing && next !== confirmation) {
      setError('两次输入的新主密码不一致。');
      return;
    }
    if (changing && (next.length < 6 || next.length > 1024)) {
      setError('新主密码需为 6 到 1024 个字符。');
      return;
    }
    working.current = true;
    setBusy(true);
    setError('');
    try {
      if (changing) await window.desktop.rotateVault(current, next);
      else if (action === 'macUnlock') await window.desktop.enableMacUnlock(current);
      else await window.desktop.disableMasterPassword(current);
      clear();
      onSuccess();
    } catch (cause) {
      setError(String(cause).replace(/^Error: Error invoking remote method '[^']+': Error: /, ''));
    } finally {
      working.current = false;
      setBusy(false);
    }
  }
  return (
    <Dialog
      title={labels.title}
      onClose={close}
      closeDisabled={busy}
      error={error}
      onShown={() => currentInput.current?.focus({ preventScroll: true })}
    >
      <p>{labels.description}</p>
      <form
        onSubmit={(event) => {
          event.preventDefault();
          void submit();
        }}
      >
        <label>
          当前主密码
          <Input.Password
            aria-label="当前主密码"
            ref={currentInput}
            autoComplete="off"
            required
            maxLength={1024}
            value={current}
            onChange={(event) => setCurrent(event.target.value)}
            disabled={busy}
          />
        </label>
        {changing && (
          <>
            <label>
              新主密码
              <Input.Password
                aria-label="新主密码"
                autoComplete="off"
                required
                maxLength={1024}
                value={next}
                onChange={(event) => setNext(event.target.value)}
                disabled={busy}
              />
            </label>
            <label>
              确认新主密码
              <Input.Password
                aria-label="确认新主密码"
                autoComplete="off"
                required
                maxLength={1024}
                value={confirmation}
                onChange={(event) => setConfirmation(event.target.value)}
                disabled={busy}
              />
            </label>
            <p className="field-hint">
              至少 6 个字符。成功后秘密会重新锁定，下次查看时用新密码解锁。
            </p>
          </>
        )}
        <div className="modal-actions">
          <Button
            type="default"
            htmlType="button"
            className="secondary-button"
            onClick={close}
            disabled={busy}
          >
            取消
          </Button>
          <Button
            type="primary"
            htmlType="submit"
            className="primary-button"
            disabled={busy || !current || (changing && (!next || !confirmation))}
          >
            {busy
              ? action === 'macUnlock'
                ? '等待系统验证…'
                : '正在转换保护方式…'
              : labels.submit}
          </Button>
        </div>
      </form>
    </Dialog>
  );
}
