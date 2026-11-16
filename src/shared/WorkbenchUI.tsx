import { useEffect, useState, type ReactNode } from 'react';
import { App, ConfigProvider, theme } from 'antd';
import zhCN from 'antd/locale/zh_CN';
import dayjs from 'dayjs';
import 'dayjs/locale/zh-cn';
import { useAppearance } from './useAppearance';

dayjs.locale('zh-cn');

function ThemeVariables() {
  const { token } = theme.useToken();
  useEffect(() => {
    const values = {
      '--bg': token.colorBgLayout,
      '--panel': token.colorBgContainer,
      '--text': token.colorText,
      '--secondary': token.colorTextSecondary,
      '--muted': token.colorTextTertiary,
      '--line': token.colorBorderSecondary,
      '--hover': token.colorFillQuaternary,
      '--selected': token.controlItemBgActive,
      '--accent': token.colorPrimaryText,
      '--accent-fill': token.colorPrimary,
      '--danger': token.colorErrorText,
      '--danger-fill': token.colorError,
      '--warning': token.colorWarningText,
      '--success': token.colorSuccessText,
    };
    for (const [key, value] of Object.entries(values))
      document.documentElement.style.setProperty(key, value);
  }, [token]);
  return null;
}

export function WorkbenchUI({ children }: { children: ReactNode }) {
  const appearance = useAppearance();
  // Ant inserts a motion provider on the first toggle; establish that boundary before editing.
  const [motionBoundary] = useState(appearance.reduceMotion);
  return (
    <ConfigProvider theme={{ token: { motion: motionBoundary } }}>
      <ConfigProvider
        locale={zhCN}
        button={{ autoInsertSpace: false }}
        theme={{
          algorithm: appearance.dark ? theme.darkAlgorithm : theme.defaultAlgorithm,
          token: {
            colorPrimary: '#1677ff',
            fontSize: 13,
            borderRadius: 7,
            controlHeight: 32,
            fontFamily:
              '-apple-system, BlinkMacSystemFont, "Segoe UI", "PingFang SC", "Microsoft YaHei", sans-serif',
            colorBgLayout: appearance.dark ? '#14171c' : '#f5f7fa',
            colorBgContainer: appearance.dark ? '#1c2026' : '#ffffff',
            motion: !appearance.reduceMotion,
            ...(appearance.highContrast
              ? {
                  colorTextSecondary: appearance.dark ? '#dadde3' : '#3c4654',
                  colorTextTertiary: appearance.dark ? '#c0c7d1' : '#4b5563',
                  colorBorderSecondary: appearance.dark ? '#8590a1' : '#697586',
                }
              : {}),
          },
          components: {
            Menu: { itemHeight: 37, itemBorderRadius: 6, itemMarginInline: 8, iconSize: 18 },
            Table: { cellPaddingBlock: 13, headerBg: appearance.dark ? '#242931' : '#fafbfd' },
            Card: { headerFontSize: 14, paddingLG: 20 },
            Tabs: { horizontalItemGutter: 26 },
          },
        }}
      >
        <App className="workbench-ui">
          <ThemeVariables />
          {children}
        </App>
      </ConfigProvider>
    </ConfigProvider>
  );
}
