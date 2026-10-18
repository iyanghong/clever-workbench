import type { Favorite, FavoriteCommand } from './home-types';
import type { SearchHit } from './search-types';
import type { SecretKind, VaultStatus, AccountCopyTarget, ResourceCopyTarget } from './vault-types';
import type { DocumentCommand, DocumentRecord, DocumentSummary } from './document-types';
import type { JSONContent } from '@tiptap/react';
import type {
  LedgerCommand,
  SystemRecord,
  SystemProject,
  EnvironmentRecord,
  ServiceRecord,
  DeploymentRecord,
  ResourceRecord,
  AccountRecord,
} from './ledger-types';
export type Project = { id: string; name: string; color: string; archivedAt: number | null };
export type TaskSummary = {
  id: string;
  title: string;
  projectId: string | null;
  systemId?: string | null;
  environmentId?: string | null;
  resourceId?: string | null;
  createdAt: number;
  startedAt: number;
  completedAt: number | null;
  deletedAt: number | null;
};
export type Task = TaskSummary & { content: JSONContent; markdown: string };
export type Draft = {
  title: string;
  projectId: string | null;
  systemId?: string | null;
  environmentId?: string | null;
  resourceId?: string | null;
  content: JSONContent;
  markdown: string;
  startedAt?: number;
};
export type Settings = {
  theme: 'system' | 'light' | 'dark';
  backupDir: string;
  autoBackup: boolean;
  lastBackupAt: number | null;
  lastBackupError: string | null;
};
export type Snapshot = {
  favorites: Favorite[];
  documents: DocumentSummary[];
  resources: ResourceRecord[];
  accounts: AccountRecord[];
  environments: EnvironmentRecord[];
  services: ServiceRecord[];
  deployments: DeploymentRecord[];
  systems: SystemRecord[];
  systemProjects: SystemProject[];
  tasks: TaskSummary[];
  projects: Project[];
  draft: Draft | null;
  settings: Settings;
};
export type Command =
  | FavoriteCommand
  | DocumentCommand
  | LedgerCommand
  | { type: 'task.create'; draft: Draft; consumeDraft?: boolean }
  | {
      type: 'task.edit';
      id: string;
      title: string;
      content: JSONContent;
      markdown: string;
      projectId: string | null;
      systemId?: string | null;
      environmentId?: string | null;
      resourceId?: string | null;
    }
  | {
      type: 'task.complete';
      id: string;
      complete: boolean;
      restoreProject?: boolean;
      completedAt?: number;
    }
  | { type: 'task.dates'; id: string; startedAt: number; completedAt: number | null }
  | { type: 'task.delete'; id: string }
  | { type: 'task.restore'; id: string; destination?: 'original' | 'unclassified' }
  | { type: 'task.purge'; id?: string }
  | { type: 'project.create'; name: string; color: string }
  | { type: 'project.edit'; id: string; name: string; color: string }
  | { type: 'project.archive'; id: string; archived: boolean }
  | { type: 'project.delete'; id: string }
  | { type: 'settings'; theme?: Settings['theme']; autoBackup?: boolean };
export type MutationResult = { snapshot: Snapshot; createdId?: string };
export type Asset = { src: string; name: string };
export type BackupSelection = { token: string; name: string };
export type BackupInfo = {
  token: string;
  createdAt: string;
  tasks: number;
  projects: number;
  images: number;
  documents: number;
  systems: number;
  resources: number;
  accounts: number;
  secrets: number;
};
export interface DesktopAPI {
  platform: string;
  vaultStatus(): Promise<VaultStatus>;
  vaultActivity(): Promise<void>;
  copySecret(accountId: string, kind: SecretKind): Promise<void>;
  copyAccountWithSecrets(
    id: string,
    target: AccountCopyTarget,
    kinds: SecretKind[],
  ): Promise<MutationResult>;
  copyResourceWithSecrets(id: string, target: ResourceCopyTarget): Promise<MutationResult>;
  initializeVault(password: string): Promise<void>;
  unlockVault(password: string): Promise<void>;
  lockVault(): Promise<void>;
  readSecret(accountId: string, kind: SecretKind): Promise<string>;
  saveSecret(accountId: string, kind: SecretKind, value: string): Promise<Snapshot>;
  removeSecret(accountId: string, kind: SecretKind): Promise<Snapshot>;
  onSettingsChange(handler: (settings: Settings) => void): () => void;
  onDataRestored(handler: () => void): () => void;
  onVaultStatus(handler: (status: VaultStatus) => void): () => void;
  snapshot(): Promise<Snapshot>;
  document(id: string): Promise<DocumentRecord>;
  searchDocuments(query: string): Promise<string[]>;
  task(id: string): Promise<Task>;
  search(query: string): Promise<string[]>;
  globalSearch(query: string): Promise<SearchHit[]>;
  mutate(command: Command): Promise<MutationResult>;
  saveDraft(draft: Draft | null): Promise<void>;
  importImage(bytes: Uint8Array, name: string): Promise<Asset>;
  chooseImages(): Promise<{ assets: Asset[]; errors: string[] }>;
  backup(): Promise<string | null>;
  chooseBackup(): Promise<BackupSelection | null>;
  inspectBackup(token: string, password: string): Promise<BackupInfo>;
  discardBackup(token: string): Promise<void>;
  restoreBackup(token: string): Promise<Snapshot>;
  retryBackup(): Promise<Snapshot>;
  backupDirectory(): Promise<Snapshot | null>;
  copyText(value: string): Promise<void>;
  openExternal(url: string): Promise<void>;
  onFlush(handler: () => Promise<void>): () => void;
  onNativeCommand(handler: (command: string) => void): () => void;
}
declare global {
  interface Window {
    desktop: DesktopAPI;
  }
}
