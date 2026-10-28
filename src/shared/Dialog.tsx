import { closeNewRecord } from './new-record';
import { XIcon } from '@phosphor-icons/react';
import { useLayoutEffect, useRef, useState, type ReactNode } from 'react';

export function Dialog({
  title,
  children,
  onClose,
  error,
  className = 'modal',
  description,
  closeLabel,
  closeDisabled = false,
  onShown,
  exclusive = false,
  canShow,
}: {
  title: string;
  children: ReactNode;
  onClose: () => void;
  error?: string;
  className?: string;
  description?: string;
  closeLabel?: string;
  closeDisabled?: boolean;
  onShown?: () => void;
  /** Low-priority prompts wait for all other modals; ordinary business dialogs may still nest. */
  exclusive?: boolean;
  canShow?: () => boolean;
}) {
  const closeRef = useRef(onClose);
  closeRef.current = onClose;
  const [discard, setDiscard] = useState<(() => void) | null>(null);
  const dialog = useRef<HTMLDialogElement>(null);
  const shown = useRef(onShown);
  shown.current = onShown;
  const guard = useRef(canShow);
  guard.current = canShow;
  useLayoutEffect(() => {
    let previous: HTMLElement | null = null;
    let presented = false;
    let observer: MutationObserver | undefined;
    const element = dialog.current;
    if (!element) return;
    const requestDiscard = (event: Event) => {
      if ((event.target as HTMLElement).closest('dialog') !== element) return;
      event.stopPropagation();
      if (element.querySelector('form[aria-busy="true"]')) return;
      const close = (event as CustomEvent<() => void>).detail ?? (() => closeRef.current());
      setDiscard(() => () => {
        const form = element.querySelector<HTMLFormElement>('form[data-new-record]');
        if (form) form.dataset.dirty = 'false';
        setDiscard(null);
        close();
      });
    };
    element.addEventListener('record-discard', requestDiscard);
    const tryShow = () => {
      if (element.open || !element.isConnected || (guard.current && !guard.current())) return;
      const others = [...document.querySelectorAll('dialog[open], [role="alertdialog"]')].filter(
        (item) => item !== element,
      );
      if (others.some((item) => exclusive || item.hasAttribute('data-exclusive-dialog'))) return;
      previous = document.activeElement instanceof HTMLElement ? document.activeElement : null;
      try {
        // Check and show are synchronous, so two queued React dialogs cannot both claim the slot.
        element.style.display = '';
        element.showModal();
        if (element.open && element.getClientRects().length) {
          presented = true;
          observer?.disconnect();
          shown.current?.();
        }
      } catch {
        element.style.display = 'none';
      }
    };
    tryShow();
    if (!presented) {
      observer = new MutationObserver(tryShow);
      observer.observe(document.body, {
        subtree: true,
        childList: true,
        attributes: true,
        attributeFilter: ['open'],
      });
      document.addEventListener('guidance-dialog-retry', tryShow);
      document.addEventListener('visibilitychange', tryShow);
      window.addEventListener('focus', tryShow);
    }
    return () => {
      element.removeEventListener('record-discard', requestDiscard);
      observer?.disconnect();
      document.removeEventListener('guidance-dialog-retry', tryShow);
      document.removeEventListener('visibilitychange', tryShow);
      window.removeEventListener('focus', tryShow);
      element.close();
      if (presented && previous?.isConnected) previous.focus({ preventScroll: true });
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
      data-exclusive-dialog={exclusive ? '' : undefined}
      style={{ display: 'none' }}
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
