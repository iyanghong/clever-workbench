import type { Snapshot } from './types';
import type { ImportCandidate, LedgerImportKind } from './ledger-import-types';
import type { AccessAddress, ResourceConnection } from './ledger-types';
import { scopeFor, type ScopeKind } from './ledger-workspace-types';

export type ImportTarget = {
  id: string;
  kind: LedgerImportKind;
  name: string;
  environmentIds: string[];
  values: Record<string, string>;
  addresses: AccessAddress[];
  connections: ResourceConnection[];
  ownerBound?: boolean;
};
export function importTargets(s: Snapshot, systemId: string): ImportTarget[] {
  const targets: ImportTarget[] = [];
  const add = (
    r: {
      id: string;
      name: string;
      notes: string;
      environmentId?: string | null;
      fields?: Record<string, string>;
    },
    kind: LedgerImportKind,
    scope: ScopeKind | null,
    values: Record<string, string> = {},
    addresses: AccessAddress[] = [],
    connections: ResourceConnection[] = [],
    ownerBound = false,
  ) => {
    const env = r.environmentId ? [r.environmentId] : [];
    const fields = Object.fromEntries(
      Object.entries(r.fields ?? {}).map(([k, v]) => ['field:' + k, v]),
    );
    targets.push({
      id: r.id,
      kind,
      name: r.name,
      environmentIds: scope ? scopeFor(s.scopes, scope, r.id, r.environmentId).environmentIds : env,
      values: { name: r.name, notes: r.notes, ...fields, ...values },
      addresses,
      connections,
      ownerBound,
    });
  };
  for (const r of s.resources.filter((x) => x.systemId === systemId))
    add(
      r,
      r.kind,
      'resource',
      r.kind === 'server' ? { address: r.address, port: r.port } : {},
      [],
      r.connections,
    );
  for (const r of s.accessEntries.filter((x) => x.systemId === systemId))
    add(r, 'access', 'access', {}, r.addresses);
  const services = s.services.filter((x) => x.systemId === systemId);
  for (const r of services) add(r, 'service', 'service', { repository: r.repository });
  for (const r of s.deploymentNodes.filter((x) => services.some((v) => v.id === x.serviceId)))
    add(r, 'node', null, { address: r.address, port: r.port, count: r.count, mode: r.mode });
  for (const r of s.operations.filter((x) => x.systemId === systemId))
    add(r, r.kind, 'operation', { frequency: r.frequency, status: r.status });
  for (const r of s.accounts.filter((x) => x.systemId === systemId))
    add(r, 'account', null, {}, [], [], Boolean(r.resourceId || r.accessId));
  return targets;
}
export function endpointValues(item: ImportCandidate | ImportTarget) {
  return [
    ...new Set(
      [
        'values' in item ? item.values.address : item.address,
        ...item.addresses.map((x) => x.url),
        ...item.connections.map((x) => x.address),
      ].filter(Boolean),
    ),
  ];
}
export function matchScore(a: ImportCandidate, b: ImportTarget | ImportCandidate) {
  const clean = (v: string) => v.trim().toLowerCase();
  const n = clean(a.name),
    m = clean(b.name);
  const addresses = endpointValues(b);
  const address = endpointValues(a).some((v) => addresses.includes(v));
  const similar = n.length >= 3 && m.length >= 3 && (n.includes(m) || m.includes(n));
  return (address ? 4 : 0) + (n && n === m ? 4 : similar ? 1 : 0);
}
export type FieldChange = { key: string; label: string; before: string; after: string };
const labels: Record<string, string> = {
  name: '名称',
  notes: '说明',
  address: '地址',
  port: '端口',
  repository: '代码仓库',
  frequency: '频率',
  count: '节点数量',
  mode: '运行方式',
  status: '状态',
};
export function matchedChild<T extends { label: string }>(
  list: T[],
  incoming: { label: string; id: string }[],
  item: { label: string; id: string },
) {
  const hit = list.filter((x) => x.label === item.label);
  if (hit.length === 1 && incoming.filter((x) => x.label === item.label).length === 1)
    return hit[0];
  if (list.length === 1 && incoming.length === 1) return list[0];
  return undefined;
}
export function importChanges(c: ImportCandidate, t: ImportTarget): FieldChange[] {
  const out: FieldChange[] = [];
  const add = (key: string, label: string, before: string, after: string) => {
    if (after.trim() && after !== before) out.push({ key, label, before, after });
  };
  for (const [k, v] of Object.entries(t.values)) {
    if (k.startsWith('field:')) continue;
    if ((k === 'mode' || k === 'status') && !c.observed?.includes(k)) continue;
    const value = c[k as keyof ImportCandidate];
    if (typeof value === 'string') add(k, labels[k], v, value);
  }
  for (const [k, v] of Object.entries(c.fields))
    add('field:' + k, k, t.values['field:' + k] ?? '', v);
  if (t.kind === 'access')
    for (const a of c.addresses) {
      const old = matchedChild(t.addresses, c.addresses, a);
      add('url:' + a.id, old?.label ?? a.label, old?.url ?? '', a.url);
    }
  if (['database', 'other', 'redis'].includes(t.kind))
    for (const a of c.connections) {
      const old = matchedChild(t.connections, c.connections, a);
      for (const k of ['address', 'port', 'role'] as const)
        add(
          'connection:' + a.id + ':' + k,
          (old?.label ?? a.label) + ' · ' + (labels[k] ?? '用途'),
          old?.[k] ?? '',
          a[k],
        );
    }
  return out;
}
export function sameEnvironment(a: string[], b: string[]) {
  return a.length === b.length && a.every((id) => b.includes(id));
}
