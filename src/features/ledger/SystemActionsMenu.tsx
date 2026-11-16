import { Button, Dropdown } from 'antd';
import {
  DotsThreeIcon,
  GearSixIcon,
  DownloadSimpleIcon,
  BookOpenIcon,
} from '@phosphor-icons/react';
import { useEffect, useRef, useState } from 'react';

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
  const initialItem = useRef(0);
  const popup = useRef<HTMLDivElement>(null);
  const trigger = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    if (!open) return;
    let frame: number;
    const focusItem = () => {
      const items = popup.current?.querySelectorAll<HTMLElement>('[role="menuitem"]');
      const item = items?.[initialItem.current];
      if (item?.getClientRects().length) item.focus({ preventScroll: true });
      else frame = requestAnimationFrame(focusItem);
    };
    frame = requestAnimationFrame(focusItem);
    return () => cancelAnimationFrame(frame);
  }, [open]);
  const actions: Record<string, () => void> = {
    info: onInfo,
    export: onExport,
    exportGuidance: onExportGuidance,
    guidance: onGuidance,
  };
  function activate(key: string) {
    setOpen(false);
    trigger.current?.focus({ preventScroll: true });
    actions[key]?.();
  }
  return (
    <Dropdown
      open={open}
      onOpenChange={setOpen}
      trigger={['click']}
      popupRender={(menu) => <div ref={popup}>{menu}</div>}
      menu={{
        'aria-label': '当前系统操作',
        onKeyDown: (event) => {
          if (event.key === 'Enter') {
            event.preventDefault();
            event.stopPropagation();
          }
          if (event.key === 'Escape' || event.key === 'Tab') {
            event.stopPropagation();
            if (event.key === 'Escape') event.preventDefault();
            setOpen(false);
            trigger.current?.focus({ preventScroll: true });
          }
        },
        items: [
          { key: 'info', label: '系统信息', icon: <GearSixIcon /> },
          { key: 'export', label: '导出资料', icon: <DownloadSimpleIcon /> },
          { type: 'divider' },
          { key: 'exportGuidance', label: '导出资料使用指引', icon: <BookOpenIcon /> },
          { key: 'guidance', label: '系统与环境使用指引', icon: <BookOpenIcon /> },
        ],
        onClick: ({ key }) => {
          activate(key);
        },
      }}
    >
      <Button
        ref={trigger}
        type="text"
        className="system-actions-trigger"
        aria-label="当前系统更多操作"
        aria-haspopup="menu"
        aria-expanded={open}
        onClick={() => {
          initialItem.current = 0;
        }}
        onKeyDown={(event) => {
          if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
            event.preventDefault();
            initialItem.current = event.key === 'ArrowUp' ? 3 : 0;
            setOpen(true);
          } else if (open && ['Home', 'End'].includes(event.key)) {
            event.preventDefault();
            initialItem.current = event.key === 'End' ? 3 : 0;
          } else if (open && ['Enter', ' '].includes(event.key)) {
            event.preventDefault();
            activate(['info', 'export', 'exportGuidance', 'guidance'][initialItem.current]);
          }
        }}
        icon={<DotsThreeIcon size={20} />}
      >
        更多
      </Button>
    </Dropdown>
  );
}
