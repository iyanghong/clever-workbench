import { useEffect, useState } from 'react';

export function useMacUnlockAvailable(visible: boolean) {
  const active = visible && window.desktop.platform === 'darwin';
  const [available, setAvailable] = useState<boolean | null>(null);
  useEffect(() => {
    setAvailable(null);
    if (!active) return;
    let latest = 0;
    const refresh = async () => {
      const attempt = ++latest;
      const next = await window.desktop.canUseMacUnlock().catch(() => false);
      if (attempt === latest) setAvailable(next);
    };
    void refresh();
    window.addEventListener('focus', refresh);
    return () => {
      latest++;
      window.removeEventListener('focus', refresh);
    };
  }, [active]);
  return active ? available : null;
}
