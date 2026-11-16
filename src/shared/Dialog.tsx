import { Alert, Button, Modal, Typography } from 'antd';
import { useEffect, useLayoutEffect, useRef, useState, type ReactNode } from 'react';
import { closeNewRecord } from './new-record';
import { openDialogSelector } from './modal-state';

const activeDialogs = new Map<symbol, boolean>();

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
  returnFocus,
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
  exclusive?: boolean;
  canShow?: () => boolean;
  returnFocus?: HTMLElement | null;
}) {
  const [visible, setVisible] = useState(false);
  const [discard, setDiscard] = useState<(() => void) | null>(null);
  const content = useRef<HTMLDivElement>(null);
  const presented = useRef(false);
  const previousFocus = useRef<HTMLElement | null>(null);
  const returnFocusRef = useRef(returnFocus);
  returnFocusRef.current = returnFocus;
  const closeRef = useRef(onClose),
    shown = useRef(onShown),
    guard = useRef(canShow);
  closeRef.current = onClose;
  shown.current = onShown;
  guard.current = canShow;
  useLayoutEffect(() => {
    const slot = Symbol(title);
    let reserved = false;
    const tryShow = () => {
      if (reserved || (guard.current && !guard.current())) return;
      if ([...activeDialogs.values()].some((otherExclusive) => exclusive || otherExclusive)) return;
      const others = [...document.querySelectorAll(openDialogSelector)];
      if (others.some((item) => exclusive || item.hasAttribute('data-exclusive-dialog'))) return;
      previousFocus.current =
        document.activeElement instanceof HTMLElement && document.activeElement !== document.body
          ? document.activeElement
          : null;
      reserved = true;
      activeDialogs.set(slot, exclusive);
      setVisible(true);
    };
    const requestDiscard = (event: Event) => {
      if (
        !(event.target instanceof HTMLElement) ||
        event.target.closest('[data-workbench-dialog]') !== content.current
      )
        return;
      event.stopPropagation();
      if (content.current?.querySelector('form[aria-busy="true"]')) return;
      const close = (event as CustomEvent<() => void>).detail ?? (() => closeRef.current());
      setDiscard(() => () => {
        const form = content.current?.querySelector<HTMLFormElement>('form[data-new-record]');
        if (form) form.dataset.dirty = 'false';
        setDiscard(null);
        close();
      });
    };
    const observer = new MutationObserver(tryShow);
    observer.observe(document.body, {
      subtree: true,
      childList: true,
      attributes: true,
      attributeFilter: ['open'],
    });
    document.addEventListener('record-discard', requestDiscard);
    document.addEventListener('guidance-dialog-retry', tryShow);
    document.addEventListener('visibilitychange', tryShow);
    window.addEventListener('focus', tryShow);
    tryShow();
    return () => {
      observer.disconnect();
      document.removeEventListener('record-discard', requestDiscard);
      document.removeEventListener('guidance-dialog-retry', tryShow);
      document.removeEventListener('visibilitychange', tryShow);
      window.removeEventListener('focus', tryShow);
      activeDialogs.delete(slot);
      document.dispatchEvent(new Event('guidance-dialog-retry'));
    };
  }, []);
  useEffect(
    () => () => {
      // Ant releases its focus trap in passive cleanup; restore after every trap is removed.
      queueMicrotask(() => {
        const target = returnFocusRef.current ?? previousFocus.current;
        if (target?.isConnected) target.focus({ preventScroll: true });
      });
    },
    [],
  );
  function reportShown() {
    if (visible && !presented.current && content.current?.getClientRects().length) {
      presented.current = true;
      shown.current?.();
    }
  }
  useLayoutEffect(() => {
    if (visible && document.activeElement === document.body) {
      const target =
        content.current?.querySelector<HTMLElement>('button:not(:disabled)') ?? content.current;
      target?.focus({ preventScroll: true });
    }
    reportShown();
  });
  function requestClose() {
    if (closeDisabled || content.current?.querySelector('form[aria-busy="true"]')) return;
    reportShown();
    if (content.current?.querySelector('form[data-new-record][data-dirty="true"]'))
      closeNewRecord(onClose);
    else onClose();
  }
  return (
    <Modal
      open={visible}
      title={<h2>{title}</h2>}
      className={`${className} shared-dialog`}
      width="var(--dialog-width, 520px)"
      footer={null}
      mask={{ closable: false }}
      focusable={{ focusTriggerAfterClose: false }}
      closable={{ disabled: closeDisabled, 'aria-label': closeLabel ?? `关闭${title}` }}
      onCancel={requestClose}
      afterOpenChange={(open) => {
        if (open) reportShown();
      }}
      modalRender={(node) => (
        <div
          ref={content}
          tabIndex={-1}
          data-workbench-dialog=""
          data-exclusive-dialog={exclusive ? '' : undefined}
        >
          {node}
        </div>
      )}
    >
      {description && <Typography.Paragraph type="secondary">{description}</Typography.Paragraph>}
      {children}
      {discard && (
        <Dialog title="放弃未提交的资料？" onClose={() => setDiscard(null)}>
          <Typography.Paragraph>
            已填写的内容尚未保存，可以继续填写或明确放弃。
          </Typography.Paragraph>
          <div className="modal-actions">
            <Button onClick={() => setDiscard(null)}>继续填写</Button>
            <Button danger type="primary" onClick={discard}>
              放弃录入
            </Button>
          </div>
        </Dialog>
      )}
      {error && (
        <Alert
          showIcon
          type="error"
          title={error.replace(/^Error: Error invoking remote method '[^']+': Error: /, '')}
          role="alert"
        />
      )}
    </Modal>
  );
}
