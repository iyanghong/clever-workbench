import { useCallback, useEffect, useMemo, useState } from 'react';
export function useVirtual(count: number, rowHeight: number | readonly number[]) {
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
  const offsets = useMemo(() => {
    const result = [0];
    for (let i = 0; i < count; i++)
      result.push(result[i] + (typeof rowHeight === 'number' ? rowHeight : rowHeight[i]));
    return result;
  }, [count, rowHeight]);
  useEffect(() => {
    if (element && element.scrollTop > offsets[count]) element.scrollTop = 0;
  }, [count, element, offsets]);
  function indexAt(position: number) {
    let low = 0,
      high = count;
    while (low < high) {
      const middle = (low + high + 1) >> 1;
      if (offsets[middle] <= position) low = middle;
      else high = middle - 1;
    }
    return low;
  }
  const start = Math.max(0, indexAt(view.top) - 5),
    end = Math.min(count, indexAt(view.top + view.height) + 6);
  return {
    ref,
    element,
    start,
    end,
    paddingTop: offsets[start],
    paddingBottom: offsets[count] - offsets[end],
  };
}
