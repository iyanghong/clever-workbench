import { XIcon } from '@phosphor-icons/react';
import { useEffect, useRef, type ReactNode } from 'react';

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
  const dialog = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    const previous = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    const element = dialog.current;
    element?.showModal();
    return () => {
      element?.close();
      if (previous?.isConnected) previous.focus({ preventScroll: true });
    };
  }, []);
  return (
    <dialog
      ref={dialog}
      className={`${className} shared-dialog`}
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
