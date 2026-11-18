import { randomUUID } from 'node:crypto';
import type { Store } from './store';
import { WorkspaceLedger } from './ledger-workspace';
import type { Snapshot } from '../src/types';
import type { ImportCandidate } from '../src/ledger-import-types';
import {
  importChanges,
  matchedChild,
  sameEnvironment,
  type ImportTarget,
} from '../src/ledger-import-matches';
import { scopeFor, type ScopeKind } from '../src/ledger-workspace-types';

export function updateFromCandidate(
  store: Store,
  s: Snapshot,
  systemId: string,
  c: ImportCandidate,
  t: ImportTarget,
) {
  const keys = new Set(c.update!.fields);
  const envs = c.update!.environmentOverride ? c.environmentIds! : t.environmentIds;
  const envChanged = !sameEnvironment(envs, t.environmentIds);
  const changes = importChanges(c, t);
  if ([...keys].some((k) => !changes.some((d) => d.key === k)))
    throw Error('替换字段已经变化，请重新核对差异。');
  if (!keys.size && !envChanged) throw Error('没有选中变更，请跳过该行或选择替换字段。');
  const fields = Object.fromEntries(
    changes
      .filter((d) => keys.has(d.key) && d.key.startsWith('field:'))
      .map((d) => [d.key.slice(6), d.after]),
  );
  const scalar = Object.fromEntries(
    changes.filter((d) => keys.has(d.key) && !d.key.includes(':')).map((d) => [d.key, d.after]),
  );
  const name = keys.has('name') ? c.name : t.name;
  const id = t.id,
    environmentId = envs[0] ?? null,
    workspace = new WorkspaceLedger(store.db),
    now = Date.now();
  let scopeKind: ScopeKind | null = null;
  if (t.kind === 'access') {
    const urls = t.addresses.map((a) => ({ ...a }));
    for (const a of c.addresses)
      if (keys.has('url:' + a.id)) {
        const old = matchedChild(t.addresses, c.addresses, a);
        if (old) urls.find((x) => x.id === old.id)!.url = a.url;
        else urls.push({ id: randomUUID(), label: a.label, url: a.url });
      }
    store.ledger.accessEntries.save(
      { type: 'access.save', id, systemId, environmentId, name, ...scalar, addresses: urls },
      now,
    );
    scopeKind = 'access';
  } else if (
    t.kind === 'server' ||
    t.kind === 'database' ||
    t.kind === 'redis' ||
    t.kind === 'other'
  ) {
    const old = store.ledger.resource(id);
    const connections = t.connections.map((x) => ({ ...x }));
    for (const a of c.connections) {
      const selected = (['address', 'port', 'role'] as const).filter((k) =>
        keys.has('connection:' + a.id + ':' + k),
      );
      if (!selected.length) continue;
      const hit = matchedChild(t.connections, c.connections, a);
      let dest = connections.find((x) => x.id === hit?.id);
      if (!dest) {
        dest = {
          id: randomUUID(),
          label: a.label,
          address: '',
          port: '',
          role: '',
          serverId: null,
        };
        connections.push(dest);
      }
      for (const k of selected) dest[k] = a[k];
    }
    store.ledger.saveResource(
      {
        type: 'resource.save',
        id,
        systemId,
        kind: t.kind,
        environmentId,
        name,
        ...scalar,
        connections,
        fields: { ...old.fields, ...fields },
      },
      now,
    );
    scopeKind = 'resource';
  } else if (t.kind === 'service') {
    store.ledger.saveService({ type: 'service.save', id, systemId, name, ...scalar }, now);
    scopeKind = 'service';
  } else if (t.kind === 'node') {
    const old = s.deploymentNodes.find((x) => x.id === id)!;
    workspace.saveNode({
      ...old,
      ...scalar,
      environmentId: environmentId!,
      fields: { ...old.fields, ...fields },
    });
  } else if (t.kind === 'account') {
    if (t.ownerBound && envChanged) throw Error('附属账号跟随所属对象的环境。');
    store.ledger.saveAccount({ type: 'account.save', id, name, ...scalar, environmentId }, now);
  } else {
    const old = s.operations.find((x) => x.id === id)!;
    workspace.saveOperation({
      ...old,
      ...scalar,
      environmentId,
      fields: { ...old.fields, ...fields },
    });
    scopeKind = 'operation';
  }
  if (scopeKind)
    workspace.saveScope(scopeKind, id, {
      ...scopeFor(s.scopes, scopeKind, id, t.environmentIds[0]),
      environmentIds: envs,
    });
  return id;
}
