import { useCallback, useEffect, useRef, useState } from 'react';
import { SquaresFourIcon, XIcon } from '@phosphor-icons/react';
import { VaultControl } from './features/vault/VaultProvider';
import { modules, type Route } from './app/modules';

export function App() {
  const [route, setRoute] = useState<Route>({ module: 'tasks' });
  const [error, setError] = useState('');
  const save = useRef<() => Promise<void>>(async () => {});
  const registerFlush = useCallback((handler: () => Promise<void>) => {
    save.current = handler;
    return () => {
      if (save.current === handler) save.current = async () => {};
    };
  }, []);
  useEffect(() => window.desktop.onFlush(() => save.current()), []);
  const navigate = useCallback(async (next: Route) => {
    try {
      await save.current();
      setError('');
      setRoute(next);
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
    <div className={`app-shell ${window.desktop.platform}`}>
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
          <VaultControl />
          <div className="local-badge">
            <span className="status-dot saved" />
            <span>本地工作空间</span>
            <span className="local-badge-note">离线可用</span>
          </div>
          {navigation('utility')}
        </div>
      </aside>
      <Page
        key={`${route.module}:${route.project ?? ''}:${route.objectId ?? ''}:${Boolean(route.trash)}`}
        route={route}
        navigate={navigate}
        registerFlush={registerFlush}
      />
      {error && (
        <div className="error-banner" role="alert">
          <span>{error}</span>
          <button aria-label="关闭提示" onClick={() => setError('')}>
            <XIcon />
          </button>
        </div>
      )}
    </div>
  );
}
