import { XIcon } from '@phosphor-icons/react';
import { useLayoutEffect, useRef, type ReactNode } from 'react';

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
  const dialog = useRef<HTMLDialogElement>(null);
  const shown = useRef(onShown);
  shown.current = onShown;
  const guard = useRef(canShow);
  guard.current = canShow;
  useLayoutEffect(() => {
    let previous: HTMLElement | null = null;
    let presented = false;
    const element = dialog.current;
    if (!element) return;
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
          shown.current?.();
        }
      } catch {
        element.style.display = 'none';
      }
    };
    tryShow();
    const timer = window.setInterval(tryShow, 100);
    return () => {
      clearInterval(timer);
      element?.close();
      if (presented && previous?.isConnected) previous.focus({ preventScroll: true });
    };
  }, []);
  return (
    <dialog
      ref={dialog}
      className={`${className} shared-dialog`}
      data-exclusive-dialog={exclusive ? '' : undefined}
      style={{ display: 'none' }}
      aria-label={title}
      onCancel={(event) => {
        event.preventDefault();
        if (!closeDisabled) onClose();
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
          onClick={onClose}
        >
          <XIcon size={18} />
        </button>
      </header>
      {children}
      {error && (
        <p role="alert" className="error-text">
          {error.replace(/^Error: Error invoking remote method '[^']+': Error: /, '')}
        </p>
      )}
    </dialog>
  );
}
