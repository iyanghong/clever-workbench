export interface UpdateAsset {
  name: string;
  url: string;
  size: number;
  apiUrl?: string;
}
export interface UpdateRelease {
  version: string;
  publishedAt: string;
  notes: string;
  pageUrl: string;
  zip: UpdateAsset;
  checksums: UpdateAsset;
}
export type UpdateStatus =
  | 'downloading'
  | 'verifying'
  | 'ready'
  | 'preparing'
  | 'installing'
  | 'validating'
  | 'success'
  | 'manual'
  | 'idle'
  | 'unsupported'
  | 'checking'
  | 'up-to-date'
  | 'no-release'
  | 'incompatible'
  | 'available'
  | 'error';
export interface UpdateSnapshot {
  recovery?: { outcome: string; message: string };
  progress?: { received: number; total: number };
  status: UpdateStatus;
  currentVersion: string;
  release?: UpdateRelease;
  message?: string;
  checkedAt?: string;
  retryAt?: string;
}
export interface UpdateHistoryEntry {
  id: string;
  currentVersion: string;
  targetVersion: string;
  createdAt: string;
  updatedAt: string;
  phase: string;
  phaseStartedAt: number;
  durations: Record<string, number>;
  outcome: 'in-progress' | 'ready' | 'failed' | 'manual' | 'success';
  message?: string;
  backup?: string;
  previousApp?: string;
  transactionDirectory?: string;
}
