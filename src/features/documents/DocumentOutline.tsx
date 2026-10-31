import { useCallback, useEffect, useState } from 'react';
import type { RefObject } from 'react';
import { AppWindowIcon, SidebarSimpleIcon, XIcon } from '@phosphor-icons/react';

export type OutlineLayout = 'popover' | 'right' | 'left';
export type OutlineHeading = { id: string; text: string; level: number };
type HeadingNode = OutlineHeading & { element: HTMLElement };

const layoutKey = 'document-outline-layout';
const openKey = 'document-outline-open';
const layoutOptions: { value: OutlineLayout; label: string }[] = [
  { value: 'popover', label: '弹出' },
  { value: 'right', label: '右侧' },
  { value: 'left', label: '左侧' },
];
const layoutIcons = {
  popover: <AppWindowIcon size={15} />,
  right: <SidebarSimpleIcon size={15} style={{ transform: 'scaleX(-1)' }} />,
  left: <SidebarSimpleIcon size={15} />,
};

function storedLayout(): OutlineLayout {
  try {
    const value = localStorage.getItem(layoutKey);
    return layoutOptions.some((option) => option.value === value)
      ? (value as OutlineLayout)
      : 'popover';
  } catch {
    return 'popover';
  }
}

function storedOpen() {
  try {
    return localStorage.getItem(openKey) === 'true';
  } catch {
    return false;
  }
}

function headingNodes(section: HTMLElement | null): HeadingNode[] {
  if (!section) return [];
  return Array.from(
    section.querySelectorAll<HTMLElement>(
      '.workbench-vditor .vditor-reset h1, .workbench-vditor .vditor-reset h2, .workbench-vditor .vditor-reset h3, .workbench-vditor .vditor-reset h4, .workbench-vditor .vditor-reset h5, .workbench-vditor .vditor-reset h6',
    ),
  )
    .map((element, index) => ({
      id: element.id || `document-heading-${index}`,
      text: (element.textContent ?? '').replace(/^\s*#{1,6}\s+/, '').trim(),
      level: Number(element.tagName.slice(1)),
      element,
    }))
    .filter((heading) => heading.text);
}

export function useDocumentOutline(sectionRef: RefObject<HTMLElement | null>, focused: boolean) {
  const [layout, setLayout] = useState<OutlineLayout>(storedLayout),
    [open, setOpen] = useState(storedOpen),
    [headings, setHeadings] = useState<OutlineHeading[]>([]),
    [activeId, setActiveId] = useState('');
  useEffect(() => {
    try {
      localStorage.setItem(layoutKey, layout);
    } catch {}
  }, [layout]);
  useEffect(() => {
    try {
      localStorage.setItem(openKey, String(open));
    } catch {}
  }, [open]);
  useEffect(() => {
    const section = sectionRef.current;
    if (!section) return;
    const update = () => {
      const next = headingNodes(section).map(({ id, text, level }) => ({ id, text, level }));
      setHeadings((current) => (JSON.stringify(current) === JSON.stringify(next) ? current : next));
    };
    update();
    const observer = new MutationObserver(update);
    observer.observe(section, { childList: true, characterData: true, subtree: true });
    return () => observer.disconnect();
  }, [sectionRef]);
  useEffect(() => {
    if (!focused || !open || layout !== 'popover') return;
    const section = sectionRef.current;
    const pointerDown = (event: PointerEvent) => {
      const target = event.target as Node;
      if (
        !section?.querySelector('.document-outline')?.contains(target) &&
        !section?.querySelector('.document-outline-toggle')?.contains(target)
      )
        setOpen(false);
    };
    const keyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setOpen(false);
    };
    document.addEventListener('pointerdown', pointerDown);
    document.addEventListener('keydown', keyDown);
    return () => {
      document.removeEventListener('pointerdown', pointerDown);
      document.removeEventListener('keydown', keyDown);
    };
  }, [focused, open, layout, sectionRef]);
  useEffect(() => {
    if (!focused || !open || !headings.length) return;
    const container = sectionRef.current?.querySelector<HTMLElement>('.editor-wrap');
    if (!container) return;
    const update = () => {
      const nodes = headingNodes(sectionRef.current);
      const top = container.getBoundingClientRect().top + 120;
      let current = nodes[0]?.id ?? '';
      for (const heading of nodes) {
        if (heading.element.getBoundingClientRect().top > top) break;
        current = heading.id;
      }
      setActiveId(current);
    };
    update();
    container.addEventListener('scroll', update, { passive: true });
    return () => container.removeEventListener('scroll', update);
  }, [focused, open, headings, layout, sectionRef]);
  const navigate = useCallback(
    (id: string) => {
      const section = sectionRef.current;
      const container = section?.querySelector<HTMLElement>('.editor-wrap');
      const heading = headingNodes(section).find((item) => item.id === id);
      if (!container || !heading) return;
      const top =
        heading.element.getBoundingClientRect().top -
        container.getBoundingClientRect().top +
        container.scrollTop -
        20;
      container.scrollTo({
        top,
        behavior: window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth',
      });
      setActiveId(id);
      if (layout === 'popover') setOpen(false);
    },
    [layout, sectionRef],
  );
  return { layout, setLayout, open, setOpen, headings, activeId, navigate };
}

export function DocumentOutline({
  layout,
  headings,
  activeId,
  onLayout,
  onClose,
  onNavigate,
}: {
  layout: OutlineLayout;
  headings: OutlineHeading[];
  activeId: string;
  onLayout: (layout: OutlineLayout) => void;
  onClose: () => void;
  onNavigate: (id: string) => void;
}) {
  const minimumLevel = Math.min(...headings.map((heading) => heading.level), 6);
  return (
    <aside
      id="document-focus-outline"
      className="document-outline"
      data-layout={layout}
      aria-label="文档大纲"
    >
      <div className="document-outline-header">
        <strong>大纲</strong>
        <span>{headings.length ? `${headings.length} 个章节` : ''}</span>
        <div className="document-outline-layouts" role="group" aria-label="大纲布局">
          {layoutOptions.map((option) => (
            <button
              key={option.value}
              aria-label={option.label}
              title={`${option.label}布局`}
              aria-pressed={layout === option.value}
              onClick={() => onLayout(option.value)}
            >
              {layoutIcons[option.value]}
            </button>
          ))}
        </div>
        <button className="icon-button" aria-label="关闭大纲" onClick={onClose}>
          <XIcon size={14} />
        </button>
      </div>
      <div className="document-outline-items">
        {headings.map((heading) => {
          const depth = Math.min(3, Math.max(0, heading.level - minimumLevel));
          return (
            <button
              key={heading.id}
              title={heading.text}
              aria-current={activeId === heading.id ? 'location' : undefined}
              style={{ paddingInlineStart: `${8 + depth * 12}px` }}
              onClick={() => onNavigate(heading.id)}
            >
              {heading.text}
            </button>
          );
        })}
        {!headings.length && <p>使用 Markdown 标题后，这里会显示章节导航。</p>}
      </div>
    </aside>
  );
}
