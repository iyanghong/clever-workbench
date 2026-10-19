export type ScopeKind = 'resource' | 'access' | 'service' | 'operation';
export type LedgerBatch = {
  token: string;
  systemId: string;
  environmentId: string | null;
  kind:
    | 'access'
    | 'server'
    | 'database'
    | 'redis'
    | 'other'
    | 'service'
    | 'job'
    | 'backup'
    | 'account'
    | 'node';
  ownerId?: string;
  ownerKind?: 'resource' | 'access' | 'environment';
  rows: {
    name: string;
    address?: string;
    port?: string;
    notes?: string;
    repository?: string;
    fields?: Record<string, string>;
    username?: string;
    password?: string;
    accountName?: string;
    frequency?: string;
    status?: 'active' | 'inactive' | 'unverified';
    count?: string;
    mode?: 'fixed' | 'scheduled';
    confirmDuplicate?: boolean;
  }[];
};
export type ScopeInput = {
  environmentIds: string[];
  tags: string[];
  status?: 'active' | 'inactive' | 'unverified';
  statusNotes?: string;
};
export type LedgerScope = ScopeInput & { kind: ScopeKind; ownerId: string; systemId: string };
export type DeploymentNode = {
  id: string;
  serviceId: string;
  environmentId: string;
  name: string;
  serverId: string | null;
  address: string;
  port: string;
  notes: string;
  mode: 'fixed' | 'scheduled';
  count: string;
};
export type Operation = {
  id: string;
  systemId: string;
  environmentId: string | null;
  serviceId: string | null;
  resourceId: string | null;
  documentId: string | null;
  name: string;
  kind: 'job' | 'backup';
  frequency: string;
  status: 'active' | 'inactive' | 'unverified';
  notes: string;
};
export type WorkspaceLedgerCommand =
  | { type: 'scope.save'; kind: ScopeKind; ownerId: string; scope: ScopeInput }
  | { type: 'node.save'; value: Omit<DeploymentNode, 'id'> & { id?: string } }
  | { type: 'node.delete'; id: string }
  | { type: 'operation.save'; value: Omit<Operation, 'id'> & { id?: string } }
  | { type: 'operation.delete'; id: string }
  | { type: 'environment.delete'; id: string }
  | { type: 'service.delete'; id: string };

export function scopeFor(
  scopes: LedgerScope[],
  kind: ScopeKind,
  ownerId: string,
  environmentId?: string | null,
): ScopeInput {
  return (
    scopes.find((s) => s.kind === kind && s.ownerId === ownerId) ?? {
      environmentIds: environmentId ? [environmentId] : [],
      tags: [],
    }
  );
}
export function inEnvironment(scope: ScopeInput, filter: string) {
  return (
    filter === 'all' ||
    (filter === 'common'
      ? scope.environmentIds.length === 0
      : scope.environmentIds.length === 0 || scope.environmentIds.includes(filter))
  );
}
