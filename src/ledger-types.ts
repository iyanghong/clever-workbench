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
export type LedgerCommand =
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
