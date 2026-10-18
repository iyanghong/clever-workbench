import { useEffect, useRef, useState, type ReactNode } from 'react';
import { MagnifyingGlassIcon, XIcon, ArrowUpRightIcon, CopyIcon } from '@phosphor-icons/react';
import { Dialog } from '../../shared/Dialog';
import { routeForHit, type ModuleProps } from '../../app/modules';
import { searchKindLabels, type SearchHit } from '../../search-types';
import { SecretCopyButton } from '../vault/SecretCopyButton';

export function GlobalSearch({
  navigate,
  flush,
  children,
}: {
  navigate: ModuleProps['navigate'];
  flush: () => Promise<void>;
  children?: ReactNode;
}) {
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
    if (document.querySelector('dialog[open]') && !openRef.current) return;
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
        if (document.querySelector('dialog[open]') && !openRef.current) return;
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
      <button className="global-search-trigger" aria-label="全局搜索" onClick={() => void show()}>
        <MagnifyingGlassIcon size={17} />
        <span>搜索系统、账号、任务与文档</span>
        <kbd>{window.desktop.platform === 'darwin' ? '⌘' : 'Ctrl'} K</kbd>
      </button>
      <div className="spacer" />
      {children}
      {error && !open && (
        <span className="error-text" role="alert">
          {error}
        </span>
      )}
      {open && (
        <Dialog
          title="搜索工作台"
          className="modal search-dialog"
          onClose={() => setOpen(false)}
          error={error}
        >
          <button
            className="search-close icon-button"
            aria-label="关闭全局搜索"
            onClick={() => setOpen(false)}
          >
            <XIcon size={18} />
          </button>
          <label className="search-input">
            <MagnifyingGlassIcon size={21} />
            <input
              ref={input}
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
                    <button
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
                    </button>
                    {hit.kind === 'access' && hit.url && (
                      <button
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
                      </button>
                    )}
                    {hit.kind === 'account' && (
                      <div className="search-result-actions">
                        {hit.username && (
                          <button
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
                          </button>
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
