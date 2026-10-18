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
};
export type DeploymentRecord = {
  id: string;
  serviceId: string;
  environmentId: string;
  address: string;
  port: string;
  notes: string;
};
export type ResourceKind = 'redis' | 'server' | 'other';
export type ResourceRecord = {
  id: string;
  environmentId: string;
  kind: ResourceKind;
  name: string;
  address: string;
  port: string;
  notes: string;
  fields: Record<string, string>;
  createdAt: number;
  updatedAt: number;
};
export type AccountRecord = {
  id: string;
  environmentId: string;
  resourceId: string | null;
  name: string;
  username: string;
  notes: string;
  createdAt: number;
  updatedAt: number;
};
export type LedgerCommand =
  | {
      type: 'account.save';
      id?: string;
      environmentId: string;
      resourceId?: string | null;
      name: string;
      username?: string;
      notes?: string;
    }
  | {
      type: 'account.copy';
      id: string;
      environmentId?: string;
      resourceId?: string | null;
      name?: string;
    }
  | { type: 'account.delete'; id: string }
  | {
      type: 'resource.save';
      id?: string;
      environmentId: string;
      kind: ResourceKind;
      name: string;
      address?: string;
      port?: string;
      notes?: string;
      fields?: Record<string, string>;
    }
  | { type: 'resource.copy'; id: string; environmentId?: string; name?: string }
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
    }
  | {
      type: 'deployment.save';
      serviceId: string;
      environmentId: string;
      address?: string;
      port?: string;
      notes?: string;
    };
