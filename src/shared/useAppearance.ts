import { useEffect, useState } from 'react';
import type { Settings } from '../types';
export function useAppearance() {
  const [settings, setSettings] = useState<Settings | null>(null);
  useEffect(() => {
    void window.desktop
      .snapshot()
      .then((snapshot) => setSettings(snapshot.settings))
      .catch(() => {});
    return window.desktop.onSettingsChange(setSettings);
  }, []);
  useEffect(() => {
    if (!settings) return;
    const media = matchMedia('(prefers-color-scheme: dark)');
    const apply = () => {
      document.documentElement.dataset.theme =
        settings.theme === 'system' ? (media.matches ? 'dark' : 'light') : settings.theme;
    };
    apply();
    media.addEventListener('change', apply);
    return () => media.removeEventListener('change', apply);
  }, [settings]);
}
