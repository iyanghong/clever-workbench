import { useEffect, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { App as AntApp, ConfigProvider, theme } from 'antd';
import zhCN from 'antd/locale/zh_CN';
import dayjs from 'dayjs';
import 'dayjs/locale/zh-cn';
import { Workbench } from './App';
import type { Preferences } from './store';
import './styles.css';

dayjs.locale('zh-cn');

function Demo() {
  const [preferences, setPreferences] = useState<Preferences>({
    theme: 'light',
    compact: false,
    contrast: false,
    reduceMotion: false,
    reduceTransparency: false,
  });
  const [systemDark, setSystemDark] = useState(matchMedia('(prefers-color-scheme: dark)').matches);
  useEffect(() => {
    const media = matchMedia('(prefers-color-scheme: dark)');
    const change = () => setSystemDark(media.matches);
    media.addEventListener('change', change);
    return () => media.removeEventListener('change', change);
  }, []);
  const dark = preferences.theme === 'dark' || (preferences.theme === 'system' && systemDark);
  return (
    <ConfigProvider
      locale={zhCN}
      theme={{
        algorithm: [
          dark ? theme.darkAlgorithm : theme.defaultAlgorithm,
          ...(preferences.compact ? [theme.compactAlgorithm] : []),
        ],
        token: {
          colorPrimary: '#1677ff',
          fontFamily:
            '-apple-system, BlinkMacSystemFont, "Segoe UI", "PingFang SC", "Microsoft YaHei", sans-serif',
          fontSize: 13,
          borderRadius: 7,
          controlHeight: 32,
          colorBgLayout: dark ? '#14171c' : '#f5f7fa',
          colorBgContainer: dark ? '#1c2026' : '#ffffff',
          motion: !preferences.reduceMotion,
          ...(preferences.contrast
            ? {
                colorTextSecondary: dark ? '#dadde3' : '#3c4654',
                colorBorder: dark ? '#8590a1' : '#697586',
              }
            : {}),
        },
        components: {
          Layout: { headerBg: dark ? '#1c2026' : '#ffffff', siderBg: dark ? '#181c22' : '#f9fafc' },
          Menu: { itemHeight: 37, itemBorderRadius: 6, itemMarginInline: 8, iconSize: 18 },
          Table: { cellPaddingBlock: 13, headerBg: dark ? '#242931' : '#fafbfd' },
          Card: { headerFontSize: 14, paddingLG: 20 },
          Tabs: { horizontalItemGutter: 26 },
          Drawer: { footerPaddingBlock: 12 },
        },
      }}
    >
      <AntApp>
        <Workbench preferences={preferences} setPreferences={setPreferences} dark={dark} />
      </AntApp>
    </ConfigProvider>
  );
}

createRoot(document.getElementById('root')!).render(<Demo />);
