import { Button, Input, Tooltip, theme } from 'antd';
import { openDialogSelector } from '../../shared/modal-state';
import { useEffect, useRef, useState, type ReactNode } from 'react';
import {
  MagnifyingGlassIcon,
  ArrowUpRightIcon,
  CopyIcon,
  SidebarSimpleIcon,
  MoonIcon,
  SunIcon,
} from '@phosphor-icons/react';
import { Dialog } from '../../shared/Dialog';
import { routeForHit, type ModuleProps } from '../../app/modules';
import { searchKindLabels, type SearchHit } from '../../search-types';
import { SecretCopyButton } from '../vault/SecretCopyButton';
import { GuidanceButton } from '../guidance/Guidance';

export function GlobalSearch({
  navigate,
  flush,
  children,
  onToggleSidebar,
}: {
  navigate: ModuleProps['navigate'];
  flush: () => Promise<void>;
  children?: ReactNode;
  onToggleSidebar?: () => void;
}) {
  const { token } = theme.useToken();
  const dark = token.colorBgLayout === '#14171c';
  const [open, setOpen] = useState(false),
    [query, setQuery] = useState(''),
    [hits, setHits] = useState<SearchHit[]>([]),
    [active, setActive] = useState(0),
    [loading, setLoading] = useState(false),
    [error, setError] = useState(''),
    [notice, setNotice] = useState('');
  const openRef = useRef(false),
    input = useRef<HTMLInputElement>(null),
    flushRef = useRef(flush);
  flushRef.current = flush;
  openRef.current = open;
  async function show() {
    if (document.querySelector(openDialogSelector) && !openRef.current) return;
    try {
      await flushRef.current();
      setError('');
      setQuery('');
      setHits([]);
      setNotice('');
      setOpen(true);
    } catch (cause) {
      setError(String(cause));
    }
  }
  useEffect(() => {
    const key = (event: KeyboardEvent) => {
      if (
        !event.isComposing &&
        (event.ctrlKey || event.metaKey) &&
        event.key.toLowerCase() === 'k'
      ) {
        if (document.querySelector(openDialogSelector) && !openRef.current) return;
        event.preventDefault();
        if (openRef.current) input.current?.focus();
        else void show();
      }
    };
    window.addEventListener('keydown', key);
    const unsubscribe = window.desktop.onNativeCommand((command) => {
      if (command === 'search') void show();
    });
    return () => {
      window.removeEventListener('keydown', key);
      unsubscribe();
    };
  }, []);
  useEffect(() => {
    let current = true;
    setActive(0);
    setNotice('');
    if (!open || !query.trim()) {
      setHits([]);
      setLoading(false);
      return;
    }
    setLoading(true);
    const timer = setTimeout(() => {
      void window.desktop
        .globalSearch(query)
        .then((results) => {
          if (current) {
            setHits(results);
            setLoading(false);
          }
        })
        .catch((cause) => {
          if (current) {
            setError(String(cause));
            setLoading(false);
          }
        });
    }, 150);
    return () => {
      current = false;
      clearTimeout(timer);
    };
  }, [query, open]);
  useEffect(() => {
    if (open)
      document.getElementById(`search-result-${active}`)?.scrollIntoView({ block: 'nearest' });
  }, [active, hits, open]);
  async function select(hit: SearchHit) {
    try {
      await navigate(routeForHit(hit));
      setOpen(false);
    } catch (cause) {
      setError(String(cause));
    }
  }
  return (
    <header className="command-bar">
      {onToggleSidebar && (
        <Button
          aria-label="收起或展开导航"
          type="text"
          icon={<SidebarSimpleIcon size={19} />}
          onClick={onToggleSidebar}
        />
      )}
      <Button
        htmlType="button"
        type="default"
        className="global-search-trigger"
        aria-label="全局搜索"
        onClick={() => void show()}
      >
        <MagnifyingGlassIcon size={17} />
        <span>搜索系统、账号、任务与文档</span>
        <kbd>{window.desktop.platform === 'darwin' ? '⌘' : 'Ctrl'} K</kbd>
      </Button>
      <div className="spacer" />
      <Tooltip title={dark ? '切换浅色' : '切换深色'}>
        <Button
          type="text"
          aria-label="切换主题"
          icon={dark ? <SunIcon size={18} /> : <MoonIcon size={18} />}
          onClick={() =>
            void window.desktop
              .mutate({ type: 'settings', theme: dark ? 'light' : 'dark' })
              .catch((cause) => setError(String(cause)))
          }
        />
      </Tooltip>
      <GuidanceButton placement="search" accessibleLabel="搜索与新建使用指引" />
      {children}
      {error && !open && (
        <span className="error-text" role="alert">
          {error}
        </span>
      )}
      {open && (
        <Dialog
          title="搜索工作台"
          closeLabel="关闭全局搜索"
          className="modal search-dialog"
          onClose={() => setOpen(false)}
          error={error}
        >
          <label className="search-input">
            <MagnifyingGlassIcon size={21} />
            <Input
              ref={(node) => {
                input.current = node?.input ?? null;
              }}
              autoFocus
              aria-label="搜索工作台内容"
              placeholder="例如：订单平台 生产 Redis"
              value={query}
              onChange={(event) => {
                setQuery(event.target.value);
                setHits([]);
                setError('');
              }}
              onKeyDown={(event) => {
                if (event.nativeEvent.isComposing) return;
                if ((event.key === 'ArrowDown' || event.key === 'ArrowUp') && hits.length) {
                  event.preventDefault();
                  setActive(
                    (index) =>
                      (index + (event.key === 'ArrowDown' ? 1 : -1) + hits.length) % hits.length,
                  );
                }
                if (event.key === 'Enter' && !loading && hits[active]) {
                  event.preventDefault();
                  void select(hits[active]);
                }
              }}
            />
          </label>
          <div className="search-results" aria-busy={loading}>
            {loading ? (
              <p className="search-empty">正在查找…</p>
            ) : hits.length ? (
              <ul aria-label="搜索结果">
                {hits.map((hit, index) => (
                  <li
                    key={`${hit.kind}:${hit.id}`}
                    id={`search-result-${index}`}
                    className={active === index ? 'active' : ''}
                    onPointerEnter={() => setActive(index)}
                  >
                    <Button
                      htmlType="submit"
                      type="text"
                      className="search-result-open"
                      aria-label={`打开${searchKindLabels[hit.kind]} ${hit.title}`}
                      onClick={() => void select(hit)}
                    >
                      <span className="result-kind">{searchKindLabels[hit.kind]}</span>
                      <span className="result-text">
                        <strong>{hit.title}</strong>
                        <small>{hit.context}</small>
                        {hit.summary && <span>{hit.summary}</span>}
                      </span>
                      <ArrowUpRightIcon size={15} />
                    </Button>
                    {hit.kind === 'access' && hit.url && (
                      <Button
                        htmlType="submit"
                        type="text"
                        className="icon-button"
                        aria-label={`打开网站 ${hit.title}`}
                        title={hit.url}
                        onClick={() =>
                          void window.desktop
                            .openExternal(hit.url!)
                            .catch((cause) => setError(String(cause)))
                        }
                      >
                        <ArrowUpRightIcon size={16} />
                      </Button>
                    )}
                    {hit.kind === 'account' && (
                      <div className="search-result-actions">
                        {hit.username && (
                          <Button
                            htmlType="submit"
                            type="text"
                            className="icon-button"
                            aria-label={`复制用户名 ${hit.title}`}
                            title="复制用户名"
                            onClick={async () => {
                              try {
                                await window.desktop.copyText(hit.username!);
                                setNotice('用户名已复制');
                              } catch (cause) {
                                setError(String(cause));
                              }
                            }}
                          >
                            <CopyIcon size={16} />
                          </Button>
                        )}
                        {hit.secretKinds?.map((kind) => (
                          <SecretCopyButton
                            key={kind}
                            accountId={hit.id}
                            kind={kind}
                            name={hit.title}
                            onError={setError}
                          />
                        ))}
                      </div>
                    )}
                  </li>
                ))}
              </ul>
            ) : (
              <p className="search-empty">
                {query
                  ? '没有找到匹配内容，试试系统名、环境或正文关键词。'
                  : '输入关键词查找资料。秘密内容不会被搜索。'}
              </p>
            )}
          </div>
          <div className="search-hint">
            <span role="status">{notice || `${hits.length} 条结果`}</span>
            <span>↑ ↓ 选择 · Enter 打开 · Esc 返回</span>
          </div>
        </Dialog>
      )}
    </header>
  );
}
