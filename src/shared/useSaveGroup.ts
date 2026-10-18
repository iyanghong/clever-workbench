import { useCallback, useEffect, useRef } from 'react';

export function useSaveGroup(parent: (save: () => Promise<void>) => () => void) {
  const handlers = useRef(new Set<() => Promise<void>>());
  const flush = useCallback(async () => {
    for (const save of [...handlers.current]) await save();
  }, []);
  const register = useCallback((save: () => Promise<void>) => {
    handlers.current.add(save);
    return () => {
      handlers.current.delete(save);
    };
  }, []);
  useEffect(() => parent(flush), [parent, flush]);
  return { register, flush };
}
