import { useCallback, useEffect, useRef, useState } from 'react';

export function useAutosave<T>(
  initial: T,
  persist: (value: T) => Promise<void>,
  onError: (message: string) => void,
) {
  const [value, setValue] = useState(initial);
  const [status, setStatus] = useState('已保存');
  const latest = useRef(initial),
    dirty = useRef(false),
    queue = useRef(Promise.resolve());
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const persistRef = useRef(persist),
    errorRef = useRef(onError);
  persistRef.current = persist;
  errorRef.current = onError;
  const flush = useCallback(() => {
    if (timer.current) {
      clearTimeout(timer.current);
      timer.current = null;
    }
    queue.current = queue.current
      .catch(() => {})
      .then(async () => {
        if (!dirty.current) return;
        const next = latest.current;
        setStatus('保存中');
        try {
          await persistRef.current(next);
          if (latest.current === next) dirty.current = false;
          setStatus(dirty.current ? '待保存' : '已保存');
        } catch (cause) {
          setStatus('保存失败 · 点击重试');
          throw cause;
        }
      });
    return queue.current;
  }, []);
  const change = useCallback(
    (next: T) => {
      latest.current = next;
      dirty.current = true;
      setValue(next);
      setStatus('待保存');
      if (timer.current) clearTimeout(timer.current);
      timer.current = setTimeout(
        () =>
          void flush().catch((cause) =>
            errorRef.current(cause instanceof Error ? cause.message : String(cause)),
          ),
        400,
      );
    },
    [flush],
  );
  useEffect(
    () => () => {
      if (timer.current) clearTimeout(timer.current);
    },
    [],
  );
  return { value, change, flush, status };
}
