import type { CreationContext } from './app/actions';
import { QuickCreate } from './app/QuickCreate';
import { Suspense, useCallback, useEffect, useRef, useState } from 'react';
import { SquaresFourIcon, XIcon } from '@phosphor-icons/react';
import { useAppearance } from './shared/useAppearance';
import { GlobalSearch } from './features/search/GlobalSearch';
import { VaultControl } from './features/vault/VaultProvider';
import { modules, type Route } from './app/modules';
import { UpdateBadge, useAppUpdate } from './features/settings/AppUpdate';

export function App() {
  useAppearance();
  useEffect(() => {
    void window.desktop
      .updateHealthReady()
      .then((nonce) => (nonce ? window.desktop.confirmUpdateHealth(nonce) : undefined))
      .catch(() => {});
  }, []);
  const update = useAppUpdate();
  const installing = update?.status === 'preparing' || update?.status === 'installing';
  const [route, setRoute] = useState<Route>({ module: 'home' });
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
  useEffect(() => window.desktop.onFlush(() => save.current()), []);
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
  const navigate = useCallback(async (next: Route) => {
    const expected = generation.current;
    try {
      await save.current();
      if (expected !== generation.current) return;
      setError('');
      setNotice('');
      updateContext({});
      setContextReady(false);
      setRoute(next);
      setPageVersion((version) => version + 1);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : String(cause));
    }
  }, []);
  const selected = modules.find((item) => item.id === route.module) ?? modules[0];
  const Page = selected.Page;
  const navigation = (section: 'workspace' | 'utility') => (
    <nav aria-label={section === 'workspace' ? '工作空间' : '辅助功能'}>
      {modules
        .filter((item) => item.section === section)
        .map((item) => (
          <button
            key={item.id}
            aria-label={item.accessibleName ?? item.title}
            aria-current={selected.id === item.id ? 'page' : undefined}
            className={selected.id === item.id ? 'selected' : ''}
            onClick={() => void navigate({ module: item.id })}
          >
            <item.icon size={19} weight={selected.id === item.id ? 'fill' : 'regular'} />
            {item.title}
          </button>
        ))}
    </nav>
  );
  return (
    <>
      <div className={`app-shell ${window.desktop.platform}`} inert={installing}>
        <aside className="sidebar">
          <div className="sidebar-drag" />
          <div className="brand">
            <div className="app-mark">
              <SquaresFourIcon weight="fill" size={25} />
            </div>
            <div>
              <strong>Clever Workbench</strong>
              <span>个人工作台</span>
            </div>
          </div>
          <div className="workspace-label">工作空间</div>
          {navigation('workspace')}
          <div className="sidebar-bottom">
            <UpdateBadge />
            <VaultControl />
            <div className="local-badge">
              <span className="status-dot saved" />
              <span>本地工作空间</span>
              <span className="local-badge-note">离线可用</span>
            </div>
            {navigation('utility')}
          </div>
        </aside>
        <div className="workspace-shell">
          <GlobalSearch key={dataVersion} navigate={navigate} flush={() => save.current()}>
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
        </div>
        {notice && (
          <div className="toast" role="status">
            <span>{notice}</span>
            <button className="icon-button" aria-label="关闭恢复提示" onClick={() => setNotice('')}>
              <XIcon size={16} />
            </button>
          </div>
        )}
        {error && (
          <div className="error-banner" role="alert">
            <span>{error}</span>
            <button aria-label="关闭提示" onClick={() => setError('')}>
              <XIcon />
            </button>
          </div>
        )}
      </div>
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
    </>
  );
}
