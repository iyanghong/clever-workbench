import { closeNewRecord } from './new-record';
import { XIcon } from '@phosphor-icons/react';
import { useEffect, useRef, useState, type ReactNode } from 'react';

export function Dialog({
  title,
  children,
  onClose,
  error,
  className = 'modal',
  description,
  closeLabel,
  closeDisabled = false,
}: {
  title: string;
  children: ReactNode;
  onClose: () => void;
  error?: string;
  className?: string;
  description?: string;
  closeLabel?: string;
  closeDisabled?: boolean;
}) {
  const closeRef = useRef(onClose);
  closeRef.current = onClose;
  const [discard, setDiscard] = useState<(() => void) | null>(null);
  const dialog = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    const previous = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    const element = dialog.current;
    const request = (event: Event) => {
      if ((event.target as HTMLElement).closest('dialog') !== element) return;
      event.stopPropagation();
      if (element?.querySelector('form[aria-busy="true"]')) return;
      const close = (event as CustomEvent).detail ?? (() => closeRef.current());
      setDiscard(() => () => {
        const form = element?.querySelector<HTMLFormElement>('form[data-new-record]');
        if (form) form.dataset.dirty = 'false';
        setDiscard(null);
        close();
      });
    };
    element?.addEventListener('record-discard', request);
    element?.showModal();
    return () => {
      element?.removeEventListener('record-discard', request);
      element?.close();
      if (previous?.isConnected) previous.focus({ preventScroll: true });
    };
  }, []);
  function requestClose() {
    if (closeDisabled || dialog.current?.querySelector('form[aria-busy="true"]')) return;
    if (dialog.current?.querySelector('form[data-new-record][data-dirty="true"]'))
      closeNewRecord(onClose);
    else onClose();
  }
  return (
    <dialog
      ref={dialog}
      className={`${className} shared-dialog`}
      aria-label={title}
      onCancel={(event) => {
        event.preventDefault();
        event.stopPropagation();
        requestClose();
      }}
    >
      <header className="dialog-header">
        <div>
          <h2>{title}</h2>
          {description && <p>{description}</p>}
        </div>
        <button
          type="button"
          className="icon-button dialog-close"
          aria-label={closeLabel ?? `关闭${title}`}
          title="关闭"
          disabled={closeDisabled}
          onClick={requestClose}
        >
          <XIcon size={18} />
        </button>
      </header>
      {children}
      {discard && (
        <Dialog title="放弃未提交的资料？" onClose={() => setDiscard(null)}>
          <p>已填写的内容尚未保存，可以继续填写或明确放弃。</p>
          <div className="modal-actions">
            <button type="button" className="secondary-button" onClick={() => setDiscard(null)}>
              继续填写
            </button>
            <button type="button" className="danger-button" onClick={discard}>
              放弃录入
            </button>
          </div>
        </Dialog>
      )}
      {error && (
        <p role="alert" className="error-text">
          {error.replace(/^Error: Error invoking remote method '[^']+': Error: /, '')}
        </p>
      )}
    </dialog>
  );
}
