import { useCallback, useEffect, useState } from 'react';
export function useVirtual(count: number, rowHeight: number) {
  const [element, setElement] = useState<HTMLDivElement | null>(null),
    [view, setView] = useState({ top: 0, height: 600 });
  const ref = useCallback((node: HTMLDivElement | null) => setElement(node), []);
  useEffect(() => {
    if (!element) return;
    const update = () => setView({ top: element.scrollTop, height: element.clientHeight });
    update();
    element.addEventListener('scroll', update, { passive: true });
    const observer = new ResizeObserver(update);
    observer.observe(element);
    return () => {
      observer.disconnect();
      element.removeEventListener('scroll', update);
    };
  }, [element]);
  useEffect(() => {
    if (element && element.scrollTop > count * rowHeight) element.scrollTop = 0;
  }, [count, element, rowHeight]);
  const start = Math.min(Math.max(0, count - 1), Math.max(0, Math.floor(view.top / rowHeight) - 5)),
    end = Math.min(count, Math.ceil((view.top + view.height) / rowHeight) + 5);
  return {
    ref,
    element,
    start,
    end,
    paddingTop: start * rowHeight,
    paddingBottom: Math.max(0, (count - end) * rowHeight),
  };
}
