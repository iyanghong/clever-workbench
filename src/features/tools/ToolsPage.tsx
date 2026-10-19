import { Suspense, useEffect, useState } from 'react';
import { ArrowRightIcon, WrenchIcon } from '@phosphor-icons/react';
import type { ModuleProps } from '../../app/modules';
import type { Snapshot } from '../../types';
import { FavoriteButton } from '../home/FavoriteButton';
import { findTool, registeredTools } from './registry';
import './tools.css';

export function ToolsPage({ route, navigate, setContext, registerFlush }: ModuleProps) {
  const [snapshot, setSnapshot] = useState<Snapshot | null>(null),
    [error, setError] = useState('');
  const selected = route.objectId ? findTool(route.objectId) : undefined;
  useEffect(() => {
    setContext({});
    void window.desktop
      .snapshot()
      .then(setSnapshot)
      .catch((e) => setError(String(e)));
  }, [setContext]);
  const favorite = (id: string) =>
    snapshot && (
      <FavoriteButton
        item={{ kind: 'tool', id }}
        snapshot={snapshot}
        onSnapshot={setSnapshot}
        onError={setError}
      />
    );
  return (
    <main className="main tools-page">
      <header className="window-toolbar">
        <div className="breadcrumb">
          <WrenchIcon size={17} />
          <button className="text-button" onClick={() => void navigate({ module: 'tools' })}>
            工具
          </button>
          {selected && (
            <>
              <span>/</span>
              <span>{selected.title}</span>
            </>
          )}
        </div>
        <div className="spacer" />
        {selected && favorite(selected.id)}
      </header>
      <div className="tools-content">
        {error && (
          <p className="tool-error" role="alert">
            {error}
          </p>
        )}
        {selected ? (
          <Suspense fallback={<p role="status">正在打开工具…</p>}>
            <selected.Page registerFlush={registerFlush} />
          </Suspense>
        ) : (
          <>
            <div className="tools-heading">
              <span className="eyebrow">本地工具</span>
              <h1>工具</h1>
              <p>完成手边的操作，把常用工具放到工作台。</p>
            </div>
            {route.objectId && <p role="alert">这个工具已不可用，请从工具目录重新选择。</p>}
            <div className="tool-directory">
              {registeredTools.map((tool) => (
                <article className="tool-card" key={tool.id}>
                  <div className="tool-card-top">
                    <tool.Icon size={30} weight="duotone" />
                    {favorite(tool.id)}
                  </div>
                  <h2>{tool.title}</h2>
                  <p>{tool.description}</p>
                  <button
                    className="text-button"
                    onClick={() => void navigate({ module: 'tools', objectId: tool.id })}
                  >
                    打开工具 <ArrowRightIcon size={16} />
                  </button>
                </article>
              ))}
            </div>
          </>
        )}
      </div>
    </main>
  );
}
