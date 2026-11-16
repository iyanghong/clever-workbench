import { Avatar, Button, Layout, Menu } from 'antd';
import { openDialogSelector } from './shared/modal-state';
import { GuidanceProvider } from './features/guidance/Guidance';
import { guidanceTarget } from './guidance/registry';
import { requireSavedRecord } from './shared/new-record';
import type { CreationContext } from './app/actions';
import { QuickCreate } from './app/QuickCreate';
import { Suspense, useCallback, useEffect, useRef, useState } from 'react';
import { SquaresFourIcon, XIcon } from '@phosphor-icons/react';
import { GlobalSearch } from './features/search/GlobalSearch';
import { VaultControl } from './features/vault/VaultProvider';
import { modules, type Route } from './app/modules';
import { UpdateBadge, useAppUpdate } from './features/settings/AppUpdate';

export function App() {
  useEffect(() => {
    void window.desktop
      .updateHealthReady()
      .then((nonce) => (nonce ? window.desktop.confirmUpdateHealth(nonce) : undefined))
      .catch(() => {});
  }, []);
  const update = useAppUpdate();
  const installing = update?.status === 'preparing' || update?.status === 'installing';
  const installingRef = useRef(installing);
  installingRef.current = installing;
  const [route, setRoute] = useState<Route>({ module: 'home' });
  const [collapsed, setCollapsed] = useState(false);
  const [error, setError] = useState('');
  const [dataVersion, setDataVersion] = useState(0);
  const [pageVersion, setPageVersion] = useState(0);
  const [notice, setNotice] = useState('');
  const generation = useRef(0);
  const [context, updateContext] = useState<CreationContext>({});
  const [contextReady, setContextReady] = useState(false);
  const setContext = useCallback((value: CreationContext) => {
    updateContext(value);
    setContextReady(true);
  }, []);
  const save = useRef<() => Promise<void>>(async () => {});
  const registerFlush = useCallback((handler: () => Promise<void>) => {
    save.current = handler;
    return () => {
      if (save.current === handler) save.current = async () => {};
    };
  }, []);
  useEffect(
    () =>
      window.desktop.onFlush(async () => {
        await requireSavedRecord();
        await save.current();
      }),
    [],
  );
  useEffect(
    () =>
      window.desktop.onDataRestored(() => {
        generation.current++;
        setDataVersion(generation.current);
        save.current = async () => {};
        setRoute({ module: 'home' });
        updateContext({});
        setContextReady(false);
        setError('');
        setNotice('恢复完成，资料与附件已就位。');
      }),
    [],
  );
  const navigateChecked = useCallback(
    async (next: Route, guidance = false, stillCurrent?: () => boolean) => {
      const expected = generation.current;
      try {
        if (installingRef.current) throw Error('正在安装更新，请等待完成。');
        await requireSavedRecord();
        if (guidance) {
          const availability = await window.desktop.guidanceAvailability();
          if (!availability.available) throw Error(availability.reason);
        }
        await save.current();
        if (guidance) {
          const availability = await window.desktop.guidanceAvailability();
          if (!availability.available) throw Error(availability.reason);
        }
        if (expected !== generation.current) throw Error('资料已切换，请重新操作。');
        if (stillCurrent && !stillCurrent())
          return { ok: false, message: '指引已关闭，导航已取消。' };
        if (
          guidance &&
          document.querySelector(
            'dialog[open]:not(.guidance-dialog), .shared-dialog:not(.guidance-dialog) [data-workbench-dialog], [role="alertdialog"]',
          )
        )
          throw Error('请先完成当前弹窗中的操作，再前往功能。');
        if (installingRef.current) throw Error('正在安装更新，请等待完成。');
        setError('');
        setNotice('');
        updateContext({});
        setContextReady(false);
        setRoute(next);
        setPageVersion((version) => version + 1);
        return { ok: true };
      } catch (cause) {
        const message = cause instanceof Error ? cause.message : String(cause);
        if (!guidance) setError(message);
        return { ok: false, message };
      }
    },
    [],
  );
  const navigate = useCallback(
    async (next: Route) => {
      await navigateChecked(next);
    },
    [navigateChecked],
  );
  const navigateGuidance = useCallback(
    async (id: string, stillCurrent?: () => boolean) => {
      const target = guidanceTarget(id);
      if (!target) return { ok: false, message: '此功能入口已移除或暂不可用。' };
      const { label, ...destination } = target;
      // Stable routes intentionally omit remembered object IDs; the page asks for current context.
      return navigateChecked(destination, true, stillCurrent);
    },
    [navigateChecked],
  );
  const selected = modules.find((item) => item.id === route.module) ?? modules[0];
  const prepareGuidancePrompt = useCallback(async () => {
    const expected = generation.current;
    try {
      // Automatic guidance must never trigger the discard confirmation of a newly opened form.
      if (installingRef.current || document.querySelector(openDialogSelector)) return false;
      await save.current();
      return (
        expected === generation.current &&
        !installingRef.current &&
        !document.querySelector(openDialogSelector)
      );
    } catch {
      return false;
    }
  }, []);
  const Page = selected.Page;
  const navigation = (section: 'workspace' | 'utility') => (
    <nav aria-label={section === 'workspace' ? '工作空间' : '辅助功能'}>
      <Menu
        mode="inline"
        selectedKeys={[selected.id]}
        inlineCollapsed={collapsed}
        onClick={({ key }) => void navigate({ module: key })}
        items={modules
          .filter((item) => item.section === section)
          .map((item) => ({
            key: item.id,
            label:
              (
                {
                  ledger: '技术台账',
                  tasks: '工作任务',
                  documents: '技术文档',
                  tools: '内置工具',
                } as Record<string, string>
              )[item.id] ?? item.title,
            'aria-label': item.accessibleName ?? item.title,
            'aria-current': selected.id === item.id ? ('page' as const) : undefined,
            icon: <item.icon size={19} weight={selected.id === item.id ? 'fill' : 'regular'} />,
          }))}
      />
    </nav>
  );
  return (
    <GuidanceProvider
      navigate={navigateGuidance}
      disabled={installing}
      generation={dataVersion}
      preparePrompt={prepareGuidancePrompt}
    >
      <Layout className={`app-shell ${window.desktop.platform}`} inert={installing}>
        <Layout.Sider
          className="sidebar"
          width={214}
          collapsedWidth={68}
          collapsed={collapsed}
          breakpoint="lg"
          onBreakpoint={setCollapsed}
        >
          <div className="sidebar-drag" />
          <div className="brand">
            <Avatar
              shape="square"
              size={34}
              className="app-mark"
              style={{ background: 'var(--accent-fill)' }}
              icon={<SquaresFourIcon weight="fill" size={25} />}
            />
            <div className="brand-copy">
              <strong>Clever Workbench</strong>
              <div className="brand-caption">
                <span>个人工作台</span>
                <UpdateBadge state={update} />
              </div>
            </div>
          </div>
          <div className="workspace-label">工作空间</div>
          {navigation('workspace')}
          <div className="sidebar-bottom">
            <VaultControl />
            <div className="local-badge">
              <span className="status-dot saved" />
              <span>本地工作空间</span>
              <span className="local-badge-note">离线可用</span>
            </div>
            {navigation('utility')}
          </div>
        </Layout.Sider>
        <Layout className="workspace-shell">
          <GlobalSearch
            key={dataVersion}
            navigate={navigate}
            flush={() => save.current()}
            onToggleSidebar={() => setCollapsed((value) => !value)}
          >
            <QuickCreate
              ready={contextReady}
              context={context}
              navigate={navigate}
              flush={() => save.current()}
            />
          </GlobalSearch>
          <Suspense
            key={`${dataVersion}:${pageVersion}`}
            fallback={
              <main className="main module-loading" role="status">
                正在打开…
              </main>
            }
          >
            <Page
              route={route}
              navigate={navigate}
              registerFlush={registerFlush}
              setContext={setContext}
            />
          </Suspense>
        </Layout>
        {notice && (
          <div className="toast" role="status">
            <span>{notice}</span>
            <Button
              htmlType="submit"
              type="text"
              className="icon-button"
              aria-label="关闭恢复提示"
              onClick={() => setNotice('')}
            >
              <XIcon size={16} />
            </Button>
          </div>
        )}
        {error && (
          <div className="error-banner" role="alert">
            <span>{error}</span>
            <Button
              htmlType="submit"
              type="text"
              aria-label="关闭提示"
              onClick={() => setError('')}
            >
              <XIcon />
            </Button>
          </div>
        )}
      </Layout>
      {installing && (
        <div
          className="update-install-overlay"
          role="alertdialog"
          aria-modal="true"
          aria-label="正在安装更新"
        >
          <p>
            {update?.status === 'preparing'
              ? '正在保存并创建完整加密备份，请稍候…'
              : '更新已准备好，正在退出并重新启动…'}
          </p>
        </div>
      )}
    </GuidanceProvider>
  );
}
