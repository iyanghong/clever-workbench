import { DotsThreeIcon } from '@phosphor-icons/react';
import { useEffect, useId, useRef, useState } from 'react';

export function SystemActionsMenu({
  onInfo,
  onExport,
  onExportGuidance,
  onGuidance,
}: {
  onInfo: () => void;
  onExport: () => void;
  onExportGuidance: () => void;
  onGuidance: () => void;
}) {
  const [open, setOpen] = useState(false);
  const root = useRef<HTMLDivElement>(null);
  const trigger = useRef<HTMLButtonElement>(null);
  const menu = useRef<HTMLDivElement>(null);
  const initialItem = useRef(0);
  const menuId = useId();
  function close(restoreFocus = false) {
    setOpen(false);
    if (restoreFocus) trigger.current?.focus({ preventScroll: true });
  }
  useEffect(() => {
    if (!open) return;
    menu.current
      ?.querySelectorAll<HTMLButtonElement>('[role="menuitem"]')
      [initialItem.current]?.focus();
    function outside(event: PointerEvent) {
      if (event.target instanceof Node && !root.current?.contains(event.target)) close();
    }
    document.addEventListener('pointerdown', outside);
    return () => document.removeEventListener('pointerdown', outside);
  }, [open]);
  function activate(action: () => void) {
    // The shared dialog must capture the persistent trigger as its return target.
    close(true);
    action();
  }
  return (
    <div
      ref={root}
      className="system-actions"
      onBlur={(event) => {
        if (!event.currentTarget.contains(event.relatedTarget)) close();
      }}
    >
      <button
        ref={trigger}
        className="text-button system-actions-trigger"
        aria-label="当前系统更多操作"
        aria-haspopup="menu"
        aria-expanded={open}
        aria-controls={open ? menuId : undefined}
        onClick={() => {
          initialItem.current = 0;
          setOpen(!open);
        }}
        onKeyDown={(event) => {
          if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
            event.preventDefault();
            initialItem.current = event.key === 'ArrowUp' ? 3 : 0;
            setOpen(true);
          }
        }}
      >
        <DotsThreeIcon size={20} />
        更多
      </button>
      {open && (
        <div
          ref={menu}
          id={menuId}
          role="menu"
          aria-label="当前系统操作"
          className="system-actions-menu"
          onKeyDown={(event) => {
            if (event.key === 'Escape') {
              event.preventDefault();
              event.stopPropagation();
              close(true);
            } else if (event.key === 'Tab') {
              close(true);
            } else if (['ArrowDown', 'ArrowUp', 'Home', 'End'].includes(event.key)) {
              event.preventDefault();
              const items = [
                ...event.currentTarget.querySelectorAll<HTMLButtonElement>('[role="menuitem"]'),
              ];
              const current = items.findIndex((item) => item === document.activeElement);
              const next =
                event.key === 'Home'
                  ? 0
                  : event.key === 'End'
                    ? items.length - 1
                    : (current + (event.key === 'ArrowDown' ? 1 : -1) + items.length) %
                      items.length;
              items[next]?.focus();
            }
          }}
        >
          <button role="menuitem" tabIndex={-1} onClick={() => activate(onInfo)}>
            系统信息
          </button>
          <button role="menuitem" tabIndex={-1} onClick={() => activate(onExport)}>
            导出资料
          </button>
          <button role="menuitem" tabIndex={-1} onClick={() => activate(onExportGuidance)}>
            导出资料使用指引
          </button>
          <button role="menuitem" tabIndex={-1} onClick={() => activate(onGuidance)}>
            系统与环境使用指引
          </button>
        </div>
      )}
    </div>
  );
}
