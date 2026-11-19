import { Button, Card } from 'antd';
import { PageHeading } from '../../shared/WorkspaceUI';
import { Suspense, useEffect, useState } from 'react';
import { ArrowRightIcon, WrenchIcon } from '@phosphor-icons/react';
import type { ModuleProps } from '../../app/modules';
import type { Snapshot } from '../../types';
import { FavoriteButton } from '../home/FavoriteButton';
import { GuidanceButton } from '../guidance/Guidance';
import { findTool, registeredTools } from './registry';
import './tools.css';
import './utility.css';

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
    <main className="main tools-page" aria-busy={!snapshot}>
      <header className="window-toolbar">
        <div className="breadcrumb">
          <WrenchIcon size={17} />
          <Button
            htmlType="submit"
            type="text"
            className="text-button"
            onClick={() => void navigate({ module: 'tools' })}
          >
            工具
          </Button>
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
          <Suspense
            fallback={
              <p role="status" aria-busy="true">
                正在打开工具…
              </p>
            }
          >
            <selected.Page registerFlush={registerFlush} />
          </Suspense>
        ) : (
          <>
            <PageHeading title="工具" description="点击星标，可从工作台快速打开常用工具。" />
            {route.objectId && <p role="alert">这个工具已不可用，请从工具目录重新选择。</p>}
            <div className="tool-directory">
              {registeredTools.map((tool) => (
                <Card role="article" className="tool-card" key={tool.id}>
                  <span className="tool-card-icon" aria-hidden="true">
                    <tool.Icon size={24} weight="duotone" />
                  </span>
                  <h2>
                    <Button
                      type="link"
                      className="tool-card-open"
                      aria-describedby={`tool-description-${tool.id}`}
                      onClick={() => void navigate({ module: 'tools', objectId: tool.id })}
                    >
                      {tool.title}
                      <ArrowRightIcon size={15} aria-hidden="true" />
                    </Button>
                  </h2>
                  <p id={`tool-description-${tool.id}`}>{tool.description}</p>
                  <div className="tool-card-actions">
                    {tool.guidance && (
                      <GuidanceButton
                        placement={tool.guidance}
                        accessibleLabel={`${tool.title}使用指引`}
                      />
                    )}
                    {favorite(tool.id)}
                  </div>
                </Card>
              ))}
            </div>
          </>
        )}
      </div>
    </main>
  );
}
