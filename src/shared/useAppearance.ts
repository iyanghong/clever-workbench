import { useEffect, useState } from 'react';
import type { Settings, SystemAppearance } from '../types';
export function useAppearance() {
  const [settings, setSettings] = useState<Settings | null>(null);
  const [system, setSystem] = useState<SystemAppearance>({
    reduceTransparency: false,
    highContrast: false,
  });
  useEffect(() => {
    let current = true;
    const unsubscribeSettings = window.desktop.onSettingsChange(setSettings),
      unsubscribeSystem = window.desktop.onSystemAppearance(setSystem);
    void window.desktop
      .snapshot()
      .then((snapshot) => {
        if (current) setSettings(snapshot.settings);
      })
      .catch(() => {});
    void window.desktop
      .systemAppearance()
      .then((preferences) => {
        if (current) setSystem(preferences);
      })
      .catch(() => {});
    return () => {
      current = false;
      unsubscribeSettings();
      unsubscribeSystem();
    };
  }, []);
  useEffect(() => {
    if (!settings) return;
    const dark = matchMedia('(prefers-color-scheme: dark)'),
      motion = matchMedia('(prefers-reduced-motion: reduce)'),
      transparency = matchMedia('(prefers-reduced-transparency: reduce)'),
      contrast = matchMedia('(prefers-contrast: more)');
    const apply = () => {
      const data = document.documentElement.dataset;
      data.platform = window.desktop.platform;
      data.theme = settings.theme === 'system' ? (dark.matches ? 'dark' : 'light') : settings.theme;
      const highContrast = settings.highContrast || system.highContrast || contrast.matches;
      data.highContrast = String(highContrast);
      data.reduceTransparency = String(
        highContrast ||
          settings.reduceTransparency ||
          system.reduceTransparency ||
          transparency.matches,
      );
      data.reduceMotion = String(settings.reduceMotion || motion.matches);
    };
    apply();
    const queries = [dark, motion, transparency, contrast];
    queries.forEach((query) => query.addEventListener('change', apply));
    return () => queries.forEach((query) => query.removeEventListener('change', apply));
  }, [settings, system]);
}
