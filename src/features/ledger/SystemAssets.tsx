import { useEffect, useState } from 'react';
import { GlobeIcon, DesktopTowerIcon, PlusIcon } from '@phosphor-icons/react';
import type { Snapshot } from '../../types';
import type { EditorHost } from './Environments';
import { Accounts } from './Accounts';
import { ResourceEditor } from './Resources';
import { RelatedWork } from './RelatedWork';
import { Dialog } from '../../shared/Dialog';
import { LedgerCaptureForm } from './LedgerCaptureForm';
import { AccessEntryEditor } from './AccessEntryEditor';

const inScope = (environmentId: string | null, scope: string) =>
  scope === 'all' || environmentId === null || environmentId === scope;

export function SystemAssets({
  kind,
  systemId,
  snapshot,
  flushAll,
  focusId,
  ...host
}: EditorHost & {
  kind: 'access' | 'server';
  systemId: string;
  snapshot: Snapshot;
  flushAll: () => Promise<void>;
  focusId?: string;
}) {
  const focusedAccount = snapshot.accounts.find((a) => a.id === focusId);
  const allItems = (
    kind === 'access'
      ? snapshot.accessEntries
      : snapshot.resources.filter((r) => r.kind === 'server')
  ).filter((item) => item.systemId === systemId);
  const [selected, setSelected] = useState<string | undefined>(
    focusedAccount?.accessId ?? focusedAccount?.resourceId ?? focusId ?? allItems[0]?.id,
  );
  const [filter, setFilter] = useState('all'),
    [creating, setCreating] = useState(false);
  const selectedItem = allItems.find((item) => item.id === selected);
  // Changing an open record's scope must not unmount its pending account edits.
  const visibleFilter =
    selectedItem && !inScope(selectedItem.environmentId, filter) ? 'all' : filter;
  const items = allItems.filter((item) => inScope(item.environmentId, visibleFilter));
  const item = selectedItem ?? items[0];
  useEffect(() => {
    setSelected(item?.id);
    setFilter(visibleFilter);
  }, [item?.id, visibleFilter]);
  const environment = snapshot.environments.find((e) => e.id === item?.environmentId) ?? null;
  const label = kind === 'access' ? '访问入口' : '服务器';
  useEffect(() => {
    host.onContext({
      systemId,
      environmentId: item?.environmentId ?? null,
      resourceId: kind === 'server' ? (item?.id ?? null) : null,
      accessId: kind === 'access' ? (item?.id ?? null) : null,
      projectId: snapshot.systems.find((s) => s.id === systemId)?.currentProjectId ?? null,
    });
  }, [item?.id, item?.environmentId, systemId, kind, snapshot.systems]);
  async function change(operation: () => void) {
    try {
      await flushAll();
      operation();
    } catch (cause) {
      host.onError(String(cause));
    }
  }
  const open = (id: string) =>
    void host
      .navigate({ module: 'ledger', objectId: id })
      .catch((cause) => host.onError(String(cause)));
  return (
    <section className="system-assets" aria-label={`系统${label}`}>
      <div className="entity-toolbar">
        <label className="scope-filter">
          范围
          <select
            aria-label={`${label}环境筛选`}
            value={visibleFilter}
            onChange={(event) => {
              const value = event.target.value;
              void change(() => {
                setSelected(undefined);
                setFilter(value);
              });
            }}
          >
            <option value="all">全部环境与通用</option>
            <option value="common">仅系统通用</option>
            {snapshot.environments
              .filter((e) => e.systemId === systemId)
              .map((e) => (
                <option key={e.id} value={e.id}>
                  {e.name}与通用
                </option>
              ))}
          </select>
        </label>
        <button className="toolbar-new" onClick={() => void change(() => setCreating(true))}>
          <PlusIcon size={16} />
          新增{label}
        </button>
      </div>
      <div className="system-asset-list" role="group" aria-label={`${label}列表`}>
        {items.map((record) => (
          <button
            key={record.id}
            className={`system-asset-row ${record.id === item?.id ? 'selected' : ''}`}
            aria-label={`${label} ${record.name}`}
            title={record.name}
            onClick={() => void change(() => setSelected(record.id))}
          >
            {kind === 'access' ? <GlobeIcon size={20} /> : <DesktopTowerIcon size={20} />}
            <span>
              <strong>{record.name}</strong>
              <small>
                {snapshot.environments.find((e) => e.id === record.environmentId)?.name ??
                  '系统通用'}
                {'address' in record && record.address ? ` · ${record.address}` : ''}
              </small>
            </span>
          </button>
        ))}
      </div>
      {item ? (
        <>
          {kind === 'access' ? (
            <AccessEntryEditor
              key={item.id}
              entry={snapshot.accessEntries.find((e) => e.id === item.id)!}
              snapshot={snapshot}
              flushAll={flushAll}
              {...host}
            />
          ) : (
            <ResourceEditor
              key={item.id}
              serverView
              resource={snapshot.resources.find((r) => r.id === item.id)!}
              environment={environment}
              snapshot={snapshot}
              flushAll={flushAll}
              onOpen={open}
              {...host}
            />
          )}
          <Accounts
            key={item.id}
            systemId={systemId}
            environment={environment}
            resourceId={kind === 'server' ? item.id : null}
            accessId={kind === 'access' ? item.id : null}
            snapshot={snapshot}
            flushAll={flushAll}
            focusAccount={focusedAccount?.id ?? null}
            onOpenAccount={(target) => open(target.accountId)}
            {...host}
          />
          {kind === 'server' && (
            <RelatedWork
              context={{ systemId, environmentId: item.environmentId, resourceId: item.id }}
              snapshot={snapshot}
              {...host}
            />
          )}
        </>
      ) : (
        <div className="entity-empty system-asset-empty">
          {kind === 'access' ? <GlobeIcon size={32} /> : <DesktopTowerIcon size={32} />}
          <h3>{kind === 'access' ? '登录入口，集中放在这里' : '记下系统部署的机器'}</h3>
          <p>
            {kind === 'access'
              ? 'Jenkins、GitLab、监控平台……先记名称，地址和账号随时补。'
              : '名称、IP、用途即可。没有账号权限，也能先记机器资料。'}
          </p>
        </div>
      )}
      {creating && (
        <Dialog title={`新增${label}`} onClose={() => setCreating(false)}>
          <LedgerCaptureForm
            kind={kind}
            snapshot={snapshot}
            context={{
              systemId,
              environmentId: filter === 'all' || filter === 'common' ? null : filter,
            }}
            cancel={() => setCreating(false)}
            submit={async (input) => {
              await flushAll();
              const result = await window.desktop.captureLedger(input);
              host.onSnapshot(result.snapshot);
              setSelected(result.createdId);
              setFilter('all');
              setCreating(false);
            }}
          />
        </Dialog>
      )}
    </section>
  );
}
