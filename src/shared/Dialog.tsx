import { useEffect, useRef, type ReactNode } from 'react';

export function Dialog({
  title,
  children,
  onClose,
  error,
  className = 'modal',
}: {
  title: string;
  children: ReactNode;
  onClose: () => void;
  error?: string;
  className?: string;
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
      className={className}
      aria-label={title}
      onCancel={(event) => {
        event.preventDefault();
        onClose();
      }}
    >
      <h2>{title}</h2>
      {children}
      {error && (
        <p role="alert" className="error-text">
          {error}
        </p>
      )}
    </dialog>
  );
}
