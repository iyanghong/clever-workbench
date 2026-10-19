import { useEffect, useRef, useState } from 'react';
import { Dialog } from '../../shared/Dialog';
export function PasswordChange({
  onClose,
  onSuccess,
}: {
  onClose: () => void;
  onSuccess: () => void;
}) {
  const [current, setCurrent] = useState(''),
    [next, setNext] = useState(''),
    [confirmation, setConfirmation] = useState(''),
    [busy, setBusy] = useState(false),
    [error, setError] = useState('');
  const working = useRef(false);
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
    if (next !== confirmation) {
      setError('两次输入的新主密码不一致。');
      return;
    }
    if (next.length < 6 || next.length > 1024) {
      setError('新主密码需为 6 到 1024 个字符。');
      return;
    }
    working.current = true;
    setBusy(true);
    setError('');
    try {
      await window.desktop.rotateVault(current, next);
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
    <Dialog title="更改主密码" onClose={close} error={error}>
      <p>当前秘密和之后生成的备份将使用新密码。已有备份仍使用生成时的密码，请保留对应密码。</p>
      <form
        onSubmit={(event) => {
          event.preventDefault();
          void submit();
        }}
      >
        <label>
          当前主密码
          <input
            type="password"
            aria-label="当前主密码"
            autoFocus
            autoComplete="off"
            required
            maxLength={1024}
            value={current}
            onChange={(event) => setCurrent(event.target.value)}
            disabled={busy}
          />
        </label>
        <label>
          新主密码
          <input
            type="password"
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
          <input
            type="password"
            aria-label="确认新主密码"
            autoComplete="off"
            required
            maxLength={1024}
            value={confirmation}
            onChange={(event) => setConfirmation(event.target.value)}
            disabled={busy}
          />
        </label>
        <p className="field-hint">至少 6 个字符。成功后秘密会重新锁定，下次查看时用新密码解锁。</p>
        <div className="modal-actions">
          <button type="button" className="secondary-button" onClick={close} disabled={busy}>
            取消
          </button>
          <button
            type="submit"
            className="primary-button"
            disabled={busy || !current || !next || !confirmation}
          >
            {busy ? '正在更改…' : '保存新主密码'}
          </button>
        </div>
      </form>
    </Dialog>
  );
}
