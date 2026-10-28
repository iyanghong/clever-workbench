import type { SecretKind } from './vault-types';
export type ObjectContext = {
  systemId: string | null;
  environmentId: string | null;
  resourceId: string | null;
};
export type SystemRecord = {
  id: string;
  name: string;
  notes: string;
  url: string;
  currentProjectId: string | null;
  createdAt: number;
  updatedAt: number;
};
export type SystemProject = { systemId: string; projectId: string; linkedAt: number };
export type EnvironmentRecord = {
  id: string;
  systemId: string;
  name: string;
  notes: string;
  createdAt: number;
};
export type ServiceRecord = {
  id: string;
  systemId: string;
  name: string;
  repository: string;
  notes: string;
  createdAt: number;
  documentIds?: string[];
};
export type DeploymentRecord = {
  id: string;
  serviceId: string;
  environmentId: string;
  address: string;
  port: string;
  notes: string;
};
export type ResourceKind = 'redis' | 'server' | 'database' | 'other';
export const serverConfigurationFields = ['操作系统', 'CPU', '内存', '硬盘'] as const;
export type AccessAddress = { id: string; label: string; url: string };
export type AccessEntry = {
  id: string;
  systemId: string;
  environmentId: string | null;
  name: string;
  notes: string;
  addresses: AccessAddress[];
  preferredAddressId: string | null;
  preferredAccountId: string | null;
  createdAt: number;
  updatedAt: number;
};
export type AccessSave = {
  type: 'access.save';
  id?: string;
  systemId?: string;
  environmentId?: string | null;
  name?: string;
  notes?: string;
  addresses?: { id?: string; label: string; url: string }[];
  preferredAddressId?: string | null;
  preferredAccountId?: string | null;
};
export type LedgerCapture = {
  kind: 'access' | ResourceKind | 'account';
  systemId: string;
  environmentId: string | null;
  name: string;
  address?: string;
  port?: string;
  purpose?: string;
  fields?: Record<string, string>;
  username?: string;
  password?: string;
  token?: string;
  privateKey?: string;
  accountName?: string;
  notes?: string;
  resourceId?: string | null;
  accessId?: string | null;
  addresses?: AccessSave['addresses'];
  connections?: ResourceConnection[];
  preferredConnectionId?: string | null;
};
export type ResourceConnection = {
  id: string;
  label: string;
  address: string;
  port: string;
  role: string;
  serverId: string | null;
};
export type ResourceRecord = {
  id: string;
  systemId: string;
  environmentId: string | null;
  kind: ResourceKind;
  name: string;
  address: string;
  port: string;
  notes: string;
  fields: Record<string, string>;
  connections?: ResourceConnection[];
  preferredConnectionId?: string | null;
  createdAt: number;
  updatedAt: number;
};
export type AccountRecord = {
  secretKinds: SecretKind[];
  id: string;
  systemId: string;
  environmentId: string | null;
  resourceId: string | null;
  accessId: string | null;
  name: string;
  username: string;
  notes: string;
  createdAt: number;
  updatedAt: number;
};
export type LedgerCommand =
  | AccessSave
  | {
      type: 'access.copy';
      id: string;
      systemId?: string;
      environmentId?: string | null;
      name?: string;
    }
  | { type: 'access.delete'; id: string }
  | {
      type: 'account.save';
      id?: string;
      environmentId?: string | null;
      resourceId?: string | null;
      accessId?: string | null;
      name: string;
      username?: string;
      notes?: string;
    }
  | {
      type: 'account.copy';
      id: string;
      environmentId?: string | null;
      resourceId?: string | null;
      accessId?: string | null;
      name?: string;
    }
  | { type: 'account.delete'; id: string }
  | {
      type: 'resource.save';
      id?: string;
      systemId?: string;
      environmentId: string | null;
      kind: ResourceKind;
      name: string;
      address?: string;
      port?: string;
      notes?: string;
      fields?: Record<string, string>;
      connections?: ResourceConnection[];
      preferredConnectionId?: string | null;
    }
  | {
      type: 'resource.copy';
      id: string;
      systemId?: string;
      environmentId?: string | null;
      name?: string;
    }
  | { type: 'resource.delete'; id: string }
  | {
      type: 'system.save';
      id?: string;
      name: string;
      notes?: string;
      url?: string;
      projectId?: string | null;
    }
  | { type: 'environment.save'; id?: string; systemId: string; name: string; notes?: string }
  | {
      type: 'service.save';
      id?: string;
      systemId: string;
      name: string;
      repository?: string;
      notes?: string;
      documentIds?: string[];
      firstNode?: Omit<import('./ledger-workspace-types').DeploymentNode, 'id' | 'serviceId'>;
    }
  | {
      type: 'deployment.save';
      serviceId: string;
      environmentId: string;
      address?: string;
      port?: string;
      notes?: string;
    };
